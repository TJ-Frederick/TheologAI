/** One explicitly approved unbound-candidate preparation; never deploys or resumes. */
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {planPreparation,prepareAndReadBackCandidate,PreparedCorpusSession,createPreparationExecutor,TARGETS} from '../../scripts/norton-aquinas-preparation.js';
import {classifyApplicationRelease,POLICY} from '../../scripts/norton-aquinas-release-policy.mjs';
import {captureUnboundCorpusControl,captureCorpusUsage} from '../../scripts/corpus-release-control.js';
import {createCorpusApi} from '../../scripts/corpus-release-api.js';
const authority=createRequire(import.meta.url)('./operator-authorization.cjs');
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
class PreparationRefusal extends Error {constructor(readonly reason:string){super('Norton production preparation refused: '+reason);}}
const check=(v:unknown,s:string):void=>{if(!v)throw new PreparationRefusal(s.replaceAll(/[^a-z0-9]+/gi,'_').toLowerCase());};
function stopReason(cause:unknown,stage:string,halted:boolean){
 if(cause instanceof PreparationRefusal)return cause.reason;
 if(cause instanceof Error&&cause.message==='Corpus preparation refused: preparation operation not admitted')return 'quota_admission';
 if(cause instanceof Error&&cause.message==='Corpus preparation refused: actual preparation exceeds reserved operation ceiling')return 'operation_budget_exceeded';
 if(halted)return 'sql_outcome_unresolved';
 if(stage==='owner_source')return 'source_authority_refused';
 if(stage.startsWith('unbound_'))return 'control_inventory_refused';
 return 'preparation_verification_refused';
}
// The stopped preparation completed one catalog SELECT. Both debits belong to the original reservation.
const discoveryHold = 32;
const previousCatalogReads = 324;
const preparationReservation = 250000;
const carriedReads = discoveryHold + previousCatalogReads;
export const PREPARATION_CONFIRMATION='PREPARE ONLY THE UNBOUND 74F NORTON AQUINAS CANDIDATE';
export type PreparationApproval={schemaVersion:string;confirmation:string;operationId:string;repository:string;ownerActorId:number;role:'production';pullRequestNumber:number;headBranch:string;sourceCommit:string;sourceTree:string;baseCommit:string;targetRunId:string;targetRunAttempt:number;databaseId:string;baselineSha256:string;sourceSha256:string;sourcePlanSha256:string;preparationPlanSha256:string;originalLedgerSha256:string;notBefore:string;expiresAt:string;budgetDay:string;maxReads:number;priorReadsReserved:number;maxLifetimeWrites:number;maxDailyWrites:number;previousPreparationWrites:number;exclusiveDataWritesDuringWindow:boolean;candidateWriteJobsPaused:boolean;noDeployment:boolean};
export function requirePreparationApproval(a:PreparationApproval,source:{sourceCommit:string;sourceTree:string},now=Date.now()){
 const keys='baselineSha256,baseCommit,budgetDay,candidateWriteJobsPaused,confirmation,databaseId,exclusiveDataWritesDuringWindow,expiresAt,headBranch,maxDailyWrites,maxLifetimeWrites,maxReads,noDeployment,notBefore,operationId,originalLedgerSha256,ownerActorId,preparationPlanSha256,previousPreparationWrites,priorReadsReserved,pullRequestNumber,repository,role,schemaVersion,sourceCommit,sourcePlanSha256,sourceSha256,sourceTree,targetRunAttempt,targetRunId'.split(',').sort();
 check(a&&Object.keys(a).sort().join(',')===keys.join(','),'closed owner approval');
 check(a.schemaVersion==='norton-production-preparation-approval.v1'&&a.confirmation===PREPARATION_CONFIRMATION&&a.repository==='TJ-Frederick/TheologAI'&&a.ownerActorId===40179660&&a.role==='production'&&a.pullRequestNumber===POLICY.productionReleasePR&&a.headBranch==='main'&&a.targetRunAttempt===1&&/^[1-9][0-9]{0,15}$/.test(a.targetRunId)&&/^operation-[a-z0-9-]{8,80}$/.test(a.operationId),'fixed owner/operation');
 check(a.sourceCommit===source.sourceCommit&&a.sourceTree===source.sourceTree&&a.baseCommit===POLICY.productionPredecessorMerge&&a.databaseId===TARGETS.production.id,'exact merged source/target');
 check(['baselineSha256','sourceSha256','sourcePlanSha256','preparationPlanSha256','originalLedgerSha256'].every(k=>/^[a-f0-9]{64}$/.test((a as any)[k])),'source/baseline/plan witnesses');
 check(a.maxReads===preparationReservation-carriedReads&&a.priorReadsReserved===carriedReads&&a.maxLifetimeWrites===115000&&a.maxDailyWrites===80000&&a.previousPreparationWrites===0&&a.exclusiveDataWritesDuringWindow===true&&a.candidateWriteJobsPaused===true&&a.noDeployment===true,'bounded replacement preparation only');
 const start=Date.parse(a.notBefore),end=Date.parse(a.expiresAt),day=new Date(now).toISOString().slice(0,10);check(/^\d{4}-\d{2}-\d{2}$/.test(a.budgetDay)&&day===a.budgetDay&&a.notBefore.slice(0,10)===a.budgetDay&&a.expiresAt.slice(0,10)===a.budgetDay&&start<=now&&end>now&&end-start<=5400000&&end<Date.parse(day+'T00:00:00Z')+86400000&&now+5400000<Date.parse(day+'T00:00:00Z')+86400000,'single approved UTC window');return a;
}
export async function runNortonPreparation(input:{root:string;approval:PreparationApproval;baselinePath:string;sourcePath:string;sourcePlanPath:string;output:string;token:string;fetch?:typeof fetch;liveCandidate?:(a:PreparationApproval)=>Promise<void>;now?:()=>number}){
 const now=input.now??Date.now,classification=classifyApplicationRelease(input.root),a=requirePreparationApproval(input.approval,classification,now());
 check(execFileSync('git',['rev-parse','HEAD^1'],{cwd:input.root,encoding:'utf8'}).trim()===a.baseCommit,'actual merged first parent');
 const sourcePlanBytes=readFileSync(input.sourcePlanPath),sourcePlan=JSON.parse(sourcePlanBytes.toString());check(sourcePlan.schemaVersion==='theologai-application-corpus-source-plan.v1'&&sourcePlan.releasePolicy===POLICY.policy&&sourcePlan.readBudget===3560000&&sourcePlan.integrityCommands===4&&sha(sourcePlanBytes)===a.sourcePlanSha256&&sourcePlan.sourceSha256===a.sourceSha256&&JSON.stringify(sourcePlan.classification)===JSON.stringify(classification),'source-bound proof plan');
 check(sha(readFileSync(input.baselinePath))===a.baselineSha256&&sha(readFileSync(input.sourcePath))===a.sourceSha256,'exact local source files');
 mkdirSync(input.output,{mode:0o700});const plan=planPreparation(input.root,input.baselinePath,input.sourcePath);check(plan.sha256===a.preparationPlanSha256,'reviewed exact preparation plan');
 const journal=join(input.output,'preparation.events.jsonl');writeFileSync(journal,'',{flag:'wx',mode:0o600});
 const record=(value:unknown)=>appendFileSync(journal,JSON.stringify(value)+'\n',{mode:0o600,flush:true});let providerCalls=0,githubCalls=0,lastSource=-Infinity,stage='owner_source',session:PreparedCorpusSession|undefined;
 // Five metadata requests per 30-second authority check, for up to 90 minutes.
 const gh=async(path:string)=>{check(++githubCalls<=905,'GitHub read budget');return JSON.parse(execFileSync('gh',['api','repos/TJ-Frederick/TheologAI'+path],{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}));};
 let lastRun:any;
 const github={rest:{actions:{getWorkflowRun:async({run_id}:any)=>({data:lastRun=await gh('/actions/runs/'+run_id)})},pulls:{get:async({pull_number}: {pull_number:number})=>({data:await gh('/pulls/'+pull_number)})},git:{getRef:async()=>({data:await gh('/git/ref/heads/main')}),getCommit:async({commit_sha}:any)=>({data:await gh('/git/commits/'+commit_sha)})}}};
 const live=input.liveCandidate??(async()=>{await authority.requireLiveCandidate({github,authorization:a});check(lastRun.actor?.id===40179660&&lastRun.triggering_actor?.id===40179660,'owner production dispatch');const jobs=await gh('/actions/runs/'+a.targetRunId+'/jobs?per_page=100');check(jobs.total_count<=100&&!jobs.jobs.some((j:any)=>j.name==='Test, Build & Deploy'&&j.started_at),'production must remain before protected execution');});
 const guard=async()=>{requirePreparationApproval(a,classification,now());if(now()-lastSource>=30000){try{await live(a);}catch(cause){if(cause instanceof PreparationRefusal)throw cause;throw new PreparationRefusal('source_authority_refused');}lastSource=now();}};
 const limited=(async(url:any,init:any)=>{await guard();check(++providerCalls<=2500,'provider exchange budget');return (input.fetch??fetch)(url,init);})as typeof fetch;
 const api=createCorpusApi('production',async()=>input.token,limited,record);let cached:Awaited<ReturnType<typeof captureCorpusUsage>>|undefined;
 const usage=async()=>{if(!cached||now()-Date.parse(cached.capturedAt)>=25000)cached=await captureCorpusUsage({role:'production',api});return{windowStart:cached.windowStart,observedAt:cached.capturedAt,rowsRead:cached.candidate.rowsRead+cached.otherDatabases.rowsRead,rowsWritten:cached.candidate.rowsWritten+cached.otherDatabases.rowsWritten};};
 const baseline=new Database(input.baselinePath,{readonly:true,fileMustExist:true}),source=new Database(input.sourcePath,{readonly:true,fileMustExist:true});
 try{
  await guard();stage='unbound_before';const before=await captureUnboundCorpusControl({role:'production',api});check(now()-Date.parse(before.capturedAt)<=50000,'fresh unbound inventory');record({kind:'unbound-before',databaseId:before.databaseId,inventorySha256:before.inventorySha256,capturedAt:before.capturedAt});
  for (const role of ['preview','production'] as const) {
   const worker = before.inventory.workers.find(w => w.name === (role === 'preview' ? 'theologai-preview' : 'theologai'));
   const expected = POLICY.predecessors[role];
   const database = role === 'preview' ? POLICY.targets.preview.databaseId : POLICY.rollback.databaseId;
   const version = worker?.versions[0];
   check(worker?.deploymentId === expected.deploymentId && worker.versions.length === 1
    && version?.versionId === expected.versionId && version.percentage === 100
    && JSON.stringify(worker.configuredD1) === JSON.stringify([database])
    && JSON.stringify(version.databases) === JSON.stringify([database]), 'serving assignment changed');
  }
  const startUsage=await usage();
  check(startUsage.rowsRead + 250000 + 200000 <= 4000000 && startUsage.rowsWritten + 51459 <= 80000, 'quota admission');
  stage='preparation';session=new PreparedCorpusSession({priorReadsReserved:a.priorReadsReserved,databaseId:TARGETS.production.id,execute:createPreparationExecutor(api.authorizedFetch),usage,guard,append:async e=>record(e)},now);
  const result=await prepareAndReadBackCandidate(plan,session,baseline,source,a.originalLedgerSha256);
  stage='post_preparation_ledger';const ledger=await session.query('SELECT id,name,applied_at FROM d1_migrations ORDER BY id LIMIT 11;',32,0);const migrations=JSON.parse(readFileSync(join(input.root,'data/data-manifest.json'),'utf8')).materializations.d1.migrations;
  check(ledger.rows.length===10&&ledger.rows.every((r,i)=>r.id===i+1&&r.name===migrations[i].path.split('/').at(-1)&&typeof r.applied_at==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r.applied_at as string)),'exact post-preparation ten-row ledger');
  stage='unbound_after';const after=await captureUnboundCorpusControl({role:'production',api});check(after.inventorySha256===before.inventorySha256,'unchanged unbound assignments');await guard();
  const receipt={schemaVersion:'norton-production-preparation-receipt.v1',purpose:'unbound-candidate-preparation-only',operationId:a.operationId,source:classification,target:plan.target,planSha256:plan.sha256,baselineWitnessSha256:plan.baselineWitnessSha256,originalLedgerSha256:a.originalLedgerSha256,postPreparationLedgerSha256:sha(JSON.stringify(ledger.rows)),postPreparationLedgerRows:10,readbacksSha256:result.readbacksSha256,completedAt:new Date(now()).toISOString(),metering:{priorDiscoveryReadsReserved:discoveryHold,previousPreparationReads:previousCatalogReads,wrapperReadAllowance:a.maxReads,preparationRoleReadReservation:preparationReservation,rowsRead:session.reads,rowsWritten:session.writes,sqlRequests:session.requests,providerExchanges:providerCalls,githubReads:githubCalls,retries:0,unknownOutcomes:0},controlInventorySha256:after.inventorySha256,authority:a,freshCompleteProof:false,deploymentAuthorized:false};
  record({kind:'preparation-complete',receiptSha256:sha(JSON.stringify(receipt))});writeFileSync(join(input.output,'preparation-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});return receipt;
 }catch(cause){try{record({kind:'STOP',stage,reason:stopReason(cause,stage,session?.halted??false),reads:session?.reads??0,writes:session?.writes??0,sqlRequests:session?.requests??0,providerExchanges:providerCalls,githubReads:githubCalls,unknownOutcome:session?.halted??false,retry:false,noAutomaticResume:true});}catch{}throw Error('Norton production preparation stopped; preserve the original journal, no retry or automatic recovery');}finally{baseline.close();source.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [approvalPath,baselinePath,sourcePath,sourcePlanPath,output,...extra]=process.argv.slice(2);check(approvalPath&&baselinePath&&sourcePath&&sourcePlanPath&&output&&!extra.length,'exact approval/baseline/source/source-plan/output arguments');
 const st=lstatSync(approvalPath!);check(st.isFile()&&!st.isSymbolicLink()&&st.size<=60000,'bounded approval file');check(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID===POLICY.account,'existing explicitly approved preparation credential');
 runNortonPreparation({root:process.cwd(),approval:JSON.parse(readFileSync(approvalPath!,'utf8')),baselinePath:resolve(baselinePath!),sourcePath:resolve(sourcePath!),sourcePlanPath:resolve(sourcePlanPath!),output:resolve(output!),token:process.env.CLOUDFLARE_API_TOKEN!}).catch(()=>{process.stderr.write('Norton production preparation stopped; retain journal and full reservation. No retry, deployment or automatic recovery.\n');process.exitCode=1;});
}
