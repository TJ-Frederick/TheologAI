import { sha256Hex } from './sha256.js';
import { MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH } from './morphologyUsageCursor.js';
import type {
  OriginalLanguageStudyV2AlignmentEvidence,
  OriginalLanguageStudyV2Candidate,
  OriginalLanguageStudyV2ProvenanceSource,
  OriginalLanguageStudyV2SelectedTokenWitness,
} from './originalLanguageStudyV2Contract.js';

export const ORIGINAL_LANGUAGE_STUDY_SCHEMA_VERSION = '3' as const;
export const ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES = 32 * 1024;
export const ORIGINAL_LANGUAGE_STUDY_ADDED_MARKDOWN_BYTES = 16 * 1024;
export const ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES = 32 * 1024;
export const ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH = 12 * 1024;
export const ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE = 20;

export const ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION =
  'original_language_study_semantic_candidates' as const;
export const ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION =
  'original_language_study_corpus_occurrences' as const;

export type OriginalLanguageStudyDepth = 'beginner' | 'intermediate' | 'technical';
export type OriginalLanguageStudyCursorOperation =
  | typeof ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION
  | typeof ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION;

export interface OriginalLanguageStudyV3Request {
  reference: string;
  target: string;
  position?: number;
  depth?: OriginalLanguageStudyDepth;
  cursor?: string;
}

export interface OriginalLanguageStudyV3ResolvedRequest {
  reference: string;
  target: string;
  position?: number;
  depth: OriginalLanguageStudyDepth;
  cursor?: string;
}

/** Every identity that can change the meaning or position of a continuation. */
export interface OriginalLanguageStudyV3CursorBinding {
  requestReference: string;
  requestTarget: string;
  requestPosition: number | null;
  depth: OriginalLanguageStudyDepth;
  operation: OriginalLanguageStudyCursorOperation;
  canonicalReference: string;
  selectedToken: OriginalLanguageStudyV2SelectedTokenWitness;
  publicStrongs: string;
  morphologyKey: string;
  semanticArtifactIdentity: string | null;
  semanticSourceIdentity: string | null;
  semanticNormalizedReference: string | null;
  corpusIdentity: string;
}

export interface OriginalLanguageStudyV3SemanticResultWindow {
  priorCount: number;
  returnedCount: number;
  consumedCount: number;
  totalCount: number;
  hasMore: boolean;
  continuation?: {
    cursor: string;
    operation: typeof ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION;
  };
}

export interface OriginalLanguageStudyV3WithheldEvidence {
  source: 'TBESH' | 'UBS Hebrew dictionary';
  field: 'Meaning' | 'A#### lexical identities';
  status: 'withheld_rights_boundary' | 'withheld_public_scope';
}

interface HebrewRepositoryEvidenceCommon {
  language: 'Hebrew';
  plainLanguage: string;
  identity: { publicStrongs: string; sourceIdentity: string };
  normalizedReference: string;
  resultWindow: OriginalLanguageStudyV3SemanticResultWindow;
  provenance: {
    artifactIdentity: string;
    sources: readonly [OriginalLanguageStudyV2ProvenanceSource, OriginalLanguageStudyV2ProvenanceSource];
  };
  withheldEvidence: readonly [OriginalLanguageStudyV3WithheldEvidence, OriginalLanguageStudyV3WithheldEvidence];
}

export type OriginalLanguageStudyV3SemanticEvidence =
  | { language: 'Greek'; status: 'not_applicable'; reason: 'hebrew_semantic_evidence_not_applicable'; plainLanguage: string }
  | { language: 'Hebrew'; status: 'unavailable'; reason: 'selected_token_required' | 'no_usable_hebrew_identity'; plainLanguage: string }
  | (HebrewRepositoryEvidenceCommon & { status: 'unavailable'; reason: 'no_lexical_entry' | 'no_publishable_semantic_evidence'; candidates: readonly [] })
  | (HebrewRepositoryEvidenceCommon & { status: 'lexical_candidates'; reason: 'no_reference_evidence' | 'reference_alignment_unproven' | 'ambiguous_reference_alignment'; candidates: readonly OriginalLanguageStudyV2Candidate[] })
  | (HebrewRepositoryEvidenceCommon & { status: 'reference_aligned_source_candidate'; candidates: readonly [OriginalLanguageStudyV2Candidate]; alignmentEvidence: OriginalLanguageStudyV2AlignmentEvidence });

