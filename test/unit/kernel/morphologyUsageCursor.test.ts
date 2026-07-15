import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  decodeMorphologyUsageCursor,
  encodeMorphologyUsageCursor,
  MORPHOLOGY_USAGE_IDENTITY,
  MORPHOLOGY_USAGE_CURSOR_MAX_LENGTH,
} from '../../../src/kernel/morphologyUsageCursor.js';
import { parseDataManifest } from '../../../scripts/d1-corpus-identity.js';
import { computeMorphologyUsageIdentity } from '../../../scripts/morphology-usage-identity.js';

const PREVIOUS_WHOLE_D1_IDENTITY = '93ae4ca3c09493cf02a6b48154c991c133fd6ce235119fc4b8cba0256a36f881';

function encodeJson(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

describe('morphology usage cursor', () => {
  it('is bound to the scoped canonical morphology-usage identity', () => {
    const manifest = parseDataManifest(readFileSync('data/data-manifest.json'));
    expect(MORPHOLOGY_USAGE_IDENTITY).toBe(computeMorphologyUsageIdentity(manifest));
    expect(MORPHOLOGY_USAGE_IDENTITY).not.toBe(PREVIOUS_WHOLE_D1_IDENTITY);
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
      v: 1, corpus: PREVIOUS_WHOLE_D1_IDENTITY, key: 'H0430', after: { book_order: 1, chapter: 1, verse: 1, position: 1 },
    }), 'H0430')).toThrow(/stale/);
    expect(() => decodeMorphologyUsageCursor(encodeJson({
      v: 2, corpus: MORPHOLOGY_USAGE_IDENTITY, key: 'H0430', after: { book_order: 1, chapter: 1, verse: 1, position: 1 },
    }), 'H0430')).toThrow(/unsupported/);
  });
});
