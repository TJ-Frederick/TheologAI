import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BIBLE_BOOKS } from '../../../src/kernel/books.js';
import { MORPHOLOGY_USAGE_IDENTITY } from '../../../src/kernel/morphologyUsageCursor.js';
import { parseDataManifest, type DataManifest } from '../../../scripts/d1-corpus-identity.js';
import {
  buildMorphologyUsageIdentityProjection,
  computeMorphologyUsageIdentity,
} from '../../../scripts/morphology-usage-identity.js';

const current = (): DataManifest => parseDataManifest(readFileSync('data/data-manifest.json'));

describe('scoped morphology usage identity', () => {
  it('pins the canonical projection with 66 ordered artifacts and the Hebrew lemma source', () => {
    const manifest = current();
    const projection = buildMorphologyUsageIdentityProjection(manifest);

    expect(computeMorphologyUsageIdentity(manifest)).toBe(MORPHOLOGY_USAGE_IDENTITY);
    expect(projection).toMatchObject({
      identityVersion: 1,
      transformVersion: 1,
      hashAlgorithm: 'sha256',
      hebrewLemmaSource: {
        path: 'data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json',
      },
      semantics: {
        occurrenceRows: { version: 1 },
        aggregates: { version: 1 },
        keyset: { version: 1, cursorWireVersion: 1, minimumVerse: 0 },
      },
    });
    expect(projection.canonicalBooks).toEqual(
      BIBLE_BOOKS.map(({ number, stepbibleId }) => ({ number, stepbibleId })),
    );
    expect(projection.morphologyArtifacts).toHaveLength(66);
    expect(projection.morphologyArtifacts.map(artifact => artifact.bookOrder)).toEqual(
      Array.from({ length: 66 }, (_unused, index) => index + 1),
    );
    expect(projection.morphologyArtifacts[0].path)
      .toBe('data/biblical-languages/stepbible/hebrew/01-Genesis.json.gz');
    expect(projection.morphologyArtifacts[65].path)
      .toBe('data/biblical-languages/stepbible/greek/66-Revelation.json.gz');
  });

  it('drifts for every morphology artifact hash and the Hebrew lemma hash', () => {
    const manifest = current();
    const base = computeMorphologyUsageIdentity(manifest);
    const includedPaths = [
      ...buildMorphologyUsageIdentityProjection(manifest).morphologyArtifacts.map(file => file.path),
      'data/biblical-languages/stepbible-lexicons/tbesh-hebrew.json',
    ];

    for (const path of includedPaths) {
      const changed = structuredClone(manifest);
      changed.files.find(file => file.path === path)!.sha256 = '0'.repeat(64);
      expect(computeMorphologyUsageIdentity(changed), path).not.toBe(base);
    }
  });

  it('includes the canonical number and STEPBible-ID mapping', () => {
    const manifest = current();
    const changedBooks = BIBLE_BOOKS.map(book => ({
      number: book.number,
      stepbibleId: book.stepbibleId,
      testament: book.testament,
    }));
    changedBooks[0] = { ...changedBooks[0], stepbibleId: 'GenesisCanonical' };
    const genesis = manifest.files.find(file => file.path.endsWith('/01-Genesis.json.gz'))!;
    manifest.files.push({
      path: 'data/biblical-languages/stepbible/hebrew/01-GenesisCanonical.json.gz',
      sha256: genesis.sha256,
    });

    expect(computeMorphologyUsageIdentity(manifest, changedBooks))
      .not.toBe(computeMorphologyUsageIdentity(current()));
  });

  it('ignores unrelated D1, catalog, cross-reference, UBS, and count drift', () => {
    const baseManifest = current();
    const base = computeMorphologyUsageIdentity(baseManifest);
    const changed = structuredClone(baseManifest);

    changed.schemaVersion = '9999_unrelated_schema';
    changed.materializations.d1.identityVersion += 1;
    changed.materializations.d1.transformVersion += 1;
    changed.materializations.d1.migrations = [{ path: 'migrations/9999_unrelated_schema.sql', sha256: '1'.repeat(64) }];
    for (const path of [
      'data/cross-references/cross_references.txt',
      'data/historical-documents/apostles-creed.json',
      'src/data/ubs-parallel-passages.generated.json',
      'data/biblical-languages/stepbible/morph-codes.json',
      'data/biblical-languages/stepbible-lexicons/tbesg-greek.json',
      'data/biblical-languages/strongs-greek.json',
    ]) {
      changed.files.find(file => file.path === path)!.sha256 = '2'.repeat(64);
    }
    for (const table of Object.keys(changed.expectedCounts)) changed.expectedCounts[table] += 7;

    expect(computeMorphologyUsageIdentity(changed)).toBe(base);
  });

  it('rejects missing, invalid, duplicate, or noncanonical scoped sources', () => {
    const missing = current();
    missing.files = missing.files.filter(file => !file.path.endsWith('/43-John.json.gz'));
    expect(() => computeMorphologyUsageIdentity(missing)).toThrow(/Missing or invalid morphology usage source/);

    const invalid = current();
    invalid.files.find(file => file.path.endsWith('/43-John.json.gz'))!.sha256 = 'not-a-hash';
    expect(() => computeMorphologyUsageIdentity(invalid)).toThrow(/Missing or invalid morphology usage source/);

    const duplicate = current();
    duplicate.files.push({ ...duplicate.files[0] });
    expect(() => computeMorphologyUsageIdentity(duplicate)).toThrow(/Duplicate manifest path/);

    expect(() => computeMorphologyUsageIdentity(current(), BIBLE_BOOKS.slice(0, 65)))
      .toThrow(/requires 66 canonical books/);
  });
});
