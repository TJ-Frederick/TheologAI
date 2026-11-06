import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
const state=vi.hoisted(()=>({clients:0,requests:0,closes:0,fingerprints:0,parallel:false,fault:'',at:1,dispatchTimes:[] as number[]}));
vi.mock('@modelcontextprotocol/client',async original=>({...await original<any>(),
 StreamableHTTPClientTransport:class{constructor(readonly url:URL,readonly options:any){}},
 Client:class{
  era:string;transport:any;
  constructor(){this.era=++state.clients===1?'2025-11-25':'2026-07-28';}
  async request(method:string,params:any={}){const response=await this.transport.options.fetch(String(this.transport.url),{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:state.requests+1,method,params})});if(response.status>=400)throw Error('SECRET_HTTP_BODY');return(await response.json()).result;}
  async connect(transport:any){this.transport=transport;for(let i=0;i<(state.fault==='exchange-budget'?201:2);i++)await this.request(i?'notifications/initialized':'initialize');}
  getNegotiatedProtocolVersion(){return this.era;}
  getServerVersion(){return{name:'theologai',version:'3.6.0-preview'};}
  getServerCapabilities(){return{};}
  listTools(){return this.request('tools/list');}
  listPrompts(){return this.request('prompts/list');}
  listResourceTemplates(){return this.request('resources/templates/list');}
  listResources(){return this.request('resources/list');}
  callTool(params:any){return this.request('tools/call',params);}
  readResource(params:any){return this.request('resources/read',params);}
  getPrompt(params:any){return this.request('prompts/get',params);}
  async close(){state.closes++;if(['protocol-then-network','network-then-status'].includes(state.fault))await new Promise(resolve=>setTimeout(resolve,15));if((state.fault==='cleanup'||state.fault==='network-and-cleanup')&&state.closes===state.at)throw Error('SECRET_CLEANUP');}
 }
}));
vi.mock('../../helpers/mcpTransportContract.js',()=>({
 captureMcpTransportSnapshot:async(client:any)=>{const methods=['listTools','listPrompts','listResourceTemplates','listResources'];if(state.parallel)await Promise.all(methods.map(method=>client[method]()));else for(const method of methods)await client[method]();return{server:{version:'3.6.0-preview'}};},
 assertMcpTransportContract:async()=>{if(state.fault==='contract-assertion')throw Error('SECRET_CONTRACT');},
 fingerprintMcpTransportSnapshot:async()=>({tools:state.fault==='parity'&&++state.fingerprints===2?'b':'a'})
}));
vi.mock('../../../scripts/audit-original-language-v2-preview.js',()=>({assertSuccess:()=>{if(state.fault==='language-success')throw Error('SECRET_LANGUAGE');},assertSafeError:()=>{if(state.fault==='language-safe-error')throw Error('SECRET_LANGUAGE');},assertInputError:()=>{if(state.fault==='language-input-error')throw Error('SECRET_LANGUAGE');},corruptCursor:(v:string)=>v}));
import {auditCorpusRelease} from '../../../scripts/audit-corpus-release.js';
let root:string,path:string;
beforeEach(()=>{
 Object.assign(state,{clients:0,requests:0,closes:0,fingerprints:0,parallel:false,fault:'',at:1,dispatchTimes:[]});root=mkdtempSync(join(tmpdir(),'live-failure-'));path=join(root,'source.db');mkdirSync(join(root,'test/fixtures'),{recursive:true});mkdirSync(join(root,'data'));
 const core={probes:Array.from({length:18},(_,i)=>({workId:'work'+i,query:'q'+i,firstSection:{sectionKey:'s'}})),legacyRegression:{workId:'legacy'}};
 for(const [name,value] of [['historical-core-preview-audit',core],['historical-spine-preview-audit',{probes:[]}],['original-language-v2-preview-audit',{cases:Array.from({length:3},(_,i)=>({id:'input'+i,arguments:{},mode:'input-error'}))}]])writeFileSync(join(root,'test/fixtures/'+name+'.json'),JSON.stringify(value));
 writeFileSync(join(root,'data/data-manifest.json'),'{}');const db=new Database(path);
 db.exec("CREATE TABLE document_sections(id INTEGER PRIMARY KEY,content TEXT);CREATE TABLE historical_section_identities(document_id TEXT,section_key TEXT,source_ordinal INTEGER,document_section_id INTEGER);CREATE TABLE historical_hierarchy_publications(public_slug TEXT,hierarchy_id TEXT);CREATE TABLE historical_edition_hierarchy_nodes(node_key TEXT,node_kind TEXT,flat_ordinal INTEGER,hierarchy_id TEXT,body_key TEXT);CREATE TABLE historical_edition_hierarchy_bodies(hierarchy_id TEXT,body_key TEXT,content TEXT);INSERT INTO historical_hierarchy_publications VALUES('aquinas','a');INSERT INTO historical_edition_hierarchy_bodies VALUES('a','b','body');");
 for(const [i,work] of ['norton',...core.probes.map(p=>p.workId)].entries()){db.prepare('INSERT INTO document_sections VALUES(?,?)').run(i+1,'body');db.prepare('INSERT INTO historical_section_identities VALUES(?,?,?,?)').run(work,'s',i,i+1);}
 for(const [i,part] of ['prima','prima-secundae','secunda-secundae','tertia'].entries())db.prepare('INSERT INTO historical_edition_hierarchy_nodes VALUES(?,?,?,?,?)').run('article:'+part+'.1','article',i,'a','b');db.close();
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();rmSync(root,{recursive:true,force:true});});
const transport=(async(_input:any,init:any)=>{
 const n=++state.requests;state.dispatchTimes.push(Date.now());
 if(state.parallel&&n>=3&&n<=6){await new Promise(resolve=>setTimeout(resolve,n===state.at?1:5));}
 if(state.fault==='protocol-then-network'&&n===state.at+1)throw Error('SECRET_LATE_NETWORK');
 if(state.fault==='network-then-status'&&n===state.at+1)return new Response('SECRET_LATE_STATUS',{status:503});
 if(n===state.at){
  if(state.fault==='network'||state.fault==='network-and-cleanup'||state.fault==='network-then-status')throw Error('SECRET_NETWORK');
  if(state.fault==='timeout')return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('SECRET_TIMEOUT'))));
  if(state.fault==='status'||state.fault==='status-malicious')return new Response('SECRET_STATUS',{status:503,headers:state.fault==='status'?{'cf-ray':'0123456789abcdef-LHR','server':'cloudflare','content-type':'text/html; charset=utf-8','retry-after':'12','set-cookie':'SECRET_COOKIE'}:{'cf-ray':'SECRET_RAY','server':'SECRET_SERVER','content-type':'text/SECRET_TYPE','retry-after':'999999','x-secret':'SECRET_HEADER'}});
  if(state.fault==='size')return new Response('SECRET_'.repeat(50000));
  if(state.fault==='read')return new Response(new ReadableStream({start(c){c.error(Error('SECRET_READ'));}}));
  if(state.fault==='protocol'||state.fault==='protocol-then-network')return new Response('SECRET_INVALID_JSON');
 }
 const {method,params}=JSON.parse(String(init.body));let result:any={content:[],structuredContent:{}};
 if(method==='resources/read'){
  const uri=params.uri;result={contents:[{uri,text:uri==='theologai://primary-sources/catalog'?JSON.stringify({workCount:state.fault==='outside-assertion'?35:36}):state.fault==='resource-assertion'&&uri.includes('#section-')?'SECRET_WRONG_BODY':'body'}]};
 }
 if(method==='tools/call'){
  const a=params.arguments??{};if(params.name==='classic_text_lookup'&&a.browseSections&&!a.cursor&&a.work.startsWith('work'))result.structuredContent={directory:{pagination:{nextCursor:'next'}}};if(params.name==='classic_text_lookup'&&a.query){const work='work'+a.query.slice(1);result.structuredContent={uri:'theologai://documents/'+work+'#section-s'};}
  if(params.name==='primary_source_search'&&a.queries?.[0]?.work)result.structuredContent={uri:'theologai://documents/'+a.queries[0].work+'#section-s'};
  if(a.cursor==='not-a-valid-cursor'||params.name==='original_language_study'&&state.fault!=='language-success')result.isError=true;
  if(state.fault==='external-assertion'&&a.queries?.[0]?.id==='external')result.structuredContent={status:'external_discovery_executed'};
  if(state.fault==='scoped-locator'&&a.queries?.[0]?.work)result.structuredContent={};
  if(state.fault==='global-locator'&&a.query)result.structuredContent={};
  if(state.fault==='tool-error'&&a.listWorks)result={isError:true,content:[{type:'text',text:'SECRET_TOOL_BODY'}]};
 }
 if(state.fault==='resource-shape'&&method==='resources/read')result={contents:[{uri:12,text:'SECRET_BODY'}]};
 return Response.json({jsonrpc:'2.0',result,...(state.fault==='aggregate-size'?{padding:'x'.repeat(240000)}:{})});
}) as typeof fetch;
const run=()=>auditCorpusRelease({role:'preview',endpoint:'https://local.test/mcp',serverVersion:'3.6.0-preview',databasePath:path,root,fetch:transport});
describe('actual corpus auditor exception-path report',()=>{
 it('preserves all370 cases,382 exchanges,success shape and zero retry in the small deterministic transport',async()=>{const result=await run();expect(result.checks).toHaveLength(370);expect(result.summaries).toEqual([{role:'preview',era:'2025-11-25',httpExchanges:191,checks:185},{role:'preview',era:'2026-07-28',httpExchanges:191,checks:185}]);expect(Object.hasOwn(result,'failure')).toBe(false);expect(state.requests).toBe(382);});
 it.each([['network','network'],['status','http_status'],['size','response_size'],['read','response_read'],['protocol','protocol'],['contract-assertion','assertion'],['outside-assertion','assertion'],['resource-assertion','assertion'],['tool-error','tool_error'],['aggregate-size','response_size'],['exchange-budget','transport_budget']])('retains sanitized %s diagnostics without raw provider strings',async(fault,category)=>{state.fault=fault;const result=await run();expect(result.failure?.category).toBe(category);expect(result.failure?.httpExchanges).toBe(state.requests);expect(result.failure?.completedChecks).toBe(result.checks.filter(c=>c.passed).length);expect(JSON.stringify(result)).not.toContain('SECRET_');expect(state.closes).toBe(1);if(fault==='outside-assertion')expect(result.failure).toMatchObject({probeId:'catalog',lastCompletedProbe:null,completedChecks:0,stage:'assertion'});if(fault==='status')expect(result.failure?.lastHttpStatus).toBe(503);if(fault==='aggregate-size')expect(result.failure!.aggregateResponseBytes).toBeGreaterThan(16*1024*1024);});
 it('retains the last completed trusted probe after a mid-run network failure',async()=>{state.fault='network';state.at=10;const result=await run();expect(result.failure).toMatchObject({category:'network',probeId:'confession-prompt',lastCompletedProbe:'primary-research-prompt',completedChecks:3,httpExchanges:10});});
 it('distinguishes its30second request timeout using the actual abort timer',async()=>{state.fault='timeout';vi.useFakeTimers();const pending=run();await vi.advanceTimersByTimeAsync(30001);const result=await pending;expect(result.failure).toMatchObject({category:'timeout',httpExchanges:1,completedChecks:0});expect(JSON.stringify(result)).not.toContain('SECRET_');});
 it.each(['parity','cleanup'])('reports failure after370 operations for %s, never a success-shaped fallback',async fault=>{state.fault=fault;state.at=2;const result=await run();expect(result.checks).toHaveLength(370);expect(result.failure?.category).toBe(fault==='cleanup'?'cleanup':'assertion');expect(result.failure?.completedChecks).toBe(370);expect(result.failure?.stage).toBe(fault==='cleanup'?'cleanup':'parity');expect(JSON.stringify(result)).not.toContain('SECRET_');});
 it('does not mask the original network failure when cleanup also fails',async()=>{state.fault='network-and-cleanup';const result=await run();expect(result.failure).toMatchObject({category:'network',cleanupFailed:true,httpExchanges:1});});
 it('preserves650ms native-fetch pacing and all370 checks',async()=>{vi.useFakeTimers();vi.stubGlobal('fetch',transport);const pending=run();await vi.runAllTimersAsync();const result=await pending;expect(Object.hasOwn(result,'failure')).toBe(false);expect(state.requests).toBe(382);expect(state.dispatchTimes.slice(1).every((t,i)=>t-state.dispatchTimes[i]>=650)).toBe(true);});
 it.each([[3,'contract:tools-list'],[4,'contract:prompts-list'],[5,'contract:resource-templates-list'],[6,'contract:resources-list']])('identifies concurrent contract request%s without adding a check or retry',async(at,id)=>{state.parallel=true;state.fault='status';state.at=at as number;const result=await run();expect(result.failure).toMatchObject({category:'http_status',probeId:id,httpObservationProbe:id,lastHttpStatus:503,completedChecks:0});expect(state.requests).toBe(6);expect(result.failure?.httpExchanges).toBe(6);});
 it('retains only bounded correlation metadata for a failing scoped search',async()=>{state.fault='status';state.at=18;const result=await run();expect(result.failure).toMatchObject({category:'http_status',reason:'http_status',probeId:'search:work0',httpObservationProbe:'search:work0',lastHttpStatus:503,httpEvidence:{cfRay:'0123456789abcdef-LHR',cloudflareServer:true,contentType:'text/html',retryAfterSeconds:12}});expect(state.requests).toBe(18);expect(JSON.stringify(result)).not.toContain('SECRET_');});
 it('omits malformed and arbitrary response headers',async()=>{state.fault='status-malicious';const result=await run();expect(result.failure?.httpEvidence).toEqual({cfRay:null,cloudflareServer:false,contentType:null,retryAfterSeconds:null});expect(JSON.stringify(result)).not.toContain('SECRET_');});
 it.each([['outside-assertion','catalog_count_mismatch'],['resource-assertion','resource_body_mismatch'],['resource-shape','resource_shape'],['scoped-locator','scoped_search_locator_missing'],['contract-assertion','mcp_contract_mismatch']])('retains a fixed known assertion reason for%s',async(fault,reason)=>{state.fault=fault;const result=await run();expect(result.failure).toMatchObject({category:'assertion',reason});expect(JSON.stringify(result)).not.toContain('SECRET_');});
 it('does not associate the invalid-cursor HTTP status with the earlier external-disabled assertion',async()=>{state.fault='external-assertion';const result=await run();expect(result.failure).toMatchObject({category:'assertion',reason:'external_disabled_contract',probeId:'external-disabled',lastHttpStatus:null,httpObservationProbe:null,httpEvidence:null});});
 it.each([['language-success','success','language_success_contract'],['language-safe-error','safe-error','language_safe_error_contract'],['language-input-error','input-error','language_input_error_contract']])('retains the exact language probe and%s mode without helper messages',async(fault,mode,reason)=>{state.fault=fault;const file=join(root,'test/fixtures/original-language-v2-preview-audit.json'),fixture=JSON.parse(readFileSync(file,'utf8'));fixture.cases[0].mode=mode;writeFileSync(file,JSON.stringify(fixture));const result=await run();expect(result.failure).toMatchObject({category:'assertion',reason,probeId:'language:input0'});expect(result.checks.find(c=>c.id==='language:input0')?.passed).toBe(false);expect(JSON.stringify(result)).not.toContain('SECRET_');});

 it('clears the prior response when a language cursor prerequisite fails before request',async()=>{const file=join(root,'test/fixtures/original-language-v2-preview-audit.json'),fixture=JSON.parse(readFileSync(file,'utf8'));fixture.cases[0].cursorFrom='missing';writeFileSync(file,JSON.stringify(fixture));const result=await run();expect(result.failure).toMatchObject({category:'assertion',reason:'language_cursor_missing',probeId:'language:input0',lastHttpStatus:null,httpObservationProbe:null,httpEvidence:null});});

 it.each([[3,'contract:tools-list'],[4,'contract:prompts-list'],[5,'contract:resource-templates-list'],[6,'contract:resources-list']])('pins concurrent SDK decoding failure%s despite later successful responses',async(at,id)=>{state.parallel=true;state.fault='protocol';state.at=at as number;const result=await run();expect(result.failure).toMatchObject({category:'protocol',reason:'protocol',probeId:id,httpObservationProbe:id,lastHttpStatus:200,completedChecks:0,httpExchanges:6});expect(state.requests).toBe(6);expect(JSON.stringify(result)).not.toContain('SECRET_');await new Promise(resolve=>setTimeout(resolve,10));expect(result.failure?.probeId).toBe(id);expect(state.requests).toBe(6);});

 it.each([['protocol-then-network','protocol',200],['network-then-status','network',null]])('keeps the first concurrent operation and cause when%s completes during cleanup',async(fault,category,status)=>{state.parallel=true;state.fault=fault as string;state.at=3;const result=await run();expect(result.failure).toMatchObject({category,reason:category,probeId:'contract:tools-list',lastHttpStatus:status,completedChecks:0,httpExchanges:6});expect(result.failure?.httpObservationProbe).toBe(status===null?null:'contract:tools-list');expect(state.requests).toBe(6);expect(state.closes).toBe(1);expect(JSON.stringify(result)).not.toContain('SECRET_');});

});
