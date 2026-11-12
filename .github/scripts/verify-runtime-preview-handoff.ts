/** Exact split native preview acceptance prerequisite. Not fresh proof or production authority. */
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import Database from 'better-sqlite3';
import {requireOperatorChallenge} from '../../scripts/operator-corpus-proof.js';
import {POLICY} from '../../scripts/norton-aquinas-release-policy.mjs';
import {classifyApplicationRelease} from '../../scripts/norton-aquinas-release-policy.mjs';
import {EXISTING,CONTINUITY_QUERIES,NATIVE_ARTIFACTS,verifyHistoricalCandidate} from './validate-existing-norton-preview.js';
import {REUSE,requireReuseApproval} from './preview-runtime-reuse.js';
import {SOURCE_RECOVERY,verifyRecoveredNortonInputs,verifyRehearsalInputWitness} from './reconstruct-norton-source.js';
import {verifyRetainedInputEvidence} from './retained-norton-inputs.js';
const {PINS,requireToolingOnlySource,verifyNativeArchive}=createRequire(import.meta.url)('./runtime-preview-handoff.cjs');
function check(value:unknown,reason:string):asserts value{if(!value)throw Error('Runtime preview handoff refused: '+reason);}
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const hash=(value:unknown)=>sha(JSON.stringify(value));
const same=(a:unknown,b:unknown,reason:string)=>check(hash(a)===hash(b),reason);
function file(path:string,max=1024*1024){const s=lstatSync(path);check(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max,'bounded regular evidence');return readFileSync(path);}
const json=(path:string,max?:number)=>JSON.parse(file(path,max).toString());
export function materializeRuntimePreviewArchives(directory:string,binding:any,now=Date.now()){
 check(binding.kind==='norton-runtime-preview','split native purpose');
 const materialized=join(directory,'verified-native');mkdirSync(materialized,{mode:0o700});
 for(const key of ['result','inputs','request']){
  const pin=PINS[key],a=binding.artifacts[key],zip=join(directory,key+'.zip');check(a.id===pin.id&&a.digest===pin.digest&&Date.parse(a.expiresAt)>now,'native archive retained at gate');
  verifyNativeArchive(key,file(zip,pin.maxBytes),a,now);
  // Inspect every entry before extraction; never create links or overwrite evidence.
  const script=`import sys,zipfile,pathlib,stat,json
archive,destination=sys.argv[1:]; root=pathlib.Path(destination)
with zipfile.ZipFile(archive) as z:
 infos=z.infolist(); assert 0<len(infos)<=200
 names=set(); total=0
 for i in infos:
  parts=pathlib.PurePosixPath(i.filename).parts
  assert parts and not i.filename.startswith('/') and not '\\\\' in i.filename and all(p not in ('.','..') for p in parts)
  assert i.filename not in names; names.add(i.filename)
  mode=(i.external_attr>>16)&0xffff; assert stat.S_IFMT(mode) in (0,stat.S_IFREG,stat.S_IFDIR)
  assert 0<=i.file_size<=(384*1024*1024 if i.filename=='source/source.db' else 16*1024*1024)
  total+=i.file_size; assert total<=450*1024*1024
 root.mkdir(mode=0o700)
 for i in infos:
  path=root.joinpath(*pathlib.PurePosixPath(i.filename).parts)
  if i.is_dir(): path.mkdir(parents=True,exist_ok=True); continue
  path.parent.mkdir(parents=True,exist_ok=True)
  with z.open(i) as source,open(path,'xb') as target:
   while True:
    chunk=source.read(1024*1024)
    if not chunk: break
    target.write(chunk)
print(json.dumps({'files':len(infos),'uncompressedBytes':total}))`;
  execFileSync('python3',['-c',script,zip,join(materialized,key)],{timeout:120000,maxBuffer:4096});
 }
 return materialized;
}
export function verifyRuntimePreviewHandoff(input:{root:string;directory:string;candidateRoot:string;binding:any;now?:number}){
 const now=input.now??Date.now(),b=input.binding;check(b?.originalMerge===PINS.originalMerge&&(b.mergeCommit===PINS.originalMerge?b.consumerPullRequest===PINS.pr:[PINS.successorPR,PINS.preparationPR].includes(b.consumerPullRequest)),'pinned original and successor consumer');check(b?.kind==='norton-runtime-preview'&&b.repository===PINS.repository&&b.pullRequest===176&&b.run?.id===PINS.run&&b.run.attempt===1&&b.run.event==='pull_request'&&b.producer?.id===PINS.producer&&b.producer.attempt===1&&b.producer.event==='workflow_dispatch'&&b.producer.actor===PINS.owner&&b.producer.triggeringActor===PINS.owner,'exact split native run purpose');
 same(b.acceptedSource,{commit:PINS.source,tree:PINS.tree},'accepted source pins');
 const classification=classifyApplicationRelease(input.root);check(classification.sourceCommit===b.mergeCommit&&classification.sourceTree===b.mergeTree,'clean reviewed consumer source');
 const source=requireToolingOnlySource(input.root,b),directory=materializeRuntimePreviewArchives(input.directory,b,now),result=join(directory,'result'),inputs=join(directory,'inputs');
 const r=json(join(result,'runtime-reuse-receipt.json')),live=json(join(result,'corpus-live.json')),edge=json(join(result,'edge.json')),request=json(join(directory,'request/runtime-reuse-request.json'));
 check(r.schemaVersion==='norton-preview-runtime-reuse-receipt.v1'&&r.purpose==='preview-only-historical-corpus-new-runtime'&&r.freshProof===false&&r.productionAuthorized===false,'historical preview acceptance only');same(r.source,b.acceptedSource,'receipt accepted source');
 const completed=Date.parse(r.completedAt);check(Number.isFinite(completed)&&completed<=now&&now-completed<=7*86400000,'preview acceptance freshness');
 same(request,r.authority,'actual owner request bytes');same(json(join(inputs,'runtime-reuse-request.json')),request,'prepared owner request');requireReuseApproval(request,b.acceptedSource,completed);
 check(request.operationId==='operation-runtime-reuse-20261111-6c43cbc-once'&&request.targetRunId===String(PINS.run)&&request.targetRunAttempt===1&&r.operationId===request.operationId,'one approved preview operation');
 check(r.owner?.mode==='runtime-reuse'&&r.owner.admission?.runId===String(PINS.producer)&&r.owner.admission.ownerActorId===PINS.owner&&r.owner.admission.operationId===r.operationId&&r.owner.inputs?.id===PINS.inputs.id&&r.owner.inputs.runId===PINS.producer&&r.owner.inputs.digest===PINS.inputs.digest&&r.owner.request?.id===PINS.request.id&&r.owner.request.digest===PINS.request.digest,'receipt split producer and native artifacts');same(r.owner.source,b.acceptedSource,'owner accepted source');same(r.owner.approval,request,'owner authority');same(json(join(inputs,'runtime-reuse-admission.json')),r.owner.admission,'prepared native admission');
 const historical=verifyHistoricalCandidate(inputs,input.candidateRoot),capture=verifyRecoveredNortonInputs(input.root,inputs),rehearsal=verifyRehearsalInputWitness(inputs,{commit:REUSE.originalInputSource,tree:REUSE.originalInputTree}),prepared=json(join(inputs,'runtime-reuse-inputs.json'));
 same(prepared.source,b.acceptedSource,'native prepared source');same(prepared.sourceRecovery,capture,'original recovered capture');same(prepared.rehearsal,rehearsal,'original retained rehearsal');
 const custody=json(join(inputs,'recovery-original-equivalence.json')).admission.retainedInputs;verifyRetainedInputEvidence(inputs,custody,NATIVE_ARTIFACTS,EXISTING.run,EXISTING.sourceCommit,Date.parse(SOURCE_RECOVERY.capturedAt));
 check(prepared.schemaVersion==='norton-preview-runtime-reuse-inputs.v1'&&prepared.originalProofSha256===EXISTING.proofSha256&&prepared.sourceDatabaseSha256===EXISTING.databaseSha256&&prepared.freshProof===false&&prepared.candidatePlan.sourceSha256===EXISTING.databaseSha256,'original complete proof, never partial replacement');same(prepared.candidatePlan.expected,historical.plan.expected,'same complete corpus expectations');
 check(r.historicalProof?.sha256===EXISTING.proofSha256&&r.historicalProof.completedAt===EXISTING.proofCompletedAt&&r.historicalProof.expiresAt===PINS.historicalExpiry&&r.historicalProof.sourceDatabaseSha256===EXISTING.databaseSha256&&r.historicalProof.custodyRiskAccepted===true&&r.historicalProof.partialNovember10ProofUsed===false&&completed<Date.parse(PINS.historicalExpiry),'historical proof valid at acceptance, not renewed');
 const bundle=join(inputs,'candidate-bundle'),manifestBytes=file(join(bundle,'release-manifest.json')),manifest=JSON.parse(manifestBytes.toString());check(sha(manifestBytes)===PINS.manifestSha256&&prepared.manifestSha256===PINS.manifestSha256&&r.newRuntime?.manifestSha256===PINS.manifestSha256&&r.newRuntime.workerSha256===PINS.workerSha256&&prepared.workerSha256===PINS.workerSha256,'accepted native Worker manifest');
 check(manifest.sourceCommit===PINS.source&&manifest.sourceTree===PINS.tree&&manifest.target==='preview'&&manifest.schemaVersion==='theologai-worker-artifact.v1'&&manifest.configSha256===sha(file(join(input.root,'wrangler.toml')))&&manifest.lockSha256===sha(file(join(input.root,'package-lock.json'))),'source-bound compiled input manifest');
 for(const name of ['worker.js','worker.js.map'])check(sha(file(join(bundle,name),16*1024*1024))===manifest.files[name],'compiled native Worker bytes');check(manifest.files['worker.js']===PINS.workerSha256,'accepted compiled Worker');
 check(live.schemaVersion==='norton-aquinas-live.v1'&&live.role==='preview'&&live.endpoint==='https://preview-mcp.theologai.xyz/mcp'&&live.serverVersion===json(join(input.root,'package.json')).version+'-preview'&&live.productProfile==='7'&&live.broaderV9Features===false&&live.sourceBodyOutput===false&&!Object.hasOwn(live,'failure')&&live.durationMs>=0&&live.durationMs<=600000&&live.aggregateResponseBytes<=16*1024*1024,'complete bounded native live acceptance');
 same(live.protocols,['2025-11-25','2026-07-28'],'both accepted protocols');check(live.checks.length===370&&r.checks===370,'all370 accepted checks');
 for(const era of live.protocols){const checks=live.checks.filter((c:any)=>c.era===era);check(checks.length===185&&new Set(checks.map((c:any)=>c.id)).size===185&&checks.every((c:any)=>c.passed===true&&c.role==='preview'&&/^[a-f0-9]{64}$/.test(c.responseSha256)),'unique passing protocol checks');const summary=live.summaries.find((s:any)=>s.era===era);check(summary?.checks===185&&summary.httpExchanges<=200,'bounded protocol exchanges');}
 same(live.checks.filter((c:any)=>c.era===live.protocols[0]).map((c:any)=>c.id),live.checks.filter((c:any)=>c.era===live.protocols[1]).map((c:any)=>c.id),'complete matching protocol inventories');same(live.fingerprints[0],live.fingerprints[1],'dual-era contract parity');
 check(live.databaseSha256===EXISTING.databaseSha256&&live.manifestSha256===sha(file(join(input.root,'data/data-manifest.json')))&&live.fixtureSha256===hash(['historical-core-preview-audit','historical-spine-preview-audit','original-language-v2-preview-audit'].map(n=>json(join(input.root,'test/fixtures/'+n+'.json'))))&&r.liveSha256===hash(live),'native live source and report hashes');
 check(edge.passed===true&&edge.audit==='primary-source-edge-stabilization-preview'&&edge.endpointClass==='preview-custom'&&r.edgeSha256===hash(edge),'native edge acceptance');
 const expectedProduction={role:'production',deploymentId:EXISTING.productionDeployment,versionId:EXISTING.productionWorker,databaseId:EXISTING.productionDatabase,versionSha256:'d21f0359e612ba3aa85651dec30a7dc0d943023f33244acf6b1ef8febf86068b'},expectedPreview={role:'preview',deploymentId:PINS.deployment,versionId:PINS.worker,databaseId:PINS.database,versionSha256:PINS.versionSha256};
 same(r.after,[expectedProduction,expectedPreview],'immutable accepted live assignments');same(r.before[0],expectedProduction,'production unchanged at preview acceptance');check(r.before[1].databaseId===PINS.database&&r.newRuntime.identity.deployedVersionId===PINS.worker&&r.newRuntime.identity.deploymentId===PINS.deployment,'same database and accepted sole new runtime');same(r.newRuntime.identity.addedVersionIds,[PINS.worker],'one accepted deployed runtime');
 const events=file(join(result,'runtime-reuse.events.jsonl'),4*1024*1024).toString().trim().split('\n').map(line=>JSON.parse(line));check(!events.some(e=>e.kind==='STOP')&&events.at(-1)?.kind==='runtime-reuse-complete'&&events.at(-1).receiptSha256===hash(r),'native terminal completion, no STOP');
 const db=new Database(join(inputs,'source/source.db'),{readonly:true,fileMustExist:true});let reads=0;
 try{for(const phase of ['before','after'])for(const q of CONTINUITY_QUERIES){const matches=events.filter(e=>e.kind==='select-result'&&e.phase===phase&&e.label===q.label),intents=events.filter(e=>e.kind==='select-intent'&&e.phase===phase&&e.label===q.label);check(matches.length===1&&intents.length===1&&intents[0].sqlSha256===sha(q.sql)&&intents[0].writeCeiling===0,'eight exact continuity intents/results');const e=matches[0],expected=q.label==='schema'?historical.envelope.receipt.proof.catalogSha256:q.label==='ledger'?historical.envelope.receipt.proof.ledgerSha256:hash(db.prepare(q.sql).all());check(e.rowsWritten===0&&Number.isSafeInteger(e.rowsRead)&&e.rowsRead>=0&&e.rowsRead<=q.ceiling&&e.responseSha256===expected,'unchanged read-only corpus witnesses');reads+=e.rowsRead;}}finally{db.close();}
 check(reads===r.metering.continuityRowsRead&&r.metering.continuityRequests===8&&r.metering.rowsWritten===0&&r.metering.newIntegrityWrites===0&&r.metering.mutationCommands===1&&r.metering.newReadReservation===100000&&r.metering.liveReadsReserved===90000&&r.metering.controlReadsReserved===10000&&r.metering.edgeExchanges<=24&&r.metering.auditExchanges<=400&&r.metering.retries===0&&r.metering.preciseHostedLiveBillingUnavailable===true,'native operation bounds, no individual billing claim');
 return{kind:'norton-runtime-preview-acceptance',...source,previewAcceptedAt:r.completedAt,nativePreviewRun:PINS.run,nativeOwnerProducerRun:PINS.producer,checks:370,freshPreviewProof:false,productionAuthorized:false,historicalProofValidAtAcceptance:true,historicalProofAuthorityExtended:false,expectedLiveControls:[expectedProduction,expectedPreview],receiptSha256:hash(r),hostedReadAttributionUnresolved:true};
}
/** Reuse captured controls without another provider read; check authority at mutation time. */
export function requireRuntimeProductionBoundary(input:{production:any;preview:any;challenge:unknown;sourceCommit:string;sourceTree:string;runId:string;now?:number}){
 const now=input.now??Date.now(),c=requireOperatorChallenge(input.challenge,now),p=input.production,v=input.preview;
 check(Date.parse(c.expiresAt)-now>=15*60000,'activation needs full live/control time reserve');
 check(c.role==='production'&&c.releasePolicy===POLICY.policy&&c.sourceCommit===input.sourceCommit&&c.sourceTree===input.sourceTree&&c.runId===input.runId,'current production source/run authority at mutation boundary');
 check(p.schemaVersion===3&&p.worker==='theologai'&&p.predecessorVersionId===POLICY.predecessors.production.versionId&&p.predecessorDeploymentId===POLICY.predecessors.production.deploymentId&&p.predecessorD1?.binding==='THEOLOGAI_DB'&&p.predecessorD1.databaseId===POLICY.rollback.databaseId&&p.candidateD1?.binding==='THEOLOGAI_DB'&&p.candidateD1.databaseId===POLICY.targets.production.databaseId&&p.candidateD1.databaseName===POLICY.targets.production.databaseName&&p.d1Changed===true,'approved production predecessor and distinct candidate at mutation boundary');
 check(v.schemaVersion===1&&v.worker==='theologai-preview'&&v.workerVersionId===POLICY.predecessors.preview.versionId&&v.deploymentId===POLICY.predecessors.preview.deploymentId&&v.d1?.binding==='THEOLOGAI_DB'&&v.d1.databaseId===POLICY.targets.preview.databaseId&&v.configuredD1?.binding==='THEOLOGAI_DB'&&v.configuredD1.databaseId===POLICY.targets.preview.databaseId&&v.configuredD1.databaseName===POLICY.targets.preview.databaseName,'accepted preview control at mutation boundary');
 return{kind:'norton-runtime-production-mutation-boundary',sourceCommit:c.sourceCommit,sourceTree:c.sourceTree,runId:c.runId,challengeExpiresAt:c.expiresAt,checkedAt:new Date(now).toISOString(),additionalProviderCalls:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{
 const args=process.argv.slice(2);let result;
 if(args[0]==='boundary'){
  const[,production,preview,challenge,...extra]=args;check(production&&preview&&challenge&&!extra.length,'exact mutation boundary arguments');
  check(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY===PINS.repository&&process.env.GITHUB_RUN_ATTEMPT==='1'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.GITHUB_REF==='refs/heads/main','protected production mutation context');
  const git=(ref:string)=>execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim();
  result=requireRuntimeProductionBoundary({production:json(production),preview:json(preview),challenge:json(challenge),sourceCommit:git('HEAD'),sourceTree:git('HEAD^{tree}'),runId:process.env.GITHUB_RUN_ID!});
 }else{const[binding,directory,candidateRoot,...extra]=args;check(binding&&directory&&candidateRoot&&!extra.length,'exact verification arguments');result=verifyRuntimePreviewHandoff({root:process.cwd(),directory:resolve(directory),candidateRoot:resolve(candidateRoot),binding:json(binding)});}
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){process.stderr.write(error instanceof Error?error.message+'\n':'Runtime preview handoff refused\n');process.exitCode=1;}}
