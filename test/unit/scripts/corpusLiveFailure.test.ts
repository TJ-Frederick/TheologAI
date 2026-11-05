import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import Database from 'better-sqlite3';
const state=vi.hoisted(()=>({clients:0,requests:0,closes:0,fingerprints:0,fault:'',at:1,dispatchTimes:[] as number[]}));
vi.mock('@modelcontextprotocol/client',()=>({
 StreamableHTTPClientTransport:class{constructor(readonly url:URL,readonly options:any){}},
 Client:class{
  era:string;transport:any;
  constructor(){this.era=++state.clients===1?'2025-11-25':'2026-07-28';}
  async request(method:string,params:any={}){const response=await this.transport.options.fetch(String(this.transport.url),{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:state.requests+1,method,params})});if(response.status>=400)throw Error('SECRET_HTTP_BODY');return(await response.json()).result;}
  async connect(transport:any){this.transport=transport;for(let i=0;i<(state.fault==='exchange-budget'?201:2);i++)await this.request(i?'notifications/initialized':'initialize');}
  getNegotiatedProtocolVersion(){return this.era;}
  callTool(params:any){return this.request('tools/call',params);}
  readResource(params:any){return this.request('resources/read',params);}
  getPrompt(params:any){return this.request('prompts/get',params);}
  async close(){state.closes++;if((state.fault==='cleanup'||state.fault==='network-and-cleanup')&&state.closes===state.at)throw Error('SECRET_CLEANUP');}
 }
}));
vi.mock('../../helpers/mcpTransportContract.js',()=>({
 captureMcpTransportSnapshot:async(client:any)=>{for(const method of ['tools/list','prompts/list','resources/list','resources/templates/list'])await client.request(method);return{server:{version:'3.6.0-preview'}};},
 assertMcpTransportContract:async()=>{if(state.fault==='contract-assertion')throw Error('SECRET_CONTRACT');},
 fingerprintMcpTransportSnapshot:async()=>({tools:state.fault==='parity'&&++state.fingerprints===2?'b':'a'})
}));
vi.mock('../../../scripts/audit-original-language-v2-preview.js',()=>({assertSuccess:()=>{},assertSafeError:()=>{},assertInputError:()=>{},corruptCursor:(v:string)=>v}));
import {auditCorpusRelease} from '../../../scripts/audit-corpus-release.js';
let root:string,path:string;
beforeEach(()=>{
 Object.assign(state,{clients:0,requests:0,closes:0,fingerprints:0,fault:'',at:1,dispatchTimes:[]});root=mkdtempSync(join(tmpdir(),'live-failure-'));path=join(root,'source.db');mkdirSync(join(root,'test/fixtures'),{recursive:true});mkdirSync(join(root,'data'));
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
 if(n===state.at){
  if(state.fault==='network'||state.fault==='network-and-cleanup')throw Error('SECRET_NETWORK');
  if(state.fault==='timeout')return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('SECRET_TIMEOUT'))));
  if(state.fault==='status')return new Response('SECRET_STATUS',{status:503});
  if(state.fault==='size')return new Response('SECRET_'.repeat(50000));
  if(state.fault==='read')return new Response(new ReadableStream({start(c){c.error(Error('SECRET_READ'));}}));
  if(state.fault==='protocol')return new Response('SECRET_INVALID_JSON');
 }
 const {method,params}=JSON.parse(String(init.body));let result:any={content:[],structuredContent:{}};
 if(method==='resources/read'){
  const uri=params.uri;result={contents:[{uri,text:uri==='theologai://primary-sources/catalog'?JSON.stringify({workCount:state.fault==='outside-assertion'?35:36}):state.fault==='resource-assertion'&&uri.includes('#section-')?'SECRET_WRONG_BODY':'body'}]};
 }
 if(method==='tools/call'){
  const a=params.arguments??{};if(params.name==='classic_text_lookup'&&a.browseSections&&!a.cursor&&a.work.startsWith('work'))result.structuredContent={directory:{pagination:{nextCursor:'next'}}};if(params.name==='classic_text_lookup'&&a.query){const work='work'+a.query.slice(1);result.structuredContent={uri:'theologai://documents/'+work+'#section-s'};}
  if(params.name==='primary_source_search'&&a.queries?.[0]?.work)result.structuredContent={uri:'theologai://documents/'+a.queries[0].work+'#section-s'};
  if(a.cursor==='not-a-valid-cursor'||params.name==='original_language_study')result.isError=true;
  if(state.fault==='tool-error'&&a.listWorks)result={isError:true,content:[{type:'text',text:'SECRET_TOOL_BODY'}]};
 }
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
});
