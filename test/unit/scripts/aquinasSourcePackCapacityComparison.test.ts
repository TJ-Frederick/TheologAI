import Database from 'better-sqlite3';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AQUINAS_CAPACITY_EXPECTED,
  additionalFtsContentShadowTables,
  assertNoAdditionalFtsContentShadowTables,
  assertCandidateBNavigationEquivalence,
  buildCandidateA,
  buildCandidateB,
  candidateBNavigationIdentityHashes,
  discoverFtsContentShadowTables,
  loadAquinasCapacityInput,
  parseAquinasCapacityComparisonArguments,
  reconstructCandidateAChildren,
  runAquinasSourcePackCapacityComparison,
} from '../../../scripts/aquinas-source-pack-capacity-comparison.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGE_DIRECTORY = 'data/historical-sources/project-gutenberg/aquinas-english-dominican/packages/aquinas-summa-pg-v1';
// This is a genuine fresh corpus build + normal verification + several
// full-database ANALYZE/VACUUM measurements. Supported Node runners under load
// have exceeded four minutes, so retain meaningful CI headroom without
// weakening the end-to-end coverage through a fixture baseline.
const FRESH_END_TO_END_TIMEOUT_MS = 600_000;

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function adversarialFixture(mutate: (root: string, packageDirectory: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), 'theologai-aquinas-capacity-fixture-'));
  const packageDirectory = join(root, PACKAGE_DIRECTORY);
  mkdirSync(dirname(packageDirectory), { recursive: true });
  cpSync(join(ROOT, PACKAGE_DIRECTORY), packageDirectory, { recursive: true });
  mutate(root, packageDirectory);
  return root;
}

