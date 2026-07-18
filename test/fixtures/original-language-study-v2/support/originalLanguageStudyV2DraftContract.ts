import { createHash } from 'node:crypto';
import type { OriginalLanguageStudyDomainResult } from '../../../../src/services/languages/OriginalLanguageStudyService.js';
import type {
  FutureExactHebrewTokenAlignmentProof,
  UbsInternalHebrewLexicalIdentity,
  UbsPublicHebrewStrongs,
  UbsSemanticDefinitionExclusionReason,
} from '../../../../src/kernel/ubsSemanticDomain.js';

export const ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_SCHEMA_VERSION = '2' as const;
export const ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES = 32 * 1024;
export const ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_MARKDOWN_BYTES = 32 * 1024;
export const ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_MAX_LENGTH = 12 * 1024;
export const ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_OPERATION =
  'original_language_study_semantic_candidates' as const;

export type OriginalLanguageStudyV2DraftDetail = 'summary' | 'detailed';

export interface OriginalLanguageStudyV2DraftRequest {
  reference: string;
  target: string;
  position?: number;
  detail?: OriginalLanguageStudyV2DraftDetail;
  cursor?: string;
}

/**
 * A future exact proof is copied only from server-owned context.  Keeping the
 * draft seam structurally identical to the canonical proof type prevents this
 * fixture from accidentally becoming a weaker promotion path.
 */
export interface ServerVerifiedHebrewSemanticAlignment extends FutureExactHebrewTokenAlignmentProof {}

/** Server-owned context. None of these semantic identities are caller input. */
export interface OriginalLanguageStudyV2DraftAuthoritativeContext {
  v1Result: OriginalLanguageStudyDomainResult;
  semanticArtifactIdentity?: string;
  serverVerifiedAlignment?: ServerVerifiedHebrewSemanticAlignment;
}

export interface IOriginalLanguageStudyV2DraftContextProvider {
  resolve(request: Readonly<OriginalLanguageStudyV2DraftResolvedRequest>):
    Promise<OriginalLanguageStudyV2DraftAuthoritativeContext>;
}

export interface OriginalLanguageStudyV2DraftResolvedRequest {
  reference: string;
  target: string;
  position?: number;
  detail: OriginalLanguageStudyV2DraftDetail;
  cursor?: string;
}

export interface OriginalLanguageStudyV2DraftSelectedTokenWitness {
  position: number;
  text: string;
  lemma: string;
  strongsNumber: string | null;
  morphologyCode: string | null;
  gloss: string | null;
}

export interface OriginalLanguageStudyV2DraftCursorBinding {
  requestReference: string;
  requestTarget: string;
  requestPosition: number | null;
  canonicalReference: string;
  selectedToken: OriginalLanguageStudyV2DraftSelectedTokenWitness;
  publicStrongs: UbsPublicHebrewStrongs;
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
  normalizedReference: string;
  artifactIdentity: string;
}

/**
 * Deterministic server witness for a token selected by the current v1 study.
 * It is not a client credential: exact promotion also compares every clear
 * witness field, reference coordinate, provenance source, and candidate ID.
 */
export function deriveOriginalLanguageStudyV2MorphologyTokenIdentity(
  binding: Pick<OriginalLanguageStudyV2DraftCursorBinding,
    'canonicalReference' | 'normalizedReference' | 'selectedToken'>,
): string {
  const payload = JSON.stringify({
    version: 1,
    canonicalReference: binding.canonicalReference,
    normalizedReference: binding.normalizedReference,
    selectedToken: binding.selectedToken,
  });
  return `theologai-morphology-token.v1:${createHash('sha256').update(payload).digest('hex')}`;
}

export interface OriginalLanguageStudyV2DraftResultWindow {
  priorCount: number;
  returnedCount: number;
  consumedCount: number;
  totalCount: number;
  hasMore: boolean;
  continuation?: {
    cursor: string;
    operation: typeof ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_OPERATION;
  };
}