export interface OriginalLanguageStudyLexicalRangeCue {
  sourceId: string;
  sourceKind: 'dictionary' | 'stepbible_lexicon';
  evidenceKind: 'definition' | 'gloss';
  text: string;
  provenanceIds: readonly string[];
}

export type OriginalLanguageStudyLexicalRange =
  | { status: 'available'; scope: 'source_attested_non_exhaustive'; cues: readonly OriginalLanguageStudyLexicalRangeCue[]; notice: string }
  | { status: 'unavailable'; scope: 'source_attested_non_exhaustive'; reason: 'no_publishable_lexical_cues'; cues: readonly []; notice: string };

export interface OriginalLanguageStudyCorpusOccurrence {
  book: string;
  canonicalOrder: number;
  chapter: number;
  verse: number;
  position: number;
  sourceForm: string;
  lemma: string;
  exactMorphologyKey: string;
  morphologyCode: string | null;
  gloss: string | null;
}

export type OriginalLanguageStudyCorpusOccurrences =
  | {
      status: 'available';
      exactMorphologyKey: string;
      publicStrongs: string;
      corpusIdentity: string;
      attested: boolean;
      totals: { tokenCount: number; verseCount: number; bookCount: number; sourceSurfaceVariantCount: number };
      occurrences: readonly OriginalLanguageStudyCorpusOccurrence[];
      resultWindow: {
        returnedCount: number;
        maximumReturned: typeof ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE;
        hasMore: boolean;
        continuation?: { cursor: string; operation: typeof ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION };
      };
      cautions: readonly string[];
    }
  | { status: 'unavailable'; reason: 'selected_token_required' | 'no_usable_strongs_identity'; plainLanguage: string }
  | { status: 'not_requested_continuation'; reason: 'semantic_continuation_only'; plainLanguage: string };

export interface OriginalLanguageStudyV3Result {
  schemaVersion: typeof ORIGINAL_LANGUAGE_STUDY_SCHEMA_VERSION;
  kind: 'original_language_study';
  depth: OriginalLanguageStudyDepth;
  request: { reference: string; target: string; position?: number };
  study: Record<string, unknown>;
  lexicalRange: OriginalLanguageStudyLexicalRange;
  englishTranslationComparison: { status: 'not_performed'; responsibility: 'guided_prompt'; reason: 'english_translations_are_retrieved_separately' };
  contextualInterpretation: { status: 'not_performed'; responsibility: 'guided_prompt'; reason: 'deterministic_tool_does_not_select_contextual_meaning' };
  semanticEvidence: OriginalLanguageStudyV3SemanticEvidence;
  corpusOccurrences?: OriginalLanguageStudyCorpusOccurrences;
  responseWindow: { unit: 'utf8_bytes'; maximum: typeof ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES; used: number; truncated: false };
}

interface CursorPayload {
  version: 1;
  contract: 'original_language_study.v3';
  operation: OriginalLanguageStudyCursorOperation;
  contextDigest: string;
  repositoryCursor: string;
}

export function originalLanguageStudyV3ContextDigest(
  binding: OriginalLanguageStudyV3CursorBinding,
  repositoryCursor: string,
): string {
  return sha256Hex(JSON.stringify({
    requestReference: binding.requestReference,
    requestTarget: binding.requestTarget,
    requestPosition: binding.requestPosition,
    depth: binding.depth,
    operation: binding.operation,
    canonicalReference: binding.canonicalReference,
    selectedToken: binding.selectedToken,
    publicStrongs: binding.publicStrongs,
    morphologyKey: binding.morphologyKey,
    semanticArtifactIdentity: binding.semanticArtifactIdentity,
    semanticSourceIdentity: binding.semanticSourceIdentity,
    semanticNormalizedReference: binding.semanticNormalizedReference,
    corpusIdentity: binding.corpusIdentity,
    repositoryCursor,
  }));
}

