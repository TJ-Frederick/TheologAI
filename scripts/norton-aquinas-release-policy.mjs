/** Explicit Norton/Aquinas activation policy. The separate application-only policy stays unchanged. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';

import POLICY from '../.github/scripts/norton-aquinas-policy.cjs';
export { POLICY };
export const BASELINE=POLICY.baseline;
export const ACCOUNT=POLICY.account;
export const CORPUS=POLICY.corpus;
export const SCHEMA=POLICY.schema;
export const TARGETS=Object.freeze(POLICY.targets);
const RELEASE_SCRIPTS=new Set(['application-release-policy.mjs','application-release-policy.d.mts','corpus-source-proof.ts','application-corpus-check.ts','corpus-proof-transport.ts','preview-fts-diagnostic.ts','operator-corpus-proof.ts','audit-dependencies.mjs','audit-dependencies.d.mts','worker-release-artifact.mjs','worker-release-artifact.d.mts','classify-ci-changes.mjs','classify-ci-changes.d.mts','pr-release-eligibility.mjs','pr-release-eligibility.d.mts','resolve-production-release-context.mjs','dual-era-preview-release-receipt.ts','release-corpus-capacity.ts','norton-aquinas-release-policy.mjs','norton-aquinas-release-policy.d.mts','norton-aquinas-preparation.ts','corpus-release-data.ts','corpus-release-control.ts','corpus-release-api.ts','preview-release-reconciliation.ts']);
const ACTIVATION_PATHS=Object.freeze([
  "data/data-manifest.json",
  "data/historical-source-packs/norton-1561/manifest.json",
  "data/historical-source-packs/norton-1561/manifest.sha256",
  "migrations/0010_active_aquinas_hierarchy_publication.sql",
  "scripts/active-aquinas-hierarchy.ts",
  "scripts/application-corpus-check.ts",
  "scripts/application-release-policy.mjs",
  "scripts/aquinas-authority-audit.ts",
  "scripts/aquinas-source-pack-capacity-comparison.ts",
  "scripts/audit-corpus-release.ts",
  "scripts/audit-dual-era-mcp-preview.ts",
  "scripts/audit-original-language-v2-preview.ts",
  "scripts/audit-primary-source-edge-stabilization.ts",
  "scripts/build-database.ts",
  "scripts/check-remote-d1-readiness.ts",
  "scripts/corpus-execution-config.ts",
  "scripts/corpus-proof-transport.ts",
  "scripts/corpus-release-api.ts",
  "scripts/corpus-release-control.ts",
  "scripts/corpus-release-data.ts",
  "scripts/corpus-source-proof.ts",
  "scripts/corpus-token-identity.ts",
  "scripts/dual-era-preview-release-receipt.ts",
  "scripts/finalize-biblical-language-unicode-manifest.ts",
  "scripts/historical-hierarchy-publication.ts",
  "scripts/historical-hierarchy.ts",
  "scripts/historical-source-packs.ts",
  "scripts/historical-transform9-authority-audit.ts",
  "scripts/norton-aquinas-live.ts",
  "scripts/norton-aquinas-preparation.ts",
  "scripts/operator-corpus-proof.ts",
  "scripts/transform12-candidate-c-storage.ts",
  "scripts/verify-biblical-language-unicode-d1.ts",
  "scripts/verify-d1-seed-workerd.ts",
  "scripts/verify-data-manifest.ts",
  "scripts/verify-database.ts",
  "scripts/worker-release-artifact.mjs",
  "src/adapters/d1/D1HistoricalHierarchyRepository.ts",
  "src/adapters/data/HistoricalHierarchyRepository.ts",
  "src/formatters/historicalHierarchyFormatter.ts",
  "src/kernel/historicalHierarchyResource.ts",
  "src/kernel/repositories.ts",
  "src/mcp/prompts.ts",
  "src/mcp/schemas/historicalHierarchy.ts",
  "src/mcp/server.ts",
  "src/presenters/historicalHierarchyStructured.ts",
  "src/services/historical/HistoricalHierarchyService.ts",
  "src/tools/toolRegistry.ts",
  "src/tools/v2/historicalHierarchy.ts",
  "src/tools/v2/index.ts",
  "src/tools/worker/index.ts"
]);
const sha=v=>createHash('sha256').update(v).digest('hex');
const check=(v,reason)=>{if(!v)throw Error('Application release refused: '+reason);};
function git(root,args){return execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024});}
function tree(root,ref){return new Map(git(root,['ls-tree','-r','-z',ref]).toString().split('\0').filter(Boolean).map(s=>{const[m,p]=s.split('\t');const[mode,,blob]=m.split(' ');return[p,{mode,blob}];}));}
export function classifyApplicationRelease(root){
 const declaration=JSON.parse(readFileSync(join(root,'release/norton-aquinas.json'),'utf8'));
 check(Object.keys(declaration).sort().join(',')==='baseline,files,policy,schemaVersion' && declaration.schemaVersion==='theologai-norton-aquinas-declaration.v1' && declaration.policy===POLICY.policy && declaration.baseline===BASELINE,'closed corpus declaration');
 const expectedPaths=ACTIVATION_PATHS;
 check(declaration.files && JSON.stringify(Object.keys(declaration.files).sort())===JSON.stringify(expectedPaths),'exact activation path inventory');
 // The existing protected action and independent operator use this one generated symlink.
 // Permit only the separately locked release trust set; every source/test edit still fails.
 const preparedReleaseLink=()=>{try{
  const link=join(root,'node_modules');if(!lstatSync(link).isSymbolicLink())return false;
  const toolchain=dirname(realpathSync(link));
  return ['package.json','package-lock.json'].every(name=>readFileSync(join(toolchain,name)).equals(git(root,['show',BASELINE+':.github/release-toolchain/'+name])));
 }catch{return false;}};
 const changes=git(root,['status','--porcelain','--untracked-files=all']).toString().split('\n').filter(Boolean);
 check(changes.every(line=>line==='?? node_modules'&&preparedReleaseLink()),'dirty or untracked exact release source');
 assertReviewedActivationEntries(declaration,tree(root,BASELINE),tree(root,'HEAD'));
 const sourceCommit=git(root,['rev-parse','HEAD']).toString().trim(),sourceTree=git(root,['rev-parse','HEAD^{tree}']).toString().trim();
 return {schemaVersion:'theologai-norton-aquinas-classification.v1',releasePolicy:POLICY.policy,sourceCommit,sourceTree,baseline:BASELINE,corpusIdentity:CORPUS,schema:SCHEMA,applicationOnly:false,declarationSha256:sha(readFileSync(join(root,'release/norton-aquinas.json')))};
}
export function assertReviewedActivationEntries(declaration,before,after){
 const expectedPaths=ACTIVATION_PATHS;
 check(declaration.schemaVersion==='theologai-norton-aquinas-declaration.v1' && declaration.policy===POLICY.policy && declaration.baseline===BASELINE && JSON.stringify(Object.keys(declaration.files??{}).sort())===JSON.stringify(expectedPaths),'exact reviewed corpus policy/path inventory');
 for(const path of expectedPaths)check(after.get(path)?.mode==='100644' && /^[a-f0-9]{40}$/.test(declaration.files[path]) && after.get(path)?.blob===declaration.files[path],'reviewed activation blob');
 const changed=[...new Set([...before.keys(),...after.keys()])].filter(path=>/^(?:src|data|scripts|migrations)\//.test(path) && JSON.stringify(before.get(path))!==JSON.stringify(after.get(path)));
 check(changed.every(path=>expectedPaths.includes(path) || path.startsWith('scripts/') && RELEASE_SCRIPTS.has(path.slice(8))),'unreviewed corpus/application path');
 for(const path of ['release/application-only.json','wrangler.toml','wrangler.ccel-coordinator.toml','package.json','package-lock.json','.nvmrc','.github/release-toolchain/package.json','.github/release-toolchain/package-lock.json'])check(JSON.stringify(before.get(path))===JSON.stringify(after.get(path)),'binding/dependency/runtime baseline changed');
}
export function requireProofApproval(value,expected,now=Date.now()){
 check(value&&Object.keys(value).sort().join(',')===['liveControlReserve','expectedLedgerSha256','releasePolicy','schemaVersion','role','accountId','databaseId','sourceCommit','sourceTree','expiresAt','maxReads','integrityCommands','exclusiveDataWritesDuringProof'].sort().join(','),'verification approval shape');
 check(value.liveControlReserve===POLICY.liveReads+POLICY.controlReads&&/^[a-f0-9]{64}$/.test(value.expectedLedgerSha256)&&value.releasePolicy===POLICY.policy&&value.schemaVersion==='theologai-fresh-corpus-proof-approval.v1'&&value.role===expected.role&&value.accountId===ACCOUNT&&value.databaseId===TARGETS[expected.role]?.databaseId,'verification approval target');
 check(value.sourceCommit===expected.sourceCommit&&value.sourceTree===expected.sourceTree,'verification approval source');
 const expiry=Date.parse(value.expiresAt);check(Number.isFinite(expiry)&&expiry>now&&expiry-now<=24*3600000,'verification approval expiry');
 check(value.maxReads===POLICY.hardReadCap&&value.integrityCommands===4&&value.exclusiveDataWritesDuringProof===true,'verification approval budget or write reservation');
 return value;
}
export function verifyFreshCorpusReceipt(value,expected,now=Date.now()){
 check(value&&value.liveControlReserve===POLICY.liveReads+POLICY.controlReads&&value.releasePolicy===POLICY.policy&&value.schemaVersion==='theologai-fresh-complete-corpus-proof.v1','fresh complete proof required; prior custody/markers unsupported');
 check(value.role===expected.role&&value.accountId===ACCOUNT&&value.databaseId===TARGETS[expected.role]?.databaseId&&value.databaseName===TARGETS[expected.role]?.databaseName,'fresh proof target');
 check(value.sourceCommit===expected.sourceCommit&&value.sourceTree===expected.sourceTree&&value.corpusIdentity===CORPUS&&value.schema===SCHEMA,'fresh proof source');
 const started=Date.parse(value.startedAt),completed=Date.parse(value.completedAt);
 check(Number.isFinite(started)&&Number.isFinite(completed)&&started<=completed&&completed<=now+30000&&now-completed<=3600000&&completed-started<=5400000,'fresh proof time');
 const proof=value.proof;
 check(expected.sourcePlanSha256===value.sourcePlanSha256&&/^[0-9a-f]{64}$/.test(expected.sourcePlanSha256),'fresh proof plan digest');
 check(expected.tables&&JSON.stringify(proof?.tables)===JSON.stringify(expected.tables),'fresh proof complete source table digests');
 check(proof?.method==='fresh_complete_cells_physical_and_rank1_fts.v1'&&proof.quickCheck==='ok','complete proof method');
 check(JSON.stringify(proof.ftsIntegrity)===JSON.stringify(['strongs_fts','sections_fts','historical_edition_sections_fts','historical_edition_hierarchy_bodies_fts']),'complete FTS proof');
 check(typeof expected.foreignKeyWitnessSha256==='string' && proof.foreignKeys?.witnessSha256===expected.foreignKeyWitnessSha256,'exact source FK equivalence witness');
 check(proof.foreignKeys?.method==='local_clean_raw_schema_plus_all_child_parent_cells'&&/^[0-9a-f]{64}$/.test(proof.foreignKeys.witnessSha256),'FK proof');
 check(Object.keys(proof.tables??{}).length===39&&Object.values(proof.tables).every(t=>Number.isSafeInteger(t.rows)&&t.rows>=0&&/^[0-9a-f]{64}$/.test(t.sha256)),'complete table proof');
 check(proof.sourceRows===Object.values(proof.tables).reduce((n,t)=>n+t.rows,0)&&/^[0-9a-f]{64}$/.test(proof.catalogSha256)&&/^[0-9a-f]{64}$/.test(proof.ledgerSha256),'complete proof accounting');
 check(value.readBudget===POLICY.reservedReads&&Number.isSafeInteger(value.metering?.rowsRead)&&value.metering.rowsRead>=0&&value.metering.rowsRead<=value.readBudget&&value.readBudget<=POLICY.hardReadCap&&Number.isSafeInteger(value.metering.rowsWritten)&&value.metering.rowsWritten>=0&&value.metering.rowsWritten<=4&&Number.isSafeInteger(value.metering.requests)&&value.metering.requests>0&&value.metering.requests<=5000&&value.metering.integrityCommands===4&&value.metering.retries===0&&value.metering.unknownAttempts===0,'fresh proof metering');
 check(value.controlsUnchanged===true&&/^[0-9a-f]{64}$/.test(value.sourcePlanSha256)&&/^[0-9a-f]{64}$/.test(value.approvalSha256),'fresh proof controls');
 check(value.operationalAssumption==='owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease','fresh proof consistency scope');
 return value;
}
