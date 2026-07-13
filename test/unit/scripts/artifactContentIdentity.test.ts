import { gzipSync } from 'node:zlib';
import { artifactContentIdentity } from '../../../scripts/artifact-content-identity.js';

describe('artifactContentIdentity', () => {
  it('equates distinct valid gzip encodings of the same canonical JSON payload', () => {
    const value = { z: 'compressible '.repeat(1_000), nested: { b: 2, a: 1 } };
    const payload = Buffer.from(JSON.stringify(value));
    const fast = gzipSync(payload, { level: 1 });
    const dense = gzipSync(payload, { level: 9 });
    const reorderedAndIndented = gzipSync(
      JSON.stringify({ nested: { a: 1, b: 2 }, z: value.z }, null, 2),
      { level: 9 },
    );

    expect(fast).not.toEqual(dense);
    expect(artifactContentIdentity('book.json.gz', fast).sha256)
      .toBe(artifactContentIdentity('book.json.gz', dense).sha256);
    expect(artifactContentIdentity('book.json.gz', fast).sha256)
      .toBe(artifactContentIdentity('book.json.gz', reorderedAndIndented).sha256);
  });

  it('detects a canonical JSON payload change', () => {
    const first = gzipSync(JSON.stringify({ words: ['one', 'two'] }), { level: 1 });
    const changed = gzipSync(JSON.stringify({ words: ['one', 'three'] }), { level: 9 });

    expect(artifactContentIdentity('book.json.gz', first).sha256)
      .not.toBe(artifactContentIdentity('book.json.gz', changed).sha256);
  });

  it('keeps non-gzip artifacts byte-identified', () => {
    const identity = artifactContentIdentity('strongs-greek.json', Buffer.from('{}'));
    expect(identity).toMatchObject({ kind: 'raw_sha256', sha256: identity.rawSha256 });
  });
});
