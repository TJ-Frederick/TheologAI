/** Inactive, source-free guard for the future UBS semantic output contract. */
import {
  UBS_SEMANTIC_CURSOR_MAX_LENGTH,
  UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS,
  parseUbsPublicHebrewIdentity,
  requireUbsSemanticNormalizedReference,
} from './ubsSemanticDomain.js';
import type { UbsPublicHebrewIdentityBoundary } from './ubsSemanticDomain.js';

export interface UbsSemanticDraftOutputRequest {
  publicStrongs: string;
  normalizedReference: string;
  artifactIdentity: string;
  /** Trusted verifier assertion required before the stronger aligned status may be emitted. */
  expectedAlignment?: {
    morphologyTokenIdentity: string;
    verifierVersion: number;
    sourceId: string;
    senseId: string;
    evidenceId: string;
  };
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
    const alignment = draftObject(root.alignmentEvidence, 'output.alignmentEvidence');
    if (alignment.status !== 'verified_token_alignment'
      || alignment.morphologyTokenIdentity !== expectedAlignment.morphologyTokenIdentity
      || alignment.verifierVersion !== expectedAlignment.verifierVersion
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
    const tokenIdentity = request.expectedAlignment.morphologyTokenIdentity;
    if (!tokenIdentity
      || tokenIdentity !== tokenIdentity.trim()
      || tokenIdentity !== tokenIdentity.normalize('NFC')
      || [...tokenIdentity].length > 512
      || hasHostileUnicode(tokenIdentity)) {
      throw new Error('UBS semantic draft expected morphology token identity must be non-empty, trimmed, NFC, bounded, and control-free');
    }
    if (!Number.isSafeInteger(request.expectedAlignment.verifierVersion)
      || request.expectedAlignment.verifierVersion < 1
      || request.expectedAlignment.verifierVersion > 1_000_000) {
      throw new Error('UBS semantic draft expected verifier version must be a bounded positive safe integer');
    }
    for (const [field, value] of [
      ['sourceId', request.expectedAlignment.sourceId],
      ['senseId', request.expectedAlignment.senseId],
      ['evidenceId', request.expectedAlignment.evidenceId],
    ] as const) {
      if (!/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value) || value.length > 128) {
        throw new Error(`UBS semantic draft expected alignment ${field} must be a canonical bounded identifier`);
      }
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
