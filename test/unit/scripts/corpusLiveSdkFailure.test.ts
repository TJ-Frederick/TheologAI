import {afterEach,it,expect,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
import {Client} from '@modelcontextprotocol/client';
vi.mock('../../helpers/mcpTransportContract.js',()=>({
 captureMcpTransportSnapshot:async(client:any)=>{await Promise.all([client.listTools(),client.listPrompts(),client.listResources(),client.listResourceTemplates()]);return{server:{version:'3.6.0-preview'}};},
 assertMcpTransportContract:async()=>{},fingerprintMcpTransportSnapshot:async()=>({tools:'fixed'})
}));
import {auditCorpusRelease} from '../../../scripts/audit-corpus-release.js';
const roots:string[]=[];afterEach(()=>{vi.restoreAllMocks();for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
function fixture(mode:string){
 const root=mkdtempSync(join(tmpdir(),'actual-sdk-audit-failure-'));roots.push(root);mkdirSync(join(root,'test/fixtures'),{recursive:true});mkdirSync(join(root,'data'));
 const core={probes:[{workId:'calvin-institutes',query:'promises law gospel reconciled',firstSection:{sectionKey:'s'}}],legacyRegression:{workId:'legacy'}};
 for(const [name,value]of[['historical-core-preview-audit',core],['historical-spine-preview-audit',{probes:[]}],['original-language-v2-preview-audit',{cases:[]}]])writeFileSync(join(root,'test/fixtures/'+name+'.json'),JSON.stringify(value));
 writeFileSync(join(root,'data/data-manifest.json'),'{}');const path=join(root,'source.db'),db=new Database(path);
 db.exec("CREATE TABLE document_sections(id INTEGER PRIMARY KEY,content TEXT);CREATE TABLE historical_section_identities(document_id TEXT,section_key TEXT,source_ordinal INTEGER,document_section_id INTEGER);CREATE TABLE historical_hierarchy_publications(public_slug TEXT,hierarchy_id TEXT);CREATE TABLE historical_edition_hierarchy_nodes(node_key TEXT,node_kind TEXT,flat_ordinal INTEGER,hierarchy_id TEXT,body_key TEXT);CREATE TABLE historical_edition_hierarchy_bodies(hierarchy_id TEXT,body_key TEXT,content TEXT);INSERT INTO historical_hierarchy_publications VALUES('aquinas','a');INSERT INTO historical_edition_hierarchy_bodies VALUES('a','b','body');");
 for(const [i,work]of['norton','calvin-institutes'].entries()){db.prepare('INSERT INTO document_sections VALUES(?,?)').run(i+1,'body');db.prepare('INSERT INTO historical_section_identities VALUES(?,?,?,?)').run(work,'s',i,i+1);}
 for(const [i,part]of['prima','prima-secundae','secunda-secundae','tertia'].entries())db.prepare('INSERT INTO historical_edition_hierarchy_nodes VALUES(?,?,?,?,?)').run('article:'+part+'.1','article',i,'a','b');db.close();
 const originalCall=Client.prototype.callTool,originalClose=Client.prototype.close;
 if(mode.startsWith('contract-')){const tools=Client.prototype.listTools,prompts=Client.prototype.listPrompts;vi.spyOn(Client.prototype,'listTools').mockImplementation(function(this:Client,params,options){return tools.call(this,params,{...options,timeout:25});});vi.spyOn(Client.prototype,'listPrompts').mockImplementation(function(this:Client,params,options){return prompts.call(this,params,{...options,timeout:75});});}
 vi.spyOn(Client.prototype,'callTool').mockImplementation(function(this:Client,params,options){return originalCall.call(this,params,{...options,...(params.name==='primary_source_search'&&params.arguments?.queries?(mode==='primary-503'||mode==='background-primary-503'?{}:{timeout:25}):{})});});
 vi.spyOn(Client.prototype,'close').mockImplementation(async function(this:Client){await originalClose.call(this);await new Promise(r=>setTimeout(r,50));if(mode==='cleanup-only')throw Error('SECRET_CLOSE');});
 const trace:{method:string;rpc:string|null;id:number|null;status:number|null;aborted?:boolean}[]=[];
 const fetchImpl=(async(_url:any,init:any)=>{
  const rpc=init.body?JSON.parse(init.body):null,row={method:init.method,rpc:rpc?.method??null,id:rpc?.id??null,status:null as number|null,aborted:false};trace.push(row);
  const waitForClose=()=>new Promise<Response>((_resolve,reject)=>{const fail=()=>{row.aborted=true;reject(init.signal.reason??new DOMException('Aborted','AbortError'));};if(init.signal.aborted)fail();else init.signal.addEventListener('abort',fail,{once:true});});
  if(init.method==='GET'){if(mode==='background-primary-503')return waitForClose();row.status=405;return new Response(null,{status:405});}
  if(rpc.method==='notifications/cancelled')return waitForClose();
  if(mode==='initialize-503'&&rpc.method==='initialize'||mode==='initialized-503'&&rpc.method==='notifications/initialized'){row.status=503;return new Response('SECRET_RESPONSE',{status:503});}
  if(rpc.method==='notifications/initialized'){row.status=202;return new Response(null,{status:202});}
  if(mode.startsWith('contract-')&&['tools/list','prompts/list'].includes(rpc.method)){if(mode==='contract-protocol'&&rpc.method==='tools/list'){row.status=200;return new Response('SECRET_INVALID_JSON',{headers:{'content-type':'application/json'}});}row.status=202;return new Response(null,{status:202});}
  const scoped=rpc.method==='tools/call'&&rpc.params.name==='primary_source_search'&&rpc.params.arguments?.queries?.[0]?.work==='calvin-institutes';
  if(scoped&&mode==='ack-202'){row.status=202;return new Response(null,{status:202});}
  if(scoped&&['primary-503','background-primary-503'].includes(mode)){row.status=503;return new Response('SECRET_RESPONSE',{status:503,headers:{'cf-ray':'0123456789abcdef-LHR'}});}
  let result:any={content:[],structuredContent:{}};
  if(rpc.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{},prompts:{},resources:{}},serverInfo:{name:'local',version:'3.6.0-preview'}};
  if(rpc.method==='tools/list')result={tools:[]};if(rpc.method==='prompts/list')result={prompts:[]};if(rpc.method==='resources/list')result={resources:[]};if(rpc.method==='resources/templates/list')result={resourceTemplates:[]};
  if(rpc.method==='resources/read')result={contents:[{uri:rpc.params.uri,text:rpc.params.uri==='theologai://primary-sources/catalog'?JSON.stringify({workCount:36}):'body'}]};
  if(rpc.method==='prompts/get')result={messages:[]};
  if(rpc.method==='tools/call'&&rpc.params.arguments?.query||scoped)result.structuredContent={uri:'theologai://documents/calvin-institutes#section-s'};
  if(rpc.params?.arguments?.cursor==='not-a-valid-cursor')result.isError=true;
  row.status=200;return Response.json({jsonrpc:'2.0',id:scoped&&mode==='uncorrelated-200'?999999:rpc.id,result});
 })as typeof fetch;
 return{trace,run:()=>auditCorpusRelease({role:'preview',endpoint:'https://local.invalid/mcp',serverVersion:'3.6.0-preview',databasePath:path,root,fetch:fetchImpl})};
}
it.each([['ack-202',202],['uncorrelated-200',200]])('keeps the real SDK timeout and original%s response when cancellation aborts during close',async(mode,status)=>{
 const f=fixture(mode as string),report=await f.run();expect(report.failure).toMatchObject({category:'timeout',reason:'sdk_request_timeout',probeId:'search:calvin-institutes',httpMethod:'POST',rpcMethod:'tools/call',lastHttpStatus:status,sdkErrorCode:'RequestTimeout',secondaryHttpFailure:{rpcMethod:'notifications/cancelled',category:'aborted',status:null}});
 const primary=f.trace.find(r=>r.rpc==='tools/call'&&r.status===status&&r.id===report.failure?.requestId);expect(primary).toBeDefined();expect(f.trace.filter(r=>r.rpc==='notifications/cancelled')).toHaveLength(1);expect(f.trace.at(-1)?.aborted).toBe(true);expect(JSON.stringify(report)).not.toContain('SECRET_');
});
it.each(['primary-503','background-primary-503'])('keeps%s primary response independently of a background GET close abort',async mode=>{const f=fixture(mode),report=await f.run();expect(report.failure).toMatchObject({category:'http_status',rpcMethod:'tools/call',lastHttpStatus:503,httpEvidence:{cfRay:'0123456789abcdef-LHR'}});if(mode==='background-primary-503')expect(report.failure?.secondaryHttpFailure).toMatchObject({httpMethod:'GET',category:'aborted'});});
it('recognizes a real zero-valued RPC ID',async()=>{const f=fixture('initialize-503'),report=await f.run();expect(report.failure).toMatchObject({category:'http_status',httpMethod:'POST',rpcMethod:'initialize',requestId:0,lastHttpStatus:503});});
it('preserves a failure of the awaited initialized notification',async()=>{const f=fixture('initialized-503'),report=await f.run();expect(report.failure).toMatchObject({category:'http_status',rpcMethod:'notifications/initialized',requestId:null,lastHttpStatus:503});});
it('preserves required client cleanup errors',async()=>{const f=fixture('cleanup-only'),report=await f.run();expect(report.failure).toMatchObject({category:'cleanup',reason:'client_close',cleanupFailed:true});});

it.each([['contract-timeout','timeout','sdk_request_timeout','RequestTimeout',202],['contract-protocol','protocol','protocol',null,200]])('keeps first concurrent%s RPC and its own SDK code through later connection-close errors',async(mode,category,reason,sdkErrorCode,status)=>{const f=fixture(mode as string),report=await f.run();expect(report.failure).toMatchObject({category,reason,sdkErrorCode,probeId:'contract:tools-list',httpMethod:'POST',rpcMethod:'tools/list',lastHttpStatus:status,completedChecks:0});expect(report.failure?.requestId).toBe(f.trace.find(r=>r.rpc==='tools/list')?.id);expect(f.trace.filter(r=>r.rpc==='tools/list')).toHaveLength(1);expect(JSON.stringify(report)).not.toContain('SECRET_');});
