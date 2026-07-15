import {
  commentaryCatalogEntry,
  HELLOAO_COMMENTARY_DELIVERY,
  HELLOAO_COMMENTARY_DELIVERY_ID,
} from '../kernel/commentaryCatalog.js';
import type { CommentaryLookupResult } from '../kernel/types.js';
import type { CommentaryOutputV1 } from '../mcp/schemas/commentary.js';

/** Present provider-attested coverage while separating work rights from delivery. */
export function presentCommentaryStructured(
  requestedReference: string,
  maxResponseCharacters: number | null,
  result: CommentaryLookupResult,
): CommentaryOutputV1 {
  const catalogEntry = commentaryCatalogEntry(result.canonicalCommentator);
  const work = catalogEntry.workProvenance;
  if (result.commentary.commentator !== catalogEntry.resultDisplayName) {
    throw new Error('Commentary result identity does not match its canonical commentator');
  }

  return {
    schemaVersion: '1',
    kind: 'commentary_lookup',
    requestedReference,
    resolvedReference: result.resolvedReference,
    query: { commentator: result.canonicalCommentator, maxResponseCharacters },
    coverage: presentCoverage(result.coverage),
    commentary: {
      commentator: result.canonicalCommentator,
      text: result.commentary.text,
      textFormat: 'text/markdown',
      textWindow: { ...result.textWindow },
      provenanceIds: [work.id, HELLOAO_COMMENTARY_DELIVERY_ID],
    },
    retrieval: {
      mode: 'remote_cached_or_live',
      providerId: HELLOAO_COMMENTARY_DELIVERY_ID,
      providerRevision: result.providerRevision,
      cacheStatus: 'not_exposed',
    },
    provenance: [
      { ...work, ...(work.license ? { license: { ...work.license } } : {}) },
      { ...HELLOAO_COMMENTARY_DELIVERY },
    ],
  };
}

function presentCoverage(
  coverage: CommentaryLookupResult['coverage'],
): CommentaryOutputV1['coverage'] {
  if (coverage.requestedScope === 'chapter') {
    return {
      ...coverage,
      providerIdentity: { ...coverage.providerIdentity },
      sectionSpanClaim: 'none',
    };
  }
  if (coverage.identityBasis === 'provider_verse_number') {
    return {
      ...coverage,
      providerIdentity: { ...coverage.providerIdentity },
      sectionSpanClaim: 'none',
    };
  }
  return {
    ...coverage,
    providerIdentity: { ...coverage.providerIdentity },
    sectionSpanClaim: 'none',
  };
}
