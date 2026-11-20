/** Local, source-bound corpus release identity and complete proof receipt checks. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import POLICY from '../.github/scripts/corpus-policy.cjs';

export {POLICY};
export const ACCOUNT = POLICY.account;
export const TARGETS = POLICY.serving().targets;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (value, reason) => { if (!value) throw Error('Application release refused: ' + reason); };

export function classifyApplicationRelease(root) {
  const git = args => execFileSync('git', args, {cwd: root}).toString().trim();
  check(!git(['status', '--porcelain', '--untracked-files=all', '--', 'src', 'data', 'scripts', 'release', 'migrations', '.github', 'wrangler.toml', 'package.json', 'package-lock.json']), 'dirty release source');
  const manifest = readFileSync(join(root, 'data/data-manifest.json'));
  const schema = JSON.parse(manifest).schemaVersion;
  check(typeof schema === 'string' && /^[a-z0-9_]+$/.test(schema), 'source schema');
  const targets = POLICY.serving(root).targets;
  return {schemaVersion:'theologai-corpus-release-classification.v1', releasePolicy:POLICY.policy,
    sourceCommit:git(['rev-parse','HEAD']), sourceTree:git(['rev-parse','HEAD^{tree}']),
    schema, manifestSha256:sha(manifest), targets};
}

export function requireProofApproval(value,expected,now=Date.now()){
 check(value&&Object.keys(value).sort().join(',')===['schemaVersion','releasePolicy','role','accountId','databaseId','sourceCommit','sourceTree','expiresAt','maxReads','reservedReads','liveControlReserve','expectedLedgerSha256','integrityCommands','exclusiveDataWritesDuringProof'].sort().join(','),'verification approval shape');
 check(value.schemaVersion==='theologai-fresh-corpus-proof-approval.v1'&&value.releasePolicy===POLICY.policy&&value.role===expected.role&&value.accountId===ACCOUNT&&value.databaseId===TARGETS[expected.role]?.databaseId,'verification approval target');
 check(value.sourceCommit===expected.sourceCommit&&value.sourceTree===expected.sourceTree,'verification approval source');
 const expiry=Date.parse(value.expiresAt);check(Number.isFinite(expiry)&&expiry>now&&expiry-now<=24*3600000,'verification approval expiry');
 check(Number.isSafeInteger(value.maxReads)&&value.maxReads>0&&value.maxReads<=POLICY.hardReadCap&&Number.isSafeInteger(value.reservedReads)&&value.reservedReads>0&&value.reservedReads<=value.maxReads&&Number.isSafeInteger(value.liveControlReserve)&&value.liveControlReserve>=POLICY.controlReads&&/^[0-9a-f]{64}$/.test(value.expectedLedgerSha256)&&value.integrityCommands===4&&value.exclusiveDataWritesDuringProof===true,'verification approval budget or write reservation');
 return value;
}
export function verifyFreshCorpusReceipt(value,expected,now=Date.now()){
 check(value&&value.schemaVersion==='theologai-fresh-complete-corpus-proof.v1'&&value.releasePolicy===POLICY.policy,'fresh complete proof required; prior custody/markers unsupported');
 check(value.role===expected.role&&value.accountId===ACCOUNT&&value.databaseId===TARGETS[expected.role]?.databaseId&&value.databaseName===TARGETS[expected.role]?.databaseName,'fresh proof target');
 check(value.sourceCommit===expected.sourceCommit&&value.sourceTree===expected.sourceTree&&value.corpusIdentity===expected.corpusIdentity&&/^[0-9a-f]{64}$/.test(expected.corpusIdentity)&&value.schema===expected.schema,'fresh proof source');
 const started=Date.parse(value.startedAt),completed=Date.parse(value.completedAt);
 check(Number.isFinite(started)&&Number.isFinite(completed)&&started<=completed&&completed<=now+30000&&now-completed<=3600000&&completed-started<=5400000,'fresh proof time');
 const proof=value.proof;
 check(expected.sourcePlanSha256===value.sourcePlanSha256&&/^[0-9a-f]{64}$/.test(expected.sourcePlanSha256),'fresh proof plan digest');
 check(expected.tables&&JSON.stringify(proof?.tables)===JSON.stringify(expected.tables),'fresh proof complete source table digests');
 check(proof?.method==='fresh_complete_cells_physical_and_rank1_fts.v1'&&proof.quickCheck==='ok','complete proof method');
 check(JSON.stringify(proof.ftsIntegrity)===JSON.stringify(['strongs_fts','sections_fts','historical_edition_sections_fts','historical_edition_hierarchy_bodies_fts']),'complete FTS proof');
 check(proof.foreignKeys?.method==='local_clean_raw_schema_plus_all_child_parent_cells'&&/^[0-9a-f]{64}$/.test(expected.foreignKeyWitnessSha256)&&proof.foreignKeys.witnessSha256===expected.foreignKeyWitnessSha256,'FK proof');
 check(Object.keys(proof.tables??{}).length>0&&Object.values(proof.tables).every(t=>Number.isSafeInteger(t.rows)&&t.rows>=0&&/^[0-9a-f]{64}$/.test(t.sha256)),'complete table proof');
 check(proof.sourceRows===Object.values(proof.tables).reduce((n,t)=>n+t.rows,0)&&/^[0-9a-f]{64}$/.test(proof.catalogSha256)&&/^[0-9a-f]{64}$/.test(expected.ledgerSha256)&&proof.ledgerSha256===expected.ledgerSha256,'complete proof accounting');
 check(Number.isSafeInteger(value.readBudget)&&value.readBudget>0&&Number.isSafeInteger(value.metering?.rowsRead)&&value.metering.rowsRead>=0&&value.metering.rowsRead<=value.readBudget&&value.readBudget<=POLICY.hardReadCap&&Number.isSafeInteger(value.metering.rowsWritten)&&value.metering.rowsWritten>=0&&value.metering.rowsWritten<=4&&Number.isSafeInteger(value.metering.requests)&&value.metering.requests>0&&value.metering.requests<=5000&&value.metering.integrityCommands===4&&value.metering.retries===value.metering.unknownAttempts&&[0,1].includes(value.metering.retries),'fresh proof metering');
 check(value.liveControlReserve===expected.liveControlReserve&&value.readBudget===expected.readBudget,'approved reservations');
 check(value.controlsUnchanged===true&&/^[0-9a-f]{64}$/.test(value.sourcePlanSha256)&&/^[0-9a-f]{64}$/.test(value.approvalSha256),'fresh proof controls');
 check(value.operationalAssumption==='owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease','fresh proof consistency scope');
 return value;
}
