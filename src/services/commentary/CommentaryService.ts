/**
 * Commentary service with adapter routing.
 *
 * Routes commentary requests to HelloAO or CCEL adapters.
 */

import type { CommentaryAdapter } from '../../adapters/commentary/CommentaryAdapter.js';
import type {
  CommentaryAdapterResult,
  CommentaryCoverageEvidence,
  CommentaryLookupParams,
  CommentaryLookupResult,
  CommentaryResult,
} from '../../kernel/types.js';
import { formatReference, parseReference, referencesEqual } from '../../kernel/reference.js';
import { APIError, NotFoundError, ValidationError } from '../../kernel/errors.js';
import {
  resolveCommentaryCatalogEntry,
  type CommentaryCatalogEntry,
} from '../../kernel/commentaryCatalog.js';

const MAX_COMMENTARY_TEXT_CODE_POINTS = 2 * 1024 * 1024;

export class CommentaryService {
  constructor(private adapters: CommentaryAdapter[]) {}

  async lookup(params: CommentaryLookupParams): Promise<CommentaryLookupResult> {
    const commentator = params.commentator || 'Matthew Henry';
    const ref = parseReference(params.reference);
    if (ref.endVerse != null) {
      throw new ValidationError(
        'reference',
        'Commentary verse ranges are not supported; request one verse or a full chapter.',
      );
    }

    for (const adapter of this.adapters) {
      const supported = adapter.supportedCommentators.some(
        c => c.toLowerCase() === commentator.toLowerCase()
      );
      if (supported) {
        const result = await adapter.getCommentary(ref, commentator);
        this.assertResultConsistency(ref, result);
        const catalogEntry = resolveCommentaryCatalogEntry(commentator);
        const returnedCatalogEntry = resolveCommentaryCatalogEntry(result.commentator);
        if (!catalogEntry || returnedCatalogEntry?.canonicalName !== catalogEntry.canonicalName) {
          throw new APIError(502, 'Commentary provider returned commentary for a different commentator.');
        }
        this.assertCoverageEvidence(ref, result.coverage, catalogEntry);
        if (!/^sha256:[0-9a-f]{64}$/.test(result.providerRevision)) {
          throw new APIError(502, 'Commentary provider returned an invalid corpus revision.');
        }

        const sourceCharacters = Array.from(result.text).length;
        if (sourceCharacters > MAX_COMMENTARY_TEXT_CODE_POINTS) {
          throw new APIError(502, 'Commentary provider returned an oversized commentary payload.');
        }
        let commentary: CommentaryResult = {
          reference: result.reference,
          commentator: result.commentator,
          text: result.text,
          citation: { ...result.citation },
        };

        // Apply maxLength if specified
        if (params.maxLength && result.text.length > params.maxLength) {
          commentary = {
            ...commentary,
            text: truncateWithEllipsis(result.text, params.maxLength),
          };
        }

        const returnedCharacters = Array.from(commentary.text).length;
        return {
          commentary,
          resolvedReference: formatReference(ref),
          canonicalCommentator: catalogEntry.canonicalName,
          coverage: cloneCoverage(result.coverage),
          providerRevision: result.providerRevision,
          textWindow: {
            unit: 'unicode_code_points',
            returnedCharacters,
            sourceCharacters,
            truncated: returnedCharacters < sourceCharacters,
          },
        };
      }
    }

    throw new NotFoundError(
      'commentator',
      `Unknown commentator: "${commentator}". Available: ${this.getAvailableCommentators().join(', ')}`
    );
  }

  /** Prevent a provider from returning adjacent or otherwise mislabeled commentary. */
  private assertResultConsistency(ref: ReturnType<typeof parseReference>, result: CommentaryResult): void {
    if (!result || typeof result.reference !== 'string' || typeof result.commentator !== 'string' || typeof result.text !== 'string') {
      throw new APIError(502, 'Commentary provider returned an invalid result.');
    }

    let returnedRef: ReturnType<typeof parseReference>;
    try {
      returnedRef = parseReference(result.reference);
    } catch {
      throw new APIError(502, 'Commentary provider returned an invalid reference.');
    }

    if (!referencesEqual(ref, returnedRef)) {
      throw new APIError(502, 'Commentary provider returned commentary for a different reference.');
    }
    if (!result.text.trim()) {
      throw new APIError(502, 'Commentary provider returned empty commentary.');
    }
  }

  /** Reject forged or request-derived coverage that is not allowed by the source catalog. */
  private assertCoverageEvidence(
    ref: ReturnType<typeof parseReference>,
    coverage: CommentaryAdapterResult['coverage'],
    catalogEntry: CommentaryCatalogEntry,
  ): void {
    if (!coverage || typeof coverage !== 'object' || !coverage.providerIdentity) {
      throw new APIError(502, 'Commentary provider returned invalid coverage evidence.');
    }

    if (ref.startVerse == null) {
      if (coverage.requestedScope !== 'chapter'
          || coverage.returnedGranularity !== 'chapter_aggregate'
          || coverage.identityBasis !== 'provider_chapter_payload'
          || coverage.providerIdentity.field !== 'chapter_payload'
          || coverage.providerIdentity.chapter !== ref.chapter) {
        throw new APIError(502, 'Commentary provider returned invalid chapter coverage evidence.');
      }
      return;
    }

    if (coverage.requestedScope !== 'verse'
        || coverage.returnedGranularity !== 'exact_verse'
        || coverage.providerIdentity.value !== ref.startVerse) {
      throw new APIError(502, 'Commentary provider returned invalid exact-verse coverage evidence.');
    }
    if (catalogEntry.scalarPolicy.kind === 'chapter_only') {
      throw new APIError(502, 'Commentary provider returned exact-verse coverage for a chapter-only work.');
    }
    if (coverage.providerIdentity.field === 'verseNumber') {
      if (coverage.identityBasis !== 'provider_verse_number') {
        throw new APIError(502, 'Commentary provider returned inconsistent verse identity evidence.');
      }
      return;
    }
    if (catalogEntry.scalarPolicy.kind !== 'verse_number_or_typed_number'
        || coverage.identityBasis !== 'provider_typed_verse_number'
        || coverage.providerIdentity.entryType !== 'verse') {
      throw new APIError(502, 'Commentary provider returned untrusted numbered-entry evidence.');
    }
  }

  getAvailableCommentators(): string[] {
    const all: string[] = [];
    for (const adapter of this.adapters) {
      all.push(...adapter.supportedCommentators);
    }
    return all;
  }
}

function cloneCoverage(coverage: CommentaryCoverageEvidence): CommentaryCoverageEvidence {
  if (coverage.requestedScope === 'chapter') {
    return { ...coverage, providerIdentity: { ...coverage.providerIdentity } };
  }
  if (coverage.identityBasis === 'provider_verse_number') {
    return { ...coverage, providerIdentity: { ...coverage.providerIdentity } };
  }
  return { ...coverage, providerIdentity: { ...coverage.providerIdentity } };
}

/** Keep the ellipsis inside the requested Unicode-character budget. */
function truncateWithEllipsis(value: string, maxLength: number): string {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  if (maxLength === 1) return '…';
  return `${characters.slice(0, maxLength - 1).join('')}…`;
}
