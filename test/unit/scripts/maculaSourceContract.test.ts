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
  verifyPinnedGitCommitTree,
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
const hasHistoricalCurrentMainObject = (() => {
  try {
    execFileSync('git', ['cat-file', '-e', '2f12262c9a37d3588bee9b5071954823c15cbd12^{commit}'], {
      cwd: new URL('.', repo),
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
})();

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
  return {
    schemaVersion: 2,
    auditRoot: '/synthetic/local-only-audit',
    command: 'node scripts/inspect-macula-v2.mjs --output audit-output/final-replay-2 --compare audit-output/final-replay-1',
    environment: { node: 'v22.0.0', sqlite: '3.0.0', git: 'git version synthetic' },
    executedAt: '2026-01-01T00:00:00.000Z',
    replayScript: {
      path: 'scripts/inspect-macula-v2.mjs',
      sha256: '0ce62ee220cd49893c59f23c0b32d00a02ccbe8f1f1c6373ebead010a94f6149',
      requiredNode: '22.23.1',
    },
    attestations: {
      maculaGreek: {
        head: '8423afe47b9e8f24b7772e808af45c7159a6fe7e',
        tree: 'eea78df4b0f1efb857f1575243a1ec4548267a11',
        clean: true,
        selectedPathCount: 29,
        everySelectedPathTracked: true,
        branch: '(detached)',
      },
      maculaHebrew: {
        head: '47db250bd55d0d8577f2a94fba114ef16c35b23c',
        tree: '594f395cf473795d6984003800b4bf86ca691a26',
        clean: true,
        selectedPathCount: 933,
        everySelectedPathTracked: true,
        branch: '(detached)',
      },
      theologaiMain: {
        head: '2f12262c9a37d3588bee9b5071954823c15cbd12',
        tree: '9922aedb74c690e7a3fcb926b3d621f28fa44535',
        clean: true,
        selectedPathCount: 68,
        everySelectedPathTracked: true,
        branch: 'main',
        originMain: '2f12262c9a37d3588bee9b5071954823c15cbd12',
      },
      theologaiPreflight: {
        head: '2f12262c9a37d3588bee9b5071954823c15cbd12',
        tree: '9922aedb74c690e7a3fcb926b3d621f28fa44535',
        clean: true,
        selectedPathCount: 0,
        everySelectedPathTracked: true,
        branch: 'main',
        originMain: '2f12262c9a37d3588bee9b5071954823c15cbd12',
      },
    },
    canonicalRuntimeCompatibility: {
      d1CorpusIdentity: '29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4',
      morphologyUsageIdentity: 'c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd',
      runtimeContentInventory: {
        artifactCount: 72,
        identityPolicy: 'canonical_decompressed_json_v1_sha256_for_json_gz_else_raw_sha256',
        sha256: 'caf58814f24cc72837586c901c42f3556b59e45ec81bb0af7f5cfb9fa1629dcd',
      },
      derivation: {
        d1CorpusIdentity: 'computeD1CorpusIdentity(parseDataManifest(data/data-manifest.json)) from the exact audit checkout',
        morphologyUsageIdentity: 'computeMorphologyUsageIdentity(parseDataManifest(data/data-manifest.json)) from the exact audit checkout',
        runtimeContentInventory: 'canonical content identity over the repository-owned 72-artifact OpenScriptures/STEPBible runtime inventory',
      },
      loader: {
        executable: '/synthetic/node',
        tsxCliSha256: '293360f3bf5826200d31375aea1267ccdad675d2a9cd1ad832e00b9f16509a7a',
        tsxVersion: '4.20.6',
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
      output: 'provenance-license-notice.json',
    },
    inventoryAssertions: {
      selectedMaculaGreekFiles: 29,
      selectedMaculaHebrewFiles: 933,
      runtimeCorpusFiles: 66,
      runtimeContentInventoryArtifacts: 72,
      faithlifeSblgntAlignmentInput: false,
      allSelectedPathsTracked: true,
    },
    benchmark: {
      engine: 'node:sqlite/native-SQLite',
      representativeReferences: [{ reference_id: 1, corpus: 'hebrew', source_reference: 'GEN 1:1!1', token_count: 1, group_count: 1 }],
      iterations: 1,
      medianMilliseconds: 0,
      p95Milliseconds: 0,
      returnedContextRows: 1,
      contextQueryPlan: [{ id: 0, parent: 0, notused: 0, detail: 'synthetic diagnostic' }],
      d1RowsRead: null,
      qualification: 'This is a full-projection local SQLite benchmark. It is not a Workerd/D1 billing or latency claim.',
    },
    workerdD1: {
      status: 'not_run',
      reason: 'A full D1/Workerd probe requires a reviewed D1 materializer/import path. Native SQLite was run against the complete projection; D1 rows_read and remote-equivalent latency remain deliberately unclaimed.',
    },
    integrity: {
      foreignKeyViolations: 0,
      tokensWithoutImmediateGroup: 0,
      tokensWithMissingGroup: 0,
      groupsWithMissingParent: 0,
      totalGroups: 441_272,
      reachableGroups: 441_272,
      unreachableGroups: 0,
      groupCycleMembers: 0,
      tokenMembershipRows: 613_652,
      groupReferenceRows: 1_965_769,
      referencesWithoutGroupContext: 0,
      duplicateTokenIds: 0,
      releaseGateDanglingParticipantReferences: 9,
      pass: true,
      releaseEligible: false,
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
    for (const path of [
      'source-manifest.json',
      'inspection.json',
      'run-summary.json',
      'REPORT.md',
      'provenance-license-notice.json',
      'replay-comparison.json',
    ]) {
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

type RunSummaryMutation = readonly [label: string, mutate: (summary: Record<string, unknown>) => void];

/**
 * Every summary boundary is exercised against the content-free fixture in normal
 * CI. The conditional copied-audit checks below prove that the exact historical
 * packet passes and that any mutation is rejected at either the semantic or
 * byte-identity boundary without making the semantic checks conditional.
 */
const runSummaryMutations: readonly RunSummaryMutation[] = [
  ['unknown top-level field', summary => { summary.unreviewed = true; }],
  ['schema version', summary => { summary.schemaVersion = 999; }],
  ['replay artifact', summary => { ((summary.replayComparison as Record<string, unknown>).artifacts as Array<Record<string, unknown>>)[0]!.sha256 = '0'.repeat(64); }],
  ['hash-domain artifact', summary => { ((summary.deterministicHashDomain as Record<string, unknown>).artifacts as Array<Record<string, unknown>>)[2]!.bytes = 1; }],
  ['replay status', summary => { (summary.replayComparison as Record<string, unknown>).status = 'not_identical'; }],
  ['source attestation', summary => { ((summary.attestations as Record<string, unknown>).maculaGreek as Record<string, unknown>).clean = false; }],
  ['compatibility identity', summary => { (summary.canonicalRuntimeCompatibility as Record<string, unknown>).d1CorpusIdentity = '0'.repeat(64); }],
  ['compatibility unknown nested field', summary => { (summary.canonicalRuntimeCompatibility as Record<string, unknown>).unreviewed = true; }],
  ['Faithlife contradiction', summary => { (summary.faithlifeSblgntNotice as Record<string, unknown>).status = 'selected_alignment_input'; }],
  ['Faithlife unknown field', summary => { (summary.faithlifeSblgntNotice as Record<string, unknown>).unreviewed = true; }],
  ['inventory boolean', summary => { (summary.inventoryAssertions as Record<string, unknown>).allSelectedPathsTracked = false; }],
  ['inventory count', summary => { (summary.inventoryAssertions as Record<string, unknown>).runtimeContentInventoryArtifacts = 71; }],
  ['benchmark unknown nested field', summary => { (summary.benchmark as Record<string, unknown>).unreviewed = true; }],
  ['Workerd pass claim', summary => { (summary.workerdD1 as Record<string, unknown>).status = 'passed'; }],
  ['integrity foreign-key count', summary => { (summary.integrity as Record<string, unknown>).foreignKeyViolations = 1; }],
  ['publication eligibility', summary => { (summary.integrity as Record<string, unknown>).releaseEligible = true; }],
  ['dangling participant count', summary => { (summary.integrity as Record<string, unknown>).releaseGateDanglingParticipantReferences = 8; }],
  ['integrity pass claim', summary => { (summary.integrity as Record<string, unknown>).pass = false; }],
  ['integrity group count', summary => { (summary.integrity as Record<string, unknown>).totalGroups = 1; }],
  ['integrity unknown nested field', summary => { (summary.integrity as Record<string, unknown>).unreviewed = true; }],
  ['environment unknown nested field', summary => { (summary.environment as Record<string, unknown>).unreviewed = true; }],
];

function applyCombinedRunSummaryMutation(summary: Record<string, unknown>): void {
  summary.unreviewed = true;
  (summary.replayComparison as Record<string, unknown>).status = 'not_identical';
  ((summary.attestations as Record<string, unknown>).maculaHebrew as Record<string, unknown>).clean = false;
  (summary.canonicalRuntimeCompatibility as Record<string, unknown>).d1CorpusIdentity = '0'.repeat(64);
  (summary.faithlifeSblgntNotice as Record<string, unknown>).unreviewed = true;
  (summary.inventoryAssertions as Record<string, unknown>).allSelectedPathsTracked = false;
  (summary.benchmark as Record<string, unknown>).unreviewed = true;
  (summary.workerdD1 as Record<string, unknown>).status = 'passed';
  (summary.integrity as Record<string, unknown>).releaseEligible = true;
  (summary.integrity as Record<string, unknown>).releaseGateDanglingParticipantReferences = 8;
  (summary.integrity as Record<string, unknown>).pass = false;
  (summary.integrity as Record<string, unknown>).totalGroups = 1;
  (summary.environment as Record<string, unknown>).unreviewed = true;
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
  });

  it('verifies an exact Git commit/tree pair available in every checkout and rejects mismatches', () => {
    const revision = (args: string[]) => execFileSync('git', args, {
      cwd: new URL('.', repo),
      encoding: 'utf8',
    }).trim();
    const head = revision(['rev-parse', 'HEAD']);
    const tree = revision(['rev-parse', 'HEAD^{tree}']);
    expect(() => verifyPinnedGitCommitTree(process.cwd(), head, tree, 'test checkout HEAD')).not.toThrow();
    expect(() => verifyPinnedGitCommitTree(process.cwd(), head, '0'.repeat(40), 'test checkout HEAD'))
      .toThrow('test checkout HEAD tree differs from the source lock');
    expect(() => verifyPinnedGitCommitTree(process.cwd(), '0'.repeat(40), tree, 'test checkout missing'))
      .toThrow('test checkout missing Git object is unavailable');
  });

  it.skipIf(!hasHistoricalCurrentMainObject)('verifies the historical current-main object when this checkout contains it', () => {
    expect(() => verifyHistoricalCurrentMainAttestation(process.cwd())).not.toThrow();
  });

  it('allows only the reviewed structural attributes and fails closed for excluded or unknown fields', () => {
    expect(() => assertMaculaSourceAttribute('greek', 'word', 'xml:id')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('greek', 'group', 'Rule')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('hebrew', 'participant', 'participantref')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('hebrew', 'word', 'lang')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('greek', 'word', 'lemma')).toThrow('explicitly excluded');
    expect(() => assertMaculaSourceAttribute('greek', 'group', 'unreviewed-field')).toThrow('unknown schema drift');
    expect(() => assertMaculaSourceAttribute('hebrew', 'participant', 'unreviewed-field')).toThrow('unknown schema drift');
    expect(() => assertMaculaSourceAttribute('greek', 'word', 'lang')).toThrow('not approved for that corpus');
    expect(() => assertMaculaSourceAttribute('greek', 'group', 'head')).toThrow('not approved for that corpus');
    expect(() => assertMaculaSourceAttribute('greek', 'participant', 'participantref')).toThrow('not approved for that corpus');
    expect(() => assertMaculaSourceAttribute('hebrew', 'participant', 'referent')).toThrow('not approved for that corpus');
    expect(() => assertMaculaSourceAttribute('hebrew', 'group', 'Rule')).toThrow('not approved for that corpus');
    expect(() => assertMaculaSourceAttribute('greek', 'invalid-scope' as never, 'participantref')).toThrow('invalid source attribute scope');
    expect(() => assertMaculaSourceAttribute('invalid-corpus' as never, 'word', 'xml:id')).toThrow('invalid source attribute corpus');
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
      ['lang evidence', value => { (((value.rightsAndProvenance as Record<string, unknown>).langRetention as Record<string, unknown>).pipelineEvidence as Record<string, unknown>).observedTokenLanguages = 'unreviewed'; }],
      ['pinned repository README provenance', value => { (((value.rightsAndProvenance as Record<string, unknown>).langRetention as Record<string, unknown>).pipelineEvidence as Record<string, unknown>).sourceReadme = 'unreviewed'; }],
      ['pinned repository XQuery provenance', value => { (((value.rightsAndProvenance as Record<string, unknown>).langRetention as Record<string, unknown>).pipelineEvidence as Record<string, unknown>).pinnedRepositoryXquery = 'unreviewed'; }],
      ['legacy selected XQuery provenance key', value => { (((value.rightsAndProvenance as Record<string, unknown>).langRetention as Record<string, unknown>).pipelineEvidence as Record<string, unknown>).selectedXquery = 'unreviewed'; }],
      ['Faithlife commit', value => { ((value.rightsAndProvenance as Record<string, unknown>).standaloneFaithlifeNotice as Record<string, unknown>).commit = 'unreviewed'; }],
      ['Faithlife tree', value => { ((value.rightsAndProvenance as Record<string, unknown>).standaloneFaithlifeNotice as Record<string, unknown>).tree = 'unreviewed'; }],
      ['Faithlife role', value => { ((value.rightsAndProvenance as Record<string, unknown>).standaloneFaithlifeNotice as Record<string, unknown>).role = 'unreviewed'; }],
      ['SBLGNT derived-input notice', value => { ((value.rightsAndProvenance as Record<string, unknown>).sblgntRightsForMaculaGreekDerivedInput as Record<string, unknown>).copyrightNotice = 'unreviewed'; }],
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

    const maturityMutation = contractFixture();
    (((maturityMutation.sources as Array<Record<string, unknown>>)[0]!.maturity as Record<string, unknown>).selectedPathComparison as Record<string, unknown>).differingSelectedLowfatFileCount = 0;
    expect(() => parseMaculaSourceContract(maturityMutation)).toThrow('source pins drifted');
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

  it('validates every deterministic and semantic summary boundary in normal CI', () => {
    expect(() => verifyMaculaAuditRunSummary(runSummaryFixture())).not.toThrow();
    for (const [label, mutate] of runSummaryMutations) {
      const mutated = runSummaryFixture();
      mutate(mutated);
      expect(() => verifyMaculaAuditRunSummary(mutated), label).toThrow('run summary');
    }
    const combined = runSummaryFixture();
    applyCombinedRunSummaryMutation(combined);
    expect(() => verifyMaculaAuditRunSummary(combined)).toThrow('run summary');
  });

  it.skipIf(!hasAuthoritativeAudit)('directly verifies the authoritative final replay without opening its projection', () => {
    expect(() => verifyAuthoritativeMaculaAudit(authoritativeFinalReplay, process.cwd())).not.toThrow();
  });

  it.skipIf(!hasAuthoritativeAudit)('rejects drift in every authority-bearing metadata file', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-macula-authority-'));
    const auditOutput = join(root, 'audit-output');
    const finalReplay = join(auditOutput, 'final-replay-2');
    mkdirSync(finalReplay, { recursive: true });
    try {
      copyFileSync(join(authoritativeAuditOutput, 'EVIDENCE-STATUS.md'), join(auditOutput, 'EVIDENCE-STATUS.md'));
      for (const path of [
        'source-manifest.json',
        'inspection.json',
        'run-summary.json',
        'REPORT.md',
        'provenance-license-notice.json',
        'replay-comparison.json',
      ]) copyFileSync(join(authoritativeFinalReplay, path), join(finalReplay, path));

      for (const [base, path] of [
        [auditOutput, 'EVIDENCE-STATUS.md'],
        [finalReplay, 'run-summary.json'],
        [finalReplay, 'REPORT.md'],
        [finalReplay, 'provenance-license-notice.json'],
        [finalReplay, 'replay-comparison.json'],
      ] as const) {
        const target = join(base, path);
        const original = readFileSync(target);
        writeFileSync(target, Buffer.concat([original, Buffer.from('\ncontradictory unreviewed claim\n')]));
        expect(() => verifyAuthoritativeMaculaAudit(finalReplay, process.cwd()), path)
          .toThrow(`authority artifact ${path} drifted`);
        writeFileSync(target, original);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(!hasAuthoritativeAudit)('rejects the complete summary mutation suite against the copied authoritative packet', () => {
    for (const [label, mutate] of runSummaryMutations) {
      expect(() => withAuditCopy(mutate), label).toThrow('MACULA source contract violation');
    }
    expect(() => withAuditCopy(applyCombinedRunSummaryMutation)).toThrow('MACULA source contract violation');
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
