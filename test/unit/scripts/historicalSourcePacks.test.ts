import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { compileEditionPackage } from '../../../src/kernel/editionProvenanceFoundation.js';
import { inventedEditionPackageFixture } from '../../fixtures/editionProvenanceFoundation.js';
import {
  assertCoreEightSourcePackRelease,
  loadHistoricalSourcePacks,
  materializeHistoricalSourcePacks,
} from '../../../scripts/historical-source-packs.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function manifestFiles(directory: string, manifest: unknown, editions: Record<string, unknown>): Map<string, string> {
  const manifestBytes = JSON.stringify(manifest);
  return new Map([
    [`${directory}/manifest.json`, manifestBytes],
    [`${directory}/manifest.sha256`, `${sha256(manifestBytes)}  manifest.json\n`],
    ...Object.entries(editions).map(([name, edition]) =>
      [`${directory}/editions/${name}.json`, JSON.stringify(edition)] as const),
  ]);
}

function sourcePackEditionFixture(id = 'invented-clockwork-treatise') {
  const fixture = inventedEditionPackageFixture() as {
    work: { workId: string };
    edition: { editionId: string; workId: string };
  } & Record<string, unknown>;
  fixture.work.workId = id;
  fixture.edition.workId = id;
  fixture.edition.editionId = id;
  return fixture;
}

