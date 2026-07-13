import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  decodeMorphologyUsageCursor,
  encodeMorphologyUsageCursor,
  MORPHOLOGY_CORPUS_IDENTITY,
  MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH,
} from '../../../src/kernel/morphologyUsageCursor.js';
import { computeD1CorpusIdentity, parseDataManifest } from '../../../scripts/d1-corpus-identity.js';

function encodeJson(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

describe('morphology usage cursor', () => {
  it('is bound to the canonical materialized D1 corpus identity', () => {
    const manifest = parseDataManifest(readFileSync('data/data-manifest.json'));
    expect(MORPHOLOGY_CORPUS_IDENTITY).toBe(computeD1CorpusIdentity(manifest));
  });

  it('round-trips canonical positions including Psalm verse zero', () => {
    const position = { book_order: 19, chapter: 3, verse: 0, position: 2 };
    const cursor = encodeMorphologyUsageCursor('H9998', position);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeMorphologyUsageCursor(cursor, 'H9998')).toEqual(position);
  });

  it('rejects malformed, oversized, wrong-key, stale, and unsupported cursors', () => {
    const valid = encodeMorphologyUsageCursor('H0430', { book_order: 1, chapter: 1, verse: 1, position: 1 });
    expect(() => decodeMorphologyUsageCursor(valid, 'G3056')).toThrow(/different Strong's identity/);
    expect(() => decodeMorphologyUsageCursor('not_json', 'H0430')).toThrow(/malformed/);
    expect(() => decodeMorphologyUsageCursor('a'.repeat(MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH + 1), 'H0430'))
      .toThrow(/oversized/);
    expect(() => decodeMorphologyUsageCursor(encodeJson({
      v: 1, corpus: '0'.repeat(64), key: 'H0430', after: { book_order: 1, chapter: 1, verse: 1, position: 1 },
    }), 'H0430')).toThrow(/stale/);
    expect(() => decodeMorphologyUsageCursor(encodeJson({
      v: 2, corpus: MORPHOLOGY_CORPUS_IDENTITY, key: 'H0430', after: { book_order: 1, chapter: 1, verse: 1, position: 1 },
    }), 'H0430')).toThrow(/unsupported/);
  });
});
