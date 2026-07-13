import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../src/kernel/sha256.js';

describe('Worker-safe SHA-256', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['The quick brown fox jumps over the lazy dog', 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
    ['Καὶ Ἑβραϊκά', 'e551529919c06d59e8cfd3b110119fce1d72639fb9429fe93bfdd3a9b4f85872'],
  ])('matches the published digest for %j', (value, digest) => {
    expect(sha256Hex(value)).toBe(digest);
  });
});
