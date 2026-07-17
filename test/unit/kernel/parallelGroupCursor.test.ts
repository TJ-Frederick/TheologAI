import { describe, expect, it } from 'vitest';
import { decodeParallelGroupCursor, encodeParallelGroupCursor } from '../../../src/kernel/parallelGroupCursor.js';
import { UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY } from '../../../src/kernel/ubsParallelSource.js';

const segments = [{ bookNumber: 42, chapter: 6, startVerse: 35, endVerse: 35 }];

describe('parallel group cursor', () => {
  it('round-trips the exact ordered normalized segment scope and source ordinal', () => {
    const cursor = encodeParallelGroupCursor(segments, {
      pageSize: 5, afterSourceOrdinal: 123, cumulativeGroupCount: 10,
    });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain('Luke');
    expect(decodeParallelGroupCursor(cursor, segments, 5)).toEqual({
      pageSize: 5, afterSourceOrdinal: 123, cumulativeGroupCount: 10,
    });
  });

  it.each([
    ['', 'empty'],
    ['not+base64', 'invalid alphabet'],
    ['a'.repeat(2049), 'oversized'],
  ])('rejects malformed cursor: %s (%s)', (cursor) => {
    expect(() => decodeParallelGroupCursor(cursor, segments, 1)).toThrow(/groupCursor/);
  });

  it('rejects wrong query order, artifact drift, version drift, extra keys, and invalid positions', () => {
    const valid = decode(encodeParallelGroupCursor([
      ...segments,
      { bookNumber: 40, chapter: 5, startVerse: 44, endVerse: 44 },
    ], { pageSize: 1, afterSourceOrdinal: 2, cumulativeGroupCount: 2 }));
    const cases = [
      { ...valid, segments: [...valid.segments].reverse() },
      { ...valid, artifact: 'f'.repeat(64) },
      { ...valid, v: 2 },
      { ...valid, extra: true },
      { ...valid, afterSourceOrdinal: 0 },
      { ...valid, pageSize: 3 },
      { ...valid, cumulativeGroupCount: 1.5 },
      { ...valid, segments: [{ bookNumber: 67, chapter: 1, startVerse: 1, endVerse: 1 }] },
    ];
    expect(valid.artifact).toBe(UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY);
    for (const value of cases) {
      const cursor = encode(value);
      expect(() => decodeParallelGroupCursor(cursor, [
        ...segments,
        { bookNumber: 40, chapter: 5, startVerse: 44, endVerse: 44 },
      ], 1)).toThrow(/groupCursor/);
    }
  });

  it('rejects a mutated opaque payload, non-canonical JSON, and base64url aliases', () => {
    const cursor = Array.from({ length: 100 }, (_, index) => encodeParallelGroupCursor(segments, {
      pageSize: 1, afterSourceOrdinal: index + 1, cumulativeGroupCount: 1,
    })).find(value => value.length % 4 !== 0)!;
    const index = Math.floor(cursor.length / 2);
    const mutated = `${cursor.slice(0, index)}${cursor[index] === 'A' ? 'B' : 'A'}${cursor.slice(index + 1)}`;
    expect(() => decodeParallelGroupCursor(mutated, segments, 1)).toThrow(/groupCursor/);

    const payload = decode(cursor);
    const reordered = encode({ artifact: payload.artifact, v: payload.v, operation: payload.operation, segments: payload.segments, pageSize: payload.pageSize, afterSourceOrdinal: payload.afterSourceOrdinal, cumulativeGroupCount: payload.cumulativeGroupCount });
    expect(() => decodeParallelGroupCursor(reordered, segments, 1)).toThrow('canonically encoded');

    const alias = base64UrlAlias(cursor);
    expect(alias).not.toBe(cursor);
    expect(decode(alias)).toEqual(payload);
    expect(() => decodeParallelGroupCursor(alias, segments, 1)).toThrow('canonically encoded');
  });
});

function decode(cursor: string): any {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cursor.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(cursor.length / 4) * 4, '=')), c => c.charCodeAt(0))));
}

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

/** Replace only ignored base64url tail bits, preserving decoded bytes. */
function base64UrlAlias(cursor: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const index = alphabet.indexOf(cursor.at(-1)!);
  const alias = cursor.length % 4 === 2 ? (index ^ 1) : (index ^ 4);
  return `${cursor.slice(0, -1)}${alphabet[alias]}`;
}
