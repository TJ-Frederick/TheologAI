import { ValidationError } from '../../kernel/errors.js';
import { MORPHOLOGY_USAGE_IDENTITY } from '../../kernel/morphologyUsageCursor.js';
import { parseStrongsIdentity } from '../../kernel/strongs.js';
import { parseUbsPublicHebrewIdentity } from '../../kernel/ubsSemanticDomain.js';
import {
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE,
  ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION,
  decodeOriginalLanguageStudyV3Cursor,
  parseOriginalLanguageStudyV3Cursor,
  type OriginalLanguageStudyCursorOperation,
  type OriginalLanguageStudyDepth,
  type OriginalLanguageStudyV3CursorBinding,
  type OriginalLanguageStudyV3ResolvedRequest,
} from '../../kernel/originalLanguageStudyV3Contract.js';
import type { OriginalLanguageStudyV2Coordinator } from './OriginalLanguageStudyV2Coordinator.js';
import type { OriginalLanguageStudyV2BeforePagedEvidenceContext } from './OriginalLanguageStudyV2Coordinator.js';
import type { StrongsService } from './StrongsService.js';
import type { OriginalLanguageStudyV3ApplicationResult } from './OriginalLanguageStudyV3ApplicationResult.js';
import type { OriginalLanguageStudyV2ApplicationResult } from './OriginalLanguageStudyV2ApplicationResult.js';

/** Public v3 coordinator; v2 survives only as the internal semantic evidence engine. */
export class OriginalLanguageStudyV3Coordinator {
  constructor(
    private readonly evidenceCoordinator: Pick<OriginalLanguageStudyV2Coordinator, 'study'>,
    private readonly strongsService: Pick<StrongsService, 'getCorpusOccurrencePage'>,
  ) {}

  async study(input: unknown): Promise<OriginalLanguageStudyV3ApplicationResult> {
    const request = snapshotRequest(input);
    let routed: ReturnType<typeof decodeOriginalLanguageStudyV3Cursor> | undefined;
    if (request.cursor !== undefined) {
      try { routed = decodeOriginalLanguageStudyV3Cursor(request.cursor); }
      catch (error) { throw new ValidationError('cursor', (error as Error).message); }
      if (routed.operation === ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION && request.depth !== 'technical') {
        throw new ValidationError('cursor', 'corpus occurrence cursors require depth technical.');
      }
    }

    const evidence = await this.evidenceCoordinator.study({
      reference: request.reference,
      target: request.target,
      ...(request.position === undefined ? {} : { position: request.position }),
      detail: request.depth === 'technical' ? 'detailed' : 'summary',
      ...(routed?.operation === ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION
        ? { cursor: routed.repositoryCursor }
        : {}),
    }, routed && request.cursor
      ? context => {
        const binding = cursorBindingFromContext(request, context, routed.operation);
        try { parseOriginalLanguageStudyV3Cursor(request.cursor!, binding); }
        catch (error) { throw new ValidationError('cursor', (error as Error).message); }
      }
      : undefined);

    if (routed && request.cursor) {
      const binding = cursorBinding(request, evidence, routed.operation);
      try { parseOriginalLanguageStudyV3Cursor(request.cursor, binding); }
      catch (error) { throw new ValidationError('cursor', (error as Error).message); }
    }

    if (request.depth !== 'technical') return Object.freeze({ request, evidence });
    if (routed?.operation === ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION) {
      return Object.freeze({
        request,
        evidence,
        corpusOccurrences: {
          status: 'not_requested_continuation' as const,
          reason: 'semantic_continuation_only' as const,
          plainLanguage: 'This continuation advances only semantic candidates; request a fresh technical study for corpus occurrences.',
        },
      });
    }

    const selectedToken = evidence.v1Result.selectedToken;
    if (!selectedToken || evidence.v1Result.status === 'needs_disambiguation') {
      return Object.freeze({
        request,
        evidence,
        corpusOccurrences: {
          status: 'unavailable' as const,
          reason: 'selected_token_required' as const,
          plainLanguage: 'Choose one returned verse-token position before requesting corpus occurrences.',
        },
      });
    }

    const rawIdentity = evidence.v1Result.identity?.publicStrongs ?? selectedToken.strongsNumber;
    const identity = typeof rawIdentity === 'string' ? parseStrongsIdentity(rawIdentity) : undefined;
    if (!identity || identity.publicId !== rawIdentity) {
      return Object.freeze({
        request,
        evidence,
        corpusOccurrences: {
          status: 'unavailable' as const,
          reason: 'no_usable_strongs_identity' as const,
          plainLanguage: 'The selected token has no canonical public Strong\'s identity, so corpus occurrences are unavailable.',
        },
      });
    }

    const corpusOccurrences = await this.strongsService.getCorpusOccurrencePage(
      identity.publicId,
      ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE,
      routed?.operation === ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION
        ? routed.repositoryCursor
        : undefined,
    );
    return Object.freeze({ request, evidence, corpusOccurrences });
  }
}

