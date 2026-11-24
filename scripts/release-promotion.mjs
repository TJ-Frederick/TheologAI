// Local promotion checks. Cloud credentials and remote queries belong to the protected jobs.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyCiChanges } from './classify-ci-changes.mjs';
import { parseNameStatusNul } from './classify-production-deployment.mjs';

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const roles = ['preview', 'production'];
const releaseBookkeeping = new Set([
  'release/serving.json',
  '.github/scripts/production-baseline.cjs',
  'scripts/release-promotion.mjs',
  'test/fixtures/release-workers/replay.py',
  'test/unit/scripts/releasePromotion.test.ts',
]);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
function requireValue(value, message) {
  if (!value) throw new Error('Release refused: ' + message);
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
  // Baseline bookkeeping can change independently of the Worker and corpus.
  const substantive = paths.filter(change => !change.paths.every(path => releaseBookkeeping.has(path)));
  if (!substantive.length) return 'docs';
  const diff = substantive.map(change => [change.status, ...change.paths].join('\0') + '\0').join('');
  const {mode} = classifyCiChanges(diff);
  if (mode === 'docs') return 'docs';
  // CI also exercises the data suite for database readers and historical search. Those
  // runtime-only changes do not modify the stored corpus. Keep shared builders conservative.
  const runtimeOnly = path => /^src\/(?:services\/historical|adapters\/(?:bible|commentary|donation|d1|data))\/.*\.ts$/.test(path)
    || path === 'src/adapters/shared/primarySourceSearchSql.ts'
    || /^test\/unit\/.*\.test\.ts$/.test(path);
  const application = substantive.every(change => change.paths.every(path =>
    runtimeOnly(path) || ['docs','serving'].includes(classifyCiChanges('M\0' + path + '\0').mode)));
  return application ? 'application' : 'corpus';
}

export function createPreviewReceipt({root, mode, manifest, audit, identity, cutover}) {
  requireValue(['application','corpus'].includes(mode) && DIGEST.test(manifest), 'invalid artifact or mode');
  requireValue(Array.isArray(audit.checks) && audit.checks.every(check => check.passed === true), 'incomplete audit checks');
  const passed = audit.checks.length;
  requireValue(audit.mode === mode && audit.role === 'preview' && audit.passed === true
    && audit.endpoint === 'https://preview-mcp.theologai.xyz/mcp', 'protected preview acceptance required');
  const protocols = ['2025-11-25', '2026-07-28'];
  const count = mode === 'corpus' ? 185 : 4;
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
    versionId: identity.deployedVersionId, databaseId: expected.databaseId};
}

export function verifyPreviewReceipt(root, receipt, mode, manifest, tree) {
  requireValue(SHA.test(tree) && tree === git(root, ['rev-parse','HEAD^{tree}']).trim(), 'merged tree differs');
  requireValue(['application','corpus'].includes(mode) && DIGEST.test(manifest)
    && receipt.schemaVersion === 1 && receipt.mode === mode && receipt.sourceTree === tree
    && receipt.manifestSha256 === manifest && UUID.test(receipt.versionId) && UUID.test(receipt.deploymentId)
    && receipt.databaseId === readReleaseConfiguration(root).targets.preview.databaseId
    && Number.isSafeInteger(receipt.checks) && (mode === 'corpus' ? receipt.checks === 370 : receipt.checks === 8), 'preview receipt mismatch');
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
  else if (command === 'record' && cutover && !extra.length) {
    const receipt = createPreviewReceipt({root, mode, manifest, audit: json(file), identity: json(identity), cutover: json(cutover)});
    writeFileSync(target, JSON.stringify(receipt) + '\n', {flag: 'wx'});
  } else if (command === 'verify' && target && !identity) {
    console.log(JSON.stringify(verifyPreviewReceipt(root, json(file), mode, manifest, target)));
  } else throw Error('Expected classify, record MODE SHA AUDIT OUT IDENTITY CUTOVER, or verify MODE SHA RECEIPT TREE');
}