export interface OriginalLanguageStudyV2DraftCandidateIdentity {
  sourceId: string;
  sourceRole: 'dictionary';
  entryId: string;
  senseId: string;
  sourceAttestedReferenceCount: number;
  referenceEvidenceIds: readonly string[];
}

export type OriginalLanguageStudyV2DraftCandidate =
  | (OriginalLanguageStudyV2DraftCandidateIdentity & { detailStatus: 'summary' })
  | (OriginalLanguageStudyV2DraftCandidateIdentity & { detailStatus: 'omitted_response_byte_budget' })
  | (OriginalLanguageStudyV2DraftCandidateIdentity & {
      detailStatus: 'detailed';
      lemma: string;
      definitionStatus: 'published' | 'absent_in_source' | 'excluded_unresolved_markup';
      definition?: string;
      definitionExclusionReasons: readonly UbsSemanticDefinitionExclusionReason[];
      glosses: readonly string[];
      domains: readonly {
        sourceId: string;
        sourceRole: 'lexical_domains';
        domainId: string;
        label: string;
        description?: string;
      }[];
      domainTotal: number;
      referenceEvidence: readonly {
        sourceId: string;
        sourceRole: 'dictionary';
        senseId: string;
        evidenceId: string;
        sourceReference: string;
        normalizedReference: string;
        kind: 'source_attested_sense_reference';
      }[];
      referenceEvidenceTotal: number;
    });

export interface OriginalLanguageStudyV2DraftProvenanceSource {
  sourceId: string;
  sourceRole: 'dictionary' | 'lexical_domains';
  artifactName: 'UBSHebrewDic-v0.9.2-en.JSON' | 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON';
  artifactVersion: '0.9.2';
  artifactIdentity: string;
  sourceUrl: string;
  sourceCommit: string;
  sourceBlob: string;
  sourceSha256: string;
  publisher: 'United Bible Societies';
  license: 'CC BY-SA 4.0';
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/';
  transformVersion: 7;
  modified: true;
  modificationNote: string;
}

export interface OriginalLanguageStudyV2DraftAlignmentEvidence
  extends ServerVerifiedHebrewSemanticAlignment {}

interface HebrewRepositoryEvidenceCommon {
  language: 'Hebrew';
  plainLanguage: string;
  identity: {
    publicStrongs: UbsPublicHebrewStrongs;
    sourceIdentity: UbsInternalHebrewLexicalIdentity;
  };
  normalizedReference: string;
  resultWindow: OriginalLanguageStudyV2DraftResultWindow;
  provenance: {
    artifactIdentity: string;
    sources: readonly [OriginalLanguageStudyV2DraftProvenanceSource, OriginalLanguageStudyV2DraftProvenanceSource];
  };
  withheldEvidence: readonly [
    { source: 'TBESH'; field: 'Meaning'; status: 'withheld_rights_boundary' },
    { source: 'UBS Hebrew dictionary'; field: 'A#### lexical identities'; status: 'withheld_public_v2_scope' },
  ];
}

export type OriginalLanguageStudyV2DraftSemanticEvidence =
  | {
      language: 'Greek';
      status: 'not_applicable';
      reason: 'hebrew_semantic_evidence_not_applicable';
      plainLanguage: string;
    }
  | {
      language: 'Hebrew';
      status: 'unavailable';
      reason: 'selected_token_required' | 'no_usable_hebrew_identity';
      plainLanguage: string;
    }
  | (HebrewRepositoryEvidenceCommon & {
      status: 'unavailable';
      reason: 'no_lexical_entry' | 'no_publishable_semantic_evidence';
      candidates: readonly [];
    })
  | (HebrewRepositoryEvidenceCommon & {
      status: 'lexical_candidates';
      reason: 'no_reference_evidence' | 'reference_alignment_unproven' | 'ambiguous_reference_alignment';
      candidates: readonly OriginalLanguageStudyV2DraftCandidate[];
    })
  | (HebrewRepositoryEvidenceCommon & {
      status: 'reference_aligned_source_candidate';
      candidates: readonly [OriginalLanguageStudyV2DraftCandidate];
      alignmentEvidence: OriginalLanguageStudyV2DraftAlignmentEvidence;
    });

