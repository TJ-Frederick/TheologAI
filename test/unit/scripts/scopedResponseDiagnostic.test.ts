import {afterEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {runScopedResponseDiagnostic,diagnosticRequests,diagnosticRequestsSha256,SCOPED_DIAGNOSTIC} from '../../../.github/scripts/norton-scoped-response-diagnostic.js';
const encode=new TextEncoder(),sha=(v:string)=>createHash('sha256').update(v).digest('hex');
afterEach(()=>vi.useRealTimers());
function fixture(mode='json'){
 const trace:{url:string;init:RequestInit;body:any}[]=[];let cancelled=false;
 const fetchImpl=(async(url:any,init:any)=>{
  const request=JSON.parse(init.body),index=trace.length;trace.push({url:String(url),init,body:request});
  if(mode==='headers-stall')return new Promise<Response>(()=>{});
  if(index===1)return new Response(null,{status:202});
  const result=index===0?{protocolVersion:'2025-11-25',serverInfo:{name:'local',version:mode==='wrong-server'?'wrong':'3.6.0-preview'},capabilities:{}}:{content:[{type:'text',text:'SECRET_SOURCE_σ🙂'}],...(mode==='tool-error'?{isError:true}:{})};
  const message=mode==='rpc-error'&&index===2?{jsonrpc:'2.0',id:request.id,error:{code:-32603,message:'SECRET_PROVIDER_MESSAGE'}}:{jsonrpc:'2.0',id:mode==='wrong-id'&&index===2?999:request.id,result};
  if(mode==='http-error'&&index===2)return new Response('SECRET_PROVIDER_BODY',{status:503,headers:{'content-type':'text/html','cf-ray':'0123456789abcdef-LHR'}});
  if(index===2&&mode==='oversize')return new Response('X'.repeat(SCOPED_DIAGNOSTIC.responseBytes+1),{headers:{'content-type':'application/json'}});
  if(index===2&&mode==='malformed-sse')return new Response('data: SECRET_INVALID\n\n',{headers:{'content-type':'text/event-stream'}});
  const lineEnd=mode==='sse-cr'?'\r':mode==='sse-lf'?'\n':'\r\n';const data='data: '+JSON.stringify(message)+lineEnd+lineEnd;
  if(mode==='json'||index===0&&!mode.startsWith('sse'))return Response.json(message);
  const bytes=encode.encode(data+(mode==='duplicate'?data:''));
  const stream=new ReadableStream<Uint8Array>({
   start(controller){controller.enqueue(bytes.slice(0,bytes.length-3));controller.enqueue(bytes.slice(bytes.length-3));if(mode==='never-eof')return;if(mode==='delayed-eof')setTimeout(()=>controller.close(),50);else if(mode==='midstream-reset')setTimeout(()=>controller.error(new TypeError('SECRET_RESET')),20);else controller.close();},
   cancel(){cancelled=true;},
  });
  return new Response(stream,{headers:{'content-type':'text/event-stream; charset=utf-8','cf-ray':mode==='malformed-ray'?'SECRET_RAY':'0123456789abcdef-LHR'}});
 })as typeof fetch;
 return{trace,cancelled:()=>cancelled,run:(options:{guard?:()=>void;deadline?:number;signal?:AbortSignal}={})=>runScopedResponseDiagnostic({fetch:fetchImpl,guard:options.guard??(()=>{}),deadline:options.deadline??Date.now()+120000,serverVersion:'3.6.0-preview',signal:options.signal})};
}
it.each(['json','sse','sse-cr','sse-lf'])('observes the exact three%s POSTs with matching ID0 and no release authority',async mode=>{const f=fixture(mode),r=await f.run();expect(r).toMatchObject({completed:true,httpExchanges:3,releaseAcceptance:false,productionAuthorized:false,retries:0,preDispatchFailure:null});expect(f.trace.map(x=>x.body)).toEqual(diagnosticRequests());expect(f.trace.every(x=>x.url===SCOPED_DIAGNOSTIC.endpoint&&x.init.method==='POST'&&x.init.redirect==='error')).toBe(true);expect(r.observations[0].requestId).toBe(0);expect(r.observations[0].matchingResponses).toBe(1);expect(r.requestPlanSha256).toBe(diagnosticRequestsSha256);expect(r.observations.every(x=>x.eofMs!==null)).toBe(true);expect(JSON.stringify(r)).not.toContain('SECRET_');});
it('records a matching SSE frame before delayed EOF',async()=>{vi.useFakeTimers();const f=fixture('delayed-eof'),pending=f.run();await vi.advanceTimersByTimeAsync(60);const r=await pending;expect(r.completed).toBe(true);expect(r.observations[2]).toMatchObject({matchingFrameMs:0,eofMs:50,outcome:'complete'});});
it('stops on a matching frame whose stream never ends, without another request',async()=>{vi.useFakeTimers();const f=fixture('never-eof'),pending=f.run();await vi.advanceTimersByTimeAsync(30001);const r=await pending;expect(r).toMatchObject({completed:false,httpExchanges:3});expect(r.observations[2]).toMatchObject({matchingFrameMs:0,eofMs:null,status:200,deadline:'request',outcome:'timeout_after_matching_frame'});expect(f.cancelled()).toBe(true);});
it('distinguishes a body transport reset from malformed SSE while retaining its earlier matching frame',async()=>{vi.useFakeTimers();const f=fixture('midstream-reset'),pending=f.run();await vi.advanceTimersByTimeAsync(21);const r=await pending;expect(r.observations[2]).toMatchObject({outcome:'response_read',matchingFrameMs:0,eofMs:null,status:200});expect(r.observations[2].bodySha256).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(r)).not.toContain('SECRET_');});
it.each([['malformed-sse','invalid_response'],['wrong-id','invalid_response'],['duplicate','invalid_response'],['rpc-error','rpc_error'],['tool-error','tool_error'],['oversize','response_limit']])('stops on%s and retains only closed metadata',async(mode,outcome)=>{const f=fixture(mode),r=await f.run();expect(r.completed).toBe(false);expect(r.observations.at(-1)?.outcome).toBe(outcome);expect(f.trace).toHaveLength(3);expect(JSON.stringify(r)).not.toContain('SECRET_');});
it('hashes an error body without retaining its contents',async()=>{const f=fixture('http-error'),r=await f.run();expect(r.observations[2]).toMatchObject({status:503,outcome:'http_error',cfRay:'0123456789abcdef-LHR',bodySha256:sha('SECRET_PROVIDER_BODY'),bytes:20});expect(JSON.stringify(r)).not.toContain('SECRET_');});
it('does not continue after an unexpected initialized server',async()=>{const f=fixture('wrong-server'),r=await f.run();expect(r.httpExchanges).toBe(1);expect(r.observations[0].outcome).toBe('unexpected_server');});
it('bounds a fetch that ignores its abort signal',async()=>{vi.useFakeTimers();const f=fixture('headers-stall'),pending=f.run();await vi.advanceTimersByTimeAsync(30001);const r=await pending;expect(r.httpExchanges).toBe(1);expect(r.observations[0]).toMatchObject({status:null,headersMs:null,outcome:'request_timeout',deadline:'request'});});
it.each(['expired','guard'])('counts zero dispatches for a%s refusal before fetch',async mode=>{const f=fixture(),r=await f.run(mode==='expired'?{deadline:Date.now()-1}:{guard:()=>{throw Error('SECRET_GUARD');}});expect(r.httpExchanges).toBe(0);expect(f.trace).toHaveLength(0);expect(r.preDispatchFailure?.outcome).toBe(mode==='expired'?'operation_timeout':'guard_refused');expect(JSON.stringify(r)).not.toContain('SECRET_');});
it('propagates the operation signal independently of the per-request timer',async()=>{vi.useFakeTimers();const f=fixture('headers-stall'),controller=new AbortController(),pending=f.run({signal:controller.signal});setTimeout(()=>controller.abort(),50);await vi.advanceTimersByTimeAsync(51);const r=await pending;expect(r.durationMs).toBe(50);expect(r.observations[0]).toMatchObject({outcome:'operation_timeout',deadline:'operation'});});

it('emits a closed observation schema with no provider-selected fields',async()=>{const r=await fixture().run();expect(Object.keys(r.observations[0]).sort()).toEqual('bodySha256,bytes,cfRay,contentType,deadline,eofMs,finishedMs,headersMs,httpMethod,matchingEnvelopeSha256,matchingFrameMs,matchingResponses,otherMessages,outcome,requestId,rpcErrorCode,rpcMethod,status'.split(',').sort());});
