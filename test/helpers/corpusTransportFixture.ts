/** Complete synthetic control plane for local operator/read transport tests. Never performs network IO. */
import {boundPreview} from './boundPreviewFixture.js';
import {ACCOUNT,POLICY,TARGETS} from '../../scripts/norton-aquinas-release-policy.mjs';
import {CORPUS_USAGE_QUERY} from '../../scripts/corpus-release-control.js';
type Result={rows:Record<string,unknown>[];rowsRead:number;rowsWritten:number};
export function corpusTransportFixture(options:{role:'preview'|'production';activated?:boolean;boundPreview?:boolean;drift?:boolean;query?:(sql:string,credential:string)=>Promise<Result>|Result;record?:(path:string,method:string)=>void;advance?:()=>void}){
 let reads=100,writes=0;
 const versions={preview:'11111111-1111-4111-8111-111111111111',production:'22222222-2222-4222-8222-222222222222'};
 if(options.boundPreview){versions.preview=boundPreview.previewVersionId;versions.production=boundPreview.productionVersionId;}
 const deployments={preview:'33333333-3333-4333-8333-333333333333',production:'44444444-4444-4444-8444-444444444444'};
 if(options.boundPreview){deployments.preview=boundPreview.previewDeploymentId;deployments.production=boundPreview.productionDeploymentId;}
 if(options.role==='production'){
  versions.preview=POLICY.predecessors.preview.versionId;deployments.preview=POLICY.predecessors.preview.deploymentId;
  if(!options.activated){versions.production=POLICY.predecessors.production.versionId;deployments.production=POLICY.predecessors.production.deploymentId;}
 }
 const binding=(role:'preview'|'production')=>role==='production'?(options.role==='production'&&options.activated?TARGETS.production.databaseId:POLICY.rollback.databaseId):(options.role==='preview'&&!options.activated&&!options.boundPreview?TARGETS.production.databaseId:TARGETS.preview.databaseId);
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
   const r=await options.query(body.sql,new Headers(init.headers).get('authorization')??'');reads+=r.rowsRead;writes+=r.rowsWritten;
   response=envelope([{success:true,results:r.rows,meta:{rows_read:r.rowsRead,rows_written:r.rowsWritten,changes:r.rowsWritten,total_attempts:1,served_by_primary:true}}]);
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
 return {fetch:fetchImpl,versions,deployments};
}