export interface OriginalLanguageStudyV2DraftResult {
  schemaVersion: typeof ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_SCHEMA_VERSION;
  kind: 'original_language_study';
  detail: OriginalLanguageStudyV2DraftDetail;
  request: {
    reference: string;
    target: string;
    position?: number;
  };
  /** Exact complete current v1 structured output, composed rather than replaced. */
  study: Record<string, unknown>;
  semanticEvidence: OriginalLanguageStudyV2DraftSemanticEvidence;
  responseWindow: {
    unit: 'utf8_bytes';
    maximum: typeof ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_RESPONSE_BYTES;
    used: number;
    truncated: false;
  };
}

interface WrapperCursorPayload {
  version: 1;
  operation: typeof ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_OPERATION;
  contextDigest: string;
  repositoryCursor: string;
}

export function originalLanguageStudyV2DraftContextDigest(
  binding: OriginalLanguageStudyV2DraftCursorBinding,
): string {
  return createHash('sha256').update(JSON.stringify([
    binding.requestReference,
    binding.requestTarget,
    binding.requestPosition,
    binding.canonicalReference,
    binding.selectedToken.position,
    binding.selectedToken.text,
    binding.selectedToken.lemma,
    binding.selectedToken.strongsNumber,
    binding.selectedToken.morphologyCode,
    binding.selectedToken.gloss,
    binding.publicStrongs,
    binding.sourceIdentity,
    binding.normalizedReference,
    binding.artifactIdentity,
  ])).digest('hex');
}

export function createOriginalLanguageStudyV2DraftCursor(
  repositoryCursor: string,
  binding: OriginalLanguageStudyV2DraftCursorBinding,
): string {
  if (!/^ubsa1_(?:[0-9a-f]{2})+$/.test(repositoryCursor) || repositoryCursor.length > 4096) {
    throw new Error('original_language_study v2 wrapper requires a bounded canonical aggregate cursor');
  }
  const payload: WrapperCursorPayload = {
    version: 1,
    operation: ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_OPERATION,
    contextDigest: originalLanguageStudyV2DraftContextDigest(binding),
    repositoryCursor,
  };
  const cursor = `olsv2c1_${[...new TextEncoder().encode(JSON.stringify(payload))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (cursor.length > ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_MAX_LENGTH) {
    throw new Error('original_language_study v2 context-bound cursor exceeds its byte-safe bound');
  }
  return cursor;
}

export function parseOriginalLanguageStudyV2DraftCursor(
  cursor: string,
  binding: OriginalLanguageStudyV2DraftCursorBinding,
): string {
  if (typeof cursor !== 'string' || cursor.length > ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_MAX_LENGTH
    || !/^olsv2c1_(?:[0-9a-f]{2})+$/.test(cursor)) {
    throw new Error('original_language_study v2 cursor has an invalid bounded encoding');
  }
  let decoded: unknown;
  try {
    const bytes = cursor.slice(8).match(/../g)!.map(byte => Number.parseInt(byte, 16));
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)));
  } catch {
    throw new Error('original_language_study v2 cursor has an invalid payload');
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('original_language_study v2 cursor payload must be an object');
  }
  const payload = decoded as Partial<WrapperCursorPayload>;
  if (Object.keys(payload).join(',') !== 'version,operation,contextDigest,repositoryCursor'
    || payload.version !== 1
    || payload.operation !== ORIGINAL_LANGUAGE_STUDY_V2_DRAFT_CURSOR_OPERATION
    || payload.contextDigest !== originalLanguageStudyV2DraftContextDigest(binding)
    || typeof payload.repositoryCursor !== 'string') {
    throw new Error('original_language_study v2 cursor does not match the full selected-token request context');
  }
  const canonical = createOriginalLanguageStudyV2DraftCursor(payload.repositoryCursor, binding);
  if (canonical !== cursor) throw new Error('original_language_study v2 cursor is not canonical');
  return payload.repositoryCursor;
}
