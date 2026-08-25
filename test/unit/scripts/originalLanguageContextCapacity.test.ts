import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertOriginalLanguageCorpusCompatibility,
  assertOriginalLanguageProjectionParity,
  assessOriginalLanguageCapacity,
  attachOriginalLanguageEvidenceHashes,
  canonicalOriginalLanguageEvidence,
  ORIGINAL_LANGUAGE_COMPLETE_HASH_DOMAIN,
  ORIGINAL_LANGUAGE_DETERMINISTIC_HASH_DOMAIN,
  originalLanguageSlotAccounting,
  parseOriginalLanguageCapacityArguments,
  resolveOriginalLanguageContextBinding,
  storedOriginalLanguageProjectionSha256,
  stripOriginalLanguageVolatileMeasurements,
  SYNTHETIC_PROFILE,
  validateSyntheticReference,
  verifyOriginalLanguageCompleteHash,
  withOriginalLanguageTemporaryDirectory,
  type SyntheticReferenceModel,
} from './originalLanguageContextCapacityRuntime.mjs';

function declaredExportNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class|interface|type)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]!);
  }
  for (const block of source.matchAll(/export\s*\{([\s\S]*?)\}(?:\s*from\s*['"][^'"]+['"])?\s*;?/g)) {
    for (const name of block[1]!.split(',').map(value => value.trim().split(/\s+as\s+/)[0]).filter(Boolean)) names.add(name!);
  }
  return names;
}

const root = resolve(import.meta.dirname, '../../..');
const gate = 350 * 1024 * 1024;
const warning = gate * 0.9;

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalOriginalLanguageEvidence(value)).digest('hex');
}

