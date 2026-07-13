import type { InputType } from 'node:zlib';
import { gzipSync } from 'node:zlib';

/**
 * RFC 1952 reserves byte 9 of the gzip header for the originating OS.
 * Node writes the host OS there, so otherwise-identical builds differ between
 * Linux (3) and macOS (19). Keep the accepted language artifacts reproducible
 * by publishing the reviewed macOS header value on every platform.
 */
export const CANONICAL_GZIP_OS = 19;

export function deterministicGzipSync(input: InputType, level = 9): Buffer {
  const compressed = gzipSync(input, { level });
  if (compressed.length < 10 || compressed[0] !== 0x1f || compressed[1] !== 0x8b || compressed[2] !== 0x08) {
    throw new Error('zlib returned an invalid gzip header');
  }
  compressed[9] = CANONICAL_GZIP_OS;
  return compressed;
}