export function createOriginalLanguageStudyV3Cursor(repositoryCursor: string, binding: OriginalLanguageStudyV3CursorBinding): string {
  assertRepositoryCursor(binding.operation, repositoryCursor);
  const payload: CursorPayload = {
    version: 1,
    contract: 'original_language_study.v3',
    operation: binding.operation,
    contextDigest: originalLanguageStudyV3ContextDigest(binding, repositoryCursor),
    repositoryCursor,
  };
  const cursor = encodeCursorPayload(payload);
  if (cursor.length > ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH) throw new Error('original_language_study v3 cursor exceeds its bound');
  return cursor;
}

/** Decode only enough to route the opaque cursor. No repository call may trust this result. */
export function decodeOriginalLanguageStudyV3Cursor(cursor: string): Pick<CursorPayload, 'operation' | 'repositoryCursor'> {
  if (cursor.startsWith('olsv2c1_')) throw new Error('schema version 2 cursor is unsupported and stale; request a fresh schema version 3 result');
  if (cursor.length > ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH || !/^olsv3c1_[A-Za-z0-9_-]+$/u.test(cursor)) throw new Error('original_language_study v3 cursor has an invalid bounded encoding');
  let decoded: unknown;
  try { decoded = JSON.parse(decodeBase64Url(cursor.slice(8))); }
  catch { throw new Error('original_language_study v3 cursor has an invalid payload'); }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('original_language_study v3 cursor payload must be an object');
  const payload = decoded as Partial<CursorPayload>;
  if (Object.keys(payload).join(',') !== 'version,contract,operation,contextDigest,repositoryCursor'
    || payload.version !== 1 || payload.contract !== 'original_language_study.v3'
    || (payload.operation !== ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION && payload.operation !== ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION)
    || typeof payload.contextDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(payload.contextDigest)
    || typeof payload.repositoryCursor !== 'string') throw new Error('original_language_study v3 cursor has an invalid closed payload');
  assertRepositoryCursor(payload.operation, payload.repositoryCursor);
  if (encodeCursorPayload(payload as CursorPayload) !== cursor) throw new Error('original_language_study v3 cursor is not canonical');
  return { operation: payload.operation, repositoryCursor: payload.repositoryCursor };
}

export function parseOriginalLanguageStudyV3Cursor(cursor: string, binding: OriginalLanguageStudyV3CursorBinding): string {
  const routed = decodeOriginalLanguageStudyV3Cursor(cursor);
  if (routed.operation !== binding.operation) throw new Error('original_language_study v3 cursor operation does not match its request');
  const canonical = createOriginalLanguageStudyV3Cursor(routed.repositoryCursor, binding);
  if (canonical !== cursor) throw new Error('original_language_study v3 cursor does not match the full evidence context');
  return routed.repositoryCursor;
}

export function selectedTokenWitnessFromStudy(study: Record<string, unknown>): OriginalLanguageStudyV2SelectedTokenWitness | undefined {
  const context = study.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return undefined;
  const token = (context as Record<string, unknown>).selectedToken;
  if (!token || typeof token !== 'object' || Array.isArray(token)) return undefined;
  const value = token as Record<string, unknown>;
  if (typeof value.position !== 'number' || typeof value.text !== 'string' || typeof value.lemma !== 'string') return undefined;
  return { position: value.position, text: value.text, lemma: value.lemma, strongsNumber: typeof value.strongsNumber === 'string' ? value.strongsNumber : null, morphologyCode: typeof value.morphologyCode === 'string' ? value.morphologyCode : null, gloss: typeof value.gloss === 'string' ? value.gloss : null };
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function encodeCursorPayload(payload: CursorPayload): string {
  return `olsv3c1_${encodeBase64Url(JSON.stringify(payload))}`;
}

function assertRepositoryCursor(operation: OriginalLanguageStudyCursorOperation, cursor: string): void {
  if (operation === ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION) {
    if (cursor.length > 12 * 1024 || !/^olsv2c1_(?:[0-9a-f]{2})+$/u.test(cursor)) {
      throw new Error('original_language_study v3 semantic continuation has an invalid repository cursor');
    }
    return;
  }
  if (cursor.length > MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/u.test(cursor)) {
    throw new Error('original_language_study v3 occurrence continuation has an invalid repository cursor');
  }
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}
