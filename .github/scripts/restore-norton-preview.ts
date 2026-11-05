/** One fixed Norton preview restoration. No D1 SQL, production mutation or retries. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {activePreviewVersionId,activeProductionVersionId,observePreviewPostMutation} from '../../scripts/preview-release-reconciliation.js';
const archive=createRequire(import.meta.url)('./operator-authorization.cjs');
export const RESTORE=Object.freeze({repo:'TJ-Frederick/TheologAI',actor:40179660,pr:176,failedRun:41951638734,
 failedSource:'cc14e062d772e957a24a64bfc15a679ebaca8109',base:'328168d5b817e9eaa0e702de382adc2c46c858ef',
 current:'eb16fe17-764d-4ccc-8a95-a2098470372c',currentDeployment:'aad541f2-7102-41ee-8da1-d8efce7fcf97',candidate:'62b871a6-5b4d-4d9b-8f52-301f6c878f48',
 target:'3312716e-d347-4f47-8753-787e4aa1808f',targetDatabase:'74f456e2-6951-4003-bb6f-91951342bf8f',
 production:'d2e2bd87-1213-4ba5-891d-e0f9b3293cb9',productionDeployment:'f6c9a995-0940-4758-a9a9-14f1389a9ab3',productionDatabase:'9bc79346-338b-439e-a2a5-424f4418eb21',
 artifact:13383258018,artifactDigest:'sha256:678e2a8f6aa6af73ea9f5f9474bd6aa5133a048ee614278556c7c2eb23bc51a7',
 account:'0594ed1e4c9fe35ab7d9f47991e99f3e',confirmation:'RESTORE THE REVIEWED NORTON PREVIEW PREDECESSOR'});
const ROUTING_CONFIG=`name = "theologai"\naccount_id = "${RESTORE.account}"\nsend_metrics = false\n[env.preview]\nname = "theologai-preview"\n`;
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
function check(v:unknown,s:string):asserts v{if(!v)throw Error('Preview restoration refused: '+s);}
export type Request={sourceCommit:string;sourceTree:string;expiresAt:string;confirmation:string};
type Run=(args:string[])=>Promise<string>;
export type Dependencies={github:(route:string,binary?:boolean)=>Promise<any>;run:Run;record:(entry:unknown)=>void;now:()=>number;sourceCommit:string;sourceTree:string;runId:string;environment:Record<string,string|undefined>};
export async function admit(request:Request,d:Dependencies){
 check(request&&Object.keys(request).sort().join(',')==='confirmation,expiresAt,sourceCommit,sourceTree','request shape');
 check(request.confirmation===RESTORE.confirmation&&/^[a-f0-9]{40}$/.test(request.sourceCommit)&&/^[a-f0-9]{40}$/.test(request.sourceTree)
  &&request.sourceCommit===d.sourceCommit&&request.sourceTree===d.sourceTree,'reviewed source and confirmation');
 const end=Date.parse(request.expiresAt);check(end>d.now()+120000&&end-d.now()<=3600000,'bounded owner window');
 const e=d.environment;check(e.GITHUB_REPOSITORY===RESTORE.repo&&e.GITHUB_EVENT_NAME==='workflow_dispatch'&&e.GITHUB_RUN_ATTEMPT==='1'&&e.GITHUB_ACTOR_ID===String(RESTORE.actor),'owner dispatch');
 const run=await d.github('/actions/runs/'+d.runId);
 check(run.actor?.id===RESTORE.actor&&run.triggering_actor?.id===RESTORE.actor&&run.run_attempt===1&&run.event==='workflow_dispatch'&&run.path==='.github/workflows/pr.yml'&&run.head_sha===request.sourceCommit&&e.GITHUB_REF==='refs/heads/'+run.head_branch,'authenticated dispatch source');
 const pr=await d.github('/pulls/176'),commit=await d.github('/git/commits/'+request.sourceCommit),main=await d.github('/git/ref/heads/main');
 check(pr.state==='open'&&!pr.draft&&pr.base.ref==='main'&&pr.base.sha===RESTORE.base&&main.object.sha===RESTORE.base&&pr.head.sha===request.sourceCommit&&pr.head.ref===run.head_branch&&pr.head.repo.full_name===RESTORE.repo&&!pr.labels.some((l:any)=>l.name==='deploy-preview')&&commit.tree.sha===request.sourceTree,'live unlabeled source/base');
 const failed=await d.github('/actions/runs/'+RESTORE.failedRun),jobs=await d.github('/actions/runs/'+RESTORE.failedRun+'/jobs?per_page=100');
 check(failed.status==='completed'&&failed.conclusion==='failure'&&failed.run_attempt===1&&failed.head_sha===RESTORE.failedSource&&failed.path==='.github/workflows/pr.yml','terminal failed source');
 const deploy=jobs.jobs.filter((j:any)=>j.name==='Deploy Preview');check(deploy.length===1&&deploy[0].conclusion==='failure'&&deploy[0].steps.some((s:any)=>s.name==='Require stable preview release registrations before audits'&&s.conclusion==='failure')&&deploy[0].steps.some((s:any)=>s.name==='Verify production control remained unchanged (read-only)'&&s.conclusion==='success'),'known failed stage');
 const ci=await d.github('/actions/workflows/pr.yml/runs?head_sha='+request.sourceCommit+'&event=pull_request&status=success&per_page=10');
 check(ci.workflow_runs.some((r:any)=>r.head_sha===request.sourceCommit&&r.conclusion==='success'&&r.event==='pull_request'&&r.path==='.github/workflows/pr.yml'),'exact source ordinary CI');
 const a=await d.github('/actions/artifacts/'+RESTORE.artifact);
 check(a.name==='preview-release-predecessor-176-'+RESTORE.failedSource&&a.digest===RESTORE.artifactDigest&&!a.expired&&Date.parse(a.expires_at)>d.now()+120000&&a.workflow_run?.id===RESTORE.failedRun&&a.workflow_run.head_sha===RESTORE.failedSource,'native predecessor provenance');
 const bytes=await d.github('/actions/artifacts/'+RESTORE.artifact+'/zip',true);
 const text=archive.readArchiveFile(bytes,RESTORE.artifactDigest,'preview-worker-predecessor-anchor.json').toString('utf8');
 const anchor=JSON.parse(text);check(anchor.predecessorVersionId===RESTORE.target&&anchor.predecessorD1.databaseId===RESTORE.targetDatabase&&anchor.candidateD1.databaseId===RESTORE.candidate,'fixed predecessor anchor');
 return text as string;
}
function binding(text:string,id:string,database:string){const v=JSON.parse(text),b=v.resources?.bindings?.filter((b:any)=>b.type==='d1');check(v.id===id&&b?.length===1&&b[0].name==='THEOLOGAI_DB'&&b[0].id===database&&b[0].database_id===database,'exact immutable version binding');}
function deployment(text:string,id:string){const rows=JSON.parse(text);check(Array.isArray(rows)&&rows.length>0,'deployment shape');const sorted=[...rows].sort((a,b)=>b.created_on.localeCompare(a.created_on));check(sorted[0].id===id,'exact deployment');}
export async function restore(request:Request,d:Dependencies){
 const anchorText=await admit(request,d);
 return restoreMatchedPreview(request,d,anchorText,async()=>{check(await admit(request,d)===anchorText,'predecessor admission changed');});
}
/** Fixed assignment operation, with the production entry point supplying fresh native admission. */
export async function restoreMatchedPreview(request:Request,d:Dependencies,anchorText:string,revalidate:()=>Promise<void>){
 const anchor=JSON.parse(anchorText);
 d.record({kind:'restoration-budget',expectedCloudflareExchangesUnderFixedAssignment:17,maximumMutationCommands:1,maximumD1Reads:0,maximumD1Writes:0,retries:0});

 const read=async(args:string[])=>{const text=await d.run(args);d.record({kind:'metadata',command:args[0],sha256:sha(text)});return text;};
 const preview=()=>read(['deployments','list','--env','preview','--json']);
 const version=(id:string,preview=true)=>read(['versions','view',id,...(preview?['--env','preview']:[]),'--json']);
 const production=async()=>{const list=await read(['deployments','list','--json']);check(activeProductionVersionId(list)===RESTORE.production,'production version');deployment(list,RESTORE.productionDeployment);const view=await version(RESTORE.production,false);binding(view,RESTORE.production,RESTORE.productionDatabase);return {list,view};};
 // Write only routing config: no observability, logpush or tail-consumer fields that versions deploy would PATCH.
 d.record({kind:'routing-config',sha256:sha(ROUTING_CONFIG)});
 const before=await preview();check(activePreviewVersionId(before)===RESTORE.current,'current preview');deployment(before,RESTORE.currentDeployment);
 const current=await version(RESTORE.current);binding(current,RESTORE.current,RESTORE.candidate);
 const target=await version(RESTORE.target);binding(target,RESTORE.target,RESTORE.targetDatabase);check(sha(target)===anchor.predecessorVersionViewSha256,'immutable predecessor payload');
 const prod=await production();
 // Recheck owner/source/expiry after all observations; do not cache a former live admission.
 await revalidate();
 const freshProduction=await production();check(freshProduction.list===prod.list&&freshProduction.view===prod.view,'production changed');
 const immediate=await preview();check(immediate===before,'preview race');
 check(Date.parse(request.expiresAt)>d.now()+120000,'mutation window');
 d.record({kind:'mutation-intent',target:RESTORE.target,maximumCommands:1,maximumD1Reads:0,maximumD1Writes:0});
 let outcome='UNKNOWN';
 try{await d.run(['versions','deploy',RESTORE.target+'@100','--env','preview','--yes']);outcome='COMMAND_COMPLETED';}catch{outcome='COMMAND_FAILED_OR_UNKNOWN';}
 let journalFailed=false;
 const postRecord=(entry:unknown)=>{try{d.record(entry);}catch{journalFailed=true;}};
 postRecord({kind:'mutation-command',outcome});
 // A dispatched mutation always gets bounded readback, even if its status journal failed.
 const postRead=async(args:string[])=>{const text=await d.run(args);postRecord({kind:'post-metadata',command:args[0],sha256:sha(text)});return text;};
 const captures=await Promise.allSettled([
  (async()=>{
   const after=await postRead(['deployments','list','--env','preview','--json']);
   const roster=JSON.parse(after);
   const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)?v:null;
   postRecord({kind:'post-preview-roster',deployments:Array.isArray(roster)?roster.slice(0,100).map(r=>({id:uuid(r?.id),versions:Array.isArray(r?.versions)?r.versions.slice(0,100).map((v:any)=>({versionId:uuid(v?.version_id),percentage:typeof v?.percentage==='number'?v.percentage:null})):null})):null});
   const observed=activePreviewVersionId(after);
   // Inspect the actual active version, including an unexpected assignment; never substitute target metadata.
   const view=await postRead(['versions','view',observed,'--env','preview','--json']);
   const observation=observePreviewPostMutation({predecessorAnchorText:anchorText,postMutationDeploymentsText:after,observedActiveVersionViewText:view,wranglerConfigText:`[env.preview]\nname="theologai-preview"\n[[env.preview.d1_databases]]\nbinding="THEOLOGAI_DB"\ndatabase_name="${anchor.candidateD1.databaseName}"\ndatabase_id="${RESTORE.candidate}"\nmigrations_dir="migrations"\n`});
   postRecord({kind:'restored-assignment-observed',outcome,observation});return {after,view,observed,observation};
  })(),
  (async()=>{
   const list=await postRead(['deployments','list','--json']);const observed=activeProductionVersionId(list);
   const view=await postRead(['versions','view',observed,'--json']);
   postRecord({kind:'production-assignment-observed',version:observed,deploymentsSha256:sha(list),versionSha256:sha(view)});return {list,view};
  })(),
 ]);
 check(captures[0]?.status==='fulfilled'&&captures[1]?.status==='fulfilled','post-state capture incomplete');
 const {view,observed,observation}=captures[0].value,postProduction=captures[1].value;
 check(postProduction.list===prod.list&&postProduction.view===prod.view,'production changed after restoration');
 check(observed===RESTORE.target&&sha(view)===anchor.predecessorVersionViewSha256,'restored predecessor');binding(view,RESTORE.target,RESTORE.targetDatabase);
 check(!journalFailed,'post-mutation journal unavailable');
 check(outcome==='COMMAND_COMPLETED','command outcome requires owner reconciliation');
 return {schemaVersion:'norton-preview-restored.v1',completedAt:new Date(d.now()).toISOString(),productionUnchanged:true,expectedCloudflareExchangesUnderFixedAssignment:17,sourceCommit:request.sourceCommit,sourceTree:request.sourceTree,runId:d.runId,observation,d1Reads:0,d1Writes:0,mutationCommands:1};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [mode,requestFile,output]=process.argv.slice(2);check((mode==='admit'||mode==='restore')&&requestFile&&output&&process.argv.length===5,'exact arguments');
 const root=process.cwd(),env=process.env,request=JSON.parse(readFileSync(requestFile,'utf8'));
 let ghCalls=0,commands=0;const start=Date.now();
 const d:Dependencies={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),runId:env.GITHUB_RUN_ID!,environment:env,now:Date.now,
  record:entry=>{try{appendFileSync(output+'.events.jsonl',JSON.stringify(entry)+'\n',{mode:0o600,flush:true});}catch(error){process.stderr.write('Sanitized restoration evidence: '+JSON.stringify(entry)+'\n');throw error;}},
  github:async(route,binary)=>{check(++ghCalls<=32&&Date.now()-start<300000,'GitHub budget');const response=await fetch('https://api.github.com/repos/'+RESTORE.repo+route,{headers:{Authorization:'Bearer '+env.GITHUB_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000),redirect:binary?'follow':'error'});check(response.ok,'GitHub status');const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();check(reader,'GitHub response body');try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;check(size<=2*1024*1024,'GitHub response bound');chunks.push(value);}}finally{await reader.cancel();}const bytes=Buffer.concat(chunks);return binary?bytes:JSON.parse(bytes.toString());},
  run:async args=>{const mutation=args[1]==='deploy';check(++commands<=13&&Date.now()-start<(mutation?120000:300000),'native command/time budget');return execFileSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'--config',output+'.toml',...args,'--env-file','/dev/null'],{cwd:root,encoding:'utf8',timeout:mutation?120000:15000,maxBuffer:2*1024*1024,env:{...env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG:'log',WRANGLER_LOG_PATH:output+'.wrangler.log'}});}};
 check(env.GITHUB_TOKEN,'existing GitHub token');
 check(!env.CLOUDFLARE_API_BASE_URL&&JSON.parse(readFileSync('node_modules/wrangler/package.json','utf8')).version==='4.114.0','pinned provider routing and CLI');
 writeFileSync(output+'.events.jsonl','',{flag:'wx',mode:0o600});
 if(mode==='restore'){check(env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_ACCOUNT_ID===RESTORE.account,'existing preview credential');writeFileSync(output+'.toml',ROUTING_CONFIG,{flag:'wx',mode:0o600});}
 (mode==='restore'?restore(request,d):admit(request,d).then(()=>({admitted:true,sourceCommit:d.sourceCommit}))).then(result=>writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600})).catch(()=>{try{d.record({kind:'STOP',holdReservations:true,retry:false});}catch{}process.stderr.write('Preview restoration stopped; preserve intent and sanitized evidence. No retry.\n');process.exitCode=1;});
}
