import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  attachNortonEvidenceHashes,
  buildNortonCompactEvidence,
  candidateLayout,
  canonicalNortonEvidence,
  externalizeNortonMigration,
  measureNortonDatabase,
  NORTON_COMPLETE_HASH_DOMAIN,
  NORTON_DETERMINISTIC_HASH_DOMAIN,
  parseNortonCapacityArguments,
  parseNortonD1Json,
  stripNortonVolatileMeasurements,
  verifyNortonCompleteArtifactHash,
  writeNortonSeedChunks,
} from '../../../scripts/norton-capacity-decision-evidence.js';

const root = resolve(import.meta.dirname, '../../..');

function fakeFullEnvelope() {
  const measure = {
    fileBytes: 100,
    pageSize: 4096,
    pageCount: 1,
    freelistPages: 0,
    accountedDbstatPages: 1,
    integrityCheck: 'ok',
    foreignKeyViolations: 0,
  };
  const candidate = (name: string, layout: ReturnType<typeof candidateLayout>) => ({
    name,
    buildMethod: 'fresh_direct_layout_build',
    layout,
    preVacuum: measure,
    postVacuumDiagnostic: { fileBytes: 90 },
    capacityGate: { status: 'within_conservative_gate', headroomBytes: 10 },
    compatibility: { documents: 35 },
    matchOrder: { phrase: ['one'] },
    layeredParity: { phrase: ['one'] },
  });
  const focused = (layout: string) => ({
    runtime: 'isolated_local_workerd_d1',
    layout,
    elapsedMs: 10,
    seed: {
      fileCount: 2,
      bytes: 20,
      sha256: 'a'.repeat(64),
      importElapsedMs: 5,
      importMeta: [{ rows_written: 1 }],
    },
    ftsIntegrityChecks: 2,
    immutableTriggerCount: 6,
    retrieval: { rows: [{ sectionKey: 'one' }], elapsedMs: 1, meta: {} },
    queryProof: { phrase: { orderedRowsSha256: 'b'.repeat(64), historicalMeta: {} } },
  });
  return attachNortonEvidenceHashes({
    schemaVersion: 'norton-capacity-decision-evidence.v2',
    status: 'local_only_disposable_decision_evidence',
    sourceRevision: { commit: 'c'.repeat(40), tree: 'd'.repeat(40), experimentScriptSha256: 'e'.repeat(64) },
    environment: { node: 'v22.23.1', sqlite: '3.51.2', wrangler: '4.114.0' },
    source: { packageSha256: 'f'.repeat(64), sourceArtifactSha256: '1'.repeat(64), sectionCount: 1250 },
    baseline: {
      profile: { schemaVersion: '0008', transformVersion: 10, expectedDocumentCount: 35 },
      corpusIdentity: '2'.repeat(64),
      measure,
    },
    capacityPolicy: { conservativeGateBytes: 350 * 1024 * 1024 },
    rightsDecision: { exactArtifactRights: 'preserved', normalizedTextRights: null },
    candidates: [
      candidate('A_current_four_copy', candidateLayout('A_current_four_copy')),
      candidate('B_historical_external_content_fts', candidateLayout('B_historical_external_content_fts')),
      candidate('C_historical_and_runtime_external_content_fts', candidateLayout('C_historical_and_runtime_external_content_fts')),
    ],
    workerd: {
      B: focused('B'),
      C: focused('C'),
      fullReleaseSeedC: {
        status: 'passed_full_generated_release_seed_workerd_proof',
        runtime: 'isolated_local_workerd_d1',
        layout: 'C_historical_and_runtime_external_content_fts',
        elapsedMs: 20,
        migrationElapsedMs: 21,
        importElapsedMs: 22,
        rebuildElapsedMs: 23,
        migrations: { count: 8, aggregateSha256: '3'.repeat(64) },
        seed: { fileCount: 10, byteSize: 100, statementCount: 20, rowCount: 30, aggregateSha256: '4'.repeat(64) },
        baseTableCountsSha256: '5'.repeat(64),
        ftsIntegrityChecks: 4,
        immutableTriggerCount: 6,
        queryProof: { phrase: { historical: '6'.repeat(64), runtime: '7'.repeat(64), count: 3 } },
        retrievalSha256: '8'.repeat(64),
        retrievalComparedWith: 'fresh_candidate_c_sqlite_exact_keys_ordinals_heading_and_content_sha256',
        releaseSeedIdentity: 'experimental',
      },
    },
    mutationResidueDiagnostics: {
      B: {
        diagnosticOnly: true,
        capacityDecisionInput: false,
        freshCandidateInputMutated: false,
        sourceDatabaseRole: 'separate_legacy_mutation_path_copy',
        outputDatabaseRole: 'disposable_diagnostic_copy',
        mutationMethod: 'copy_then_drop_recreate_rebuild',
        directCandidateBytes: 100,
        beforeVacuum: { fileBytes: 110 },
        afterVacuum: { fileBytes: 90 },
        preVacuumResidueBytesVersusDirect: 10,
        postVacuumBytesVersusDirect: -10,
      },
      C: {
        diagnosticOnly: true,
        capacityDecisionInput: false,
        freshCandidateInputMutated: false,
        sourceDatabaseRole: 'separate_legacy_mutation_path_copy',
        outputDatabaseRole: 'disposable_diagnostic_copy',
        mutationMethod: 'copy_then_drop_recreate_rebuild',
        directCandidateBytes: 100,
        beforeVacuum: { fileBytes: 109 },
        afterVacuum: { fileBytes: 89 },
        preVacuumResidueBytesVersusDirect: 9,
        postVacuumBytesVersusDirect: -11,
      },
    },
    recommendation: {
      leadingCapacityCandidate: 'C_historical_and_runtime_external_content_fts',
      status: 'provisional_capacity_recommendation',
    },
    scopeBoundary: { bindingOrRemoteD1Used: false, corpusActivated: false, deploymentPerformed: false },
    elapsedMs: 99,
    sanitized: true,
  });
}