export function originalLanguageStudyV3CursorBinding(
  request: OriginalLanguageStudyV3ResolvedRequest,
  evidence: OriginalLanguageStudyV2ApplicationResult,
  operation: OriginalLanguageStudyCursorOperation,
): OriginalLanguageStudyV3CursorBinding {
  const token = evidence.v1Result.selectedToken;
  if (!token) throw new Error('v3 cursor binding requires one selected token');
  const rawIdentity = evidence.v1Result.identity?.publicStrongs ?? token.strongsNumber;
  const identity = typeof rawIdentity === 'string' ? parseStrongsIdentity(rawIdentity) : undefined;
  if (!identity || identity.publicId !== rawIdentity) throw new Error('v3 cursor binding requires one canonical Strong\'s identity');
  const semantic = evidence.semanticEvidence;
  const repository = 'identity' in semantic && 'provenance' in semantic;
  return {
    requestReference: request.reference,
    requestTarget: request.target,
    requestPosition: request.position ?? null,
    depth: request.depth,
    operation,
    canonicalReference: evidence.v1Result.reference,
    selectedToken: {
      position: token.position,
      text: token.text,
      lemma: token.lemma,
      strongsNumber: token.strongsNumber,
      morphologyCode: token.morphologyCode,
      gloss: token.gloss,
    },
    publicStrongs: identity.publicId,
    morphologyKey: identity.morphologyKey,
    semanticArtifactIdentity: repository ? semantic.provenance.artifactIdentity : null,
    semanticSourceIdentity: repository ? semantic.identity.sourceIdentity : null,
    semanticNormalizedReference: repository ? semantic.normalizedReference : null,
    corpusIdentity: MORPHOLOGY_USAGE_IDENTITY,
  };
}

function snapshotRequest(input: unknown): Readonly<OriginalLanguageStudyV3ResolvedRequest> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('request', 'original_language_study request must be an object.');
  const record = input as Record<string, unknown>;
  const unknown = Object.keys(record).find(key => !['reference', 'target', 'position', 'depth', 'cursor'].includes(key));
  if (unknown) throw new ValidationError(unknown, `Unknown argument "${unknown}".`);
  if (typeof record.reference !== 'string' || record.reference.length < 1 || record.reference.length > 100 || record.reference !== record.reference.trim()) throw new ValidationError('reference', 'reference must be a trimmed string from 1 to 100 characters.');
  if (typeof record.target !== 'string' || record.target.length < 1 || record.target.length > 100 || record.target !== record.target.trim()) throw new ValidationError('target', 'target must be a trimmed string from 1 to 100 characters.');
  if (record.position !== undefined && (!Number.isSafeInteger(record.position) || (record.position as number) < 1 || (record.position as number) > 200)) throw new ValidationError('position', 'position must be an integer from 1 to 200.');
  if (record.depth !== undefined && !['beginner', 'intermediate', 'technical'].includes(record.depth as string)) throw new ValidationError('depth', 'depth must be beginner, intermediate, or technical.');
  if (record.cursor !== undefined && (typeof record.cursor !== 'string' || record.cursor.length < 1)) throw new ValidationError('cursor', 'cursor must be a non-empty opaque string.');
  return Object.freeze({
    reference: record.reference,
    target: record.target,
    ...(record.position === undefined ? {} : { position: record.position as number }),
    depth: (record.depth ?? 'intermediate') as OriginalLanguageStudyDepth,
    ...(record.cursor === undefined ? {} : { cursor: record.cursor as string }),
  });
}

function cursorBinding(
  request: OriginalLanguageStudyV3ResolvedRequest,
  evidence: OriginalLanguageStudyV2ApplicationResult,
  operation: OriginalLanguageStudyCursorOperation,
) {
  try { return originalLanguageStudyV3CursorBinding(request, evidence, operation); }
  catch (error) { throw new ValidationError('cursor', (error as Error).message); }
}

function cursorBindingFromContext(
  request: OriginalLanguageStudyV3ResolvedRequest,
  context: OriginalLanguageStudyV2BeforePagedEvidenceContext,
  operation: OriginalLanguageStudyCursorOperation,
): OriginalLanguageStudyV3CursorBinding {
  const token = context.v1Result.selectedToken;
  if (!token) throw new ValidationError('cursor', 'v3 cursor binding requires one selected token');
  const rawIdentity = context.v1Result.identity?.publicStrongs ?? token.strongsNumber;
  const identity = typeof rawIdentity === 'string' ? parseStrongsIdentity(rawIdentity) : undefined;
  if (!identity || identity.publicId !== rawIdentity) {
    throw new ValidationError('cursor', 'v3 cursor binding requires one canonical Strong\'s identity');
  }
  const hebrew = context.v1Result.language === 'Hebrew'
    ? parseUbsPublicHebrewIdentity(identity.publicId)
    : undefined;
  return {
    requestReference: request.reference,
    requestTarget: request.target,
    requestPosition: request.position ?? null,
    depth: request.depth,
    operation,
    canonicalReference: context.canonicalReference.display,
    selectedToken: {
      position: token.position,
      text: token.text,
      lemma: token.lemma,
      strongsNumber: token.strongsNumber,
      morphologyCode: token.morphologyCode,
      gloss: token.gloss,
    },
    publicStrongs: identity.publicId,
    morphologyKey: identity.morphologyKey,
    semanticArtifactIdentity: hebrew ? context.semanticArtifactIdentity ?? null : null,
    semanticSourceIdentity: hebrew?.sourceIdentity ?? null,
    semanticNormalizedReference: hebrew ? context.canonicalReference.semanticKey : null,
    corpusIdentity: MORPHOLOGY_USAGE_IDENTITY,
  };
}
