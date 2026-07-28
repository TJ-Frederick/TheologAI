import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEditionPackage } from '../../../src/kernel/editionProvenanceFoundation.js';
import {
  assertHistoricalSpineActivationReady,
  assertExactInput,
  parsePascalSections,
  replayHistoricalSpineSourcePacks,
  validateHistoricalSpineStaticPack,
} from '../../../scripts/replay-historical-spine-source-packs.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const packs = [
  'historical-spine-early',
  'historical-spine-later',
] as const;

describe('inactive historical-spine local source preparation', () => {
  it('keeps ten reviewed packages outside the active D1 input contract', () => {
    const dataManifest = JSON.parse(readFileSync('data/data-manifest.json', 'utf8')) as {
      materializations: { d1: { inputs: string[] } };
    };
    expect(dataManifest.materializations.d1.inputs.some(path => path.includes('historical-spine-'))).toBe(false);

    for (const pack of packs) {
      const root = resolve(process.cwd(), 'data/historical-source-packs', pack);
      const manifestText = readFileSync(resolve(root, 'manifest.json'), 'utf8');
      const manifest = JSON.parse(manifestText) as {
        members: Array<{ sourcePath: string; packageSha256: string }>;
      };
      const preparation = JSON.parse(readFileSync(resolve(root, 'source-preparation.json'), 'utf8')) as {
        status: string;
        inputs: Array<{ editionId: string; role: string; sha256: string; bytes: number }>;
      };
      expect(readFileSync(resolve(root, 'manifest.sha256'), 'utf8')).toBe(`${sha256(manifestText)}  manifest.json\n`);
      expect(preparation.status).toBe('inactive_local_preparation_only');
      expect(manifest.members).toHaveLength(pack === 'historical-spine-early' ? 6 : 4);
      expect(new Set(preparation.inputs.filter(input => input.role !== 'derived').map(input => input.editionId))).toEqual(new Set(manifest.members.map(member => member.sourcePath.split('/').at(-1)!.replace(/\.json$/, ''))));
      for (const member of manifest.members) {
        const compiled = compileEditionPackage(JSON.parse(readFileSync(resolve(root, member.sourcePath), 'utf8')));
        expect(compiled.sha256).toBe(member.packageSha256);
      }
    }
  });

  it('validates every manifest/input/artifact bijection before any supplied source root is read', () => {
    const early = validateHistoricalSpineStaticPack('early');
    const later = validateHistoricalSpineStaticPack('later');
    for (const pack of [early, later]) {
      const editionIds = pack.records.map(record => record.compiled.package.edition.editionId);
      const externalInputs = pack.preparation.inputs.filter(input => input.role !== 'derived');
      expect(new Set(externalInputs.map(input => input.editionId))).toEqual(new Set(editionIds));
      for (const record of pack.records) {
        const id = record.compiled.package.edition.editionId;
        for (const artifact of record.artifacts) {
          const input = externalInputs.find(candidate => candidate.editionId === id && candidate.role === artifact.role);
          expect(input).toMatchObject({ sha256: artifact.sha256, bytes: artifact.bytes });
        }
        const sourceInputs = externalInputs.filter(candidate => candidate.editionId === id
          && candidate.sha256 === record.compiled.package.edition.source.sha256
          && candidate.bytes === record.compiled.package.edition.source.bytes);
        expect(sourceInputs).toHaveLength(1);
      }
    }
    expect(early.readiness.authorityComparatorReplay).toEqual({ status: 'completed', receiptPath: 'replay-receipt.json' });
    expect(later.readiness.authorityComparatorReplay).toEqual({ status: 'completed', receiptPath: 'replay-receipt.json' });
    expect(later.preparation.normalizationGates).toEqual([{
      editionId: 'pascal-pensees-trotter-1910',
      kind: 'exclude_prefatory_contributor',
      contributor: 'T. S. Eliot',
      requiredIntroMarker: 'INTRODUCTION BY T. S. ELIOT',
      bodyStartMarker: 'SECTION I',
      bodyEndMarker: 'NOTES',
    }]);
    expect(() => assertHistoricalSpineActivationReady('early')).toThrow('separately reviewed Transform 11 release');
    expect(() => assertHistoricalSpineActivationReady('later')).toThrow('separately reviewed Transform 11 release');
  });

  it('retains current sanitized exact-byte replay receipts without source bodies or local paths', () => {
    const receipt = readFileSync('data/historical-source-packs/historical-spine-early/replay-receipt.json', 'utf8');
    const laterReceipt = readFileSync('data/historical-source-packs/historical-spine-later/replay-receipt.json', 'utf8');
    expect(() => validateHistoricalSpineStaticPack('early')).not.toThrow();
    expect(() => validateHistoricalSpineStaticPack('later')).not.toThrow();
    expect(receipt).toContain('historical-source-replay-receipt.v1');
    expect(receipt).toContain('scripts/replay-historical-spine-source-packs.ts');
    expect(receipt).not.toContain('/private/');
    expect(receipt).not.toContain('content');
    expect(laterReceipt).toContain('julian-revelations-of-divine-love-warrack-1901-gutenberg');
    expect(laterReceipt).not.toContain('revelationsofdiv1907juli.pdf');
    expect(laterReceipt).not.toContain('ofimitationofchr1901thom.pdf');
  });

  it('records Hooker’s raw EPUB independently from the derived Book I text', () => {
    const root = resolve(process.cwd(), 'data/historical-source-packs/historical-spine-later');
    const prep = JSON.parse(readFileSync(resolve(root, 'source-preparation.json'), 'utf8')) as {
      inputs: Array<{ editionId: string; role: string; sha256: string; bytes: number }>;
    };
    const id = 'hooker-laws-of-ecclesiastical-polity-book-1-keble-1888';
    const raw = prep.inputs.find(input => input.editionId === id && input.role === 'comparator');
    const derived = prep.inputs.find(input => input.editionId === id && input.role === 'derived');
    const edition = JSON.parse(readFileSync(resolve(root, 'editions', `${id}.json`), 'utf8')) as {
      edition: { source: { sha256: string; bytes: number }; provenance: { uncertainty: string } };
    };
    expect(raw).toMatchObject({ sha256: 'c6ec69aaddc67c0e3f4a10fcc34241e83cfab5dded736ad3a87e9797cfd1b8c4', bytes: 852534 });
    expect(derived).toMatchObject({ sha256: '6e269829edd2d030f6409e11d40da4ceed3e322b6ab6b71539b507b78061d44e', bytes: 181926 });
    expect(edition.edition.source).toMatchObject({ sha256: raw!.sha256, bytes: raw!.bytes });
    expect(edition.edition.provenance.uncertainty).toContain(`derived Book I text SHA-256 ${derived!.sha256} (${derived!.bytes} bytes)`);
  });

  it('keeps the source-first corrections exact and fails closed before an unreviewed root is read', () => {
    expect(() => validateHistoricalSpineStaticPack('later')).not.toThrow();
    expect(() => replayHistoricalSpineSourcePacks('/definitely-not-a-theologai-source-root', ['early']))
      .toThrow('missing reviewed local inputs; no replay was attempted');
    expect(() => replayHistoricalSpineSourcePacks('/definitely-not-a-theologai-source-root', ['later']))
      .toThrow('missing reviewed local inputs; no replay was attempted');
    const later = validateHistoricalSpineStaticPack('later');
    const julian = later.records.find(record => record.compiled.package.edition.editionId === 'julian-revelations-of-divine-love-warrack-1901-gutenberg')!;
    const kempis = later.records.find(record => record.compiled.package.edition.editionId === 'kempis-imitation-of-christ-benham-gutenberg')!;
    expect(julian.artifacts).toHaveLength(1);
    expect(julian.artifacts[0]).toMatchObject({ role: 'authority', sha256: '2e01d1a44b27b001b51053053fe69db771a6609edbbbc5a7fb31da9d4b3cc4b9', bytes: 476062 });
    expect(kempis.artifacts).toHaveLength(1);
    expect(kempis.artifacts[0]).toMatchObject({ role: 'authority', sha256: '7631799607b0ede62f1bd7ed2a8eb62d89524451a3c41e9ad2b5cbf4c2aa5383', bytes: 374954 });
    const exact = Buffer.from('reviewed bytes');
    expect(() => assertExactInput('synthetic', exact, { sha256: sha256('different bytes'), bytes: exact.byteLength }))
      .toThrow('expected');
  });

  it('fails closed when Pascal’s marked T. S. Eliot introduction could enter normalized sections', () => {
    const later = validateHistoricalSpineStaticPack('later');
    const gate = later.preparation.normalizationGates[0]!;
    const body = [
      '*** START OF THE PROJECT GUTENBERG EBOOK PENSEES ***',
      'INTRODUCTION BY T. S. ELIOT',
      'prefatory matter',
      'SECTION I',
      'Primary text one. '.repeat(20),
      'SECTION II',
      'Primary text two. '.repeat(20),
      'NOTES',
      '*** END OF THE PROJECT GUTENBERG EBOOK PENSEES ***',
    ].join('\n');
    expect(parsePascalSections(body, gate).map(section => section.heading)).toEqual(['SECTION I', 'SECTION II']);
    expect(() => parsePascalSections(body.replace('INTRODUCTION BY T. S. ELIOT', 'PREFACE'), gate))
      .toThrow('introduction marker is absent');
    expect(() => parsePascalSections(body.replace('Primary text one.', 'T. S. Eliot notes.'), gate))
      .toThrow('preface leaked');
  });
});