describe('Aquinas source-pack capacity comparison derivation', () => {
  it('keeps the documented no-argument capacity audit command bound to its reviewed script', () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.['audit:aquinas-source-pack-capacity'])
      .toBe('tsx scripts/aquinas-source-pack-capacity-comparison.ts');
  });

  it('attests the exact inactive five-shard package and child inventory', () => {
    const input = loadAquinasCapacityInput(ROOT);
    expect(input.identity).toEqual(AQUINAS_CAPACITY_EXPECTED.identity);
    expect(input.sourceHashes.packageSha256s).toEqual(AQUINAS_CAPACITY_EXPECTED.shardPackageHashes);
    expect(input.sourceArtifacts.map(artifact => ({
      artifactId: artifact.artifactId, locator: artifact.locator, sha256: artifact.sha256, bytes: artifact.bytes,
    }))).toEqual([
      { artifactId: 'pg-17611', locator: 'https://www.gutenberg.org/cache/epub/17611/pg17611-h.zip', sha256: 'cd67660a85693de3ead953162db89677a29d59c6fc739e6faf0b4fb4f57fb8b2', bytes: 970487 },
      { artifactId: 'pg-17897', locator: 'https://www.gutenberg.org/cache/epub/17897/pg17897-h.zip', sha256: '378ad159b217adfa26868e1600319125a63202fd955e96ab8aca51961229d698', bytes: 979217 },
      { artifactId: 'pg-18755', locator: 'https://www.gutenberg.org/cache/epub/18755/pg18755-h.zip', sha256: '3d8d24ff85ac392fc2d3da6563d75362ae388ef9dc5403573ab769cebf967146', bytes: 1436264 },
      { artifactId: 'pg-19950', locator: 'https://www.gutenberg.org/cache/epub/19950/pg19950-h.zip', sha256: 'ac431f87de4a2fa9edb5cf0b02134c45a79e48fea3b9c3ee9f3c10cf183e52b8', bytes: 949369 },
    ]);
    expect(input.questions).toHaveLength(512);
    expect(input.authorityBodies.filter(body => body.kind === 'article')).toHaveLength(2669);
    expect(input.authorityBodies.filter(body => body.kind === 'preamble')).toHaveLength(512);
    expect(input.authorityBodies.filter(body => body.kind === 'part_prologue')).toHaveLength(3);
    expect(input.authorityBodies).toHaveLength(3184);
  });

  it('derives plain 512-question bodies and the exact implicit-root Candidate B hierarchy', () => {
    const input = loadAquinasCapacityInput(ROOT);
    const candidateA = buildCandidateA(input);
    const candidateB = buildCandidateB(input);

    expect(candidateA.questionBodies).toHaveLength(512);
    expect(candidateA.questionBodies.every(body => !body.content.startsWith('{'))).toBe(true);
    expect(candidateA.questionBodies.flatMap(body => body.conservation)).toHaveLength(3184);
    expect(reconstructCandidateAChildren(candidateA.questionBodies)).toEqual(input.authorityBodies);

    expect(candidateB.authorityBodies).toEqual(input.authorityBodies);
    expect(candidateB.navigationNodes).toHaveLength(3185);
    expect(candidateB.navigationNodes.filter(node => node.kind === 'part')).toHaveLength(4);
    expect(candidateB.navigationNodes.filter(node => node.kind === 'question')).toHaveLength(512);
    expect(candidateB.navigationNodes.filter(node => node.kind === 'article')).toHaveLength(2669);
    expect(candidateB.navigationNodes.filter(node => node.parentId === null)).toHaveLength(4);
    expect(candidateB.navigationNodes.filter(node => node.bodyId !== null)).toHaveLength(3184);
    expect(() => assertCandidateBNavigationEquivalence(candidateB.navigationNodes)).not.toThrow();
    const hashes = candidateBNavigationIdentityHashes(candidateB.navigationNodes);
    expect(hashes.flat).toBe(hashes.hierarchical);

    const reordered = [candidateB.navigationNodes[1]!, candidateB.navigationNodes[0]!, ...candidateB.navigationNodes.slice(2)]
      .map((node, index) => ({ ...node, flatOrdinal: index + 1 }));
    expect(() => assertCandidateBNavigationEquivalence(reordered)).toThrow('ordered hierarchical traversal differ');
  });

  it('rejects missing, reordered, byte-tampered, hash-tampered, identity-tampered, and duplicate package inputs', () => {
    const firstShard = 'aquinas-summa-pg-v1.prima.shard-0001.json';
    const cases: Array<[string, (root: string, packageDirectory: string) => void]> = [
      ['missing shard', (_root, packageDirectory) => unlinkSync(join(packageDirectory, firstShard))],
      ['reordered shard descriptors', (_root, packageDirectory) => {
        const path = join(packageDirectory, 'manifest.json'); const manifest = JSON.parse(readFileSync(path, 'utf8'));
        [manifest.shards[0], manifest.shards[1]] = [manifest.shards[1], manifest.shards[0]]; writeJson(path, manifest);
      }],
      ['byte-tampered content', (_root, packageDirectory) => {
        const path = join(packageDirectory, firstShard); const shard = JSON.parse(readFileSync(path, 'utf8'));
        shard.questions[0].preamble.content += 'x'; writeJson(path, shard);
      }],
      ['hash-tampered output', (_root, packageDirectory) => {
        const path = join(packageDirectory, firstShard); const shard = JSON.parse(readFileSync(path, 'utf8'));
        shard.questions[0].preamble.output.sha256 = '0'.repeat(64); writeJson(path, shard);
      }],
      ['identity-tampered manifest', (_root, packageDirectory) => {
        const path = join(packageDirectory, 'manifest.json'); const manifest = JSON.parse(readFileSync(path, 'utf8'));
        manifest.identity.workId = 'tampered-work'; writeJson(path, manifest);
      }],
      ['duplicate question', (_root, packageDirectory) => {
        const path = join(packageDirectory, firstShard); const shard = JSON.parse(readFileSync(path, 'utf8'));
        shard.questions.push(shard.questions[0]); shard.shard.questionKeys.push(shard.shard.questionKeys[0]); writeJson(path, shard);
      }],
    ];
    for (const [label, mutate] of cases) {
      const fixture = adversarialFixture(mutate);
      try { expect(() => loadAquinasCapacityInput(fixture), label).toThrow(); } finally { rmSync(fixture, { recursive: true, force: true }); }
    }
  });

  it('accepts no output, schema, or target arguments', () => {
    expect(() => parseAquinasCapacityComparisonArguments([])).not.toThrow();
    expect(() => parseAquinasCapacityComparisonArguments(['--output', 'data/theologai.db']))
      .toThrow('accepts no arguments');
  });

  it('discovers unexpected FTS content shadows from sqlite_master', () => {
    const database = new Database(':memory:');
    try {
      database.exec(`
        CREATE TABLE external_authority (body_id TEXT PRIMARY KEY, content TEXT NOT NULL);
        CREATE VIRTUAL TABLE external_authority_fts USING fts5(
          body_id UNINDEXED, content, content='external_authority', content_rowid='rowid'
        );
        CREATE VIRTUAL TABLE unexpected_candidate_fts USING fts5(content);
      `);
      const discovered = discoverFtsContentShadowTables(database);
      expect(discovered).toContain('unexpected_candidate_fts_content');
      expect(discovered).not.toContain('external_authority_fts_content');
      expect(additionalFtsContentShadowTables([], discovered)).toEqual(['unexpected_candidate_fts_content']);
      expect(() => assertNoAdditionalFtsContentShadowTables([], discovered))
        .toThrow('unexpected_candidate_fts_content');
    } finally {
      database.close();
    }
  });

  it('measures disposable full copies pre-VACUUM and keeps estimates non-gating', () => {
    const report = runAquinasSourcePackCapacityComparison(ROOT);
    expect(report.status).toBe('normal_release_baseline_with_standalone_aquinas_rehearsal');
    expect(report.temporaryStorage).toBe('os-temp-disposed');
    expect(report.baseline.kind).toBe('normal_release_zero_hierarchy_baseline');
    expect(report.baseline.builtFreshFromCurrentCheckout).toBe(true);
    expect(report.baseline.preVacuum.freelistPages).toBe(0);
    expect(report.baseline.preVacuum.integrityCheck).toBe('ok');
    expect(report.baseline.postVacuumDiagnostic.fileBytes).toBeLessThanOrEqual(report.baseline.preVacuum.fileBytes);
    expect(report.standaloneAquinasRehearsal.shape).toBe('generic edition-scoped hierarchy with external-content FTS');
    expect(report.standaloneAquinasRehearsal.materialization).toEqual({ hierarchies: 1, artifacts: 4, bodies: 3184, nodes: 3185, ftsRows: 3184 });
    expect(report.standaloneAquinasRehearsal.storedIntegrityVerified).toBe(true);
    expect(report.standaloneAquinasRehearsal.preVacuumFullCopy.fileBytes).toBeGreaterThan(report.baseline.preVacuum.fileBytes);
    expect(report.standaloneAquinasRehearsal.postVacuumDiagnostic.fileBytes)
      .toBeLessThanOrEqual(report.standaloneAquinasRehearsal.preVacuumFullCopy.fileBytes);
    expect(report.standaloneAquinasRehearsal.capacityGate.finalBytes)
      .toBe(report.standaloneAquinasRehearsal.preVacuumFullCopy.fileBytes);
    expect(report.standaloneAquinasRehearsal.capacityGate.basis).toBe('direct_pre_vacuum_full_copy_after_analyze');
    expect(report.standaloneAquinasRehearsal.capacityGate.withinLimit).toBe(true);

    expect(JSON.stringify(report)).not.toContain('Whether Sacred Doctrine Is a Science');
    expect(report.capacityStatus).toBe('within_350_mib');
  }, FRESH_END_TO_END_TIMEOUT_MS);
});
