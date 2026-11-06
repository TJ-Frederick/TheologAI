/** Fixed corpus-only live profile. Both protocol eras; frozen core/spine/language fixtures. */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport, SdkError, SdkErrorCode } from '@modelcontextprotocol/client';
import { versionNegotiationFor } from './audit-dual-era-mcp-preview.js';
import { assertSuccess, assertSafeError, assertInputError, corruptCursor } from './audit-original-language-v2-preview.js';
import { captureMcpTransportSnapshot, assertMcpTransportContract, fingerprintMcpTransportSnapshot } from '../test/helpers/mcpTransportContract.js';
import { escapeFrozenEditionSectionContentForMarkdown } from '../src/kernel/editionProvenanceFoundation.js';
import {createHash} from 'node:crypto';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const hash=(v:unknown)=>sha(JSON.stringify(v));
export const CORPUS_LIVE_FAILURE_CATEGORIES=['timeout','aborted','guard','network','http_status','response_size','response_read','transport_budget','protocol','tool_error','assertion','cleanup','unknown'] as const;
type FailureCategory=typeof CORPUS_LIVE_FAILURE_CATEGORIES[number];
type FailureStage='initialize'|'contract'|'probe'|'assertion'|'parity'|'cleanup';
class AuditFault extends Error {constructor(readonly category:FailureCategory,readonly reason:string=category){super('Corpus live audit failed');}}
function check(v:unknown,message:string):asserts v {if(!v)throw new AuditFault(message==='live_http_time_budget'?'transport_budget':'assertion',message);}
const categoryForStage=(stage:FailureStage):FailureCategory=>stage==='initialize'||stage==='probe'||stage==='contract'?'protocol':stage==='assertion'||stage==='parity'?'assertion':'unknown';
const sdkErrorCodeFor=(error:unknown):string|null=>error instanceof SdkError?Object.entries(SdkErrorCode).find(([name,value])=>value===error.code&&/^[A-Za-z][A-Za-z0-9]{0,80}$/.test(name))?.[0]??null:null;
const trustedId=(id:string)=>/^[A-Za-z0-9:._-]{1,200}$/.test(id)?id:'unavailable';

