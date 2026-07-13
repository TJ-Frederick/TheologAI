import type { CanonicalOccurrencePosition } from './repositories.js';

export const MORPHOLOGY_CORPUS_IDENTITY = '93ae4ca3c09493cf02a6b48154c991c133fd6ce235119fc4b8cba0256a36f881';
export const MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH = 512;

interface MorphologyUsageCursorV1 {
  v: 1;
  corpus: string;
  key: string;
  after: CanonicalOccurrencePosition;
}

export function encodeMorphologyUsageCursor(
  morphologyKey: string,
  after: CanonicalOccurrencePosition,
): string {
  assertOccurrencePosition(after);
  return encodeBase64Url(JSON.stringify({
    v: 1,
    corpus: MORPHOLOGY_CORPUS_IDENTITY,
    key: morphologyKey,
    after,
  } satisfies MorphologyUsageCursorV1));
}

export function decodeMorphologyUsageCursor(
  cursor: string,
  expectedMorphologyKey: string,
): CanonicalOccurrencePosition {
  if (!cursor || cursor.length > MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new RangeError('occurrence_cursor is malformed or oversized');
  }
  let value: unknown;
  try {
    value = JSON.parse(decodeBase64Url(cursor));
  } catch {
    throw new RangeError('occurrence_cursor is malformed');
  }
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'after,corpus,key,v'
    || value.v !== 1 || value.corpus !== MORPHOLOGY_CORPUS_IDENTITY) {
    throw new RangeError('occurrence_cursor is stale or uses an unsupported version');
  }
  if (value.key !== expectedMorphologyKey) {
    throw new RangeError('occurrence_cursor belongs to a different Strong\'s identity');
  }
  if (!isRecord(value.after)
    || Object.keys(value.after).sort().join(',') !== 'book_order,chapter,position,verse') {
    throw new RangeError('occurrence_cursor is malformed');
  }
  const after = {
    book_order: value.after.book_order,
    chapter: value.after.chapter,
    verse: value.after.verse,
    position: value.after.position,
  };
  try {
    assertOccurrencePosition(after as CanonicalOccurrencePosition);
  } catch {
    throw new RangeError('occurrence_cursor is malformed');
  }
  return after as CanonicalOccurrencePosition;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertOccurrencePosition(position: CanonicalOccurrencePosition): void {
  if (!Number.isSafeInteger(position.book_order) || position.book_order < 1 || position.book_order > 66
    || !Number.isSafeInteger(position.chapter) || position.chapter < 1
    || !Number.isSafeInteger(position.verse) || position.verse < 0
    || !Number.isSafeInteger(position.position) || position.position < 1) {
    throw new RangeError('occurrence position is invalid');
  }
}
