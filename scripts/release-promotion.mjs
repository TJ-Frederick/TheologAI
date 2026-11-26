// Local promotion checks. Cloud credentials and remote queries belong to the protected jobs.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyCiChanges } from './classify-ci-changes.mjs';
import { parseNameStatusNul } from './classify-production-deployment.mjs';
import { hasHostedCorpusChecks, hostedCorpusCheckCount, hostedCorpusProfile } from './hosted-corpus-profile.mjs';

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const roles = ['preview', 'production'];
const releaseOperations = new Set([
  'release/serving.json',
  '.github/scripts/production-baseline.cjs',
  '.github/scripts/release-workers.sh',
  '.github/workflows/deploy.yml',
  '.github/workflows/pr.yml',
  'scripts/audit-corpus-release.ts',
  'scripts/hosted-corpus-profile.mjs',
  'scripts/hosted-corpus-profile.d.mts',
  'scripts/norton-aquinas-live.ts',
  'scripts/original-language-study-release.ts', // Executed by release acceptance, outside corpus materialization.
  'scripts/pr-release-eligibility.d.mts',
  'scripts/pr-release-eligibility.mjs',
  'scripts/release-acceptance.ts',
  'scripts/release-promotion.mjs',
  'test/fixtures/release-workers/replay.py',
  'test/fixtures/original-language-study-v3-release.json',
  'test/helpers/corpusTransportFixture.ts',
  'test/helpers/hostedCorpusRecoveryFixture.ts',
  'test/helpers/mcpTransportContract.ts',
  'test/test-topology.json',
  'test/unit/config/workflowTopology.test.ts',
  'test/unit/scripts/nortonAquinasLiveWorkflow.test.ts',
  'test/unit/scripts/nortonOperatorSuccessorFlow.test.ts',
  'test/unit/scripts/prReleaseEligibility.test.ts',
  'test/unit/scripts/releasePromotion.test.ts',
]);
const runtimeOnlyPaths = new Set([
  'src/adapters/shared/primarySourceSearchSql.ts',
  'src/adapters/shared/morphologyExpansion.ts',
  'src/adapters/shared/HttpClient.ts',
  'src/kernel/historicalHierarchyDelivery.ts',
  'src/kernel/morphologyUsageCursor.ts',
  'src/kernel/parallelGroupCursor.ts',
  'src/kernel/utf8Base64Url.ts',
  'src/kernel/originalLanguageStudyV3Contract.ts',
  'src/kernel/repositories.ts',
  'src/kernel/types.ts', // Shared TypeScript declarations only.
  'skills/passage-exegesis/SKILL.md',
  'skills/word-study/SKILL.md',
  'test/fixtures/expandedMorphology.ts',
  'test/fixtures/mcpCompositionRoot.ts',
]);
// PR #203 changes only the Node test harness and three npm test commands.
// Recognize this exact transition so a future application release can include
// the maintenance without granting a standing exception to package.json or scripts/.
const reviewedNodeE2eChanges = [
  ['package.json', '1a931cc4d60bd88d3968388bbfcb90fd08dc0ab6', '5471d433642480d3bbb02f78028d37489ff01e77'],
  ['scripts/node-e2e-fixture.ts', null, 'c0555b9e5f378d6c3c3e0e2419cf17125ffe21f9'],
  ['scripts/test-node-http-e2e.ts', '09fd645ca578c25a22d7e9eba38ce3a7684906ed', 'a6ac7eab37c659a8fdfd6bac9e041debc886e061'],
  ['scripts/test-node-stdio-e2e.ts', 'b824299c4ff760091df61f3773cdb29a1f642b82', '0dd9542494d7c405264c9cebb67204405b06f6e5'],
  ['test/unit/scripts/nodeE2eFixture.test.ts', null, '4b4957ce01ef2784fda529dafef4a833bb631efa'],
];
// PR #216 reproduced the Worker, SQLite database and seed export byte for byte.
// Keep these preparation changes on the no-deployment path only in this exact form.
const reviewedCorpusPreparationChanges = [
  ['scripts/atomic-publication.ts', '2dd1781bad7806b62c3aa7f9a86b8c02f1ac94da', '9c1f6f82084f0edca35bd717a02a4849e984652c'],
  ['scripts/export-for-d1.ts', '7ee672c6e568795e6237e7a8ea372f28ee6c9aa1', '9444efe472cf3f183ad77af9e4274724920a8501'],
  ['scripts/norton-aquinas-preparation.ts', '5297bdd3cd7c7142c739f78b81eaba5c24c7d875', 'd2bfd0eae7073524e7d0f799cd17884c73586a5a'],
  ['scripts/sqlite-corpus-markers.ts', null, 'f0df49dd3da1f21a5f6dd4af012966f1eb3dbe29'],
  ['scripts/verify-database.ts', 'c3a0b142f1688e5c496f900286b27bc416387c9c', '0d6b30e3a09bb3329e7dc865b77441a3054fe83a'],
  ['test/unit/scripts/d1SeedManifest.test.ts', '69f68ffbb516d38003e23d209eead23412af050e', '41f07a28192fc07542c35e49546f4939880ecaf1'],
  ['test/unit/scripts/languageBuildInfrastructure.test.ts', '6eef2b680c449967eb221c270e25cc4841b4f2ec', '5c4b1e0190a70bb463760cd6885a9e4e853747cc'],
  ['test/unit/scripts/nortonAquinasPreparation.test.ts', '2126b796ed3ad721c447315c1c0e9c2de6c684e6', 'f076d97107ef6c9d4ce735bb4633beee5f62e2ed'],
  ['test/unit/scripts/transform12FtsCorruption.test.ts', '07578fcbc2aeec852ffe134e5ced84c2a96d70cd', 'caf6c822ef0ca6c01b512fbc262f640e42a295b6'],
];
const reviewedNodeE2ePaths = new Set(reviewedNodeE2eChanges.map(([path]) => path));
const reviewedCorpusPreparationPaths = new Set(reviewedCorpusPreparationChanges.map(([path]) => path));
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
function requireValue(value, message) {
  if (!value) throw new Error('Release refused: ' + message);
}