/** Correlation only: these headers do not establish which component generated a response. */
function httpEvidence(response:Response){
 const ray=response.headers.get('cf-ray'),retry=response.headers.get('retry-after');
 const media=response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
 return {cfRay:ray&&/^[a-f0-9]{16}(?:-[A-Z]{3})?$/.test(ray)?ray:null,cloudflareServer:response.headers.get('server')?.toLowerCase()==='cloudflare',contentType:['application/json','text/html','text/plain','text/event-stream'].includes(media??'')?media:null,retryAfterSeconds:retry&&/^\d{1,5}$/.test(retry)&&Number(retry)<=86400?Number(retry):null};
}
export async function auditCorpusRelease(options: {
    role: 'preview' | 'production';
    endpoint: string;
    serverVersion: string;
    databasePath: string;
    root: string;
    fetch: typeof fetch;
    guard?:()=>void;
}) {
    const root = options.root;
    const parsed = new URL(options.endpoint);
    check(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash, 'unsafe_endpoint');
    const started = Date.now();
    let nextNetworkStart=0;
    let aggregateBytes = 0;
    const checks: {
        role: string;
        era: string;
        id: string;
        passed: boolean;
        responseSha256: string;
    }[] = [], summaries: unknown[] = [], fingerprints: unknown[] = [];
    let current = 'initialize', role = '', era = '';
    type HttpObservation={era:string;probeId:string;httpMethod:string;rpcMethod:string|null;requestId:string|number|null;status:number|null;evidence:ReturnType<typeof httpEvidence>|null};
    type RequestFailure=HttpObservation&{category:FailureCategory;reason:string;sdkErrorCode?:string|null};
    let failedRequest:RequestFailure|undefined,secondaryHttpFailure:RequestFailure|undefined;
    let originatingFailure:(RequestFailure&{sdkErrorCode:string|null;stage:FailureStage})|undefined;
    let stage:FailureStage='initialize',failureReason:string|undefined,lastHttpEvidence:ReturnType<typeof httpEvidence>|null=null,httpObservationProbe:string|null=null,failure:FailureCategory|undefined,cleanupFailed=false,totalExchanges=0,eraExchanges=0,lastHttpStatus:number|null=null;
    const databaseSha256=sha(readFileSync(options.databasePath)),manifestSha256=sha(readFileSync(join(root,'data/data-manifest.json')));
    const core = JSON.parse(readFileSync(join(root, 'test/fixtures/historical-core-preview-audit.json'), 'utf8'));
    const spine = JSON.parse(readFileSync(join(root, 'test/fixtures/historical-spine-preview-audit.json'), 'utf8'));
    const language = JSON.parse(readFileSync(join(root, 'test/fixtures/original-language-v2-preview-audit.json'), 'utf8'));
    const db = new Database(options.databasePath, { readonly: true, fileMustExist: true });
    const norton = (db.prepare("SELECT d.document_id,d.section_key FROM historical_section_identities d WHERE d.document_id LIKE '%norton%' OR d.document_id='calvin-institutes-of-the-christian-religion' ORDER BY source_ordinal LIMIT 1").get() as any);
    const aquinas = (db.prepare('SELECT public_slug,hierarchy_id FROM historical_hierarchy_publications').get() as any);
    const nodes = db.prepare("SELECT node_key FROM historical_edition_hierarchy_nodes WHERE node_kind='article' AND node_key LIKE ? ORDER BY flat_ordinal LIMIT 1");
    const directNodes = ['prima.', 'prima-secundae.', 'secunda-secundae.', 'tertia.'].map(p => (nodes.get('article:' + p + '%') as any)?.node_key);
    if (!norton || directNodes.some(n => !n))
        throw Error('Corpus probe identity unavailable ' + JSON.stringify({ norton, directNodes }));
    function validateResource(value: any) {
        if (!value?.contents)
            return;
        for (const item of value.contents) {
            if (typeof item.uri !== 'string' || typeof item.text !== 'string')
                throw new AuditFault('assertion','resource_shape');
            const section = /^theologai:\/\/documents\/([^#]+)#section-(.+)$/.exec(item.uri);
            if (section) {
                const row = db.prepare('SELECT s.content FROM historical_section_identities i JOIN document_sections s ON s.id=i.document_section_id WHERE i.document_id=? AND i.section_key=?').get(section[1], section[2]) as {
                    content: string;
                } | undefined;
                check(row, 'resource_section_missing');
                check(item.text.includes(escapeFrozenEditionSectionContentForMarkdown(row.content)) || item.text.includes(row.content), 'resource_body_mismatch');
            }
            const node = /^theologai:\/\/documents\/([^#]+)#node-(.+)$/.exec(item.uri);
            if (node) {
                const row = db.prepare('SELECT b.content FROM historical_hierarchy_publications p JOIN historical_edition_hierarchy_nodes n ON n.hierarchy_id=p.hierarchy_id JOIN historical_edition_hierarchy_bodies b ON b.hierarchy_id=n.hierarchy_id AND b.body_key=n.body_key WHERE p.public_slug=? AND n.node_key=?').get(node[1], node[2]) as {
                    content: string;
                } | undefined;
                check(row && item.text.includes(row.content), 'hierarchy_body_mismatch');
            }
        }
    }
    try {
        for (const preview of [options.role === 'preview']) {
            role = preview ? 'preview' : 'production';
            const fetchImpl = options.fetch;
            for (const protocol of ['2025-11-25', '2026-07-28'] as const) {
                era = protocol;
                let exchanges = 0;eraExchanges=0;
                const contractResponses=new Map<string,{status:number;evidence:ReturnType<typeof httpEvidence>}>();
                const requestObservations=new Map<string,HttpObservation>();
                const localFetch = async (input: any, init?: any) => {
                    let requestProbe=current,requestStatus:number|null=null,requestEvidence:ReturnType<typeof httpEvidence>|null=null;
                    const httpMethod=init?.method===undefined?'GET':['GET','POST','DELETE'].includes(init.method)?init.method:'other';let rpcMethod:string|null=null,requestId:string|number|null=null;
                    if(typeof init?.body==='string'){try{const rpc=JSON.parse(init.body);rpcMethod=typeof rpc.method==='string'&&/^[A-Za-z][A-Za-z0-9/_-]{0,80}$/.test(rpc.method)?rpc.method:null;requestId=typeof rpc.id==='number'&&Number.isSafeInteger(rpc.id)||typeof rpc.id==='string'&&/^[A-Za-z0-9._:-]{1,80}$/.test(rpc.id)?rpc.id:null;if(stage==='contract'){const id=({'tools/list':'contract:tools-list','prompts/list':'contract:prompts-list','resources/list':'contract:resources-list','resources/templates/list':'contract:resource-templates-list'} as Record<string,string>)[rpc.method];if(id)requestProbe=id;}}catch{}}
                    // Initialized notifications are awaited by connect(); cancellation and GET streams are not the active RPC.
                    const awaited=httpMethod!=='GET'&&rpcMethod!=='notifications/cancelled';
                    const observation:HttpObservation={era:protocol,probeId:requestProbe,httpMethod,rpcMethod,requestId,status:null,evidence:null};
                    if(awaited)requestObservations.set(requestProbe,observation);
                    try{
                    try{options.guard?.();}catch{throw new AuditFault('guard');}
                    check(++exchanges <= 200 && Date.now() - started <= 600000, 'live_http_time_budget');
                    totalExchanges++;eraExchanges=exchanges;
                    const url = String(input instanceof Request ? input.url : input);
                    check(url === options.endpoint, 'unexpected_endpoint');
                    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
                    try {
                        if(options.fetch===fetch){const delay=Math.max(0,nextNetworkStart-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));nextNetworkStart=Date.now()+650;}
                        let response:Response;try{response = await fetchImpl(input, { ...init, headers:{...Object.fromEntries(new Headers(init?.headers)),'user-agent':`TheologAI-Corpus-${role}-Audit/1.0`}, redirect: 'error', signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });}catch{throw new AuditFault(controller.signal.aborted?'timeout':init?.signal?.aborted?'aborted':'network');}
                        requestStatus=response.status;requestEvidence=httpEvidence(response);observation.status=requestStatus;observation.evidence=requestEvidence;if(awaited){if(requestProbe.startsWith('contract:'))contractResponses.set(requestProbe,{status:requestStatus,evidence:requestEvidence});lastHttpStatus=requestStatus;lastHttpEvidence=requestEvidence;httpObservationProbe=requestProbe;}
                        if(response.redirected||response.status>=500){throw new AuditFault('http_status');}
                        if (!response.body)
                            return response;
                        const reader = response.body.getReader(), chunks: Uint8Array[] = [];
                        let bytes = 0;
                        for (;;) {
                            let next:ReadableStreamReadResult<Uint8Array>;try{next=await reader.read();}catch{throw new AuditFault(controller.signal.aborted?'timeout':init?.signal?.aborted?'aborted':'response_read');}
                            if (next.done)
                                break;
                            bytes += next.value.byteLength;
                            aggregateBytes += next.value.byteLength;
                            if (bytes > 256 * 1024 || aggregateBytes > 16 * 1024 * 1024) {
                                try{await reader.cancel();}catch{}
                                throw new AuditFault('response_size');
                            }
                            chunks.push(next.value);
                        }
                        return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
                    }
                    finally {
                        clearTimeout(timer);
                    }
                    }catch(error){const failure={...observation,status:requestStatus,evidence:requestEvidence,sdkErrorCode:null,category:error instanceof AuditFault?error.category:'protocol' as const,reason:error instanceof AuditFault?error.reason:'protocol'};if(awaited)failedRequest??=failure;else secondaryHttpFailure??=failure;throw error;}
                };
                const client = new Client({ name: 'local-corpus-feasibility', version: '1' }, versionNegotiationFor(protocol));
                async function contractOperation<T>(id:string,action:()=>Promise<T>):Promise<T>{
                    try{return await action();}catch(error){const response=contractResponses.get(id);const sdkErrorCode=sdkErrorCodeFor(error);const category=error instanceof AuditFault?error.category:sdkErrorCode==='RequestTimeout'?'timeout':response&&response.status>=400?'http_status':'protocol';failedRequest??={...(requestObservations.get(id)??{era:protocol,probeId:id,httpMethod:'POST',rpcMethod:null,requestId:null}),status:response?.status??null,evidence:response?.evidence??null,category,reason:error instanceof AuditFault?error.reason:sdkErrorCode==='RequestTimeout'?'sdk_request_timeout':category,sdkErrorCode};throw error;}
                }
                const contractClient={getServerVersion:()=>client.getServerVersion(),getServerCapabilities:()=>client.getServerCapabilities(),listTools:()=>contractOperation('contract:tools-list',()=>client.listTools()),listPrompts:()=>contractOperation('contract:prompts-list',()=>client.listPrompts()),listResourceTemplates:()=>contractOperation('contract:resource-templates-list',()=>client.listResourceTemplates()),listResources:()=>contractOperation('contract:resources-list',()=>client.listResources())};
                const probe = async (id: string, action: () => Promise<any>, allowError = false) => { current = id;stage='probe';failedRequest=undefined;lastHttpStatus=null;lastHttpEvidence=null;httpObservationProbe=null;
                    const value = await action();stage='assertion';
                    if (value?.isError && !allowError)
                        throw new AuditFault('tool_error','unexpected_tool_error');
                    validateResource(value);
                    checks.push({ role, era, id, passed: true, responseSha256: sha(JSON.stringify(value)) });
                    return value;
                };
                let eraFailed=false;
                try {
                    current = 'initialize';stage='initialize';failedRequest=undefined;lastHttpStatus=null;lastHttpEvidence=null;httpObservationProbe=null;
                    await client.connect(new StreamableHTTPClientTransport(new URL(options.endpoint), { fetch: localFetch as any }));
                    current='contract';stage='contract';
                    const snapshot = await captureMcpTransportSnapshot(contractClient);
                    current='contract';stage='contract';lastHttpStatus=null;lastHttpEvidence=null;httpObservationProbe=null;
                    try{await assertMcpTransportContract(snapshot, { contractVersion: preview ? '7' : '6', logging: false });}catch{throw new AuditFault('assertion','mcp_contract_mismatch');}
                    check(client.getNegotiatedProtocolVersion() === protocol, 'protocol_version_mismatch');
                    check(snapshot.server.version === options.serverVersion, 'server_version_mismatch');
                    fingerprints.push(await fingerprintMcpTransportSnapshot(snapshot));
                    const catalog = await probe('catalog', () => client.readResource({ uri: 'theologai://primary-sources/catalog' }));
                    check(JSON.parse(catalog.contents[0].text).workCount === 36, 'catalog_count_mismatch');
                    await probe('classic-catalog', () => client.callTool({ name: 'classic_text_lookup', arguments: { listWorks: true } }));
                    await probe('primary-research-prompt', () => client.getPrompt({ name: 'primary-source-research', arguments: { topic: 'eucharist', authors: 'Erasmus of Rotterdam,Martin Luther', startYear: '500', endYear: '1500', maxSections: '2' } }));
                    await probe('confession-prompt', () => client.getPrompt({ name: 'confession-study', arguments: { topic: 'justification' } }));
                    const uris = (v: any): string[] => v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => k === 'uri' && typeof x === 'string' ? [x] : uris(x)) : [];
                    for (const p of [...core.probes, ...spine.probes]) {
                        await probe('classic-landing:' + p.workId, () => client.callTool({ name: 'classic_text_lookup', arguments: { work: p.workId } }));
                        const page = await probe('browse:' + p.workId, () => client.callTool({ name: 'classic_text_lookup', arguments: { work: p.workId, browseSections: true } }));
                        const next = (page.structuredContent as any)?.directory?.pagination?.nextCursor;
                        if (next)
                            await probe('browse-next:' + p.workId, () => client.callTool({ name: 'classic_text_lookup', arguments: { work: p.workId, browseSections: true, cursor: next } }));
                        await probe('landing:' + p.workId, () => client.readResource({ uri: 'theologai://documents/' + p.workId }));
                        await probe('body:' + p.workId, () => client.readResource({ uri: 'theologai://documents/' + p.workId + '#section-' + p.firstSection.sectionKey }));
                        const global = await probe('global-classic-search:' + p.workId, () => client.callTool({ name: 'classic_text_lookup', arguments: { query: p.query } }));
                        const globalUri = uris(global.structuredContent).find(x => x.startsWith('theologai://documents/' + p.workId + '#section-'));
                        if (!globalUri && p.sourcePackId)
                            throw new AuditFault('assertion','global_search_locator_missing');
                        await probe('global-search-body:' + p.workId, () => client.readResource({ uri: globalUri ?? 'theologai://documents/' + p.workId }));
                        const q = { id: 'scope', text: p.query, work: p.workId, match: 'all_terms', limit: 8, ...(!preview ? { providers: ['local'] } : { searchDepth: 'standard' }) };
                        const primary = await probe('search:' + p.workId, () => client.callTool({ name: 'primary_source_search', arguments: { queries: [q] } }));
                        const primaryUri = uris(primary.structuredContent).find(x => x.startsWith('theologai://documents/' + p.workId + '#section-'));
                        if (!primaryUri)
                            throw new AuditFault('assertion','scoped_search_locator_missing');
                        await probe('primary-search-body:' + p.workId, () => client.readResource({ uri: primaryUri }));
                    }
                    await probe('legacy-regression', () => client.callTool({ name: 'classic_text_lookup', arguments: { work: core.legacyRegression.workId } }));
                    const disabled = await probe('external-disabled', () => client.callTool({ name: 'primary_source_search', arguments: { queries: [{ id: 'external', text: 'Lord Supper', ...(preview ? { searchDepth: 'expanded', expandedLimit: 1 } : { providers: ['ccel'] }), match: 'all_terms', selection: 'relevance', limit: 1 }] } }), !preview);
                    const badCursor = await probe('invalid-classic-cursor', () => client.callTool({ name: 'classic_text_lookup', arguments: { work: core.probes[0].workId, browseSections: true, cursor: 'not-a-valid-cursor' } }), true);
                    check(badCursor.isError === true, 'invalid_cursor_accepted');
                    current='external-disabled';stage='assertion';lastHttpStatus=null;lastHttpEvidence=null;httpObservationProbe=null;
                    check(preview ? !JSON.stringify(disabled).includes('external_discovery_executed') : disabled.isError === true, 'external_disabled_contract');
                    await probe('norton-browse', () => client.callTool({ name: 'classic_text_lookup', arguments: { work: norton.document_id, browseSections: true } }));
                    await probe('norton-body', () => client.readResource({ uri: 'theologai://documents/' + norton.document_id + '#section-' + norton.section_key }));
                    await probe('aquinas-landing', () => client.callTool({ name: 'historical_hierarchy_lookup', arguments: { slug: aquinas.public_slug } }));
                    await probe('aquinas-children', () => client.callTool({ name: 'historical_hierarchy_lookup', arguments: { slug: aquinas.public_slug, browseChildren: true } }));
                    for (const node of directNodes) {
                        await probe('aquinas-node:' + node, () => client.callTool({ name: 'historical_hierarchy_lookup', arguments: { slug: aquinas.public_slug, nodeKey: node } }));
                        await probe('aquinas-resource:' + node, () => client.readResource({ uri: 'theologai://documents/' + aquinas.public_slug + '#node-' + node }));
                    }
                    await probe('aquinas-search', () => client.callTool({ name: 'historical_hierarchy_lookup', arguments: { slug: aquinas.public_slug, query: 'grace', match: 'all_terms' } }));
                    const cursorHistory = new Map<string, string>(), priorCandidates = new Map<string, string[]>();
                    for (const c of language.cases) {
                        current='language:'+c.id;stage='assertion';lastHttpStatus=null;lastHttpEvidence=null;httpObservationProbe=null;failedRequest=undefined;
                        const args = { ...c.arguments };
                        if (c.cursorFrom) {
                            const cursor = cursorHistory.get(c.cursorFrom);
                            if (!cursor)
                                throw new AuditFault('assertion','language_cursor_missing');
                            args.cursor = c.cursorMutation ? corruptCursor(cursor) : cursor;
                        }
                        const value = await probe('language:' + c.id, () => client.callTool({ name: 'original_language_study', arguments: args }), c.mode !== 'success');
                        const raw = { ...value, text: (value.content ?? []).filter((x: any) => x.type === 'text').map((x: any) => x.text) };
                        try{
                            if (c.mode === 'success')
                                assertSuccess(c.id, raw as any, language, cursorHistory, priorCandidates);
                            else if (c.mode === 'safe-error')
                                assertSafeError(c.id, raw as any, args.cursor);
                            else
                                assertInputError(raw as any);
                        }catch{throw new AuditFault('assertion',c.mode==='success'?'language_success_contract':c.mode==='safe-error'?'language_safe_error_contract':'language_input_error_contract');}
                    }
                    summaries.push({ role, era, httpExchanges: exchanges, checks: checks.filter(x => x.role === role && x.era === era).length });
                }
                catch(error){
                    eraFailed=true;
                    const sdkErrorCode=failedRequest?(failedRequest.sdkErrorCode??null):sdkErrorCodeFor(error);
                    const category=failedRequest?.category??(error instanceof AuditFault?error.category:sdkErrorCode==='RequestTimeout'?'timeout':lastHttpStatus!==null&&lastHttpStatus>=400?'http_status':categoryForStage(stage));
                    const observed=requestObservations.get(failedRequest?.probeId??current);
                    // Freeze the awaited operation before close() aborts shared transport/cancellation traffic.
                    originatingFailure={...(failedRequest??observed??{era,probeId:current,httpMethod:'POST',rpcMethod:null,requestId:null,status:lastHttpStatus,evidence:lastHttpEvidence}),category,reason:failedRequest?.reason??(error instanceof AuditFault?error.reason:sdkErrorCode==='RequestTimeout'?'sdk_request_timeout':category),sdkErrorCode,stage};
                    if(!failedRequest&&httpObservationProbe!==current){originatingFailure.status=null;originatingFailure.evidence=null;}
                    throw error;
                }
                finally {
                    try{await client.close();}catch{cleanupFailed=true;if(!eraFailed){current='client-close';stage='cleanup';lastHttpStatus=null;lastHttpEvidence=null;httpObservationProbe=null;throw new AuditFault('cleanup','client_close');}}
                }
            }
        }
        current='dual-era-parity';stage='parity';lastHttpStatus=null;lastHttpEvidence=null;httpObservationProbe=null;sameFingerprints();
    }
    catch(error){const origin=originatingFailure??failedRequest;if(origin){current=origin.probeId;lastHttpStatus=origin.status;lastHttpEvidence=origin.evidence;httpObservationProbe=origin.status===null?null:origin.probeId;}if(originatingFailure)stage=originatingFailure.stage;if((stage as FailureStage)==='assertion'){const failed=[...checks].reverse().find(c=>c.id===current&&c.era===era);if(failed)failed.passed=false;}failureReason=origin?.reason??(error instanceof AuditFault?error.reason:categoryForStage(stage));failure=origin?.category??(error instanceof AuditFault?error.category:lastHttpStatus!==null&&lastHttpStatus>=400?'http_status':categoryForStage(stage));}
    finally {
        try{db.close();}catch{cleanupFailed=true;if(!failure){failure='cleanup';failureReason='database_close';current='database-close';stage='cleanup';lastHttpStatus=null;lastHttpEvidence=null;httpObservationProbe=null;}}
    }
    return { schemaVersion: 'norton-aquinas-live.v1', role: options.role, endpoint: options.endpoint, serverVersion: options.serverVersion, productProfile: options.role === 'preview' ? '7' : '6', protocols: ['2025-11-25', '2026-07-28'], summaries, fixtureSha256: hash([core, spine, language]), fingerprints, checks, databaseSha256, manifestSha256, sourceBodyOutput: false, broaderV9Features: false, aggregateResponseBytes: aggregateBytes, durationMs: Date.now() - started,...(failure?{failure:{schemaVersion:'norton-aquinas-live-failure.v1' as const,category:failure,reason:failureReason,stage,role:options.role,era:era||null,probeId:trustedId(current),lastCompletedProbe:checks.some(c=>c.passed)?trustedId([...checks].reverse().find(c=>c.passed)!.id):null,lastCompletedEra:[...checks].reverse().find(c=>c.passed)?.era??null,completedChecks:checks.filter(c=>c.passed).length,httpExchanges:totalExchanges,eraHttpExchanges:eraExchanges,lastHttpStatus,httpObservationProbe:httpObservationProbe?trustedId(httpObservationProbe):null,httpEvidence:lastHttpEvidence,aggregateResponseBytes:aggregateBytes,cleanupFailed,httpMethod:originatingFailure?.httpMethod??null,rpcMethod:originatingFailure?.rpcMethod??null,requestId:originatingFailure?.requestId??null,sdkErrorCode:originatingFailure?.sdkErrorCode??null,secondaryHttpFailure:secondaryHttpFailure?{...secondaryHttpFailure,probeId:trustedId(secondaryHttpFailure.probeId)}:null}}:{}) };
    function sameFingerprints() { check(hash(fingerprints[0]) === hash(fingerprints[1]), 'dual_era_contract_mismatch'); }
}
