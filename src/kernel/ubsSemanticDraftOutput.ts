/** Inactive, source-free guard for the future UBS semantic output contract. */
import {
  UBS_SEMANTIC_CURSOR_MAX_LENGTH,
  UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS,
  parseUbsPublicHebrewIdentity,
  requireUbsSemanticNormalizedReference,
} from './ubsSemanticDomain.js';
import type { FutureExactHebrewTokenAlignmentProof, UbsPublicHebrewIdentityBoundary } from './ubsSemanticDomain.js';

export interface UbsSemanticDraftOutputRequest {
  publicStrongs: string;
  normalizedReference: string;
  artifactIdentity: string;
  /** Full server-owned proof; coordinate-only evidence never satisfies this. */
  expectedAlignment?: FutureExactHebrewTokenAlignmentProof;
}

export function createUbsSemanticDraftContinuationCursor(
  request: UbsSemanticDraftOutputRequest,
  priorCount: number,
): string {
  const identity = validateUbsSemanticDraftRequest(request);
  if (!Number.isSafeInteger(priorCount) || priorCount <= 0) {
    throw new Error('UBS semantic draft continuation priorCount must be a positive safe integer');
  }
  const payload = JSON.stringify({
    version: 1,
    operation: 'semantic_candidates',
    artifactIdentity: request.artifactIdentity,
    publicStrongs: identity.publicStrongs,
    sourceIdentity: identity.sourceIdentity,
    normalizedReference: request.normalizedReference,
    priorCount,
  });
  const cursor = `ubs1_${[...new TextEncoder().encode(payload)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (cursor.length > UBS_SEMANTIC_CURSOR_MAX_LENGTH) {
    throw new Error('UBS semantic draft continuation exceeds the 4096-character limit');
  }
  return cursor;
}

/**
 * JSON Schema remains responsible for structural validation. This presenter
 * guard enforces relational invariants and returns the exact serialization
 * whose UTF-8 size was checked; callers must emit it rather than reserialize.
 */
export function serializeValidatedUbsSemanticDraftOutput(
  output: unknown,
  request: UbsSemanticDraftOutputRequest,
): string {
  const expectedIdentity = validateUbsSemanticDraftRequest(request);
  let serialized: string;
  try {
    const value = JSON.stringify(output);
    if (value === undefined) throw new Error('undefined');
    serialized = value;
  } catch {
    throw new Error('UBS semantic draft output must be JSON serializable');
  }
  const serializedBytes = new TextEncoder().encode(serialized).byteLength;
  if (serializedBytes > UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.responseBytes) {
    throw new Error(`UBS semantic draft output exceeds ${UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.responseBytes} serialized UTF-8 bytes`);
  }

  const root = draftObject(JSON.parse(serialized), 'output');
  const status = draftString(root.status, 'output.status');
  const resultWindow = draftObject(root.resultWindow, 'output.resultWindow');
  const priorCount = draftInteger(resultWindow.priorCount, 'output.resultWindow.priorCount');
  const returnedCount = draftInteger(resultWindow.returnedCount, 'output.resultWindow.returnedCount');
  const consumedCount = draftInteger(resultWindow.consumedCount, 'output.resultWindow.consumedCount');
  const totalCount = draftInteger(resultWindow.totalCount, 'output.resultWindow.totalCount');
  const hasMore = resultWindow.hasMore;
  if (typeof hasMore !== 'boolean') throw new Error('output.resultWindow.hasMore must be boolean');
  if (priorCount + returnedCount !== consumedCount || consumedCount > totalCount) {
    throw new Error('UBS semantic draft result window arithmetic is inconsistent');
  }
  if (hasMore !== (consumedCount < totalCount)) {
    throw new Error('UBS semantic draft hasMore must be true if and only if results remain');
  }
  const continuation = resultWindow.continuation;
  if (hasMore !== (continuation !== undefined)) {
    throw new Error('UBS semantic draft continuation must be present if and only if results remain');
  }
  const responseWindow = draftObject(root.responseWindow, 'output.responseWindow');
  if (responseWindow.unit !== 'utf8_bytes'
    || responseWindow.maximum !== UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.responseBytes
    || typeof responseWindow.truncated !== 'boolean') {
    throw new Error('UBS semantic draft response window does not describe the enforced UTF-8 bound');
  }

  if (status === 'unavailable') {
    if (priorCount !== 0 || returnedCount !== 0 || consumedCount !== 0 || totalCount !== 0) {
      throw new Error('UBS semantic unavailable output must report an empty terminal result window');
    }
    return serialized;
  }
  if (status !== 'lexical_candidates' && status !== 'reference_aligned_source_candidate') {
    throw new Error('UBS semantic draft output has an unsupported status');
  }

  const identity = draftObject(root.identity, 'output.identity');
  if (identity.publicStrongs !== expectedIdentity.publicStrongs
    || identity.sourceIdentity !== expectedIdentity.sourceIdentity) {
    throw new Error('UBS semantic draft public/source identity pair does not match its derived request identity');
  }
  if (root.normalizedReference !== request.normalizedReference) {
    throw new Error('UBS semantic draft normalized reference does not match its request');
  }
  const provenance = draftObject(root.provenance, 'output.provenance');
  const transformation = draftObject(provenance.transformation, 'output.provenance.transformation');
  if (transformation.artifactIdentity !== request.artifactIdentity) {
    throw new Error('UBS semantic draft provenance artifact does not match its request');
  }

  if (status === 'lexical_candidates') {
    if (!Array.isArray(root.candidates) || returnedCount !== root.candidates.length) {
      throw new Error('UBS semantic candidate count must equal resultWindow.returnedCount');
    }
  } else {
    if (priorCount !== 0 || returnedCount !== 1 || consumedCount !== 1 || totalCount !== 1 || hasMore) {
      throw new Error('UBS semantic aligned source candidate must report exactly one terminal item');
    }
    const evidence = draftObject(root.referenceEvidence, 'output.referenceEvidence');
    if (evidence.normalizedReference !== request.normalizedReference || evidence.senseId !== root.senseId) {
      throw new Error('UBS semantic reference evidence does not match its top-level sense and normalized reference');
    }
    const expectedAlignment = request.expectedAlignment;
    if (expectedAlignment === undefined) {
      throw new Error('UBS semantic aligned source candidate requires a trusted expected alignment assertion');
    }
    const alignment = normalizeExactAlignment(root.alignmentEvidence, 'output.alignmentEvidence');
    if (!sameExactAlignment(alignment, expectedAlignment)
      || root.senseId !== expectedAlignment.senseId
      || evidence.sourceId !== expectedAlignment.sourceId
      || evidence.senseId !== expectedAlignment.senseId
      || evidence.evidenceId !== expectedAlignment.evidenceId) {
      throw new Error('UBS semantic selected sense and evidence do not match the trusted alignment proof identity');
    }
  }

  if (continuation !== undefined) {
    const continuationRecord = draftObject(continuation, 'output.resultWindow.continuation');
    const query = draftObject(continuationRecord.query, 'output.resultWindow.continuation.query');
    const expectedCursor = createUbsSemanticDraftContinuationCursor(request, consumedCount);
    if (continuationRecord.cursor !== expectedCursor
      || continuationRecord.operation !== 'semantic_candidates'
      || continuationRecord.artifactIdentity !== request.artifactIdentity
      || continuationRecord.artifactIdentity !== transformation.artifactIdentity
      || query.publicStrongs !== expectedIdentity.publicStrongs
      || query.sourceIdentity !== expectedIdentity.sourceIdentity
      || query.publicStrongs !== identity.publicStrongs
      || query.sourceIdentity !== identity.sourceIdentity
      || query.normalizedReference !== request.normalizedReference
      || query.normalizedReference !== root.normalizedReference) {
      throw new Error('UBS semantic continuation is not bound to its request, output, and provenance');
    }
  }
  return serialized;
}

function validateUbsSemanticDraftRequest(
  request: UbsSemanticDraftOutputRequest,
): UbsPublicHebrewIdentityBoundary {
  const expectedIdentity = parseUbsPublicHebrewIdentity(request.publicStrongs);
  if (!expectedIdentity || expectedIdentity.publicStrongs !== request.publicStrongs) {
    throw new Error('UBS semantic draft request publicStrongs must be canonical unpadded H-number public syntax');
  }
  requireUbsSemanticNormalizedReference(
    request.normalizedReference,
    'UBS semantic draft request normalizedReference',
  );
  if (!/^[0-9a-f]{64}$/.test(request.artifactIdentity)) {
    throw new Error('UBS semantic draft artifact identity must be a lowercase SHA-256');
  }
  if (request.expectedAlignment !== undefined) {
    const expected = normalizeExactAlignment(request.expectedAlignment, 'UBS semantic draft expected alignment');
    if (expected.sourceIdentity !== expectedIdentity.sourceIdentity
      || expected.normalizedReference !== request.normalizedReference
      || expected.morphologyTokenCoordinates.normalizedReference !== request.normalizedReference
      || expected.artifactIdentity !== request.artifactIdentity
      || expected.artifactSources.dictionary.artifactIdentity !== request.artifactIdentity
      || expected.artifactSources.lexicalDomains.artifactIdentity !== request.artifactIdentity) {
      throw new Error('UBS semantic draft expected alignment is stale for its request identity, reference, or artifact');
    }
  }
  return expectedIdentity;
}

function hasHostileUnicode(value: string): boolean {
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)) return true;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) >= 0xfffe) return true;
  }
  return false;
}

function normalizeExactAlignment(input: unknown, path: string): FutureExactHebrewTokenAlignmentProof {
  const record = draftObject(input, path);
  exactProperties(record,
    [
      'status', 'proofContract', 'verifierVersion', 'sourceIdentity', 'normalizedReference',
      'artifactIdentity', 'artifactVersion', 'artifactSources', 'sourceId', 'entryId', 'senseId', 'evidenceId',
      'morphologyTokenIdentity', 'morphologyTokenCoordinates', 'morphologyTokenWitness',
    ], path);
  if (record.status !== 'verified_token_alignment'
    || record.proofContract !== 'theologai-exact-hebrew-token-alignment.v1') {
    throw new Error(`${path} must use the exact server-side token proof contract`);
  }
  const verifierVersion = draftInteger(record.verifierVersion, `${path}.verifierVersion`);
  if (verifierVersion < 1 || verifierVersion > 1_000_000) {
    throw new Error(`${path}.verifierVersion must be a bounded positive safe integer`);
  }
  return {
    status: 'verified_token_alignment',
    proofContract: 'theologai-exact-hebrew-token-alignment.v1',
    verifierVersion,
    sourceIdentity: canonicalHebrewIdentity(record.sourceIdentity, `${path}.sourceIdentity`),
    normalizedReference: requireUbsSemanticNormalizedReference(record.normalizedReference, `${path}.normalizedReference`),
    artifactIdentity: canonicalSha256(record.artifactIdentity, `${path}.artifactIdentity`),
    artifactVersion: artifactVersion(record.artifactVersion, `${path}.artifactVersion`),
    artifactSources: normalizeArtifactSources(record.artifactSources, `${path}.artifactSources`),
    sourceId: canonicalIdentifier(record.sourceId, `${path}.sourceId`),
    entryId: canonicalIdentifier(record.entryId, `${path}.entryId`),
    senseId: canonicalIdentifier(record.senseId, `${path}.senseId`),
    evidenceId: canonicalIdentifier(record.evidenceId, `${path}.evidenceId`),
    morphologyTokenIdentity: canonicalText(record.morphologyTokenIdentity, 512, `${path}.morphologyTokenIdentity`),
    morphologyTokenCoordinates: normalizeTokenCoordinates(record.morphologyTokenCoordinates, `${path}.morphologyTokenCoordinates`),
    morphologyTokenWitness: normalizeTokenWitness(record.morphologyTokenWitness, `${path}.morphologyTokenWitness`),
  };
}

function normalizeArtifactSources(
  input: unknown,
  path: string,
): FutureExactHebrewTokenAlignmentProof['artifactSources'] {
  const record = draftObject(input, path);
  exactProperties(record, ['dictionary', 'lexicalDomains'], path);
  return {
    dictionary: normalizeArtifactSource(record.dictionary, 'dictionary', path),
    lexicalDomains: normalizeArtifactSource(record.lexicalDomains, 'lexical_domains', path),
  };
}

function normalizeArtifactSource(
  input: unknown,
  role: 'dictionary' | 'lexical_domains',
  path: string,
): FutureExactHebrewTokenAlignmentProof['artifactSources']['dictionary'] {
  const record = draftObject(input, `${path}.${role}`);
  exactProperties(record,
    ['sourceId', 'sourceRole', 'artifactName', 'artifactIdentity', 'artifactVersion', 'sourceSha256'],
    `${path}.${role}`);
  const expectedName = role === 'dictionary'
    ? 'UBSHebrewDic-v0.9.2-en.JSON'
    : 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON';
  if (record.sourceRole !== role || record.artifactName !== expectedName) {
    throw new Error(`${path}.${role} must identify the exact ${role} UBS artifact`);
  }
  return {
    sourceId: canonicalIdentifier(record.sourceId, `${path}.${role}.sourceId`),
    sourceRole: role,
    artifactName: expectedName,
    artifactIdentity: canonicalSha256(record.artifactIdentity, `${path}.${role}.artifactIdentity`),
    artifactVersion: artifactVersion(record.artifactVersion, `${path}.${role}.artifactVersion`),
    sourceSha256: canonicalSha256(record.sourceSha256, `${path}.${role}.sourceSha256`),
  } as FutureExactHebrewTokenAlignmentProof['artifactSources']['dictionary'];
}

function normalizeTokenCoordinates(
  input: unknown,
  path: string,
): FutureExactHebrewTokenAlignmentProof['morphologyTokenCoordinates'] {
  const record = draftObject(input, path);
  exactProperties(record, ['canonicalReference', 'normalizedReference', 'position'], path);
  const position = draftInteger(record.position, `${path}.position`);
  if (position < 1 || position > 200) throw new Error(`${path}.position must be an integer from 1 through 200`);
  return {
    canonicalReference: canonicalText(record.canonicalReference, 100, `${path}.canonicalReference`),
    normalizedReference: requireUbsSemanticNormalizedReference(record.normalizedReference, `${path}.normalizedReference`),
    position,
  };
}

function normalizeTokenWitness(
  input: unknown,
  path: string,
): FutureExactHebrewTokenAlignmentProof['morphologyTokenWitness'] {
  const record = draftObject(input, path);
  exactProperties(record, ['text', 'lemma', 'strongsNumber', 'morphologyCode', 'gloss'], path);
  return {
    text: canonicalText(record.text, 2_000, `${path}.text`),
    lemma: canonicalText(record.lemma, 2_000, `${path}.lemma`),
    strongsNumber: nullableCanonicalText(record.strongsNumber, 128, `${path}.strongsNumber`),
    morphologyCode: nullableCanonicalText(record.morphologyCode, 512, `${path}.morphologyCode`),
    gloss: nullableCanonicalText(record.gloss, 2_000, `${path}.gloss`),
  };
}

function sameExactAlignment(
  left: FutureExactHebrewTokenAlignmentProof,
  right: FutureExactHebrewTokenAlignmentProof,
): boolean {
  return JSON.stringify(left) === JSON.stringify(normalizeExactAlignment(right, 'UBS semantic draft expected alignment'));
}

function exactProperties(record: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(record);
  if (actual.length !== expected.length || actual.some(key => !expected.includes(key)) || expected.some(key => !(key in record))) {
    throw new Error(`${path} must have exactly the reviewed proof fields`);
  }
}

function canonicalText(value: unknown, maximum: number, path: string): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value !== value.normalize('NFC')
    || [...value].length > maximum || hasHostileUnicode(value)) {
    throw new Error(`${path} must be non-empty, trimmed, NFC, bounded, and control-free`);
  }
  return value;
}

function nullableCanonicalText(value: unknown, maximum: number, path: string): string | null {
  return value === null ? null : canonicalText(value, maximum, path);
}

function canonicalIdentifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > 128 || !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value)) {
    throw new Error(`${path} must be a canonical bounded identifier`);
  }
  return value;
}

function canonicalHebrewIdentity(value: unknown, path: string): FutureExactHebrewTokenAlignmentProof['sourceIdentity'] {
  if (typeof value !== 'string' || !/^H(?!0000$)[0-9]{4}$/.test(value)) {
    throw new Error(`${path} must be a canonical fixed-width H#### identity`);
  }
  return value as FutureExactHebrewTokenAlignmentProof['sourceIdentity'];
}

function canonicalSha256(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${path} must be a lowercase SHA-256`);
  return value;
}

function artifactVersion(value: unknown, path: string): '0.9.2' {
  if (value !== '0.9.2') throw new Error(`${path} must be the pinned UBS artifact version`);
  return value;
}

function draftObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function draftString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  return value;
}

function draftInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${path} must be a non-negative safe integer`);
  return value as number;
}
