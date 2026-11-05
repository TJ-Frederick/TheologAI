/** Corpus-only live profile inside the existing protected release. No deployment or credential discovery. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {POLICY,TARGETS,classifyApplicationRelease,verifyFreshCorpusReceipt} from './norton-aquinas-release-policy.mjs';
import {requireOperatorChallenge} from './operator-corpus-proof.js';
import {CorpusProofTransport} from './corpus-proof-transport.js';
import {captureCorpusUsage} from './corpus-release-control.js';
import {createCorpusApi} from './corpus-release-api.js';
import {auditCorpusRelease} from './audit-corpus-release.js';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
function check(v:unknown,message:string):asserts v {if(!v)throw Error('Corpus live refused: '+message);}
const json=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
export async function runCorpusLive(input:{role:'preview'|'production';sourceDirectory:string;planSha256:string;challengeFile:string;receiptFile:string;cutoverFile:string;outputDirectory:string;token:string;fetch?:typeof fetch}){
 const classification=classifyApplicationRelease(process.cwd());
 const planText=readFileSync(join(input.sourceDirectory,'plan.json'));check(sha(planText)===input.planSha256,'source plan hash');
 const plan=JSON.parse(planText.toString()),challenge=requireOperatorChallenge(json(input.challengeFile));
 check(JSON.stringify(plan.classification)===JSON.stringify(classification)&&challenge.releasePolicy===POLICY.policy&&challenge.liveControlReserve===100000&&challenge.role===input.role&&challenge.sourceCommit===classification.sourceCommit&&challenge.sourceTree===classification.sourceTree&&challenge.sourcePlanSha256===input.planSha256,'source policy/role');
 check(sha(readFileSync(join(input.sourceDirectory,'source.db')))===plan.sourceSha256,'source database hash');
 const receipt=json(input.receiptFile);verifyFreshCorpusReceipt(receipt,{role:input.role,sourceCommit:classification.sourceCommit,sourceTree:classification.sourceTree,sourcePlanSha256:input.planSha256,tables:plan.expected.digests,foreignKeyWitnessSha256:plan.expected.foreignKeyWitnessSha256});
 check(receipt.proof.ledgerSha256===challenge.authorization.authorization.expectedLedgerSha256,'approved original ledger witness');
 const cutover=json(input.cutoverFile);check(cutover.candidateBindingMatches===true&&cutover.candidateD1.databaseId===TARGETS[input.role].databaseId,'audited cutover target');
 const output=join(input.outputDirectory,'corpus-live.json'),events=output+'.events.jsonl';
 const event=(value:unknown)=>appendFileSync(events,JSON.stringify(value)+'\n',{mode:0o600,flush:true});
 // A partial/failed live attempt retains the whole reservation; output paths are create-only.
 const observer=new CorpusProofTransport({policy:POLICY.policy,role:input.role,token:input.token,readBudget:0,eventFile:events,activated:true,fetch:input.fetch,historicalExceptions:false});
 const before=await observer.observeControls() as any[];
 const active=before.find(v=>v.role===input.role);check(active?.deploymentId===cutover.observedActiveDeploymentId&&active?.versionId===cutover.observedActiveVersionId,'cutover assignment changed');
 const api=createCorpusApi(input.role,async()=>input.token,input.fetch,event);
 const usage=await captureCorpusUsage({role:input.role,api});
 const effective=Math.max(usage.candidate.rowsRead+usage.otherDatabases.rowsRead,challenge.admission.rowsRead+receipt.metering.rowsRead);
 check(effective+POLICY.liveReads+POLICY.controlReads+200000<=4000000,'whole live/control reservation and uncertainty margin');
 event({kind:'live-admitted',releasePolicy:POLICY.policy,liveReads:POLICY.liveReads,controlReads:POLICY.controlReads,effectiveAccountReads:effective,uncertaintyMargin:200000,challengeNonce:challenge.nonce});
 event({kind:'live-intent',reservedReads:POLICY.liveReads,stopOnUnknown:true});
 const live=await auditCorpusRelease({role:input.role,root:process.cwd(),databasePath:join(input.sourceDirectory,'source.db'),endpoint:input.role==='preview'?'https://preview-mcp.theologai.xyz/mcp':'https://mcp.theologai.xyz/mcp',serverVersion:JSON.parse(readFileSync('package.json','utf8')).version+(input.role==='preview'?'-preview':''),fetch:input.fetch??fetch,guard:()=>{requireOperatorChallenge(challenge);}});
 if(Object.hasOwn(live,'failure')){
  const text=JSON.stringify(live,null,2)+'\n';let retained=false;
  try{check(Buffer.byteLength(text)<=512*1024,'bounded sanitized failure report');writeFileSync(output,text,{flag:'wx',mode:0o600});retained=true;}catch{}
  try{event({kind:'live-failed',reportSha256:sha(text),reportRetained:retained,reservedReadsRetained:POLICY.liveReads,retry:false});}catch{try{process.stderr.write('Corpus live audit failed; report or journal retention unavailable. No retry.\n');}catch{}}
  check(false,'live audit failure');
 }
 const after=await observer.observeControls();check(JSON.stringify(after)===JSON.stringify(before),'live assignments changed');
 const finalUsage=await captureCorpusUsage({role:input.role,api});
 // Adaptive analytics has no ingestion watermark: a delta can include the earlier full proof.
 // Retain the whole live charge; never present a delayed counter delta as precise per-suite metering.
 const finalAccountReads=Math.max(finalUsage.candidate.rowsRead+finalUsage.otherDatabases.rowsRead,effective+POLICY.liveReads);
 check(finalAccountReads+POLICY.controlReads+200000<=4000000,'final account headroom exceeded');
 check(finalUsage.candidate.rowsWritten+finalUsage.otherDatabases.rowsWritten<=80000,'final account write ceiling exceeded');
 requireOperatorChallenge(challenge);
 event({kind:'live-complete',sha256:sha(JSON.stringify(live)),reservedReadsRetained:POLICY.liveReads,precisePerSuiteMeteringUnavailable:true,usageBefore:usage,usageObservation:finalUsage,ingestionWatermarkUnavailable:true});
 writeFileSync(output,JSON.stringify(live,null,2)+'\n',{flag:'wx',mode:0o600});
 // Existing artifact names retain truthful, explicitly scoped case records; no old audit schema is fabricated.
 for(const [name,predicate]of [
  ['original-language-v2-'+input.role+'-audit.json',(id:string)=>id.startsWith('language:')],
  ['historical-core-'+input.role+'-audit.json',(id:string)=>!id.startsWith('language:')],
  ['historical-spine-'+input.role+'-audit.json',(id:string)=>!id.startsWith('language:')],
 ] as const)writeFileSync(join(input.outputDirectory,name),JSON.stringify({schemaVersion:'norton-aquinas-live-cases.v1',releasePolicy:POLICY.policy,role:input.role,protocols:live.protocols,completeLiveSha256:sha(JSON.stringify(live)),checks:live.checks.filter(c=>predicate(c.id))},null,2)+'\n',{flag:'wx',mode:0o600});
 const audit={schemaVersion:'theologai-dual-era-mcp-preview-audit.v1',capturedAt:new Date().toISOString(),endpoint:live.endpoint,productProfile:live.productProfile,eras:live.protocols.map((protocolVersion,i)=>({protocolVersion,serverName:'theologai-bible-server',serverVersion:live.serverVersion,counts:{tools:12,prompts:6,resourceTemplates:2,staticResources:3},fingerprints:live.fingerprints[i]})),crossEraContractSha256:sha(JSON.stringify(live.fingerprints))};
 writeFileSync(join(input.outputDirectory,'dual-era-mcp-'+input.role+'-audit.json'),JSON.stringify(audit,null,2)+'\n',{flag:'wx',mode:0o600});return live;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [role,sourceDirectory,planSha256,challengeFile,receiptFile,cutoverFile,outputDirectory,...extra]=process.argv.slice(2);
 check((role==='preview'||role==='production')&&sourceDirectory&&planSha256&&challengeFile&&receiptFile&&cutoverFile&&outputDirectory&&!extra.length,'exact CLI arguments');
 check(process.env.CLOUDFLARE_API_TOKEN,'existing protected credential missing');
 runCorpusLive({role,sourceDirectory,planSha256,challengeFile,receiptFile,cutoverFile,outputDirectory,token:process.env.CLOUDFLARE_API_TOKEN}).catch(()=>{process.stderr.write('Corpus live stopped; retain full phase reservation and sanitized journals. No retry or rollback.\n');process.exitCode=1;});
}
