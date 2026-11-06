import{prepareApplicationReleaseSource}from '../../helpers/applicationReleaseSource.js';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { ALL_FTS, CATALOG_SQL, canonicalTableDigest } from '../../../scripts/corpus-source-proof.js';
import { ACCOUNT, TARGETS, classifyApplicationRelease } from '../../../scripts/application-release-policy.mjs';
import { operatorApproval } from '../../../scripts/operator-corpus-proof.js';
const require=createRequire(import.meta.url);
const authority=require('../../../.github/scripts/operator-authorization.cjs');
const verifySource=require('../../../.github/scripts/verify-operator-proof-source.cjs');
const verifyProduction=require('../../../.github/scripts/verify-production-operator-authorization.cjs');
const bridge=require('../../../.github/scripts/operator-proof-bridge.cjs');
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');

describe('successor operation flow with real CLIs and bounded local SQLite transport',()=>{
  it('admits a different-branch successor, proves every phase, and independently proves the same-tree merged production',async()=>{
    const directory=mkdtempSync(join(tmpdir(),'operator-successor-flow-'));
    try {
      const root=join(directory,'source');execFileSync('git',['clone','--shared','--no-checkout',process.cwd(),root],{stdio:'pipe'});
      const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();
      git('sparse-checkout','init','--cone');git('sparse-checkout','set','scripts','release','src','data','migrations','.github');git('checkout','--detach','HEAD');prepareApplicationReleaseSource(root);
      const base=git('rev-parse','HEAD');
      for(const name of ['operator-corpus-proof.ts','application-corpus-check.ts','application-release-policy.mjs','corpus-proof-transport.ts'])copyFileSync(resolve('scripts',name),join(root,'scripts',name));
      for(const name of ['operator-authorization.cjs'])copyFileSync(resolve('.github/scripts',name),join(root,'.github/scripts',name));
      git('add','scripts','.github');git('-c','user.name=Flow fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','-m','Reviewed successor fixture');
      const previewSource=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}');
      symlinkSync(resolve('node_modules'),join(root,'node_modules'),'dir');writeFileSync(join(root,'.git/info/exclude'),'\n/node_modules\n',{flag:'a'});symlinkSync(resolve('node_modules'),join(directory,'node_modules'),'dir');
      const db=new Database(join(directory,'source.db'));
      db.exec(`CREATE TABLE documents(id INTEGER PRIMARY KEY,title TEXT);
        CREATE TABLE document_sections(id INTEGER PRIMARY KEY,document_id INTEGER REFERENCES documents(id),content TEXT);
        CREATE TABLE historical_edition_sections(id INTEGER PRIMARY KEY,content TEXT);
        CREATE TABLE historical_edition_hierarchy_bodies(id INTEGER PRIMARY KEY,content TEXT);
        CREATE VIRTUAL TABLE strongs_fts USING fts5(strongs_number,lemma,transliteration,definition);
        CREATE VIRTUAL TABLE sections_fts USING fts5(content,content='document_sections',content_rowid='id');
        CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5(content,content='historical_edition_sections',content_rowid='id');
        CREATE VIRTUAL TABLE historical_edition_hierarchy_bodies_fts USING fts5(content,content='historical_edition_hierarchy_bodies',content_rowid='id');
        INSERT INTO documents VALUES(1,'one');INSERT INTO document_sections VALUES(1,1,'one two');
        INSERT INTO historical_edition_sections VALUES(1,'one two');INSERT INTO historical_edition_hierarchy_bodies VALUES(1,'one two');
        INSERT INTO strongs_fts VALUES('G25','agape','agape','love');`);
      for(const t of ALL_FTS.slice(1))db.exec(`INSERT INTO ${t}(${t}) VALUES('rebuild')`);
      const tables=['documents','document_sections','historical_edition_sections','historical_edition_hierarchy_bodies','strongs_fts'];
      for(let n=0;n<34;n++){const t='fixture_'+String(n).padStart(2,'0');db.exec(`CREATE TABLE ${t}(id INTEGER PRIMARY KEY,value TEXT);INSERT INTO ${t} VALUES(1,'fixture')`);tables.push(t);}
      tables.sort();
      const expected={tables,catalog:db.prepare(CATALOG_SQL).all(),digests:Object.fromEntries(tables.map(t=>[t,canonicalTableDigest(db,t)])),foreignKeyWitnessSha256:'a'.repeat(64),schemaVersion:'bounded-fixture',migrationNames:['0001.sql'],quickCheckReadCeiling:5000};
      db.close();const sourceHash=sha(readFileSync(join(directory,'source.db')));
      let priorPreview:any;
      for(const phase of ['preview','production','failed-read'] as const) {
        const role=phase==='production'?'production':'preview',work=join(directory,phase);mkdirSync(work);
        if(role==='production') {
          const merge=execFileSync('git',['-c','user.name=Flow fixture','-c','user.email=fixture@example.invalid','commit-tree',tree,'-p',base,'-p',previewSource],{cwd:root,input:'Exact same-tree production merge\n',encoding:'utf8'}).trim();
          git('checkout','--detach',merge);expect(git('rev-parse','HEAD^{tree}')).toBe(priorPreview.sourceTree);
        }
        const source=classifyApplicationRelease(root);
        const plan={schemaVersion:'theologai-application-corpus-source-plan.v1',classification:source,sourceSha256:sourceHash,expected,readBudget:3510997,integrityCommands:4};
        const planText=JSON.stringify(plan),digest=sha(planText);writeFileSync(join(work,'plan.json'),planText);copyFileSync(join(directory,'source.db'),join(work,'source.db'));
        const target=join(work,'target.db');copyFileSync(join(directory,'source.db'),target);const remote=new Database(target);remote.exec("CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value BLOB);CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT,applied_at TEXT);INSERT INTO d1_migrations VALUES(1,'0001.sql','fixture')");remote.close();
        const day=new Date(Date.now()+86400000).toISOString().slice(0,10),now=Date.parse(day+'T00:05:00Z');
        const runId=role==='production'?'124':phase==='failed-read'?'125':'123',branch=role==='production'?'main':'ci/different-successor-flow';
        const a={schemaVersion:'theologai-operator-authorization.v1',scope:'new-additional-operation',repository:'TJ-Frederick/TheologAI',ownerActorId:40179660,role,pullRequestNumber:172,headBranch:branch,sourceCommit:source.sourceCommit,sourceTree:source.sourceTree,baseCommit:base,sourcePlanSha256:digest,targetRunId:runId,targetRunAttempt:1,authorizationId:'operation-flow-'+phase,ledgerId:'operation-flow-'+phase,notBefore:new Date(now-1000).toISOString(),expiresAt:new Date(now+86400000-1000).toISOString(),reservedReads:3510997,hardReadCap:3800000,diagnosticCommands:4,maxWrites:4,previousReadsSpentOrReserved:0,previousWritesSpentOrReserved:0,previousDiagnosticCommands:0,outstandingPriorReservationsAccepted:true};
        writeFileSync(join(work,'operator-authorization.json'),JSON.stringify(a));execFileSync('zip',['-q','authorization.zip','operator-authorization.json'],{cwd:work});let zip=readFileSync(join(work,'authorization.zip'));let retained=false;
        const owner={id:321,head_sha:source.sourceCommit,head_branch:branch,created_at:new Date(now).toISOString(),actor:{id:40179660},triggering_actor:{id:40179660},run_attempt:1,event:'workflow_dispatch',path:'.github/workflows/pr.yml'};
        const artifact={id:654,name:`operator-authorization-${runId}-attempt-1`,digest:'sha256:'+sha(zip),expired:false,expires_at:a.expiresAt,workflow_run:{id:321,head_sha:source.sourceCommit}},marker={...artifact,id:655,name:'operator-ledger-'+a.ledgerId};
        const targetRun={id:Number(runId),head_sha:source.sourceCommit,status:'in_progress',run_attempt:1,event:role==='preview'?'pull_request':'workflow_dispatch',path:role==='preview'?'.github/workflows/pr.yml':'.github/workflows/deploy.yml',pull_requests:[{number:172,head:{sha:source.sourceCommit},base:{sha:base}}]};
        const pr={number:172,state:'open',draft:false,merged_at:role==='production'?new Date(now).toISOString():null,merge_commit_sha:source.sourceCommit,base:{ref:'main',sha:base},head:{sha:role==='production'?previewSource:source.sourceCommit,ref:branch,repo:{full_name:a.repository}},labels:[{name:'deploy-preview'}]};
        const jobs=['Select Validation','Test & Build','Fresh Checkout & Data','Worker Runtime & D1','Node HTTP E2E','Applicable MCP Conformance','Validation Complete','Build preview Worker artifact (no cloud credentials)'].map(name=>({name,status:'completed',conclusion:'success'}));
        const context={repo:{owner:'TJ-Frederick',repo:'TheologAI'},eventName:targetRun.event,sha:source.sourceCommit,runId:Number(runId),payload:{pull_request:{number:172,head:{sha:source.sourceCommit,ref:branch}}}};
        const github={rest:{repos:{listPullRequestsAssociatedWithCommit:async()=>({data:[pr]})},pulls:{get:async()=>({data:pr})},git:{getRef:async()=>({data:{object:{sha:role==='preview'?base:source.sourceCommit}}}),getCommit:async()=>({data:{tree:{sha:tree},parents:[{sha:base}]}})},actions:{
          getWorkflowRun:async({run_id}:any)=>({data:Number(run_id)===321?owner:targetRun}),getArtifact:async()=>({data:artifact}),listArtifactsForRepo:async({name}:any)=>({data:{artifacts:retained?[name.startsWith('operator-ledger-')?marker:artifact]:[]}}),downloadArtifact:async()=>({data:zip}),
          listJobsForWorkflowRun:async({run_id}:any)=>({data:{jobs:Number(run_id)===321?[{name:'Retain operator operation authorization (no cloud credentials)',status:'completed',conclusion:'success'}]:jobs}}),listWorkflowRunArtifacts:async()=>({data:{artifacts:['corpus','worker'].map(kind=>({name:`${kind}-preview-${runId}-attempt-1`,expired:false,expires_at:a.expiresAt,workflow_run:{id:Number(runId),head_sha:source.sourceCommit},digest:'sha256:'+'f'.repeat(64)}))}})}}};
        const env={...process.env,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:a.repository,GITHUB_RUN_ID:runId,GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:role==='preview'?'refs/pull/172/merge':'refs/heads/main',GITHUB_EVENT_NAME:context.eventName,OPERATOR_SOURCE_RUN_ID:runId,OPERATOR_SOURCE_PLAN_SHA256:digest,OPERATOR_BASE_COMMIT:base,RUNNER_TEMP:work};
        const clock=vi.spyOn(Date,'now').mockReturnValue(now);
        try {
          rmSync(join(work,'operator-authorization.json'));
          await authority.uploadAuthorization({github,context:{...context,eventName:'workflow_dispatch',runId:321},core:{setOutput:vi.fn()},environment:{...env,GITHUB_ACTOR_ID:'40179660',GITHUB_REF:'refs/heads/'+branch,OPERATOR_AUTHORIZATION_JSON:JSON.stringify(a)},now});
          retained=true;rmSync(join(work,'authorization.zip'));execFileSync('zip',['-q','authorization.zip','operator-authorization.json'],{cwd:work});zip=readFileSync(join(work,'authorization.zip'));artifact.digest=marker.digest='sha256:'+sha(zip);
          if(role==='preview')await verifySource({github,context,core:{setOutput:vi.fn()},environment:env});else await verifyProduction({github,context,core:{setOutput:vi.fn()},environment:env});}finally{clock.mockRestore();}
        const p=JSON.parse(readFileSync(join(work,'operator-authorization.json'),'utf8'));expect(p.authorization).toEqual(a);
        const metadata:Record<string,unknown>={};const prefix='repos/'+a.repository;
        metadata[prefix+'/actions/runs/321']=owner;metadata[prefix+'/actions/artifacts/654']=artifact;metadata[prefix+'/actions/artifacts?name=operator-ledger-'+a.ledgerId+'&per_page=100']={artifacts:[marker]};
        metadata[prefix+'/actions/runs/'+runId]=targetRun;metadata[prefix+'/actions/runs/'+runId+'/jobs?per_page=100']={jobs:[{name:role==='preview'?'Preview operator corpus verification':'Test, Build & Deploy',status:'in_progress'}]};metadata[prefix+'/pulls/172']=pr;metadata[prefix+'/git/ref/heads/main']={object:{sha:role==='preview'?base:source.sourceCommit}};
        writeFileSync(join(work,'github.json'),JSON.stringify(metadata));mkdirSync(join(work,'bin'));
        writeFileSync(join(work,'bin/gh'),`#!${process.execPath}\nconst fs=require('node:fs');const path=process.argv[3];if(path.endsWith('/zip'))process.stdout.write(fs.readFileSync(${JSON.stringify(join(work,'authorization.zip'))}));else{const data=JSON.parse(fs.readFileSync(${JSON.stringify(join(work,'github.json'))},'utf8'));if(!data[path])process.exit(1);process.stdout.write(JSON.stringify(data[path]));}`,{mode:0o755});
        const network=join(work,'network.jsonl'),log=join(work,'transport.jsonl'),preload=join(work,'transport.mjs');
        writeFileSync(preload,`import Database from ${JSON.stringify(resolve('node_modules/better-sqlite3/lib/index.js'))};import{appendFileSync}from'node:fs';
          const N=Date;const now=Number(process.env.FIXTURE_NOW);globalThis.Date=class extends N{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};const timeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>timeout(fn,0,...args);
          const db=new Database(${JSON.stringify(target)});globalThis.fetch=async(url,options)=>{appendFileSync(${JSON.stringify(network)},'request\\n');const path=new URL(url).pathname;const body=options.body?JSON.parse(options.body):null;let value;
          if(path.endsWith('/query')){const sql=body.sql;const write=sql.startsWith('INSERT');const token=options.headers.authorization;appendFileSync(${JSON.stringify(log)},JSON.stringify({kind:write?'diagnostic':'read',credential:token.includes('integrity')?'operator':'reader'})+'\\n');if(write&&!token.includes('integrity'))throw Error('reader attempted write');if(process.env.FAIL_READ==='true'&&!write)throw Error('ambiguous read fixture');const rows=write?(db.prepare(sql).run(),[]):db.prepare(sql).all();value={success:true,errors:[],result:[{success:true,results:rows,meta:{rows_read:Math.max(rows.length,1),rows_written:write?1:0,changes:write?1:0,total_attempts:1,served_by_primary:true}}]};}
          else if(path.endsWith('/graphql'))value={data:{viewer:{accounts:[{accountTag:${JSON.stringify(ACCOUNT)},d1AnalyticsAdaptiveGroups:[{sum:{rowsRead:100,rowsWritten:0},avg:{sampleInterval:1}}]}]}}};
          else{const role=path.includes('/theologai-preview/')?'preview':'production';const binding={type:'d1',name:'THEOLOGAI_DB',id:${JSON.stringify(TARGETS)}[role].databaseId};const version=role==='preview'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222';const result=path.endsWith('/settings')?{bindings:[binding]}:path.endsWith('/deployments')?{deployments:[{id:role,versions:[{version_id:version,percentage:100}]}]}:{id:version,resources:{bindings:[binding]}};value={success:true,errors:[],result};}return Response.json(value);};`);
        const invoke=(args:string[],extra:Record<string,string>={})=>spawnSync(process.execPath,['--import','tsx','--import',preload,'scripts/operator-corpus-proof.ts',...args],{cwd:root,encoding:'utf8',timeout:45000,env:{...env,PATH:join(work,'bin')+':'+process.env.PATH,FIXTURE_NOW:String(now+1000),CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:'synthetic-reader',...extra}});
        const challenge=join(work,'challenge.json');let result=invoke(['challenge',role,work,digest,challenge]);expect(result.status,result.stderr).toBe(0);
        const c=JSON.parse(readFileSync(challenge,'utf8')),ledger=join(work,'ledger.json'),integrity=join(work,'integrity.json');
        // A package with genuine native metadata cannot authorize altered IDs or marker forks.
        const beforeNegative=readFileSync(network,'utf8');
        const markerRoute=prefix+'/actions/artifacts?name=operator-ledger-'+a.ledgerId+'&per_page=100';
        metadata[markerRoute]={artifacts:[marker,marker]};writeFileSync(join(work,'github.json'),JSON.stringify(metadata));
        expect(invoke(['init-ledger',challenge,join(work,'duplicate-marker.json')]).status).toBe(1);expect(readFileSync(network,'utf8')).toBe(beforeNegative);
        metadata[markerRoute]={artifacts:[marker]};writeFileSync(join(work,'github.json'),JSON.stringify(metadata));
        const altered=structuredClone(c);altered.authorizationId='operation-reset-fixture';altered.authorization.authorization.authorizationId=altered.authorizationId;altered.authorization.authorization.ledgerId=altered.authorizationId;altered.authorization.provenance.contentSha256=sha(JSON.stringify(altered.authorization.authorization));
        const alteredFile=join(work,'altered.json');writeFileSync(alteredFile,JSON.stringify(altered));expect(invoke(['init-ledger',alteredFile,join(work,'reset-ledger.json')]).status).toBe(1);expect(existsSync(log)).toBe(false);expect(readFileSync(network,'utf8')).toBe(beforeNegative);
        result=invoke(['init-ledger',challenge,ledger]);expect(result.status,result.stderr).toBe(0);
        const runArgs=['run',challenge,work,digest,integrity,ledger],operatorEnv={CLOUDFLARE_API_TOKEN:'synthetic-integrity',THEOLOGAI_OPERATOR_AUTH_CONFIRMED:'existing-wrangler-oauth',APPLICATION_CORPUS_PROOF_APPROVAL_JSON:JSON.stringify(operatorApproval(c)),FIXTURE_NOW:String(now+2000)};
        result=invoke(runArgs,operatorEnv);expect(result.status,result.stderr).toBe(0);
        const budget=JSON.parse(readFileSync(ledger,'utf8'));expect(budget.consumed).toBe(true);expect(budget.outstandingReservation).toEqual({reads:3510997,writes:4,diagnosticCommands:4,includesProtectedReader:true});expect(budget.diagnosticCommands).toBe(4);
        const localEnvelope=JSON.parse(readFileSync(integrity,'utf8'));const proofUpload=join(work,'upload');mkdirSync(proofUpload);
        bridge.upload({context:{...context,eventName:'workflow_dispatch'},core:{setOutput:vi.fn()},environment:{GITHUB_ACTOR_ID:'40179660',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/'+branch,RUNNER_TEMP:proofUpload,OPERATOR_PROOF_JSON:JSON.stringify(localEnvelope)},now:now+2000});
        execFileSync('zip',['-q','proof.zip','operator-proof-envelope.json'],{cwd:proofUpload});const proofZip=readFileSync(join(proofUpload,'proof.zip'));
        const proofRun={...owner,id:456,created_at:new Date(now+2000).toISOString()},proofArtifact={id:789,name:bridge.artifactName(c),digest:'sha256:'+sha(proofZip),expired:false,expires_at:a.expiresAt,workflow_run:{id:456,head_sha:source.sourceCommit}};
        const originalArtifacts=github.rest.actions.listWorkflowRunArtifacts,originalJobs=github.rest.actions.listJobsForWorkflowRun;
        Object.assign(github.rest.actions,{listWorkflowRuns:async()=>({data:{workflow_runs:[proofRun]}}),
          listWorkflowRunArtifacts:async({run_id}:any)=>Number(run_id)===456?{data:{artifacts:[proofArtifact]}}:originalArtifacts(),
          listJobsForWorkflowRun:async({run_id}:any)=>Number(run_id)===456?{data:{jobs:[{name:'Retain operator corpus proof (no cloud credentials)',status:'completed',conclusion:'success'}]}}:originalJobs({run_id})});
        const found=await bridge.find({github,challenge:c,now:now+2000});expect(found).toMatchObject({runId:456,artifactId:789,digest:proofArtifact.digest});
        // Simulate only the hosted download boundary: exact native ZIP bytes/roster stay local.
        expect('sha256:'+sha(proofZip)).toBe(found.digest);expect(execFileSync('unzip',['-Z1',join(proofUpload,'proof.zip')],{encoding:'utf8'}).trim()).toBe('operator-proof-envelope.json');
        expect(invoke(['run',challenge,work,digest,join(work,'replay.json'),ledger],operatorEnv).status).toBe(1);expect(readFileSync(log,'utf8').trim().split('\n')).toHaveLength(4);
        // A cancelled/missing protected phase leaves the whole reservation outstanding.
        expect(existsSync(join(work,'complete.json'))).toBe(false);expect(JSON.parse(readFileSync(ledger,'utf8')).outstandingReservation.reads).toBe(3510997);
        const complete=join(work,'complete.json');result=invoke(['complete',challenge,join(proofUpload,'operator-proof-envelope.json'),work,digest,complete],{FIXTURE_NOW:String(now+3000),...(phase==='failed-read'?{FAIL_READ:'true'}:{})});
        if(phase==='failed-read') {
          expect(result.status).toBe(1);const costs=JSON.parse(readFileSync(complete+'.budget.json','utf8'));expect(costs.reader.readsSpentOrReserved).toBeGreaterThanOrEqual(4096);expect(costs.integrity.cumulativeDiagnosticCommands).toBe(4);expect(JSON.parse(readFileSync(ledger,'utf8')).outstandingReservation.reads).toBe(3510997);continue;
        }
        expect(result.status,result.stderr).toBe(0);const receipt=JSON.parse(readFileSync(complete,'utf8'));expect(Object.keys(receipt.proof.tables)).toHaveLength(39);expect(receipt.metering.integrityCommands).toBe(4);expect(receipt.metering.rowsWritten).toBe(4);
        const accepted=join(work,'accepted.json');result=invoke(['accept',challenge,join(work,'operator-proof-envelope.json'),work,digest,accepted],{FIXTURE_NOW:String(now+4000)});expect(result.status,result.stderr).toBe(0);expect(JSON.parse(readFileSync(accepted,'utf8'))).toEqual(receipt);
        const calls=readFileSync(log,'utf8').trim().split('\n').map(s=>JSON.parse(s));expect(calls.filter(v=>v.kind==='diagnostic')).toHaveLength(4);expect(calls.filter(v=>v.kind==='read').every(v=>v.credential==='reader')).toBe(true);
        if(role==='preview')priorPreview=receipt;else{expect(receipt.sourceTree).toBe(priorPreview.sourceTree);expect(receipt.sourceCommit).not.toBe(priorPreview.sourceCommit);expect(c.authorization.authorization.role).toBe('production');}
      }
    } finally {rmSync(directory,{recursive:true,force:true});}
  },120000);
});