function isReviewedTransition(root, base, matching, entries) {
  if (matching.length !== entries.length || matching.some(change => !['A', 'M'].includes(change.status))) {
    return false;
  }
  const expected = entries.map(([path, before, after]) =>
    `:${before ? '100644' : '000000'} 100644 ${before ?? '0'.repeat(40)} ${after} ${before ? 'M' : 'A'}\0${path}\0`).join('');
  const actual = git(root, ['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base, 'HEAD', '--', ...entries.map(([path]) => path)]);
  return actual === expected;
}

export function readReleaseConfiguration(root = process.cwd()) {
  const record = json(join(root, 'release', 'serving.json'));
  requireValue(SHA.test(record.productionSource), 'invalid serving source');
  for (const role of roles) {
    for (const db of [record.targets?.[role], record.predecessors?.[role]]) {
      requireValue(UUID.test(db?.databaseId) && /^[a-z0-9-]+$/.test(db?.databaseName), 'invalid ' + role + ' database');
    }
    const from = record.predecessors[role];
    requireValue(UUID.test(from.versionId) && UUID.test(from.deploymentId), 'missing predecessor identity');
  }
  requireValue(record.targets.preview.databaseId !== record.targets.production.databaseId, 'shared target database');
  return record;
}

export function classifyRelease(root = process.cwd(), baselineFile) {
  const config = readReleaseConfiguration(root);
  // Local classification starts from the reviewed assignment. The workflow
  // can supply an accepted deployment that supersedes that assignment.
  const baseline = baselineFile ? json(baselineFile) : {productionSource:config.productionSource, targets:config.predecessors};
  requireValue(SHA.test(baseline.productionSource), 'invalid accepted production source');
  git(root, ['merge-base', '--is-ancestor', config.productionSource, baseline.productionSource]);
  git(root, ['merge-base', '--is-ancestor', baseline.productionSource, 'HEAD']);
  const accepted = baseline.productionSource === config.productionSource ? config.predecessors
    : JSON.parse(git(root, ['show', baseline.productionSource + ':release/serving.json'])).targets;
  for (const role of roles) {
    requireValue(baseline.targets?.[role]?.databaseId === accepted[role].databaseId &&
      baseline.targets[role].databaseName === accepted[role].databaseName, 'accepted ' + role + ' database differs');
  }
  const changes = git(root, ['diff', '--name-status', '-z', '--find-renames', baseline.productionSource, 'HEAD']);
  const paths = parseNameStatusNul(changes);
  if (roles.some(role => accepted[role].databaseId !== config.targets[role].databaseId ||
    accepted[role].databaseName !== config.targets[role].databaseName)) return 'corpus';
  if (!paths.length) return 'docs';
  // The CI classifier already has an explicit list of runtime-only and documentation changes.
  // Anything outside it, including builders and their dependencies, needs data validation.
  // Release automation can change independently of the Worker and corpus.
  const nodeE2e = paths.filter(change => change.paths.some(path => reviewedNodeE2ePaths.has(path)));
  const corpusPreparation = paths.filter(change => change.paths.some(path => reviewedCorpusPreparationPaths.has(path)));
  const reviewedNodeE2e = isReviewedTransition(root, baseline.productionSource, nodeE2e, reviewedNodeE2eChanges);
  const reviewedCorpusPreparation = isReviewedTransition(root, baseline.productionSource, corpusPreparation, reviewedCorpusPreparationChanges);
  if (corpusPreparation.length && !reviewedCorpusPreparation) return 'corpus';
  const maintenance = new Set([
    ...(reviewedNodeE2e ? nodeE2e : []),
    ...(reviewedCorpusPreparation ? corpusPreparation : []),
  ]);
  const substantive = paths.filter(change => !maintenance.has(change) &&
    !change.paths.every(path => releaseOperations.has(path)));
  if (!substantive.length) return 'docs';
  const diff = substantive.map(change => [change.status, ...change.paths].join('\0') + '\0').join('');
  const {mode} = classifyCiChanges(diff);
  if (mode === 'docs') return 'docs';
  // CI also exercises the data suite for database readers and historical search. Those
  // runtime-only changes do not modify the stored corpus. Keep shared builders conservative.
  const runtimeOnly = path => /^src\/(?:services\/historical|adapters\/(?:bible|commentary|donation|d1|data))\/.*\.ts$/.test(path)
    || runtimeOnlyPaths.has(path)
    || /^test\/unit\/.*\.test\.ts$/.test(path);
  const application = substantive.every(change => change.paths.every(path =>
    runtimeOnly(path) || ['docs','serving'].includes(classifyCiChanges('M\0' + path + '\0').mode)));
  return application ? 'application' : 'corpus';
}

function classifyPrRelease(root, baselineFile, env) {
  const { CI_EXPECTED_HEAD: merge, CI_PR_BASE: base, CI_PR_HEAD: head } = env;
  requireValue([merge, base, head].every(commit => SHA.test(commit ?? ''))
    && git(root, ['rev-parse', 'HEAD']).trim() === merge, 'unexpected PR release checkout');
  requireValue(git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'false', 'PR release history is shallow');
  requireValue(git(root, ['rev-list', '--parents', '-n', '1', merge]).trim() === `${merge} ${base} ${head}`,
    'expected exact PR merge parents');
  const tree = git(root, ['rev-parse', `${merge}^{tree}`]).trim();
  const sameTree = tree === git(root, ['rev-parse', `${head}^{tree}`]).trim();
  return {mode: classifyRelease(root, baselineFile), tree, sameTree};
}

export function createPreviewReceipt({root, mode, manifest, audit, identity, cutover}) {
  requireValue(['application','corpus'].includes(mode) && DIGEST.test(manifest), 'invalid artifact or mode');
  requireValue(Array.isArray(audit.checks) && audit.checks.every(check => check.passed === true), 'incomplete audit checks');
  const passed = audit.checks.length;
  requireValue(audit.mode === mode && audit.role === 'preview' && audit.passed === true
    && audit.endpoint === 'https://preview-mcp.theologai.xyz/mcp', 'protected preview acceptance required');
  const protocols = ['2025-11-25', '2026-07-28'];
  const focused = mode === 'corpus' && audit.profile === hostedCorpusProfile;
  requireValue(audit.profile === undefined || focused, 'invalid preview audit profile');
  if (focused) requireValue(hasHostedCorpusChecks(audit), 'focused preview acceptance incomplete');
  const count = mode === 'corpus' ? focused ? hostedCorpusCheckCount / protocols.length : 185 : 4;
  requireValue(passed === count * protocols.length, 'preview acceptance incomplete');
  for (const era of protocols) {
    const ids = audit.checks.filter(check => check.era === era).map(check => mode === 'corpus' ? check.id : check.probeId);
    requireValue(ids.length === count && new Set(ids).size === count && ids.every(id => typeof id === 'string' && id.length > 0),
      'incomplete or duplicated protocol checks');
    if (mode === 'application') {
      requireValue([era === protocols[0] ? 'initialize' : 'server/discover', 'tools-list', 'local-passage',
        'search:kempis-imitation-of-christ'].every(id => ids.includes(id)), 'required application check missing');
    }
  }
  const expected = readReleaseConfiguration(root).targets.preview;
  requireValue(identity.schemaVersion === 2 && identity.worker === 'theologai-preview'
    && UUID.test(identity.deployedVersionId) && UUID.test(identity.deploymentId), 'invalid audited Worker');
  requireValue(cutover.worker === identity.worker && cutover.candidateBindingMatches === true
    && cutover.observedActiveDeploymentId === identity.deploymentId && cutover.observedActiveVersionId === identity.deployedVersionId
    && cutover.candidateD1?.binding === 'THEOLOGAI_DB' && cutover.observedActiveD1?.binding === 'THEOLOGAI_DB'
    && cutover.candidateD1?.databaseName === expected.databaseName && cutover.candidateD1.databaseId === expected.databaseId
    && cutover.observedActiveD1.databaseId === expected.databaseId, 'audited preview assignment differs');
  return {schemaVersion: 1, sourceTree: git(root, ['rev-parse', 'HEAD^{tree}']).trim(), mode,
    manifestSha256: manifest, checks: passed, deploymentId: identity.deploymentId,
    versionId: identity.deployedVersionId, databaseId: expected.databaseId,
    ...(focused ? {corpusProfile: hostedCorpusProfile} : {})};
}

export function verifyPreviewReceipt(root, receipt, mode, manifest, tree) {
  requireValue(SHA.test(tree) && tree === git(root, ['rev-parse','HEAD^{tree}']).trim(), 'merged tree differs');
  const expectedChecks = mode === 'application' ? 8 : receipt.corpusProfile === hostedCorpusProfile ? hostedCorpusCheckCount : 370;
  requireValue(receipt.corpusProfile === undefined || (mode === 'corpus' && receipt.corpusProfile === hostedCorpusProfile),
    'invalid corpus acceptance profile');
  requireValue(['application','corpus'].includes(mode) && DIGEST.test(manifest)
    && receipt.schemaVersion === 1 && receipt.mode === mode && receipt.sourceTree === tree
    && receipt.manifestSha256 === manifest && UUID.test(receipt.versionId) && UUID.test(receipt.deploymentId)
    && receipt.databaseId === readReleaseConfiguration(root).targets.preview.databaseId
    && receipt.checks === expectedChecks, 'preview receipt mismatch');
  return receipt;
}

// Pure rehearsal: select the predecessor attested by this deployment. Any actual rollback
// requires fresh assignment/compatibility checks and separate owner approval.
export function rollbackPair(role, anchor, version) {
  requireValue(roles.includes(role), 'unknown rollback role');
  requireValue(anchor.schemaVersion === 3 && anchor.worker === (role === 'preview' ? 'theologai-preview' : 'theologai')
    && UUID.test(anchor.predecessorDeploymentId) && UUID.test(version.id) && version.id === anchor.predecessorVersionId
    && anchor.predecessorD1?.binding === 'THEOLOGAI_DB' && UUID.test(anchor.predecessorD1.databaseId), 'invalid rollback anchor');
  const bindings = version.resources?.bindings?.filter(binding => binding.type === 'd1');
  requireValue(bindings?.length === 1 && bindings[0].name === 'THEOLOGAI_DB'
    && (bindings[0].id ?? bindings[0].database_id) === anchor.predecessorD1.databaseId
    && (bindings[0].database_id ?? bindings[0].id) === anchor.predecessorD1.databaseId, 'rollback database differs');
  return {worker: anchor.worker, deploymentId: anchor.predecessorDeploymentId, versionId: version.id,
    databaseId: anchor.predecessorD1.databaseId};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, mode, manifest, file, target, identity, cutover, ...extra] = process.argv.slice(2);
  const root = process.cwd();
  if (command === 'rollback-pair' && file && !target) console.log(JSON.stringify(rollbackPair(mode, json(manifest), json(file))));
  else if (command === 'classify' && manifest === undefined) console.log(classifyRelease(root, mode));
  else if (command === 'classify-pr' && mode && manifest === undefined) {
    const result = classifyPrRelease(root, mode, process.env);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      `mode=${result.mode}\ntested_tree=${result.tree}\nsame_tree=${result.sameTree}\n`);
    console.log(JSON.stringify(result));
  }
  else if (command === 'record' && cutover && !extra.length) {
    const receipt = createPreviewReceipt({root, mode, manifest, audit: json(file), identity: json(identity), cutover: json(cutover)});
    writeFileSync(target, JSON.stringify(receipt) + '\n', {flag: 'wx'});
  } else if (command === 'verify' && target && !identity) {
    console.log(JSON.stringify(verifyPreviewReceipt(root, json(file), mode, manifest, target)));
  } else throw Error('Expected classify, classify-pr BASELINE, record MODE SHA AUDIT OUT IDENTITY CUTOVER, or verify MODE SHA RECEIPT TREE');
}
