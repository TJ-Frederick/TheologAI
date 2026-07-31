import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MACULA_AUDIT_IDENTITY,
  assertMaculaSourceAttribute,
  parseMaculaSourceContractCliArgs,
  parseMaculaSourceContract,
  readMaculaSourceContract,
  verifyAuthoritativeMaculaAudit,
  verifyHistoricalCurrentMainAttestation,
  verifyMaculaAuditRunSummary,
} from '../../../scripts/macula-source-contract.js';

const repo = new URL('../../../', import.meta.url);
const expectedMaculaPaths = [
  'data/biblical-languages/macula/SOURCE-CONTRACT.json',
  'docs/MACULA-SOURCE-CONTRACT.md',
  'scripts/macula-source-contract.ts',
  'test/unit/scripts/maculaSourceContract.test.ts',
].sort();
const authoritativeAuditOutput = '/private/tmp/theologai-macula-source-audit/audit-output';
const authoritativeFinalReplay = join(authoritativeAuditOutput, 'final-replay-2');
const hasAuthoritativeAudit = existsSync(authoritativeFinalReplay);

function contractFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL('data/biblical-languages/macula/SOURCE-CONTRACT.json', repo), 'utf8'));
}

/** Synthetic, content-free metadata fixture; it is not copied audit output. */
function runSummaryFixture(): Record<string, unknown> {
  const artifacts = [
    { path: 'source-manifest.json', bytes: 240_952, sha256: 'b9dbd2ca6353fa76740650ffa85247b449e0e2f687fc1f40e227a7677f571988' },
    { path: 'inspection.json', bytes: 54_523, sha256: '505e715901635db876539358f9456830ff51b17445cd372045d665834c9896b9' },
    { path: 'macula-structural-projection.sqlite', bytes: 207_106_048, sha256: 'c5a61cf047e662a6d2238093edefa7dc540ce8f2b2bbeb49115cb94329fab414' },
  ];
  const currentMain = {
    head: '2f12262c9a37d3588bee9b5071954823c15cbd12',
    tree: '9922aedb74c690e7a3fcb926b3d621f28fa44535',
    originMain: '2f12262c9a37d3588bee9b5071954823c15cbd12',
    clean: true,
  };
  return {
    schemaVersion: 2,
    auditRoot: '/synthetic/local-only-audit',
    command: 'synthetic',
    environment: {},
    executedAt: 'synthetic',
    replayScript: {},
    integrity: {},
    inventoryAssertions: {},
    benchmark: {},
    workerdD1: {},
    attestations: {
      maculaGreek: {
        head: '8423afe47b9e8f24b7772e808af45c7159a6fe7e',
        tree: 'eea78df4b0f1efb857f1575243a1ec4548267a11',
        clean: true,
        everySelectedPathTracked: true,
        selectedPathCount: 29,
      },
      maculaHebrew: {
        head: '47db250bd55d0d8577f2a94fba114ef16c35b23c',
        tree: '594f395cf473795d6984003800b4bf86ca691a26',
        clean: true,
        everySelectedPathTracked: true,
        selectedPathCount: 933,
      },
      theologaiMain: currentMain,
      theologaiPreflight: currentMain,
    },
    canonicalRuntimeCompatibility: {
      d1CorpusIdentity: '29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4',
      morphologyUsageIdentity: 'c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd',
      runtimeContentInventory: {
        artifactCount: 72,
        identityPolicy: 'canonical_decompressed_json_v1_sha256_for_json_gz_else_raw_sha256',
        sha256: 'caf58814f24cc72837586c901c42f3556b59e45ec81bb0af7f5cfb9fa1629dcd',
      },
    },
    deterministicHashDomain: {
      excludes: ['run-summary.json', 'timestamps', 'absolute paths', 'host-specific tool versions and benchmark timing'],
      artifacts: artifacts.map(artifact => ({ ...artifact })),
      sha256: MACULA_AUDIT_IDENTITY,
    },
    replayComparison: {
      status: 'identical',
      priorOutput: 'audit-output/final-replay-1',
      deterministicIdentity: MACULA_AUDIT_IDENTITY,
      artifacts: artifacts.map(artifact => ({ ...artifact })),
      assertion: 'The complete projection was independently regenerated twice from the same clean, pinned local inputs and every deterministic artifact hash and byte count matched.',
    },
    faithlifeSblgntNotice: {
      status: 'notice_only_excluded_from_alignment_projection_and_deterministic_identity',
    },
  };
}

