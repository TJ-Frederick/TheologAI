import type { OriginalLanguageStudyDomainResult } from '../services/languages/OriginalLanguageStudyService.js';
import { sha256Hex } from './sha256.js';
import type {
  FutureExactHebrewTokenAlignmentProof,
  UbsInternalHebrewLexicalIdentity,
  UbsPublicHebrewStrongs,
  UbsSemanticDefinitionExclusionReason,
} from './ubsSemanticDomain.js';

/**
 * Inactive, server-owned contract for a future hard cut from the current
 * original_language_study response to schema v2.  Nothing in this module
 * registers a tool or gives callers a way to supply semantic identities.
 */
export const ORIGINAL_LANGUAGE_STUDY_V2_SCHEMA_VERSION = '2' as const;
export const ORIGINAL_LANGUAGE_STUDY_V2_RESPONSE_BYTES = 32 * 1024;
/**
 * The exact established v1 Markdown prefix remains uncapped. Only the new v2
 * semantic suffix is independently bounded, so activating v2 can never make
 * an otherwise valid v1 rendering fail merely because of its existing size.
 * The 16 KiB ceiling leaves substantial room beneath the 32 KiB structured
 * response budget while preventing escaped semantic fields from expanding
 * without limit in text clients.
 */
export const ORIGINAL_LANGUAGE_STUDY_V2_ADDED_SEMANTIC_MARKDOWN_BYTES = 16 * 1024;
export const ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_MAX_LENGTH = 12 * 1024;
export const ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_OPERATION =
  'original_language_study_semantic_candidates' as const;

export type OriginalLanguageStudyV2Detail = 'summary' | 'detailed';

export interface OriginalLanguageStudyV2Request {
  reference: string;
  target: string;
  position?: number;
  /** Summary is the public default once this inactive contract is activated. */
  detail?: OriginalLanguageStudyV2Detail;
  cursor?: string;
}

/** A proof may only be copied from a future server-owned verifier. */
export interface ServerVerifiedHebrewSemanticAlignment extends FutureExactHebrewTokenAlignmentProof {}

/**
 * Server-owned context.  The coordinator snapshots it before composition so
 * callers cannot inject source IDs, artifact identities, or alignment proofs.
 */
export interface OriginalLanguageStudyV2AuthoritativeContext {
  v1Result: OriginalLanguageStudyDomainResult;
  semanticArtifactIdentity?: string;
  serverVerifiedAlignment?: ServerVerifiedHebrewSemanticAlignment;
}

export interface IOriginalLanguageStudyV2ContextProvider {
  resolve(request: Readonly<OriginalLanguageStudyV2ResolvedRequest>):
    Promise<OriginalLanguageStudyV2AuthoritativeContext>;
}

export interface OriginalLanguageStudyV2ResolvedRequest {
  reference: string;
  target: string;
  position?: number;
  detail: OriginalLanguageStudyV2Detail;
  cursor?: string;
}

export interface OriginalLanguageStudyV2SelectedTokenWitness {
  position: number;
  text: string;
  lemma: string;
  strongsNumber: string | null;
  morphologyCode: string | null;
  gloss: string | null;
}

export interface OriginalLanguageStudyV2CursorBinding {
  requestReference: string;
  requestTarget: string;
  requestPosition: number | null;
  canonicalReference: string;
  selectedToken: OriginalLanguageStudyV2SelectedTokenWitness;
  publicStrongs: UbsPublicHebrewStrongs;
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
  normalizedReference: string;
  artifactIdentity: string;
}

/**
 * Deterministic witness for the token selected by the composed v1 study.  It
 * is an integrity binding, not a caller credential or a semantic verdict.
 */
export function deriveOriginalLanguageStudyV2MorphologyTokenIdentity(
  binding: Pick<OriginalLanguageStudyV2CursorBinding,
    'canonicalReference' | 'normalizedReference' | 'selectedToken'>,
): string {
  return `theologai-morphology-token.v1:${sha256Hex(JSON.stringify({
    version: 1,
    canonicalReference: binding.canonicalReference,
    normalizedReference: binding.normalizedReference,
    selectedToken: binding.selectedToken,
  }))}`;
}

export interface OriginalLanguageStudyV2ResultWindow {
  priorCount: number;
  returnedCount: number;
  consumedCount: number;
  totalCount: number;
  hasMore: boolean;
  continuation?: {
    cursor: string;
    operation: typeof ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_OPERATION;
  };
}

export interface OriginalLanguageStudyV2CandidateIdentity {
  sourceId: string;
  sourceRole: 'dictionary';
  entryId: string;
  senseId: string;
  sourceAttestedReferenceCount: number;
  referenceEvidenceIds: readonly string[];
}