describe('source-free original-language context capacity experiment', () => {
  it('keeps the checked declaration facade and wrapper export surface aligned', () => {
    const wrapper = readFileSync(join(root, 'test/unit/scripts/originalLanguageContextCapacityRuntime.mjs'), 'utf8');
    const declaration = readFileSync(join(root, 'test/unit/scripts/originalLanguageContextCapacityRuntime.d.mts'), 'utf8');
    const source = readFileSync(join(root, 'scripts/original-language-context-capacity.ts'), 'utf8');
    const wrapperExports = declaredExportNames(wrapper);
    expect(declaredExportNames(declaration)).toEqual(wrapperExports);
    for (const name of wrapperExports) expect(declaredExportNames(source), name).toContain(name);
  });

  it('accepts no arguments and has no remote/corpus acquisition mode', () => {
    expect(() => parseOriginalLanguageCapacityArguments([])).not.toThrow();
    expect(() => parseOriginalLanguageCapacityArguments(['--remote'])).toThrow('accepts no arguments');
    expect(() => parseOriginalLanguageCapacityArguments(['--source', 'macula'])).toThrow('accepts no arguments');
  });

  it('accepts Greek one-to-one and many-to-one positional alignment', () => {
    const result = validateSyntheticReference({
      canonicalCandidates: ['SYN.GRC.TEST'],
      sourceReference: null,
      sourceLanguage: 'grc',
      crosswalkKind: 'identity',
      bundle: { v: 1, g: [[1, 0, 1, 1], [2, 1, 2, 2, 3]] },
    });
    expect(result).toMatchObject({
      sourcePositions: 3,
      contextUnits: 2,
      manyToOneUnits: 1,
      oneToManySourcePositions: 0,
    });
  });

  it('models Hebrew and Aramaic high-multiplicity sensitivity up to an explicit bound', () => {
    for (const sourceLanguage of ['hbo', 'arc'] as const) {
      const result = validateSyntheticReference({
        canonicalCandidates: [`SYN.${sourceLanguage}.TEST`],
        sourceReference: null,
        sourceLanguage,
        crosswalkKind: 'identity',
        bundle: {
          v: 1,
          s: [
            [1, 1, 1, 0, 1],
            [2, 1, 2, 1, 2],
            [3, 1, 3, 2, 3],
            [4, 1, 4, 3, 4],
            [5, 2, 1, 4, 5],
          ],
        },
      });
      expect(result).toMatchObject({
        sourcePositions: 2,
        contextUnits: 5,
        oneToManySourcePositions: 1,
      });
    }
    expect(() => validateSyntheticReference({
      canonicalCandidates: ['SYN.HBO.OVERFLOW'],
      sourceReference: null,
      sourceLanguage: 'hbo',
      crosswalkKind: 'identity',
      bundle: {
        v: 1,
        s: Array.from({ length: 7 }, (_, index) => [index + 1, 1, index + 1, index, 1]),
      },
    })).toThrow('must be an integer from 1 to 6');
  });

  it('fails closed on ambiguous crosswalks and alignments', () => {
    const base: SyntheticReferenceModel = {
      canonicalCandidates: ['SYN.GRC.TEST'],
      sourceReference: null,
      sourceLanguage: 'grc',
      crosswalkKind: 'identity',
      bundle: { v: 1, g: [[1, 0, 1, 1]] },
    };
    expect(() => validateSyntheticReference({
      ...base,
      canonicalCandidates: ['SYN.GRC.ONE', 'SYN.GRC.TWO'],
    })).toThrow('exactly one canonical candidate');
    expect(() => validateSyntheticReference({
      ...base,
      sourceReference: 'DUPLICATED.SOURCE.REF',
    })).toThrow('must not duplicate');
    expect(() => validateSyntheticReference({
      ...base,
      bundle: { v: 1, g: [[1, 0, 1, 1], [2, 1, 2, 1]] },
    })).toThrow('maps to multiple units');
    expect(() => validateSyntheticReference({
      ...base,
      sourceLanguage: 'hbo',
      bundle: { v: 1, s: [[1, 1, 1, 0, 1], [2, 1, 1, 1, 2]] },
    })).toThrow('unique and contiguous');
  });

  it('recomputes canonical stored-row identity and rejects any mismatch', () => {
    const database = new Database(':memory:');
    try {
      database.exec(`CREATE TABLE synthetic_original_language_context_bundles (
        canonical_reference TEXT,source_reference TEXT,source_language TEXT,
        crosswalk_kind TEXT,payload_json TEXT
      )`);
      database.prepare(`INSERT INTO synthetic_original_language_context_bundles VALUES (?,?,?,?,?)`)
        .run('SYN.GRC.00001', null, 'grc', 'identity', '{"g":[[1,0,1,1]],"v":1}');
      const rowHash = hash([
        'SYN.GRC.00001',
        null,
        'grc',
        'identity',
        '{"g":[[1,0,1,1]],"v":1}',
      ]);
      const generated = createHash('sha256').update(rowHash).digest('hex');
      const stored = storedOriginalLanguageProjectionSha256(database);
      expect(stored).toBe(generated);
      expect(() => assertOriginalLanguageProjectionParity(generated, [
        { label: 'integrated', sha256: stored },
        { label: 'sidecar', sha256: stored },
      ])).not.toThrow();
      expect(() => assertOriginalLanguageProjectionParity(generated, [
        { label: 'integrated', sha256: stored },
        { label: 'sidecar', sha256: '0'.repeat(64) },
      ])).toThrow('generated/stored projection mismatch');
    } finally {
      database.close();
    }
  });

  it('applies exact capacity boundary arithmetic', () => {
    expect(assessOriginalLanguageCapacity(warning - 1)).toMatchObject({
      withinLimit: true, warning: false, status: 'within_gate',
    });
    expect(assessOriginalLanguageCapacity(warning)).toMatchObject({
      withinLimit: true, warning: true, status: 'within_gate_warning',
    });
    expect(assessOriginalLanguageCapacity(gate)).toMatchObject({
      withinLimit: true, warning: true, headroomBytes: 0,
    });
    expect(assessOriginalLanguageCapacity(gate + 1)).toMatchObject({
      withinLimit: false, status: 'exceeds_internal_gate', headroomBytes: -1,
    });
    expect(() => assessOriginalLanguageCapacity(-1)).toThrow('non-negative integer');
  });

  it('accounts for one additional sidecar slot per environment', () => {
    expect(originalLanguageSlotAccounting(2)).toEqual({
      existingD1AdditionalSlots: 0,
      separateD1AdditionalSlots: 2,
      environments: 2,
    });
    expect(originalLanguageSlotAccounting(3).separateD1AdditionalSlots).toBe(3);
    expect(() => originalLanguageSlotAccounting(0)).toThrow('positive integer');
  });

  it('fails context closed on missing binding or corpus/schema skew while preserving base morphology', () => {
    const identity = 'a'.repeat(64);
    expect(() => assertOriginalLanguageCorpusCompatibility(identity, identity, 'synthetic-original-language-context-capacity.v1'))
      .not.toThrow();
    expect(() => assertOriginalLanguageCorpusCompatibility(identity, 'b'.repeat(64), 'synthetic-original-language-context-capacity.v1'))
      .toThrow('different base corpus');
    expect(resolveOriginalLanguageContextBinding(identity, undefined)).toEqual({
      status: 'context_unavailable',
      reason: 'binding_missing_or_unavailable',
      baseMorphologyMayContinue: true,
      contextReturned: false,
    });
    expect(resolveOriginalLanguageContextBinding(identity, {
      expectedBaseCorpusIdentity: 'b'.repeat(64),
      schemaVersion: 'synthetic-original-language-context-capacity.v1',
    })).toMatchObject({
      status: 'context_unavailable',
      reason: 'identity_or_version_mismatch',
      baseMorphologyMayContinue: true,
      contextReturned: false,
    });
  });

  it('defines truthful deterministic and complete hash domains', () => {
    const first = attachOriginalLanguageEvidenceHashes({
      status: 'synthetic',
      elapsedMs: 1,
      workerd: { queryElapsedMs: 2, rowsRead: 3 },
    });
    const second = attachOriginalLanguageEvidenceHashes({
      status: 'synthetic',
      elapsedMs: 9,
      workerd: { queryElapsedMs: 8, rowsRead: 3 },
    });
    expect(first.deterministicEvidenceSha256).toBe(second.deterministicEvidenceSha256);
    expect(first.completeArtifactSha256).not.toBe(second.completeArtifactSha256);
    expect(verifyOriginalLanguageCompleteHash(first)).toBe(true);
    expect(verifyOriginalLanguageCompleteHash({ ...first, status: 'changed' })).toBe(false);
    expect(ORIGINAL_LANGUAGE_DETERMINISTIC_HASH_DOMAIN).toContain('ending ElapsedMs');
    expect(ORIGINAL_LANGUAGE_COMPLETE_HASH_DOMAIN).toContain('excluding only completeArtifactSha256');
    expect(stripOriginalLanguageVolatileMeasurements(first)).not.toHaveProperty('elapsedMs');
  });

  it('cleans its disposable directory after success and failure', () => {
    const parent = mkdtempSync(join(tmpdir(), 'original-language-cleanup-test-'));
    try {
      const successPath = withOriginalLanguageTemporaryDirectory(directory => {
        expect(existsSync(directory)).toBe(true);
        return directory;
      }, parent);
      expect(existsSync(successPath)).toBe(false);
      expect(() => withOriginalLanguageTemporaryDirectory(directory => {
        expect(existsSync(directory)).toBe(true);
        throw new Error('expected failure');
      }, parent)).toThrow('expected failure');
      expect(readdirSync(parent)).toEqual([]);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('keeps the experiment synthetic and the architecture wording provisional', () => {
    expect(SYNTHETIC_PROFILE.aramaicReferences).toBeGreaterThan(0);
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(packageJson.scripts['audit:original-language-context-capacity'])
      .toBe('tsx scripts/original-language-context-capacity.ts');
    expect(packageJson.scripts['audit:original-language-context-capacity:write-evidence'])
      .toBe('tsx scripts/write-original-language-context-capacity-evidence.ts');
    const source = readFileSync(resolve(root, 'scripts/original-language-context-capacity.ts'), 'utf8');
    expect(source).not.toContain("'--remote'");
    expect(source).not.toMatch(/\bfetch\s*\(\s*['"`]/);
    expect(source).not.toContain('https://');
    expect(source).toContain('externalCorpusAcquired: false');
    expect(source).toContain('publicSchemaChanged: false');
    const docs = readFileSync(
      resolve(root, 'docs/ORIGINAL-LANGUAGE-CONTEXT-CAPACITY-EXPERIMENT.md'),
      'utf8',
    );
    expect(docs).toContain('source-free');
    expect(docs).toContain('provisional leading candidate');
    expect(docs).toContain('final architecture recommendation');
    expect(docs).toContain('one additional D1 slot per environment');
    expect(docs).toContain('rows_read');
  });

  it('publishes compact, self-verifying evidence for the exact reviewed experiment', () => {
    const evidencePath = resolve(
      root,
      'docs/evidence/original-language-context-capacity-evidence.json',
    );
    expect(statSync(evidencePath).size).toBeLessThan(20_000);
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    expect(verifyOriginalLanguageCompleteHash(evidence)).toBe(true);
    expect(evidence.status).toBe('provisional_leading_candidate_not_architecture_authority');
    expect(evidence.architectureDecision.status)
      .toBe('provisional_leading_candidate_pending_real_corpus_and_operational_proof');
    expect(evidence.scopeBoundary).toMatchObject({
      runtimeChanged: false,
      publicSchemaChanged: false,
      migrationAdded: false,
      manifestChanged: false,
      remoteD1OrWorkerUsed: false,
      isolatedLocalWorkerdUsed: true,
      corpusAcquired: false,
      corpusActivated: false,
      deploymentPerformed: false,
    });
    for (const candidate of evidence.candidates.filter(
      (entry: { synthetic?: unknown }) => entry.synthetic,
    )) {
      expect(candidate.synthetic.generatedProjectionSha256)
        .toBe(candidate.synthetic.storedProjectionSha256);
    }
    const scriptSha256 = createHash('sha256')
      .update(readFileSync(resolve(root, 'scripts/original-language-context-capacity.ts')))
      .digest('hex');
    expect(evidence.sourceRevision.experimentScriptSha256).toBe(scriptSha256);
  });
});
