import {createHash} from 'node:crypto';
/** Complete synthetic control plane for local operator/read transport tests. Never performs network IO. */
import {ACCOUNT,POLICY,TARGETS} from '../../scripts/application-release-policy.mjs';
import {CORPUS_USAGE_QUERY} from '../../scripts/corpus-release-control.js';
type Result={rows:Record<string,unknown>[];rowsRead:number;rowsWritten:number};
export function corpusTransportFixture(options:{role:'preview'|'production';activated?:boolean;boundPreview?:boolean;drift?:boolean;query?:(sql:string,credential:string)=>Promise<Result|Response>|Result|Response;record?:(path:string,method:string)=>void;advance?:()=>void}){
 let reads=100,writes=0;
 const {predecessors} = POLICY.serving();
 const assignments = {
   preview: {databaseId:options.role==='preview'&&!options.boundPreview?TARGETS.production.databaseId:TARGETS.preview.databaseId,
     versionId:predecessors.preview.versionId,deploymentId:predecessors.preview.deploymentId},
   production:{databaseId:predecessors.production.databaseId,versionId:predecessors.production.versionId,deploymentId:predecessors.production.deploymentId},
 };
 const versions = {preview:assignments.preview.versionId, production:assignments.production.versionId};
 const deployments = {preview:assignments.preview.deploymentId, production:assignments.production.deploymentId};
 const binding=(role:'preview'|'production')=>options.activated && role === options.role ? TARGETS[role].databaseId : assignments[role].databaseId;
 const envelope=(result:unknown,info?:unknown)=>Response.json({success:true,errors:[],messages:[],result,...(info?{result_info:info}:{})});
 const fetchImpl=(async(input:any,init:any={})=>{
  const url=new URL(String(input)),path=url.pathname,method=init.method??'GET';options.record?.(path,method);
  if(url.origin!=='https://api.cloudflare.com')throw Error('Synthetic fixture forbids external IO');
  const account='/client/v4/accounts/'+ACCOUNT;
  const body=init.body?JSON.parse(String(init.body)):null;
  let response:Response;
  if(path==='/client/v4/graphql'){
   if(body.query===CORPUS_USAGE_QUERY)response=Response.json({data:{viewer:{accounts:[{accountTag:ACCOUNT,databases:[{dimensions:{databaseId:TARGETS[options.role].databaseId},sum:{rowsRead:reads,rowsWritten:writes},avg:{sampleInterval:1}}]}]}}});
   else response=Response.json({data:{viewer:{accounts:[{accountTag:ACCOUNT,d1AnalyticsAdaptiveGroups:[{sum:{rowsRead:reads,rowsWritten:writes},avg:{sampleInterval:1}}]}]}}});
  }else if(path===account+'/d1/database/'+TARGETS[options.role].databaseId+'/query'){
   if(!options.query)throw Error('SQL forbidden in metadata-only fixture');
   const r=await options.query(body.sql,new Headers(init.headers).get('authorization')??'');
   if (r instanceof Response) {options.advance?.();return r;}
   reads+=r.rowsRead;writes+=r.rowsWritten;response=envelope([{success:true,results:r.rows,meta:{rows_read:r.rowsRead,rows_written:r.rowsWritten,changes:r.rowsWritten,total_attempts:1,served_by_primary:true}}]);
  }else if(path===account+'/d1/database/'+TARGETS[options.role].databaseId)response=envelope({uuid:TARGETS[options.role].databaseId,name:TARGETS[options.role].databaseName,file_size:348463104,created_at:'2026-07-28T00:00:00Z'});
  else if(path===account+'/workers/scripts')response=envelope([{id:'theologai'},{id:'theologai-preview'}]);
  else if(path===account+'/pages/projects')response=envelope([],{page:1,per_page:10,count:0,total_count:0,total_pages:0});
  else {
   const match=new RegExp('^'+account+'/workers/scripts/(theologai|theologai-preview)/(settings|deployments|versions/[a-f0-9-]+)$').exec(path);
   if(!match)throw Error('Unplanned synthetic route '+path);
   const role=match[1]==='theologai-preview'?'preview':'production',id=options.drift?'unknown':binding(role);
   const bindings=[{type:'d1',name:'THEOLOGAI_DB',id}];
   if(match[2]==='settings')response=envelope({bindings});
   else if(match[2]==='deployments')response=envelope({deployments:[{id:deployments[role],created_on:'2026-10-27T00:00:00Z',versions:[{version_id:versions[role],percentage:100}]}]},{page:1,per_page:Number(url.searchParams.get('per_page')??100),count:1,total_count:1,total_pages:1});
   else response=envelope({id:versions[role],number:1,resources:{bindings}});
  }
  options.advance?.();return response;
 }) as typeof fetch;
 return {fetch:fetchImpl,versions,deployments,assignments};
}

export function corpusGrant(options:{role?:'preview'|'production'; now?:number; boundPreview?:boolean; overrides?:Record<string,unknown>}={}) {
 const role=options.role ?? 'preview', now=options.now ?? Date.now();
 const day = new Date(now).toISOString().slice(0,10);
 const authorization={schemaVersion:'theologai-operator-authorization.v1',scope:'new-additional-operation',
  exclusiveDataWritesDuringWindow:true,candidateWriteJobsPaused:true,releasePolicy:POLICY.policy,
  databaseId:TARGETS[role].databaseId,assignments:corpusTransportFixture({role,boundPreview:options.boundPreview}).assignments,
  accountReadCeiling:4_000_000,accountReadCeilingDay:day,accountReadsHeld:0,accountWritesHeld:0,liveControlReserve:100_000,
  expectedLedgerSha256:'1'.repeat(64),repository:'TJ-Frederick/TheologAI',ownerActorId:40179660,
  role,pullRequestNumber:172,headBranch:role==='preview'?'ci/different-successor':'main',
  sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),baseCommit:'c'.repeat(40),sourcePlanSha256:'d'.repeat(64),
  targetRunId:'123',targetRunAttempt:1,authorizationId:'operation-successor-fixture',ledgerId:'operation-successor-fixture',
  notBefore:day+'T00:00:00Z',expiresAt:day+'T23:59:59Z',reservedReads:3_560_000,hardReadCap:3_560_000,
  diagnosticCommands:4,maxWrites:4,previousReadsSpentOrReserved:0,previousWritesSpentOrReserved:0,previousDiagnosticCommands:0,
  outstandingPriorReservationsAccepted:true,...options.overrides};
 return {package:{authorization,provenance:{runId:'321',artifactId:'654',digest:'sha256:'+'9'.repeat(64),
   contentSha256:createHash('sha256').update(JSON.stringify(authorization)).digest('hex')}},
   sourceCommit:authorization.sourceCommit,sourceTree:authorization.sourceTree,runId:authorization.targetRunId};
}