function withAuditCopy(mutateRunSummary: (summary: Record<string, unknown>) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'theologai-macula-audit-'));
  const auditOutput = join(root, 'audit-output');
  const finalReplay = join(auditOutput, 'final-replay-2');
  mkdirSync(finalReplay, { recursive: true });
  try {
    copyFileSync(join(authoritativeAuditOutput, 'EVIDENCE-STATUS.md'), join(auditOutput, 'EVIDENCE-STATUS.md'));
    for (const path of ['source-manifest.json', 'inspection.json', 'run-summary.json']) {
      copyFileSync(join(authoritativeFinalReplay, path), join(finalReplay, path));
    }
    const runSummary = JSON.parse(readFileSync(join(finalReplay, 'run-summary.json'), 'utf8')) as Record<string, unknown>;
    mutateRunSummary(runSummary);
    writeFileSync(join(finalReplay, 'run-summary.json'), `${JSON.stringify(runSummary)}\n`, 'utf8');
    verifyAuthoritativeMaculaAudit(finalReplay, process.cwd());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('MACULA local-only source contract', () => {
  it('pins the approved untagged revisions, final audit identity, and historical current-main compatibility values', () => {
    const contract = readMaculaSourceContract(process.cwd());
    expect(contract.status).toBe('candidate_contract_only');
    expect(contract.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'macula-greek',
        revision: expect.objectContaining({
          commit: '8423afe47b9e8f24b7772e808af45c7159a6fe7e',
          tree: 'eea78df4b0f1efb857f1575243a1ec4548267a11',
        }),
      }),
      expect.objectContaining({
        id: 'macula-hebrew',
        revision: expect.objectContaining({
          commit: '47db250bd55d0d8577f2a94fba114ef16c35b23c',
          tree: '594f395cf473795d6984003800b4bf86ca691a26',
        }),
      }),
    ]));
    expect((contract.auditEvidence as { deterministicIdentity: string }).deterministicIdentity).toBe(MACULA_AUDIT_IDENTITY);
    expect(contract.currentMainAttestation).toMatchObject({
      commit: '2f12262c9a37d3588bee9b5071954823c15cbd12',
      tree: '9922aedb74c690e7a3fcb926b3d621f28fa44535',
      morphologyUsageIdentity: 'c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd',
      d1CorpusIdentity: '29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4',
    });
    expect(() => verifyHistoricalCurrentMainAttestation(process.cwd())).not.toThrow();
  });

  it('allows only the reviewed structural attributes and fails closed for excluded or unknown fields', () => {
    expect(() => assertMaculaSourceAttribute('word', 'xml:id')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('group', 'Rule')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('participant', 'participantref')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('word', 'lemma')).toThrow('explicitly excluded');
    expect(() => assertMaculaSourceAttribute('group', 'unreviewed-field')).toThrow('unknown schema drift');
    expect(() => assertMaculaSourceAttribute('participant', 'unreviewed-field')).toThrow('unknown schema drift');
    expect(() => assertMaculaSourceAttribute('invalid-scope' as never, 'participantref')).toThrow('invalid source attribute scope');
  });

  it('rejects unknown contract fields, dangling-ledger changes, and every reviewed rights or inertness mutation', () => {
    const unknown = contractFixture();
    unknown.unreviewed = true;
    expect(() => parseMaculaSourceContract(unknown)).toThrow('unknown or missing fields');

    const changedLedger = contractFixture();
    const ledger = changedLedger.danglingParticipantExclusionLedger as { total: number };
    ledger.total = 8;
    expect(() => parseMaculaSourceContract(changedLedger)).toThrow('dangling participant exclusion ledger drifted');

    const rightsMutations: Array<readonly [string, (value: Record<string, unknown>) => void]> = [
      ['Greek license', value => { ((value.rightsAndProvenance as Record<string, unknown>).maculaGreek as Record<string, unknown>).license = 'unreviewed'; }],
      ['Greek attribution', value => { ((value.rightsAndProvenance as Record<string, unknown>).maculaGreek as Record<string, unknown>).requiredAttribution = 'unreviewed'; }],
      ['Faithlife commit', value => { ((value.rightsAndProvenance as Record<string, unknown>).faithlifeSblgntStandaloneNotice as Record<string, unknown>).commit = 'unreviewed'; }],
      ['Faithlife tree', value => { ((value.rightsAndProvenance as Record<string, unknown>).faithlifeSblgntStandaloneNotice as Record<string, unknown>).tree = 'unreviewed'; }],
      ['Faithlife role', value => { ((value.rightsAndProvenance as Record<string, unknown>).faithlifeSblgntStandaloneNotice as Record<string, unknown>).role = 'unreviewed'; }],
      ['legal gate', value => { (value.rightsAndProvenance as Record<string, unknown>).legalReviewGate = 'unreviewed'; }],
    ];
    for (const [label, mutate] of rightsMutations) {
      const mutated = contractFixture();
      mutate(mutated);
      expect(() => parseMaculaSourceContract(mutated), label).toThrow('rights and provenance drifted');
    }

    const activationMutation = contractFixture();
    ((activationMutation.inertness as Record<string, unknown>).contractDoesNotActivate as string[])[0] = 'unreviewed';
    expect(() => parseMaculaSourceContract(activationMutation)).toThrow('inertness drifted');
    const boundaryMutation = contractFixture();
    (boundaryMutation.inertness as Record<string, unknown>).verifierBoundary = 'unreviewed';
    expect(() => parseMaculaSourceContract(boundaryMutation)).toThrow('inertness drifted');
  });

  it('accepts only the exact local verifier CLI forms', () => {
    expect(parseMaculaSourceContractCliArgs([])).toBeUndefined();
    expect(parseMaculaSourceContractCliArgs(['--audit-dir', 'audit-output/final-replay-2']))
      .toMatch(/audit-output\/final-replay-2$/);
    for (const argumentsAfterScript of [
      ['unexpected'],
      ['--audit-dir'],
      ['--audit-dir', 'audit-output/final-replay-2', 'extra'],
      ['--unknown', 'audit-output/final-replay-2'],
      ['--audit-dir', '--unknown'],
    ]) {
      expect(() => parseMaculaSourceContractCliArgs(argumentsAfterScript)).toThrow('usage:');
    }
  });

  it('validates deterministic replay metadata in a fresh checkout and fails closed on contradictions', () => {
    expect(() => verifyMaculaAuditRunSummary(runSummaryFixture())).not.toThrow();
    const replayArtifactMutation = runSummaryFixture();
    ((replayArtifactMutation.replayComparison as Record<string, unknown>).artifacts as Array<Record<string, unknown>>)[0]!.sha256 = '0'.repeat(64);
    expect(() => verifyMaculaAuditRunSummary(replayArtifactMutation)).toThrow('run summary replay comparison drifted');
    const hashDomainMutation = runSummaryFixture();
    ((hashDomainMutation.deterministicHashDomain as Record<string, unknown>).artifacts as Array<Record<string, unknown>>)[2]!.bytes = 1;
    expect(() => verifyMaculaAuditRunSummary(hashDomainMutation)).toThrow('run summary deterministic hash domain drifted');
    const statusMutation = runSummaryFixture();
    (statusMutation.replayComparison as Record<string, unknown>).status = 'not_identical';
    expect(() => verifyMaculaAuditRunSummary(statusMutation)).toThrow('run summary replay comparison drifted');
  });

  it.skipIf(!hasAuthoritativeAudit)('directly verifies the authoritative final replay without opening its projection', () => {
    expect(() => verifyAuthoritativeMaculaAudit(authoritativeFinalReplay, process.cwd())).not.toThrow();
  });

  it.skipIf(!hasAuthoritativeAudit)('fails closed when replay metadata contradicts the deterministic replay evidence', () => {
    expect(() => withAuditCopy(summary => {
      ((summary.replayComparison as Record<string, unknown>).artifacts as Array<Record<string, unknown>>)[0]!.sha256 = '0'.repeat(64);
    })).toThrow('run summary replay comparison drifted');
    expect(() => withAuditCopy(summary => {
      ((summary.deterministicHashDomain as Record<string, unknown>).artifacts as Array<Record<string, unknown>>)[2]!.bytes = 1;
    })).toThrow('run summary deterministic hash domain drifted');
    expect(() => withAuditCopy(summary => {
      (summary.replayComparison as Record<string, unknown>).status = 'not_identical';
    })).toThrow('run summary replay comparison drifted');
  });

  it('keeps the packet content-free and completely outside runtime, migration, manifest, and public-surface wiring', () => {
    const maculaPaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: new URL('.', repo),
      encoding: 'utf8',
    }).split('\n').filter(path => /macula/i.test(path)).sort();
    expect(maculaPaths).toEqual(expectedMaculaPaths);

    const contract = readFileSync(new URL('data/biblical-languages/macula/SOURCE-CONTRACT.json', repo), 'utf8');
    expect(contract).not.toMatch(/<\/?(?:w|wg)\b|o\d{11,}|[\u0590-\u05ff\u0370-\u03ff]/);
    expect(contract).not.toMatch(/(?:\.xml|\.sqlite|\.sql)"\s*$/m);

    for (const path of [
      'src/index.ts', 'src/worker.ts', 'src/server.ts', 'src/worker-server.ts', 'src/mcp/tools.ts',
      'src/tools/v2/index.ts', 'src/tools/worker/index.ts', 'data/data-manifest.json', 'wrangler.toml',
    ]) {
      expect(readFileSync(new URL(path, repo), 'utf8'), path).not.toMatch(/macula/i);
    }
    const packageJson = JSON.parse(readFileSync(new URL('package.json', repo), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['data:verify-macula-source-contract'])
      .toBe('tsx scripts/macula-source-contract.ts');
    expect(Object.values(packageJson.scripts).filter(command => /macula/i.test(command)))
      .toEqual(['tsx scripts/macula-source-contract.ts']);
  });
});
