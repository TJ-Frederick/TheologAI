/** Manual, network-denied regression of the complete protected executor.
 * Usage: node --import tsx THIS SOURCE_ROOT baseline|positive|forbidden|503 OUTPUT WORKER_JS SOURCE_DB PRODUCTION_VERSION PREVIEW_VERSION
 * Version JSON is private input: only hashes and bounded metadata are retained.
 * Positive and baseline use the real edge, SDK auditor, inline guard, and pacing.
 * Only forbidden mode supplies an audit seam to stimulate a prohibited request.
 */
import {Miniflare} from 'miniflare';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const [rootArg,mode,outputArg,workerArg,databaseArg,productionArg,previewArg,...extra]=process.argv.slice(2);
function insist(v:unknown,s:string):asserts v{if(!v)throw Error('Offline executor replay refused: '+s);}
insist(rootArg&&['baseline','positive','forbidden','503'].includes(mode)&&outputArg&&workerArg&&databaseArg&&productionArg&&previewArg&&!extra.length,'explicit local arguments');
const root=resolve(rootArg),output=resolve(outputArg),worker=resolve(workerArg),database=resolve(databaseArg);
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex'),json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024}).trim();
const source={commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),branch:git('branch','--show-current')||'codex/production-physical-cooldown-20261118'};
insist(git('status','--porcelain','--untracked-files=all').split('\n').filter(Boolean).every(x=>x==='?? node_modules'),'source initially clean');
if(mode==='baseline')insist(source.commit==='7894ee6a709192e04f78fb8cb4f6da5e3830cd45','unaltered historical source');
const producer=await import(pathToFileURL(join(root,'.github/scripts/refresh-norton-preview.ts')).href),{REFRESH,executePreviewRefresh,validateRefreshAudit,refreshFailureReason}=producer;
insist(hash(readFileSync(worker))===REFRESH.workerSha256&&hash(readFileSync(database))===REFRESH.sourceDatabaseSha256,'accepted compiled Worker and DB raw bytes');
const versions={production:json(resolve(productionArg)),preview:json(resolve(previewArg))};
for(const role of ['production','preview'] as const)insist(hash(JSON.stringify(versions[role],null,2)+'\n')===REFRESH[role].versionSha256,'actual immutable version hash');
mkdirSync(output,{recursive:true,mode:0o700});insist(!existsSync(join(output,'executor')),'fresh evidence directory');
const work=mkdtempSync(join(tmpdir(),'refresh-executor-')),persist=join(work,'d1'),realStart=Date.now(),anchor=Date.parse(mode==='baseline'?'2026-11-18T12:00:00Z':'2026-11-20T12:00:00Z'),now=()=>anchor+Date.now()-realStart;
const approval={schemaVersion:REFRESH.schema,operationId:'operation-offline-full-executor-'+mode,sourceCommit:source.commit,sourceTree:source.tree,headBranch:source.branch,targetRunId:'100',validationRunId:'100',targetRunAttempt:1,ownerActorId:40179660,notBefore:new Date(anchor-1000).toISOString(),expiresAt:new Date(anchor+45*60000).toISOString(),budgetDay:new Date(anchor).toISOString().slice(0,10),maxReads:100000,maxWrites:0,maxDeployments:0,previousReadsHeld:REFRESH.previousReadsHeld,totalReadsHeld:REFRESH.totalReadsHeld,uncertaintyMargin:REFRESH.uncertaintyMargin,cumulativeReadCeiling:REFRESH.cumulativeReadCeiling,acceptPreviewRowsNotReproven:true,knownDailyReadFloor:1000,unreportedInFlightReadReserve:1000};
const eventPath=join(work,'github-event.json');writeFileSync(eventPath,JSON.stringify({action:'labeled',label:{name:'validate-deployed-preview'},number:182,pull_request:{number:182,draft:false,head:{sha:source.commit,ref:source.branch,repo:{full_name:'TJ-Frederick/TheologAI'}},base:{sha:'24a6ba7516d40207eb07e246dd08d8e26e5100f1',ref:'main'}}}));
const environment={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'TJ-Frederick/TheologAI',GITHUB_EVENT_NAME:'pull_request',GITHUB_SHA:'c'.repeat(40),GITHUB_HEAD_REF:source.branch,GITHUB_REF:'refs/pull/182/merge',GITHUB_RUN_ID:'100',GITHUB_RUN_ATTEMPT:'1',GITHUB_ACTOR_ID:'40179660',GITHUB_ACTOR:'offline-owner',GITHUB_TRIGGERING_ACTOR:'offline-owner',GITHUB_EVENT_PATH:eventPath};
const options:any={modules:true,script:readFileSync(worker,'utf8'),compatibilityDate:'2026-07-29',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:{THEOLOGAI_DB:'00000000-0000-4000-8000-000000000001'},d1Persist:persist,bindings:{THEOLOGAI_VERSION:'3.6.0-preview',THEOLOGAI_REQUEST_LOGS:'false',THEOLOGAI_EXPOSE_CCEL_DISCOVERY:'true',THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH:'false',THEOLOGAI_ENABLE_CCEL_COORDINATOR:'false'},outboundService:async()=>{throw Error('Offline replay denies outbound Worker IO');}};
const files=(p:string):string[]=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(p,e.name)):[join(p,e.name)]);
let mf=new Miniflare(options),failed=false,afterFailure=0,usageObservations=0,stimulusValidRefused=false,stimulusForbiddenRefused=false,stimulusDispatchCountBefore:number|null=null,stimulusDispatchCountAfter:number|null=null;
const trace:Array<{sequence:number;kind:string;method:string;rpc:string|null;httpStatus:number}>=[];
try{
 await(await mf.getD1Database('THEOLOGAI_DB')).prepare('SELECT 1').all();await mf.dispose();const dbs=files(persist).filter(p=>/[a-f0-9]{64}\.sqlite$/.test(p));insist(dbs.length===1,'single isolated D1');for(const suffix of ['-wal','-shm'])rmSync(dbs[0]+suffix,{force:true});copyFileSync(database,dbs[0]);mf=new Miniflare(options);
 const net=(async(input:any,init:any={})=>{
  if(failed)afterFailure++;const u=new URL(String(input)),method=init.method??'GET';let rpc:any;try{rpc=JSON.parse(String(init.body??'null'));}catch{}
  let response:Response,kind:string;
  if(String(input)===REFRESH.endpoint){kind='local-workerd-mcp';insist(!new Headers(init.headers).has('authorization'),'no control credential on MCP');
   if(mode==='503'&&rpc?.method==='resources/read'){failed=true;response=Response.json({jsonrpc:'2.0',id:rpc.id,error:{code:-32603,message:'offline awaited fault'}},{status:503});}
   else response=await mf.dispatchFetch(String(input),init) as unknown as Response;
  }else{
   kind='simulated-control';insist(u.origin==='https://api.cloudflare.com','no external host');
   if(u.pathname==='/client/v4/graphql'){insist(method==='POST','GraphQL POST');usageObservations++;response=Response.json({data:{viewer:{accounts:[{accountTag:REFRESH.account,databases:[{dimensions:{databaseId:REFRESH.preview.databaseId},sum:{rowsRead:1000+usageObservations*100,rowsWritten:0},avg:{sampleInterval:1}}]}]}}});}
   else{insist(method==='GET','no remote SQL or control mutation');const role=u.pathname.includes('/theologai-preview/')?'preview':'production',pin=REFRESH[role];
    insist(u.pathname.startsWith('/client/v4/accounts/'+REFRESH.account+'/workers/scripts/'+(role==='preview'?'theologai-preview':'theologai')+'/'),'fixed metadata path');
    let result:unknown;if(u.pathname.endsWith('/settings'))result={bindings:[{type:'d1',name:'THEOLOGAI_DB',id:pin.databaseId}]};else if(u.pathname.endsWith('/deployments'))result={deployments:[{id:pin.deploymentId,versions:[{version_id:pin.versionId,percentage:100}]}]};else{insist(u.pathname.endsWith('/versions/'+pin.versionId),'exact immutable version route');result=versions[role];}
    response=Response.json({success:true,errors:[],result});}
  }
  trace.push({sequence:trace.length+1,kind,method,rpc:rpc?.method??null,httpStatus:response.status});return response;
 }) as typeof fetch;
 let receipt:any,refusal:string|null=null;
 const auditStimulus=mode==='forbidden'?{audit:async(input:any)=>{stimulusDispatchCountBefore=trace.length;const send=(method:string)=>input.fetch(REFRESH.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:9001,method})});let first:unknown;try{await send('tools/delete');}catch(error){first=error;stimulusForbiddenRefused=true;}try{await send('tools/list');}catch{stimulusValidRefused=true;}stimulusDispatchCountAfter=trace.length;insist(first&&stimulusForbiddenRefused&&stimulusValidRefused&&stimulusDispatchCountAfter===stimulusDispatchCountBefore,'both negative stimuli refused without any dispatch');throw first;}}:{};
 try{receipt=await executePreviewRefresh({root,source,approvalBytes:Buffer.from(JSON.stringify(approval)),sourceDatabase:database,workerJs:worker,output:join(output,'executor'),token:'offline-synthetic-control-token',environment,fetch:net,now,...auditStimulus});}catch(error){refusal=refreshFailureReason(error);}
 const reportPath=join(output,'executor/corpus-live.json'),report=existsSync(reportPath)?json(reportPath):null,events=readFileSync(join(output,'executor/refresh.events.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));
 if(mode==='positive'){insist(receipt&&report,'complete executor receipt');validateRefreshAudit(report,json(join(root,'test/fixtures/norton-preview-live-refresh-checks.json')));insist(report.checks.length===370&&usageObservations===2&&events.at(-1)?.kind==='refresh-complete','entire pre/post control and success path');}
 else{insist(!receipt&&!existsSync(join(output,'executor/refresh-receipt.json'))&&events.at(-1)?.kind==='STOP','terminal failure without success receipt');if(mode==='baseline')insist(report?.checks.length===185&&report.checks.every((c:any)=>c.era==='2025-11-25')&&report.failure?.rpcMethod==='server/discover'&&report.failure.lastHttpStatus===null&&!trace.some(x=>x.rpc==='server/discover'),'historical inline guard blocks second-era discover before dispatch after185 checks');if(mode==='503')insist(report?.failure?.lastHttpStatus===503&&afterFailure===0,'awaited failure retained and no further dispatch');if(mode==='forbidden')insist(stimulusForbiddenRefused&&stimulusValidRefused&&stimulusDispatchCountBefore===stimulusDispatchCountAfter&&trace.length===stimulusDispatchCountAfter&&!trace.some(x=>x.rpc==='tools/delete')&&events.some(x=>x.kind==='local-refusal'&&x.reason==='MCP read method only')&&events.at(-1)?.reason==='MCP read method only','first refusal retained and prohibited request never dispatched');}
 writeFileSync(join(output,'trace.json'),JSON.stringify(trace,null,2)+'\n');
 writeFileSync(join(output,'result.json'),JSON.stringify({mode,source,workerSha256:hash(readFileSync(worker)),sourceDatabaseSha256:hash(readFileSync(database)),immutableVersions:{production:REFRESH.production.versionSha256,preview:REFRESH.preview.versionSha256},sourceGuard:'real clean checked-out HEAD/tree/module root',clock:'synthetic UTC anchor advancing with real elapsed milliseconds',elapsedMs:Date.now()-realStart,providerCalls:0,simulatedBoundaries:['control settings/deployments','GraphQL usage','GitHub owner event/environment','clock anchor'],retainedVersionMetadata:'actual authorized private files, hashes only',engine:'accepted compiled Worker in actual local Workerd with isolated exact DB copy',auditSeam:mode==='forbidden'?'negative stimulus only':'none',edgeSeam:'none',checks:report?.checks.length??0,usageObservations,dispatches:trace.length,optionalGet405:trace.filter(x=>x.method==='GET'&&x.httpStatus===405).length,afterAwaitedFailureDispatches:afterFailure,stimulusForbiddenRefused,stimulusValidRefused,stimulusDispatchCountBefore,stimulusDispatchCountAfter,successReceipt:!!receipt,terminalEvent:events.at(-1),caughtReason:refusal,limitations:['offline synthetic platform/control assignment metadata and billing','local rate-limit binding absent and CF country/colo synthetic','no current hosted state or complete historical preview row proof established']},null,2)+'\n');
 console.log(JSON.stringify({mode,checks:report?.checks.length??0,receipt:!!receipt,dispatches:trace.length,elapsedMs:Date.now()-realStart}));
}finally{await mf.dispose();rmSync(work,{recursive:true,force:true});}
