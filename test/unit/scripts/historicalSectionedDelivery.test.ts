import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_SECTIONED_DELIVERY_CURSOR_VERSION,
  HISTORICAL_SECTIONED_DELIVERY_KIND,
  NORTON_DOCUMENT_ID,
  NORTON_EDITION_ID,
  NORTON_GATE1_PACKAGE_BYTES,
  NORTON_GATE1_PACKAGE_PATH,
  NORTON_GATE1_PACKAGE_SHA256,
  NORTON_SECTION_COUNT,
  NORTON_TRANSFORM9_PLAN_PATH,
  NORTON_WORK_ID,
  parseHistoricalSectionedDeliveryPlan,
  sectionKeyForOrdinal,
  verifyNortonTransform9Preparation,
} from '../../../scripts/historical-sectioned-delivery.js';

const ROOT = process.cwd();
const SELF_SCRIPT = 'scripts/historical-sectioned-delivery.ts';

function rawPlan(): Record<string, any> {
  return JSON.parse(readFileSync(NORTON_TRANSFORM9_PLAN_PATH, 'utf8')) as Record<string, any>;
}

describe('inactive sectioned_only historical delivery and Norton transform-9 preparation', () => {
  it('freezes bounded landing, cursor-bound browsing, exact-body routing, and the transform-8 boundary', () => {
    const plan = parseHistoricalSectionedDeliveryPlan(rawPlan());

    expect(plan).toMatchObject({
      schemaVersion: 1,
      kind: HISTORICAL_SECTIONED_DELIVERY_KIND,
      runtimeStatus: 'inactive_until_transform_9',
      genericAliasStatus: 'dormant_until_future_activation',
      delivery: {
        mode: 'sectioned_only',
        wholeDocumentResource: {
          representation: 'bounded_landing_metadata_only',
          maxUtf8Bytes: 16_384,
          sectionDirectory: 'not_included',
          body: 'not_included',
        },
        browse: {
          maxSectionEntries: 32,
          body: 'not_included',
          nativeResourceLinks: 'exact_section_only',
          cursor: {
            version: HISTORICAL_SECTIONED_DELIVERY_CURSOR_VERSION,
            bindings: ['contractVersion', 'documentId', 'editionId', 'immutableCorpusIdentity', 'pageSize', 'lastSourceOrdinal', 'lastSectionKey'],
          },
        },
        exactSectionResource: { body: 'only_body_delivery_route' },
      },
      transform: {
        targetTransformVersion: 9,
        predecessor: { transformVersion: 8, scope: 'existing_17_historical_documents_only' },
        migrationStatus: 'not_authorized',
        dataManifestStatus: 'unchanged',
      },
    });
    expect(plan.delivery.wholeDocumentResource.fields).toEqual([
      'workId', 'editionId', 'title', 'language', 'sectionCount', 'browseContract',
    ]);
    expect(plan.delivery.browse.entryFields).toEqual([
      'sourceOrdinal', 'sectionKey', 'displayLabel', 'heading', 'resourceUri',
    ]);
  });

  it('audits the existing canonical Gate 1 package without duplicating its body', () => {
    const audit = verifyNortonTransform9Preparation(ROOT);
    expect(audit).toEqual({
      documentId: NORTON_DOCUMENT_ID,
      workId: NORTON_WORK_ID,
      editionId: NORTON_EDITION_ID,
      sectionCount: NORTON_SECTION_COUNT,
      packageSha256: NORTON_GATE1_PACKAGE_SHA256,
      packageBytes: NORTON_GATE1_PACKAGE_BYTES,
      firstSectionKey: 'a17662-source-ordinal-0001',
      lastSectionKey: 'a17662-source-ordinal-1250',
      browseMaxSectionEntries: 32,
    });

    const fixture = readFileSync(NORTON_TRANSFORM9_PLAN_PATH, 'utf8');
    expect(Buffer.byteLength(fixture)).toBeLessThan(8_192);
    expect(fixture).not.toContain('"sections"');
    expect(fixture).not.toContain('THE INSTITVTION OF Christian Religion');
    expect(readFileSync(NORTON_GATE1_PACKAGE_PATH).byteLength).toBe(NORTON_GATE1_PACKAGE_BYTES);
  });

  it('freezes every Norton source-ordinal key and rejects out-of-range generation', () => {
    expect(Array.from({ length: NORTON_SECTION_COUNT }, (_, index) => sectionKeyForOrdinal(index + 1))).toEqual([
      ...Array.from({ length: 1_249 }, (_, index) => `a17662-source-ordinal-${String(index + 1).padStart(4, '0')}`),
      'a17662-source-ordinal-1250',
    ]);
    expect(() => sectionKeyForOrdinal(0)).toThrow('1 through 1250');
    expect(() => sectionKeyForOrdinal(1.5)).toThrow('1 through 1250');
    expect(() => sectionKeyForOrdinal(1_251)).toThrow('1 through 1250');
  });

  it.each([
    ['unbounded landing', (plan: any) => { plan.delivery.wholeDocumentResource.maxUtf8Bytes = 16_385; }, 'maxUtf8Bytes'],
    ['whole-document directory', (plan: any) => { plan.delivery.wholeDocumentResource.sectionDirectory = 'included'; }, 'sectionDirectory'],
    ['whole-document body', (plan: any) => { plan.delivery.wholeDocumentResource.body = 'included'; }, 'wholeDocumentResource.body'],
    ['browse page over 32 entries', (plan: any) => { plan.delivery.browse.maxSectionEntries = 33; }, 'maxSectionEntries'],
    ['browse body', (plan: any) => { plan.delivery.browse.body = 'included'; }, 'browse.body'],
    ['missing cursor identity binding', (plan: any) => { plan.delivery.browse.cursor.bindings.pop(); }, 'cursor.bindings'],
    ['reordered cursor identity bindings', (plan: any) => { plan.delivery.browse.cursor.bindings.reverse(); }, 'cursor.bindings'],
    ['non-section exact body route', (plan: any) => { plan.delivery.exactSectionResource.body = 'also_browse'; }, 'exactSectionResource.body'],
    ['transform-8 inclusion', (plan: any) => { plan.transform.predecessor.scope = 'existing_18_historical_documents'; }, 'predecessor.scope'],
    ['authorized migration', (plan: any) => { plan.transform.migrationStatus = 'authorized'; }, 'migrationStatus'],
    ['generic document identity', (plan: any) => { plan.edition.documentId = 'calvin-institutes'; }, 'edition.documentId'],
    ['wrong work chronology', (plan: any) => { plan.work.composition.endYear = 1561; }, 'composition.endYear'],
    ['unqualified day field', (plan: any) => { plan.edition.publication.day = 6; }, 'edition.publication'],
    ['wrong Gate 1 path', (plan: any) => { plan.gate1Package.path = 'data/norton-copy.json'; }, 'gate1Package.path'],
    ['wrong Gate 1 hash', (plan: any) => { plan.gate1Package.sha256 = '0'.repeat(64); }, 'gate1Package.sha256'],
    ['wrong key endpoint', (plan: any) => { plan.gate1Package.sectionKeys.last = 'a17662-source-ordinal-1249'; }, 'sectionKeys.last'],
    ['embedded body field', (plan: any) => { plan.sections = []; }, '$'],
    ['invalid reviewed month', (plan: any) => { plan.work.metadataProvenance.reviewedAt = '2026-13-01'; }, 'real UTC calendar date'],
    ['invalid reviewed day', (plan: any) => { plan.edition.editionProvenance.reviewedAt = '2026-04-31'; }, 'real UTC calendar date'],
    ['invalid non-leap day', (plan: any) => { plan.work.metadataProvenance.reviewedAt = '2025-02-29'; }, 'real UTC calendar date'],
  ])('fails closed on %s', (_label, mutate, message) => {
    const plan = rawPlan();
    mutate(plan);
    expect(() => parseHistoricalSectionedDeliveryPlan(plan)).toThrow(message);
  });

  it('accepts a real leap-day review date without permitting calendar rollover', () => {
    const plan = rawPlan();
    plan.work.metadataProvenance.reviewedAt = '2024-02-29';
    plan.edition.editionProvenance.reviewedAt = '2000-02-29';
    expect(parseHistoricalSectionedDeliveryPlan(plan)).toMatchObject({
      work: { metadataProvenance: { reviewedAt: '2024-02-29' } },
      edition: { editionProvenance: { reviewedAt: '2000-02-29' } },
    });
  });

  it('provides a manual local verifier but keeps it out of runtime, migrations, data materialization, and workflow wiring', () => {
    const result = spawnSync(process.execPath, [
      '--import', 'tsx', resolve('scripts/historical-sectioned-delivery.ts'), '--verify',
    ], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      editionId: NORTON_EDITION_ID,
      packageSha256: NORTON_GATE1_PACKAGE_SHA256,
      sectionCount: NORTON_SECTION_COUNT,
    });

    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(Object.values(packageJson.scripts).join('\n')).not.toContain('historical-sectioned-delivery');
    expect(readFileSync('data/data-manifest.json', 'utf8')).not.toContain(NORTON_EDITION_ID);
    const migrations = walkFiles('migrations');
    expect(migrations.some(path => /(?:^|\/)0005_historical_section_identity_delivery\.sql$/.test(path))).toBe(true);

    const operationalScripts = walkFiles('scripts')
      .filter(path => /\.(?:[cm]?[jt]s|sh)$/.test(path))
      .filter(path => path !== SELF_SCRIPT);
    const manifestsAndSeeds = [
      ...walkFiles('data'),
      ...walkFiles('test/fixtures'),
    ].filter(path => /(?:^|\/)[^/]*(?:manifest|seed)[^/]*(?:\/|$)/i.test(path));
    const wranglerConfigs = [
      ...readdirSync('.').filter(path => /^wrangler.*\.toml$/.test(path)),
      ...walkFiles('test').filter(path => /(?:^|\/)wrangler[^/]*\.toml$/.test(path)),
    ];
    const operationalSurfaces = [...new Set([
      ...walkFiles('src').filter(path => /\.[cm]?[jt]s$/.test(path)),
      ...migrations,
      ...walkFiles('.github/workflows'),
      ...operationalScripts,
      ...manifestsAndSeeds,
      ...wranglerConfigs,
      'package.json',
      'package-lock.json',
    ])].sort();
    expect(operationalSurfaces).toEqual(expect.arrayContaining([
      'src/index.ts',
      'src/worker.ts',
      'migrations/0001_initial_schema.sql',
      '.github/workflows/pr.yml',
      'scripts/build-database.ts',
      'scripts/export-for-d1.ts',
      'scripts/export-for-d1.sh',
      'scripts/d1-seed-manifest.ts',
      'scripts/d1-seed-utils.ts',
      'scripts/verify-d1-seed.ts',
      'scripts/verify-d1-seed-import.ts',
      'scripts/verify-d1-seed-workerd.ts',
      'scripts/verify-data-manifest.ts',
      'data/data-manifest.json',
      'package.json',
      'package-lock.json',
      'wrangler.toml',
      'wrangler.release.toml',
      'wrangler.ccel-coordinator.toml',
      'test/worker-runtime/wrangler.test.toml',
      'test/ccel-coordinator-runtime/wrangler.test.toml',
    ]));
    expect(operationalSurfaces).not.toContain(SELF_SCRIPT);
    for (const path of operationalSurfaces) {
      const text = readFileSync(path, 'utf8');
      expect(text, path).not.toContain(HISTORICAL_SECTIONED_DELIVERY_KIND);
      expect(text, path).not.toContain('historical-sectioned-delivery');
    }
  });
});

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}
