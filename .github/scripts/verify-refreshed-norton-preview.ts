/** Consumer of the separate one-time, native live/identity preview gate. */
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {classifyApplicationRelease} from '../../scripts/norton-aquinas-release-policy.mjs';
import {canonicalJson} from '../../scripts/audit-historical-core-preview.js';
import {REFRESH,verifyRefreshReceipt} from './refresh-norton-preview.js';
import {requireRuntimeProductionBoundary} from './verify-runtime-preview-handoff.js';
const native=createRequire(import.meta.url)('./refreshed-preview-handoff.cjs');
function check(v:unknown,s:string):asserts v{if(!v)throw Error('Fresh preview archive refused: '+s);}
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
function file(path:string,max:number){const s=lstatSync(path);check(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max,'bounded regular file');return readFileSync(path);}
export function verifyRefreshedPreviewArchive(input:{root:string;directory:string;binding:any;now?:number}){
 const now=input.now??Date.now(),b=input.binding,a=b?.artifact;
 check(b?.kind===native.KIND&&b.repository==='TJ-Frederick/TheologAI'&&b.consumerPullRequest===182&&b.run?.attempt===1&&b.run.event==='pull_request'&&b.run.actor===40179660&&b.run.triggeringActor===40179660&&a.runId===b.run.id&&a.name===`preview-live-refresh-${b.run.id}-attempt-1`&&Date.parse(a.expiresAt)>now&&now<Date.parse(REFRESH.cutoff),'exact one-time native purpose and retention');
 const source=classifyApplicationRelease(input.root);check(source.sourceCommit===b.mergeCommit&&source.sourceTree===b.mergeTree,'clean reviewed production source');
 const git=(...args:string[])=>execFileSync('git',args,{cwd:input.root,encoding:'utf8'}).trim();
 check(git('rev-parse','HEAD^1')===native.BASE&&git('rev-parse','HEAD^2')===b.acceptedSource.commit&&git('rev-parse',b.acceptedSource.commit+'^{tree}')===b.mergeTree,'identical reviewed source tree and merge');
 const bytes=file(join(input.directory,'refresh.zip'),8*1024*1024);check(bytes.length===a.bytes&&'sha256:'+sha(bytes)===a.digest,'native result digest');
 const destination=join(input.directory,'verified-refresh');mkdirSync(destination,{mode:0o700});
 const script=`import sys,zipfile,pathlib,stat,json
archive,root,names=sys.argv[1:]; root=pathlib.Path(root); expected=set(json.loads(names))
with zipfile.ZipFile(archive) as z:
 infos=z.infolist(); assert len(infos)==len(expected) and {i.filename for i in infos}==expected
 total=0
 for i in infos:
  assert '/' not in i.filename and '\\\\' not in i.filename
  assert stat.S_IFMT((i.external_attr>>16)&65535) in (0,stat.S_IFREG)
  assert 0<i.file_size<=(8*1024*1024 if i.filename=='worker.js' else 2*1024*1024)
  total+=i.file_size; assert total<=16*1024*1024
 for i in infos:
  with z.open(i) as src,open(root/i.filename,'xb') as dst:
   while True:
    chunk=src.read(1024*1024)
    if not chunk: break
    dst.write(chunk)`;
 execFileSync('python3',['-c',script,join(input.directory,'refresh.zip'),destination,JSON.stringify(native.FILES)],{timeout:30000,stdio:'pipe'});
 const json=(name:string,max=1024*1024)=>JSON.parse(file(join(destination,name),max).toString());
 const receipt=json('refresh-receipt.json'),request=json('refresh-request.json',65536),template=json('refresh-template.json',65536),live=json('corpus-live.json'),edge=json('edge.json');
 check(template.targetRunId===String(b.run.id)&&canonicalJson(template)===canonicalJson(request),'unchanged exact owner request for protected PR target');
 check(b.owner?.event==='workflow_dispatch'&&b.owner.attempt===1&&b.owner.actor===40179660&&b.owner.triggeringActor===40179660&&Number.isSafeInteger(b.owner.runId)&&b.owner.runId!==b.run.id,'distinct authenticated owner input creator');
 const ownerRequest=createRequire(import.meta.url)('./operator-authorization.cjs').readArchiveFile(file(join(input.directory,'request.zip'),128*1024),b.request.digest,'refresh-request.json');
 check(b.request.name===`norton-preview-live-refresh-request-${b.run.id}-attempt-1`&&b.request.runId===b.owner.runId&&Date.parse(b.request.expiresAt)>now&&canonicalJson(JSON.parse(ownerRequest.toString()))===canonicalJson(request),'native owner input for the exact PR target');
 const ledger=createRequire(import.meta.url)('./operator-authorization.cjs').readArchiveFile(file(join(input.directory,'ledger.zip'),128*1024),b.ledger.digest,'refresh-request.json');
 check(b.ledger.name==='norton-preview-live-refresh-ledger-'+request.operationId&&b.ledger.runId===b.owner.runId&&Date.parse(b.ledger.expiresAt)>now&&canonicalJson(JSON.parse(ledger.toString()))===canonicalJson(request),'exact reserved owner operation');
 check(canonicalJson(request)===canonicalJson(receipt.authority)&&request.targetRunId===String(b.run.id)&&receipt.owner.runId===String(b.run.id),'same native owner request and run');
 check(sha(file(join(destination,'worker.js'),8*1024*1024))===REFRESH.workerSha256,'accepted compiled Worker bytes');
 const inventory=JSON.parse(readFileSync(join(input.root,'test/fixtures/norton-preview-live-refresh-checks.json'),'utf8'));
 verifyRefreshReceipt(receipt,{source:b.acceptedSource,inventory,live,edge,now});
 const events=file(join(destination,'refresh.events.jsonl'),2*1024*1024).toString().trim().split('\n').map(s=>JSON.parse(s));
 check(events.at(-1)?.kind==='refresh-complete'&&events.at(-1).receiptSha256===sha(JSON.stringify(receipt))&&!events.some(e=>e.kind==='STOP'),'definitive successful native receipt');
 return{kind:'norton-preview-live-refresh-acceptance',consumerSource:source,producerSource:b.acceptedSource,nativePreviewRun:b.run.id,nativeArtifactId:a.id,nativeArtifactDigest:a.digest,previewAcceptedAt:receipt.completedAt,checks:370,freshPreviewProof:false,previewRowsReproven:false,historicalProofAuthorityExtended:false,productionAuthorized:false,expectedLiveControls:[REFRESH.production,REFRESH.preview],receiptSha256:sha(JSON.stringify(receipt)),hostedReadAttributionUnresolved:true};
}
export function requireFreshProductionDeadline(challenge:any,now=Date.now()){
 check(now<Date.parse(REFRESH.cutoff)&&Number.isFinite(Date.parse(challenge?.authorization?.authorization?.expiresAt))&&Date.parse(challenge.authorization.authorization.expiresAt)<=Date.parse(REFRESH.cutoff),'one-time production owner deadline');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2);let value;
  if(args[0]==='boundary'){
   const[,production,preview,challenge,...extra]=args;check(production&&preview&&challenge&&!extra.length,'exact mutation arguments');
   check(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='TJ-Frederick/TheologAI'&&process.env.GITHUB_RUN_ATTEMPT==='1'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.GITHUB_REF==='refs/heads/main','protected production mutation context');
   const json=(path:string)=>JSON.parse(readFileSync(path,'utf8')),c=json(challenge);requireFreshProductionDeadline(c);
   const git=(ref:string)=>execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim();
   value=requireRuntimeProductionBoundary({production:json(production),preview:json(preview),challenge:c,sourceCommit:git('HEAD'),sourceTree:git('HEAD^{tree}'),runId:process.env.GITHUB_RUN_ID!});
  }else{
   const[binding,directory,...extra]=args;check(binding&&directory&&!extra.length,'BINDING DIRECTORY');value=verifyRefreshedPreviewArchive({root:process.cwd(),directory:resolve(directory),binding:JSON.parse(readFileSync(resolve(binding),'utf8'))});
  }
  process.stdout.write(JSON.stringify(value)+'\n');
 }catch{process.stderr.write('Fresh preview archive or mutation boundary refused.\n');process.exitCode=1;}
}
