import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  UBS_HEBREW_V092_ARTIFACTS,
  assertPinnedUbsHebrewV092Bytes,
  assertUbsHebrewV092SourceManifest,
  parseUbsSourceTokenReference,
  verifyUbsHebrewV092Acquisition,
} from '../../../scripts/verify-ubs-hebrew-v092-acquisition.js';

const manifestPath = 'data/biblical-languages/ubs-open-license/v0.9.2/SOURCE.json';

function manifest(): Record<string, any> {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, any>;
}

describe('UBS Hebrew v0.9.2 acquisition verifier', () => {
  it('proves the exact two approved raw artifacts, notices, and inspected schema report', () => {
    const report = verifyUbsHebrewV092Acquisition(process.cwd());
    expect(report).toMatchObject({
      schemaVersion: 'theologai-ubs-hebrew-v0.9.2-schema-inspection-v1',
      dictionary: {
        entries: 7932,
        lexicalReferences: {
          records: 260813,
          anchorFormat: 'BBBCCCVVVSSWWW',
          anchorDigits: 14,
          allRowsStartWithSourceTokenAnchor: true,
          footnoteMarkers: 2698,
          bangN001Suffixes: 1,
          negativeN033Markers: 1,
          multiMarkerSuffixes: 1,
        },
      },
      domains: { records: 411 },
    });
  });

  it('rejects a one-byte source change before any future transformation can read it', () => {
    const artifact = UBS_HEBREW_V092_ARTIFACTS[0];
    const changed = Buffer.from(readFileSync(artifact.trackedPath));
    changed[changed.length - 1] ^= 1;
    expect(() => assertPinnedUbsHebrewV092Bytes(artifact, changed)).toThrow('SHA-256 drift');
  });

  it('validates the inspected field shape and preserves every observed footnote anomaly', () => {
    expect(parseUbsSourceTokenReference('00100100100002')).toEqual({
      book: 1, chapter: 1, verse: 1, segment: 0, word: 2, suffix: '', footnoteMarkers: [],
    });
    expect(parseUbsSourceTokenReference('01300202400022!{N:001}')).toMatchObject({
      book: 13, chapter: 2, verse: 24, segment: 0, word: 22,
      suffix: '!{N:001}', footnoteMarkers: ['!{N:001}'],
    });
    expect(parseUbsSourceTokenReference('01100400700050{N:-033}')).toMatchObject({
      suffix: '{N:-033}', footnoteMarkers: ['{N:-033}'],
    });
    expect(parseUbsSourceTokenReference('01804100700002{N:002}{N:003}')).toMatchObject({
      suffix: '{N:002}{N:003}', footnoteMarkers: ['{N:002}', '{N:003}'],
    });
  });

  it.each([
    '00000100100002', // no book zero
    '04000100100002', // outside the pinned globally observed book field range
    '00100000100002', // no chapter zero
    '00115100100002', // outside the observed global chapter field range
    '00100100000002', // no verse zero
    '00100117700002', // outside the observed global verse field range
    '00100100101002', // Hebrew segment must remain 00
    '00100100100000', // word must be positive
    '00100100100003', // source word coordinates are even
  ])('rejects structurally out-of-range or disallowed encoded fields: %s', reference => {
    expect(() => parseUbsSourceTokenReference(reference)).toThrow();
  });

  it('binds every approved compliance and provenance field exactly', () => {
    expect(() => assertUbsHebrewV092SourceManifest(manifest())).not.toThrow();

    const mutations: Array<(value: Record<string, any>) => void> = [
      value => { value.upstream.copyright = 'changed'; },
      value => { value.coverageAndCompleteness.upstreamHebrewNotice = '90% omitted'; },
      value => { value.coverageAndCompleteness.upstreamV092ReleaseNote = '99% conflict omitted'; },
      value => { value.coverageAndCompleteness.theologaiPolicy = 'completeness allowed'; },
      value => { value.modifications.performed = 'transformed'; },
      value => { value.modifications.plannedButNotPerformed = 'migration 0004 performed'; },
      value => { value.futureAttributionAndShareAlikePolicy = 'attribution only'; },
      value => { value.upstream.licenseUrl = 'https://example.invalid/license'; },
      value => { value.upstream.commit = '0'.repeat(40); },
      value => { value.artifacts[0].sourceUrl = 'https://example.invalid/source'; },
      value => { value.artifacts[0].gitBlobSha1 = '0'.repeat(40); },
      value => { value.artifacts[0].sha256 = '0'.repeat(64); },
      value => { value.artifacts[0].id = 'wrong-artifact'; },
    ];
    for (const mutate of mutations) {
      const changed = manifest();
      mutate(changed);
      expect(() => assertUbsHebrewV092SourceManifest(changed)).toThrow('exact approved compliance projection');
    }
  });
});