describe('historical exact-edition source packs', () => {
  it('preserves canonical Book and Chapter identities for Damascene and Irenaeus', () => {
    const load = (id: string) => JSON.parse(readFileSync(resolve(process.cwd(), `data/historical-source-packs/core-eight/editions/${id}.json`), 'utf8')) as { edition: { provenance: { uncertainty: string } }; sections: Array<{ sectionKey: string; sourceOrdinal: number }> };
    const damascene = load('john-damascene-exposition-salmond-npnf2-v9');
    const damasceneCounts = [14, 30, 29, 27];
    expect(damascene.sections.map(section => section.sectionKey)).toEqual(damasceneCounts.flatMap((count, book) => Array.from({ length: count }, (_, chapter) => `book-${book + 1}-chapter-${String(chapter + 1).padStart(2, '0')}`)));
    const irenaeus = load('irenaeus-against-heresies-anf1-1885');
    const irenaeusCounts = [31, 35, 25, 41, 36];
    expect(irenaeus.sections.map(section => section.sectionKey)).toEqual(irenaeusCounts.flatMap((count, book) => [`book-${book + 1}-preface`, ...Array.from({ length: count }, (_, chapter) => `book-${book + 1}-chapter-${String(chapter + 1).padStart(2, '0')}`)]));
    for (const edition of [damascene, irenaeus]) {
      expect(edition.sections.map(section => section.sourceOrdinal)).toEqual(Array.from({ length: edition.sections.length }, (_, index) => index + 1));
      expect(edition.edition.provenance.uncertainty).toMatch(/edition scope: .*; semantic key scheme:/);
    }
  });

  it('keeps the Deane Proslogion in source reading order with a clean XML witness', () => {
    const path = resolve(process.cwd(), 'data/historical-source-packs/core-eight/editions/anselm-proslogion-deane-1903.json');
    const edition = JSON.parse(readFileSync(path, 'utf8')) as { edition: { contributorGroups: { translation: { contributors: Array<{ name: string }> } } }; sections: Array<{ sectionKey: string; heading: string; content: string }> };
    expect(edition.edition.contributorGroups.translation.contributors).toEqual([{ name: 'Sidney Norton Deane', role: 'translator' }]);
    expect(edition.sections.map(section => section.sectionKey)).toEqual(['preface', ...Array.from({ length: 26 }, (_, index) => `chapter-${String(index + 1).padStart(2, '0')}`)]);
    expect(edition.sections[0]).toMatchObject({ heading: 'Preface' });
    expect(edition.sections.slice(1).every(section => /^Chapter\s+/i.test(section.heading))).toBe(true);
    expect(edition.sections.map(section => section.content).join('\n')).not.toMatch(/jts\.elf|Monologiuni|\bmeas\s+ure\b/i);
  });

  it('keeps Wesley volume-end material outside all 53 sermon bodies', () => {
    const edition = JSON.parse(readFileSync(new URL('../../../data/historical-source-packs/core-eight/editions/wesley-standard-sermons-1771.json', import.meta.url), 'utf8')) as { sections: Array<{ sectionKey: string; content: string }> };
    const sermonBodies = new Map(edition.sections.map(section => [section.sectionKey.replace(/-part-\d+$/, ''), section.content]));
    expect(sermonBodies.size).toBe(53);
    const completeText = edition.sections.map(section => section.content).join('\n');
    expect(completeText).not.toMatch(/[♦♠]|(?:replaced with|omitted from text|duplicate .+ removed|removed unneeded word|Number [‘'"].+ skipped|Points [‘'"].+ replaced)/i);
    for (const sermon of ['sermon-16', 'sermon-30', 'sermon-47', 'sermon-53']) {
      const content = [...edition.sections.filter(section => section.sectionKey.replace(/-part-\d+$/, '') === sermon).map(section => section.content)].join('\n');
      expect(content, sermon).not.toMatch(/The End of the (?:FIRST|SECOND|THIRD|FOURTH) VOLUME|Footnotes\.|Transcriber[’']s Notes|PROJECT GUTENBERG/i);
    }
  });

  it('accepts a strict shared manifest, pins its compiled package, and retains multiple artifacts', () => {
    const edition = sourcePackEditionFixture();
    const packageSha256 = compileEditionPackage(edition).sha256;
    const manifest = {
      schemaVersion: 'historical-source-pack-manifest.v1', packId: 'test-core', revision: 1,
      rightsScope: 'normalized_public_domain_text_only',
      members: [{
        id: 'invented-clockwork-treatise', sourcePath: 'editions/invented.json', packageSha256,
        normalizedTextRights: { status: 'no_known_conflict', scope: 'normalized_public_domain_text_only', basis: 'Test-only normalized text screen.', reviewedAt: '2026-07-23' },
        artifacts: [
          { artifactId: 'invented-authority', role: 'authority', locator: 'https://example.invalid/authority', sha256: 'b'.repeat(64), bytes: 1, acquiredAt: '2026-07-23T00:00:00.000Z' },
          { artifactId: 'invented-comparator', role: 'comparator', locator: 'https://example.invalid/comparator', sha256: 'c'.repeat(64), bytes: 2, acquiredAt: '2026-07-23T00:00:00.000Z' },
        ],
      }],
    };
    const files = manifestFiles('data/historical-source-packs/core-eight', manifest, { invented: edition });
    const packs = loadHistoricalSourcePacks([...files.keys()], { read: (path: string) => files.get(path)! } as never);
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({ packId: 'test-core', revision: '1', artifacts: [{ role: 'authority' }, { role: 'comparator' }] });
  });

  it('rejects a mismatched package pin before it can be materialized', () => {
    const manifest = {
      schemaVersion: 'historical-source-pack-manifest.v1', packId: 'test-core', revision: 1,
      rightsScope: 'normalized_public_domain_text_only', members: [{
        id: 'invented-clockwork-treatise', sourcePath: 'editions/invented.json', packageSha256: '0'.repeat(64),
        normalizedTextRights: { status: 'no_known_conflict', scope: 'normalized_public_domain_text_only', basis: 'Test-only normalized text screen.', reviewedAt: '2026-07-23' },
        artifacts: [{ artifactId: 'invented-authority', role: 'authority', locator: 'https://example.invalid/authority', sha256: 'b'.repeat(64), bytes: 1, acquiredAt: '2026-07-23T00:00:00.000Z' }],
      }],
    };
    const files = manifestFiles('data/historical-source-packs/core-eight', manifest, { invented: sourcePackEditionFixture() });
    expect(() => loadHistoricalSourcePacks([...files.keys()], { read: (path: string) => files.get(path)! } as never)).toThrow('package checksum mismatch');
  });

  it('binds each manifest member id to both compiled work and edition identities', () => {
    const edition = sourcePackEditionFixture();
    const manifest = {
      schemaVersion: 'historical-source-pack-manifest.v1', packId: 'test-core', revision: 1,
      rightsScope: 'normalized_public_domain_text_only', members: [{
        id: 'different-identity', sourcePath: 'editions/invented.json', packageSha256: compileEditionPackage(edition).sha256,
        normalizedTextRights: { status: 'no_known_conflict', scope: 'normalized_public_domain_text_only', basis: 'Test-only normalized text screen.', reviewedAt: '2026-07-23' },
        artifacts: [{ artifactId: 'invented-authority', role: 'authority', locator: 'https://example.invalid/authority', sha256: 'b'.repeat(64), bytes: 1, acquiredAt: '2026-07-23T00:00:00.000Z' }],
      }],
    };
    const files = manifestFiles('data/historical-source-packs/test', manifest, { invented: edition });
    expect(() => loadHistoricalSourcePacks([...files.keys()], { read: (path: string) => files.get(path)! } as never)).toThrow('member id must equal');
  });

  it('discovers multiple manifest-declared packs deterministically', () => {
    const first = sourcePackEditionFixture();
    const second = structuredClone(first);
    second.work.workId = 'second-invented-work';
    second.work.title = 'Second Invented Work';
    second.edition.workId = 'second-invented-work';
    second.edition.editionId = 'second-invented-work';
    second.edition.version = 'second-invented-edition-v1';
    const makeManifest = (packId: string, id: string, edition: typeof first, artifactId: string) => ({
      schemaVersion: 'historical-source-pack-manifest.v1', packId, revision: 1,
      rightsScope: 'normalized_public_domain_text_only',
      members: [{
        id, sourcePath: `editions/${id}.json`, packageSha256: compileEditionPackage(edition).sha256,
        normalizedTextRights: { status: 'no_known_conflict', scope: 'normalized_public_domain_text_only', basis: 'Test-only normalized text screen.', reviewedAt: '2026-07-23' },
        artifacts: [{ artifactId, role: 'authority', locator: 'https://example.invalid/authority', sha256: 'b'.repeat(64), bytes: 1, acquiredAt: '2026-07-23T00:00:00.000Z' }],
      }],
    });
    const alpha = manifestFiles('data/historical-source-packs/alpha', makeManifest('alpha-pack', 'invented-clockwork-treatise', first, 'alpha-authority'), { 'invented-clockwork-treatise': first });
    const beta = manifestFiles('data/historical-source-packs/beta', makeManifest('beta-pack', 'second-invented-work', second, 'beta-authority'), { 'second-invented-work': second });
    const files = new Map([...beta, ...alpha]);
    const packs = loadHistoricalSourcePacks([...files.keys()].reverse(), { read: (path: string) => files.get(path)! } as never);
    expect(packs.map(pack => pack.packId)).toEqual(['alpha-pack', 'beta-pack']);
  });

  it('rejects orphan edition JSON rather than granting synthetic rights', () => {
    const edition = sourcePackEditionFixture();
    const manifest = {
      schemaVersion: 'historical-source-pack-manifest.v1', packId: 'test-core', revision: 1,
      rightsScope: 'normalized_public_domain_text_only',
      members: [{
        id: 'invented-clockwork-treatise', sourcePath: 'editions/invented.json', packageSha256: compileEditionPackage(edition).sha256,
        normalizedTextRights: { status: 'no_known_conflict', scope: 'normalized_public_domain_text_only', basis: 'Test-only normalized text screen.', reviewedAt: '2026-07-23' },
        artifacts: [{ artifactId: 'invented-authority', role: 'authority', locator: 'https://example.invalid/authority', sha256: 'b'.repeat(64), bytes: 1, acquiredAt: '2026-07-23T00:00:00.000Z' }],
      }],
    };
    const files = manifestFiles('data/historical-source-packs/test', manifest, { invented: edition, orphan: edition });
    expect(() => loadHistoricalSourcePacks([...files.keys()], { read: (path: string) => files.get(path)! } as never)).toThrow('Orphan');
  });

  it('rejects missing rights and missing or mismatched manifest checksum sidecars', () => {
    const edition = sourcePackEditionFixture();
    const member = {
      id: 'invented-clockwork-treatise', sourcePath: 'editions/invented.json', packageSha256: compileEditionPackage(edition).sha256,
      normalizedTextRights: { status: 'no_known_conflict', scope: 'normalized_public_domain_text_only', basis: 'Test-only normalized text screen.', reviewedAt: '2026-07-23' },
      artifacts: [{ artifactId: 'invented-authority', role: 'authority', locator: 'https://example.invalid/authority', sha256: 'b'.repeat(64), bytes: 1, acquiredAt: '2026-07-23T00:00:00.000Z' }],
    };
    const base = { schemaVersion: 'historical-source-pack-manifest.v1', packId: 'test-core', revision: 1, rightsScope: 'normalized_public_domain_text_only' };
    const missingRightsMember = { ...member } as Record<string, unknown>;
    delete missingRightsMember.normalizedTextRights;
    const missingRights = manifestFiles('data/historical-source-packs/test', { ...base, members: [missingRightsMember] }, { invented: edition });
    expect(() => loadHistoricalSourcePacks([...missingRights.keys()], { read: (path: string) => missingRights.get(path)! } as never)).toThrow('unknown or missing fields');

    const missingSidecar = manifestFiles('data/historical-source-packs/test', { ...base, members: [member] }, { invented: edition });
    missingSidecar.delete('data/historical-source-packs/test/manifest.sha256');
    expect(() => loadHistoricalSourcePacks([...missingSidecar.keys()], { read: (path: string) => missingSidecar.get(path)! } as never)).toThrow('missing required');

    const mismatchedSidecar = manifestFiles('data/historical-source-packs/test', { ...base, members: [member] }, { invented: edition });
    mismatchedSidecar.set('data/historical-source-packs/test/manifest.sha256', `${'0'.repeat(64)}  manifest.json\n`);
    expect(() => loadHistoricalSourcePacks([...mismatchedSidecar.keys()], { read: (path: string) => mismatchedSidecar.get(path)! } as never)).toThrow('does not match');
  });

  it('round-trips authority and comparator roles through normalized persistence', () => {
    const manifestPath = 'data/historical-source-packs/core-eight/manifest.json';
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      members: Array<{ sourcePath: string; artifacts: Array<{ role: string }> }>;
    };
    const paths = [
      manifestPath,
      'data/historical-source-packs/core-eight/manifest.sha256',
      ...manifest.members.map(member => `data/historical-source-packs/core-eight/${member.sourcePath}`),
    ];
    const packs = loadHistoricalSourcePacks(paths, {
      read: (path: string) => readFileSync(path, 'utf8'),
    } as never);
    assertCoreEightSourcePackRelease(packs);
    const db = new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      db.exec(readFileSync('migrations/0001_initial_schema.sql', 'utf8'));
      db.exec(readFileSync('migrations/0005_historical_section_identity_delivery.sql', 'utf8'));
      db.exec(readFileSync('migrations/0006_historical_source_packs.sql', 'utf8'));
      expect(materializeHistoricalSourcePacks(db, packs)).toEqual({
        packs: 1, works: 8, editions: 8, artifacts: 25, sections: 512,
        deliveryProfiles: 8, identities: 512, legacyAliases: 0,
      });
      const roles = db.prepare(
        'SELECT role, COUNT(*) AS count FROM historical_source_artifacts GROUP BY role ORDER BY role',
      ).all() as Array<{ role: string; count: number }>;
      const expected = new Map<string, number>();
      for (const member of manifest.members) {
        for (const artifact of member.artifacts) {
          expected.set(artifact.role, (expected.get(artifact.role) ?? 0) + 1);
        }
      }
      expect(roles).toEqual([...expected].sort(([left], [right]) => left.localeCompare(right))
        .map(([role, count]) => ({ role, count })));
      expect(db.prepare(
        `SELECT COUNT(*) AS count FROM historical_editions e
          WHERE NOT EXISTS (
            SELECT 1 FROM historical_source_artifacts a
             WHERE a.edition_id = e.edition_id AND a.role = 'authority'
          )`,
      ).get()).toEqual({ count: 0 });
      expect(db.prepare(`SELECT COUNT(*) AS count FROM historical_document_delivery_profiles
        WHERE delivery_mode = 'sectioned_only' AND landing_max_bytes = 16384
          AND browse_page_size = 32 AND cursor_version = 1
          AND work_id = document_id AND edition_id = document_id
          AND immutable_corpus_identity = section_package_identity`).get()).toEqual({ count: 8 });
      expect(db.prepare(`SELECT COUNT(*) AS count FROM historical_section_identities i
        JOIN historical_document_delivery_profiles p ON p.document_id = i.document_id
        WHERE p.delivery_mode = 'sectioned_only'`).get()).toEqual({ count: 512 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM historical_section_aliases').get()).toEqual({ count: 0 });
      expect(db.prepare(`SELECT COUNT(*) AS count FROM historical_edition_sections s
        LEFT JOIN historical_edition_sections_fts f
          ON f.edition_id = s.edition_id AND f.section_key = s.section_key
        WHERE f.rowid IS NULL OR f.heading IS NOT s.heading OR f.content IS NOT s.content`).get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }
  });
});