export type OriginalLanguageStudyV2Candidate =
  | (OriginalLanguageStudyV2CandidateIdentity & { detailStatus: 'summary' })
  | (OriginalLanguageStudyV2CandidateIdentity & { detailStatus: 'omitted_response_byte_budget' })
  | (OriginalLanguageStudyV2CandidateIdentity & {
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

/** Attribution is intentionally limited to the two pinned public artifacts. */
export interface OriginalLanguageStudyV2ProvenanceSource {
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

export interface OriginalLanguageStudyV2AlignmentEvidence
  extends ServerVerifiedHebrewSemanticAlignment {}

interface HebrewRepositoryEvidenceCommon {
  language: 'Hebrew';
  plainLanguage: string;
  identity: {
    publicStrongs: UbsPublicHebrewStrongs;
    sourceIdentity: UbsInternalHebrewLexicalIdentity;
  };
  normalizedReference: string;
  resultWindow: OriginalLanguageStudyV2ResultWindow;
  provenance: {
    artifactIdentity: string;
    sources: readonly [OriginalLanguageStudyV2ProvenanceSource, OriginalLanguageStudyV2ProvenanceSource];
  };
  withheldEvidence: readonly [
    { source: 'TBESH'; field: 'Meaning'; status: 'withheld_rights_boundary' },
    { source: 'UBS Hebrew dictionary'; field: 'A#### lexical identities'; status: 'withheld_public_v2_scope' },
  ];
}

export type OriginalLanguageStudyV2SemanticEvidence =
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
      candidates: readonly OriginalLanguageStudyV2Candidate[];
    })
  | (HebrewRepositoryEvidenceCommon & {
      status: 'reference_aligned_source_candidate';
      candidates: readonly [OriginalLanguageStudyV2Candidate];
      alignmentEvidence: OriginalLanguageStudyV2AlignmentEvidence;
    });

export interface OriginalLanguageStudyV2Result {
  schemaVersion: typeof ORIGINAL_LANGUAGE_STUDY_V2_SCHEMA_VERSION;
  kind: 'original_language_study';
  detail: OriginalLanguageStudyV2Detail;
  request: {
    reference: string;
    target: string;
    position?: number;
  };
  /** Exact complete current v1 structured output, composed rather than replaced. */
  study: Record<string, unknown>;
  semanticEvidence: OriginalLanguageStudyV2SemanticEvidence;
  responseWindow: {
    unit: 'utf8_bytes';
    maximum: typeof ORIGINAL_LANGUAGE_STUDY_V2_RESPONSE_BYTES;
    used: number;
    truncated: false;
  };
}

interface WrapperCursorPayload {
  version: 1;
  operation: typeof ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_OPERATION;
  contextDigest: string;
  repositoryCursor: string;
}

export function originalLanguageStudyV2ContextDigest(
  binding: OriginalLanguageStudyV2CursorBinding,
): string {
  return sha256Hex(JSON.stringify([
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
  ]));
}

export function createOriginalLanguageStudyV2Cursor(
  repositoryCursor: string,
  binding: OriginalLanguageStudyV2CursorBinding,
): string {
  if (!/^ubsa1_(?:[0-9a-f]{2})+$/.test(repositoryCursor) || repositoryCursor.length > 4096) {
    throw new Error('original_language_study v2 wrapper requires a bounded canonical aggregate cursor');
  }
  const payload: WrapperCursorPayload = {
    version: 1,
    operation: ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_OPERATION,
    contextDigest: originalLanguageStudyV2ContextDigest(binding),
    repositoryCursor,
  };
  const cursor = `olsv2c1_${[...new TextEncoder().encode(JSON.stringify(payload))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (cursor.length > ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_MAX_LENGTH) {
    throw new Error('original_language_study v2 context-bound cursor exceeds its byte-safe bound');
  }
  return cursor;
}

export function parseOriginalLanguageStudyV2Cursor(
  cursor: string,
  binding: OriginalLanguageStudyV2CursorBinding,
): string {
  if (typeof cursor !== 'string' || cursor.length > ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_MAX_LENGTH
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
    || payload.operation !== ORIGINAL_LANGUAGE_STUDY_V2_CURSOR_OPERATION
    || payload.contextDigest !== originalLanguageStudyV2ContextDigest(binding)
    || typeof payload.repositoryCursor !== 'string') {
    throw new Error('original_language_study v2 cursor does not match the full selected-token request context');
  }
  const canonical = createOriginalLanguageStudyV2Cursor(payload.repositoryCursor, binding);
  if (canonical !== cursor) throw new Error('original_language_study v2 cursor is not canonical');
  return payload.repositoryCursor;
}