describe('Norton capacity decision evidence', () => {
  it('defines the three direct layouts without treating D as equivalent', () => {
    expect(candidateLayout('A_current_four_copy')).toEqual({
      historicalExternalContent: false,
      runtimeExternalContent: false,
    });
    expect(candidateLayout('B_historical_external_content_fts')).toEqual({
      historicalExternalContent: true,
      runtimeExternalContent: false,
    });
    expect(candidateLayout('C_historical_and_runtime_external_content_fts')).toEqual({
      historicalExternalContent: true,
      runtimeExternalContent: true,
    });
    expect(candidateLayout('D_norton_sidecar_lower_scope')).toEqual({
      historicalExternalContent: false,
      runtimeExternalContent: false,
    });
  });

  it('refuses all options so it cannot be pointed at live services', () => {
    expect(() => parseNortonCapacityArguments([])).not.toThrow();
    expect(() => parseNortonCapacityArguments(['--remote'])).toThrow('accepts no arguments');
  });

  it('rewrites only the selected FTS layouts and fails if a known migration shape drifts', () => {
    const current = `CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(
      title, content, topics
    );
    CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5(
      edition_id UNINDEXED, section_key UNINDEXED, heading, content
    );`;
    const c = externalizeNortonMigration(
      current,
      candidateLayout('C_historical_and_runtime_external_content_fts'),
    );
    expect(c).toContain("content='document_sections'");
    expect(c).toContain("content='historical_edition_sections'");
    const a = externalizeNortonMigration(current, candidateLayout('A_current_four_copy'));
    expect(a).toBe(current);
    expect(() => externalizeNortonMigration(
      'CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(changed);',
      candidateLayout('C_historical_and_runtime_external_content_fts'),
    )).toThrow('runtime FTS migration rewrite did not match');
  });

  it('strips exactly the documented volatile measurement keys recursively', () => {
    const value = {
      elapsedMs: 1,
      importElapsedMs: 2,
      importMeta: [{ rows: 1 }],
      stable: {
        elapsedMs: 3,
        schemaImportMs: 4,
        ftsRebuildAndSealMs: 5,
        nested: { migrationElapsedMs: 6, rebuildElapsedMs: 7 },
        metadata: 'retained',
        result: 4,
      },
    };
    expect(stripNortonVolatileMeasurements(value)).toEqual({
      stable: { nested: {}, metadata: 'retained', result: 4 },
    });
    expect(NORTON_DETERMINISTIC_HASH_DOMAIN).toContain('ending Ms');
  });

  it('hashes the entire envelope except only the complete hash itself', () => {
    const envelope = attachNortonEvidenceHashes({ status: 'one', nested: { value: 1 }, sanitized: true });
    expect(envelope.completeArtifactHashDomain).toBe(NORTON_COMPLETE_HASH_DOMAIN);
    expect(verifyNortonCompleteArtifactHash(envelope)).toBe(true);
    expect(verifyNortonCompleteArtifactHash({ ...envelope, status: 'two' })).toBe(false);
    expect(verifyNortonCompleteArtifactHash({
      ...envelope,
      deterministicEvidenceHashDomain: `${envelope.deterministicEvidenceHashDomain}-changed`,
    })).toBe(false);
    expect(verifyNortonCompleteArtifactHash({
      ...envelope,
      completeArtifactHashDomain: `${NORTON_COMPLETE_HASH_DOMAIN}-changed`,
    })).toBe(false);
  });

  it('validates D1 result envelopes and rejects malformed or failed pages', () => {
    expect(parseNortonD1Json('[{"success":true,"results":[{"count":1}]}]'))
      .toEqual([{ success: true, results: [{ count: 1 }] }]);
    expect(() => parseNortonD1Json('{}')).toThrow('not a JSON result array');
    expect(() => parseNortonD1Json('[{"success":false}]')).toThrow('reported failure');
  });

  it('accounts for every SQLite page through dbstat plus freelist', () => {
    const directory = mkdtempSync(join(tmpdir(), 'norton-measure-test-'));
    const path = join(directory, 'fixture.sqlite');
    try {
      const database = new Database(path);
      database.exec('CREATE TABLE rows (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
      const insert = database.prepare('INSERT INTO rows(value) VALUES (?)');
      database.transaction(() => {
        for (let index = 0; index < 500; index++) insert.run('x'.repeat(1_000));
      })();
      database.exec('DELETE FROM rows WHERE id > 5');
      const measurement = measureNortonDatabase(database, path);
      expect(measurement.accountedDbstatPages + measurement.freelistPages)
        .toBe(measurement.pageCount);
      expect(measurement.freelistPages).toBeGreaterThan(0);
      expect(measurement.fileBytes).toBe(measurement.pageSize * measurement.pageCount);
      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('writes deterministic bounded seed chunks with exact row accounting', () => {
    const directory = mkdtempSync(join(tmpdir(), 'norton-seed-test-'));
    try {
      const statements = [
        { sql: 'INSERT INTO "rows"("id") VALUES(1);', rows: 1 },
        { sql: 'INSERT INTO "rows"("id") VALUES(2);', rows: 1 },
      ];
      const first = writeNortonSeedChunks(directory, 'rows', 1, statements);
      const secondDirectory = join(directory, 'second');
      const second = writeNortonSeedChunks(secondDirectory, 'rows', 1, statements);
      expect(first.map(file => ({ ...file, path: file.path.split('/').at(-1) })))
        .toEqual(second.map(file => ({ ...file, path: file.path.split('/').at(-1) })));
      expect(first.reduce((sum, file) => sum + file.rows, 0)).toBe(2);
      expect(first.every(file => file.bytes <= 8 * 1024 * 1024)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('constructs compact evidence without repetitive import metadata', () => {
    const full = fakeFullEnvelope();
    const compact = buildNortonCompactEvidence(full);
    expect(verifyNortonCompleteArtifactHash(compact)).toBe(true);
    expect(compact.status).toBe('provisional_capacity_recommendation_not_release_authority');
    expect(compact.candidates).toHaveLength(3);
    expect(compact.workerd.fullReleaseSeedC.status)
      .toBe('passed_full_generated_release_seed_workerd_proof');
    expect(compact.workerd.fullReleaseSeedC.retrievalComparedWith)
      .toBe('fresh_candidate_c_sqlite_exact_keys_ordinals_heading_and_content_sha256');
    expect(compact.mutationResidueDiagnostics).toMatchObject({
      capacityDecisionInfluence: 'none_fresh_A_B_C_measurements_are_authoritative',
      diagnostics: {
        B: {
          diagnosticOnly: true,
          capacityDecisionInput: false,
          freshCandidateInputMutated: false,
        },
        C: {
          diagnosticOnly: true,
          capacityDecisionInput: false,
          freshCandidateInputMutated: false,
        },
      },
    });
    const serialized = JSON.stringify(compact);
    expect(serialized).not.toContain('importMeta');
    const keys = (value: unknown): string[] => value && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, item]) => [key, ...keys(item)])
      : [];
    expect(keys(compact)).not.toContain('elapsedMs');
    expect(serialized).toContain('normalizedTextRights');
    const changedTiming = structuredClone(full);
    changedTiming.elapsedMs = 12345;
    changedTiming.workerd.B.schemaImportMs = 12346;
    changedTiming.workerd.B.ftsRebuildAndSealMs = 12347;
    changedTiming.workerd.B.seed.importElapsedMs = 12348;
    changedTiming.workerd.B.retrieval.elapsedMs = 12349;
    changedTiming.workerd.B.queryProof.phrase.historicalElapsedMs = 12350;
    changedTiming.workerd.B.queryProof.phrase.runtimeElapsedMs = 12351;
    changedTiming.workerd.fullReleaseSeedC.migrationElapsedMs = 12352;
    changedTiming.workerd.fullReleaseSeedC.importElapsedMs = 12353;
    changedTiming.workerd.fullReleaseSeedC.rebuildElapsedMs = 12354;
    delete changedTiming.completeArtifactSha256;
    const rehashed = attachNortonEvidenceHashes(Object.fromEntries(
      Object.entries(changedTiming).filter(([key]) =>
        !['deterministicEvidenceHashDomain', 'deterministicEvidenceSha256',
          'completeArtifactHashDomain'].includes(key)
      ),
    ));
    expect(canonicalNortonEvidence(buildNortonCompactEvidence(rehashed)))
      .toBe(canonicalNortonEvidence(compact));
  });

  it('keeps a compact, valid, source-controlled evidence envelope', () => {
    const path = resolve(root, 'docs/evidence/norton-capacity-decision-evidence.json');
    const bytes = readFileSync(path);
    const evidence = JSON.parse(bytes.toString('utf8'));
    expect(bytes.byteLength).toBeLessThan(20_000);
    expect(verifyNortonCompleteArtifactHash(evidence)).toBe(true);
    expect(evidence.status).toBe('provisional_capacity_recommendation_not_release_authority');
    expect(evidence.workerd.fullReleaseSeedC.status)
      .toBe('passed_full_generated_release_seed_workerd_proof');
    const scriptSha = createHash('sha256')
      .update(readFileSync(resolve(root, 'scripts/norton-capacity-decision-evidence.ts')))
      .digest('hex');
    expect(evidence.sourceRevision.experimentScriptSha256).toBe(scriptSha);
  });

  it('is exposed as a local audit and documents the provisional decision boundary', () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(packageJson.scripts['audit:norton-capacity'])
      .toBe('tsx scripts/norton-capacity-decision-evidence.ts');
    expect(packageJson.scripts['audit:norton-capacity:write-evidence'])
      .toBe('tsx scripts/write-norton-capacity-compact-evidence.ts');
    const source = readFileSync(resolve(root, 'scripts/norton-capacity-decision-evidence.ts'), 'utf8');
    expect(source).toContain("'--local'");
    expect(source).not.toContain("'--remote'");
    expect(source).toContain('normalizedTextRights: null');
    const documentation = readFileSync(resolve(root, 'docs/NORTON-CAPACITY-EXPERIMENT.md'), 'utf8');
    expect(documentation).toContain('local-only');
    expect(documentation).toContain('provisional capacity leader');
    expect(documentation).toContain('not a final architecture');
    expect(documentation).toContain('docs/evidence/norton-capacity-decision-evidence.json');
  });
});
