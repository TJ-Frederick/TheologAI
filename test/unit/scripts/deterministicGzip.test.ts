import { gunzipSync } from 'node:zlib';
import { CANONICAL_GZIP_OS, deterministicGzipSync } from '../../../scripts/deterministic-gzip.js';

describe('deterministicGzipSync', () => {
  it('publishes the reviewed gzip OS header without changing the payload', () => {
    const input = Buffer.from('TheologAI cross-platform gzip regression');
    const compressed = deterministicGzipSync(input);

    expect(compressed.subarray(0, 3)).toEqual(Buffer.from([0x1f, 0x8b, 0x08]));
    expect(compressed[9]).toBe(CANONICAL_GZIP_OS);
    expect(CANONICAL_GZIP_OS).toBe(19);
    expect(gunzipSync(compressed)).toEqual(input);
  });
});
