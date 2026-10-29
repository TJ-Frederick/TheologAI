/** Corpus-preserving release classification and fresh-proof receipt checks. No remote IO. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export const BASELINE='8fbfccfc73628918cfbcf4ca22676f2f7a0b55ab';
export const ACCOUNT='0594ed1e4c9fe35ab7d9f47991e99f3e';
export const CORPUS='66c148a206b9b0eb1bf7552572570c42dabfd0ba591b63e0cf0d02adda35aa07';
export const SCHEMA='0009_candidate_c_sectioned_publications';
export const TARGETS=Object.freeze({
 preview:{databaseName:'theologai-preview-20260811-schema0009-a',databaseId:'74f456e2-6951-4003-bb6f-91951342bf8f'},
 production:{databaseName:'theologai-production-20260811-schema0009-a',databaseId:'9bc79346-338b-439e-a2a5-424f4418eb21'},
});
const RELEASE_SCRIPTS=new Set(['application-release-policy.mjs','application-release-policy.d.mts','corpus-source-proof.ts','application-corpus-check.ts','corpus-proof-transport.ts','preview-fts-diagnostic.ts','audit-dependencies.mjs','audit-dependencies.d.mts','worker-release-artifact.mjs','worker-release-artifact.d.mts','classify-ci-changes.mjs','classify-ci-changes.d.mts','pr-release-eligibility.mjs','pr-release-eligibility.d.mts','resolve-production-release-context.mjs','dual-era-preview-release-receipt.ts']);
const SECURITY_PATHS=['src/http/config.ts','src/http/nodeHttpServer.ts','src/http/worker/ccelOperator.ts','src/http/worker/rateLimit.ts','src/http/worker/rateLimitIdentity.ts','src/http/worker/requestBody.ts','src/http/worker/requestPolicy.ts','src/http/worker/telemetry.ts','src/mcp/inputLimits.ts','src/mcp/server.ts','src/mcp/tools.ts','src/mcp/validation.ts'].sort();
const sha=v=>createHash('sha256').update(v).digest('hex');
const check=(v,reason)=>{if(!v)throw Error('Application release refused: '+reason);};
function git(root,args){return execFileSync('git',args,{cwd:root,maxBuffer:16*1024*1024});}
function tree(root,ref){return new Map(git(root,['ls-tree','-r','-z',ref]).toString().split('\0').filter(Boolean).map(s=>{const[m,p]=s.split('\t');const[mode,,blob]=m.split(' ');return[p,{mode,blob}];}));}
export function classifyEntries(before,after,securityFiles){
 const changed=[];
 for(const path of [...new Set([...before.keys(),...after.keys()])].sort()){
  if(!/^(?:src|data|scripts|migrations)\//.test(path))continue;
  if(JSON.stringify(before.get(path))===JSON.stringify(after.get(path)))continue;
  if(path.startsWith('scripts/')&&RELEASE_SCRIPTS.has(path.slice(8)))continue;
  if(securityFiles[path]&&after.get(path)?.blob===securityFiles[path]&&after.get(path)?.mode==='100644')continue;
  changed.push(path);
 }
 return {applicationOnly:changed.length===0,unreviewedDataOrApplicationPaths:changed};
}
export function classifyApplicationRelease(root){
 const declaration=JSON.parse(readFileSync(join(root,'release/application-only.json'),'utf8'));
 check(declaration.schemaVersion==='theologai-application-release-contract.v1'&&declaration.baseline===BASELINE&&declaration.corpusIdentity===CORPUS&&declaration.schema===SCHEMA,'supported corpus declaration');
 check(declaration.securityFiles&&Object.entries(declaration.securityFiles).every(([p,h])=>p.startsWith('src/')&&/^[0-9a-f]{40}$/.test(h)),'security blob declaration');
 check(JSON.stringify(Object.keys(declaration.securityFiles).sort())===JSON.stringify(SECURITY_PATHS),'security path scope');
 check(git(root,['diff','--name-only','HEAD','--','src','data','scripts','migrations','package.json','package-lock.json','.nvmrc','release']).length===0,'dirty release source');
 const untracked=git(root,['ls-files','--others','--exclude-standard','-z','--','src','data','scripts','migrations','release']);
 check(untracked.length===0,'untracked release source');
 const head=git(root,['rev-parse','HEAD']).toString().trim();const sourceTree=git(root,['rev-parse','HEAD^{tree}']).toString().trim();
 const result=classifyEntries(tree(root,BASELINE),tree(root,'HEAD'),declaration.securityFiles);
 check(result.applicationOnly,'data or unreviewed application changes: '+result.unreviewedDataOrApplicationPaths.join(','));
 const protectedTargets=['wrangler.toml','wrangler.ccel-coordinator.toml'];
 for(const path of protectedTargets)check(git(root,['diff',BASELINE,'HEAD','--',path]).length===0,'binding or Worker configuration changed');
 return {schemaVersion:'theologai-application-release-classification.v1',sourceCommit:head,sourceTree,baseline:BASELINE,corpusIdentity:CORPUS,schema:SCHEMA,applicationOnly:true,declarationSha256:sha(readFileSync(join(root,'release/application-only.json')))};
}
export function requireProofApproval(value,expected,now=Date.now()){
 check(value&&Object.keys(value).sort().join(',')===['schemaVersion','role','accountId','databaseId','sourceCommit','sourceTree','expiresAt','maxReads','integrityCommands','exclusiveDataWritesDuringProof'].sort().join(','),'verification approval shape');
 check(value.schemaVersion==='theologai-fresh-corpus-proof-approval.v1'&&value.role===expected.role&&value.accountId===ACCOUNT&&value.databaseId===TARGETS[expected.role]?.databaseId,'verification approval target');
 check(value.sourceCommit===expected.sourceCommit&&value.sourceTree===expected.sourceTree,'verification approval source');
 const expiry=Date.parse(value.expiresAt);check(Number.isFinite(expiry)&&expiry>now&&expiry-now<=24*3600000,'verification approval expiry');
 check(Number.isSafeInteger(value.maxReads)&&value.maxReads>0&&value.maxReads<=3800000&&value.integrityCommands===4&&value.exclusiveDataWritesDuringProof===true,'verification approval budget or write reservation');
 return value;
}
export function verifyFreshCorpusReceipt(value,expected,now=Date.now()){
 check(value&&value.schemaVersion==='theologai-fresh-complete-corpus-proof.v1','fresh complete proof required; prior custody/markers unsupported');
 check(value.role===expected.role&&value.accountId===ACCOUNT&&value.databaseId===TARGETS[expected.role]?.databaseId&&value.databaseName===TARGETS[expected.role]?.databaseName,'fresh proof target');
 check(value.sourceCommit===expected.sourceCommit&&value.sourceTree===expected.sourceTree&&value.corpusIdentity===CORPUS&&value.schema===SCHEMA,'fresh proof source');
 const started=Date.parse(value.startedAt),completed=Date.parse(value.completedAt);
 check(Number.isFinite(started)&&Number.isFinite(completed)&&started<=completed&&completed<=now+30000&&now-completed<=3600000&&completed-started<=5400000,'fresh proof time');
 const proof=value.proof;
 check(expected.sourcePlanSha256===value.sourcePlanSha256&&/^[0-9a-f]{64}$/.test(expected.sourcePlanSha256),'fresh proof plan digest');
 check(expected.tables&&JSON.stringify(proof?.tables)===JSON.stringify(expected.tables),'fresh proof complete source table digests');
 check(proof?.method==='fresh_complete_cells_physical_and_rank1_fts.v1'&&proof.quickCheck==='ok','complete proof method');
 check(JSON.stringify(proof.ftsIntegrity)===JSON.stringify(['strongs_fts','sections_fts','historical_edition_sections_fts','historical_edition_hierarchy_bodies_fts']),'complete FTS proof');
 check(proof.foreignKeys?.method==='local_clean_raw_schema_plus_all_child_parent_cells'&&/^[0-9a-f]{64}$/.test(proof.foreignKeys.witnessSha256),'FK proof');
 check(Object.keys(proof.tables??{}).length===39&&Object.values(proof.tables).every(t=>Number.isSafeInteger(t.rows)&&t.rows>=0&&/^[0-9a-f]{64}$/.test(t.sha256)),'complete table proof');
 check(proof.sourceRows===Object.values(proof.tables).reduce((n,t)=>n+t.rows,0)&&/^[0-9a-f]{64}$/.test(proof.catalogSha256)&&/^[0-9a-f]{64}$/.test(proof.ledgerSha256),'complete proof accounting');
 check(Number.isSafeInteger(value.readBudget)&&value.readBudget>0&&Number.isSafeInteger(value.metering?.rowsRead)&&value.metering.rowsRead>=0&&value.metering.rowsRead<=value.readBudget&&value.readBudget<=3800000&&Number.isSafeInteger(value.metering.rowsWritten)&&value.metering.rowsWritten>=0&&value.metering.rowsWritten<=4&&Number.isSafeInteger(value.metering.requests)&&value.metering.requests>0&&value.metering.requests<=5000&&value.metering.integrityCommands===4&&value.metering.retries===0&&value.metering.unknownAttempts===0,'fresh proof metering');
 check(value.controlsUnchanged===true&&/^[0-9a-f]{64}$/.test(value.sourcePlanSha256)&&/^[0-9a-f]{64}$/.test(value.approvalSha256),'fresh proof controls');
 check(value.operationalAssumption==='owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease','fresh proof consistency scope');
 return value;
}
