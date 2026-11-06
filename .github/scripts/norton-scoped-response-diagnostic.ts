/** Fixed raw MCP observation only. Never validates a release or retries a request. */
import {createHash} from 'node:crypto';

export const SCOPED_DIAGNOSTIC = Object.freeze({
    schema: 'norton-scoped-response-diagnostic-approval.v1',
    confirmation: 'DIAGNOSE ONLY THE FIXED NORTON SCOPED SEARCH RESPONSE',
    failedOperation: 'operation-retained-carry-20261106-9305cbfb17',
    reads: 10000,
    mcpReads: 1000,
    previousReads: 3960000,
    durationMs: 120000,
    requestMs: 30000,
    responseBytes: 262144,
    aggregateBytes: 786432,
    endpoint: 'https://preview-mcp.theologai.xyz/mcp',
    jobName: 'Diagnose fixed Norton scoped response (read-only)',
});
export function diagnosticRequests() {
    return [
        {jsonrpc: '2.0', id: 0, method: 'initialize', params: {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'TheologAI-Scoped-Response-Diagnostic', version: '1'}}},
        {jsonrpc: '2.0', method: 'notifications/initialized'},
        {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'primary_source_search', arguments: {queries: [{id: 'scope', text: 'promises law gospel reconciled', work: 'calvin-institutes', match: 'all_terms', limit: 8, searchDepth: 'standard'}]}}},
    ] as const;
}
export const diagnosticRequestsSha256 = createHash('sha256').update(JSON.stringify(diagnosticRequests())).digest('hex');
type Outcome = 'complete'|'http_error'|'response_read'|'network'|'request_timeout'|'operation_timeout'|'timeout_after_matching_frame'|'response_limit'|'invalid_response'|'rpc_error'|'tool_error'|'unexpected_server'|'guard_refused';
type Observation = {
    rpcMethod: string;
    requestId: number|null;
    httpMethod: 'POST';
    status: number|null;
    contentType: 'application/json'|'text/event-stream'|null;
    cfRay: string|null;
    headersMs: number|null;
    matchingFrameMs: number|null;
    eofMs: number|null;
    finishedMs: number;
    bytes: number;
    bodySha256: string;
    matchingResponses: number;
    otherMessages: number;
    matchingEnvelopeSha256: string|null;
    rpcErrorCode: number|null;
    deadline: 'request'|'operation'|null;
    outcome: Outcome;
};
class DiagnosticFault extends Error {
    constructor(readonly outcome: Outcome) { super('Fixed scoped diagnostic stopped'); }
}
/** Race the actual fetch/read as well as aborting it; a stalled stream cannot bypass the deadline. */
export async function withinDiagnosticSignal<T>(pending: Promise<T>, signal: AbortSignal, outcome: 'request_timeout'|'operation_timeout' = 'request_timeout'): Promise<T> {
    if (signal.aborted) throw new DiagnosticFault(outcome);
    let abort: () => void = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => {
        abort = () => reject(new DiagnosticFault(outcome));
        signal.addEventListener('abort', abort, {once: true});
    });
    try { return await Promise.race([pending, interrupted]); }
    finally { signal.removeEventListener('abort', abort); }
}
export async function runScopedResponseDiagnostic(input: {
    fetch: typeof fetch;
    guard: () => void;
    deadline: number;
    serverVersion: string;
    signal?: AbortSignal;
    now?: () => number;
}) {
    const now = input.now ?? Date.now;
    const started = now(), observations: Observation[] = [];
    let aggregateBytes = 0;
    let preDispatchFailure: {rpcMethod: string; requestId: number|null; outcome: Outcome}|null = null;
    const guard = () => { try { input.guard(); } catch { throw new DiagnosticFault('guard_refused'); } };
    for (const [index, request] of diagnosticRequests().entries()) {
        const requestStart = now(), hash = createHash('sha256');
        const observation: Observation = {
            rpcMethod: request.method, requestId: 'id' in request ? request.id : null, httpMethod: 'POST',
            status: null, contentType: null, cfRay: null, headersMs: null, matchingFrameMs: null,
            eofMs: null, finishedMs: 0, bytes: 0, bodySha256: '', matchingResponses: 0,
            otherMessages: 0, matchingEnvelopeSha256: null, rpcErrorCode: null, deadline: null, outcome: 'complete',
        };
        let dispatched = false;
        let transportPhase: 'fetch'|'read'|'decode' = 'fetch';
        const controller = new AbortController();
        const remaining = Math.min(SCOPED_DIAGNOSTIC.requestMs, input.deadline - now());
        const operationDeadline = remaining < SCOPED_DIAGNOSTIC.requestMs;
        let timer: ReturnType<typeof setTimeout>|undefined;
        let reader: ReadableStreamDefaultReader<Uint8Array>|undefined;
        try {
            guard();
            if (remaining <= 0) throw new DiagnosticFault('operation_timeout');
            timer = setTimeout(() => { observation.deadline = operationDeadline ? 'operation' : 'request'; controller.abort(); }, remaining);
            const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
            if (signal.aborted) throw new DiagnosticFault('operation_timeout');
            dispatched = true; observations.push(observation);
            const response = await withinDiagnosticSignal(input.fetch(SCOPED_DIAGNOSTIC.endpoint, {
                method: 'POST', redirect: 'error', signal,
                headers: {'content-type': 'application/json', accept: 'application/json,text/event-stream', 'user-agent': 'TheologAI-Scoped-Response-Diagnostic/1.0', ...(index ? {'mcp-protocol-version': '2025-11-25'} : {})},
                body: JSON.stringify(request),
            }), signal);
            observation.headersMs = now() - requestStart;
            observation.status = response.status;
            const media = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
            observation.contentType = media === 'application/json' || media === 'text/event-stream' ? media : null;
            const ray = response.headers.get('cf-ray');
            observation.cfRay = ray && /^[a-f0-9]{16}(?:-[A-Z]{3})?$/.test(ray) ? ray : null;
            const httpOkay = !response.redirected && response.status === (index === 1 ? 202 : 200);
            const match = (value: unknown) => {
                if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DiagnosticFault('invalid_response');
                const message = value as Record<string, any>;
                if (message.jsonrpc !== '2.0' || !Object.hasOwn(message, 'id') || message.id !== observation.requestId) { observation.otherMessages++; return; }
                if (++observation.matchingResponses !== 1 || Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error')) throw new DiagnosticFault('invalid_response');
                observation.matchingFrameMs = now() - requestStart;
                observation.matchingEnvelopeSha256 = createHash('sha256').update(JSON.stringify(message)).digest('hex');
                if (Object.hasOwn(message, 'error')) {
                    observation.rpcErrorCode = Number.isSafeInteger(message.error?.code) ? message.error.code : null;
                    throw new DiagnosticFault('rpc_error');
                }
                if (!message.result || typeof message.result !== 'object' || Array.isArray(message.result)) throw new DiagnosticFault('invalid_response');
                if (index === 0 && (message.result.protocolVersion !== '2025-11-25' || message.result.serverInfo?.version !== input.serverVersion)) throw new DiagnosticFault('unexpected_server');
                if (index === 2 && message.result.isError === true) throw new DiagnosticFault('tool_error');
            };
            const decoder = new TextDecoder('utf-8', {fatal: true});
            let pending = '', jsonText = '', data: string[] = [], eventName = '';
            const event = () => {
                if (data.length && (!eventName || eventName === 'message')) match(JSON.parse(data.join('\n')));
                data = []; eventName = '';
            };
            const text = (value: string, final = false) => {
                if (observation.contentType !== 'text/event-stream') { jsonText += value; return; }
                pending += value;
                for (let end = pending.search(/[\r\n]/); end >= 0; end = pending.search(/[\r\n]/)) {
                    if (pending[end] === '\r' && end === pending.length - 1 && !final) break;
                    const width = pending[end] === '\r' && pending[end + 1] === '\n' ? 2 : 1;
                    const line = pending.slice(0, end); pending = pending.slice(end + width);
                    if (!line) event();
                    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
                    else if (line.startsWith('event:')) eventName = line.slice(6).trim();
                }
            };
            if (response.body) {
                reader = response.body.getReader();
                for (;;) {
                    guard();
                    transportPhase = 'read';
                    const next = await withinDiagnosticSignal(reader.read(), signal);
                    if (next.done) break;
                    observation.bytes += next.value.byteLength; aggregateBytes += next.value.byteLength; hash.update(next.value);
                    if (observation.bytes > SCOPED_DIAGNOSTIC.responseBytes || aggregateBytes > SCOPED_DIAGNOSTIC.aggregateBytes) throw new DiagnosticFault('response_limit');
                    transportPhase = 'decode';
                    if (httpOkay) text(decoder.decode(next.value, {stream: true}));
                }
                transportPhase = 'decode';
                if (httpOkay) text(decoder.decode(), true);
            }
            observation.eofMs = now() - requestStart;
            if (!httpOkay) throw new DiagnosticFault('http_error');
            if (index === 1) {
                if (observation.bytes !== 0) throw new DiagnosticFault('invalid_response');
            } else {
                if (!observation.contentType) throw new DiagnosticFault('invalid_response');
                transportPhase = 'decode';
                if (observation.contentType === 'application/json') match(JSON.parse(jsonText));
                // An SSE event without its terminating blank line is not dispatched, including at EOF.
                if (observation.matchingResponses !== 1) throw new DiagnosticFault('invalid_response');
            }
            guard();
        } catch (error) {
            if (input.signal?.aborted) observation.deadline = 'operation';
            observation.outcome = observation.deadline
                ? observation.matchingFrameMs !== null ? 'timeout_after_matching_frame' : observation.deadline === 'operation' ? 'operation_timeout' : 'request_timeout'
                : error instanceof DiagnosticFault ? error.outcome : error instanceof SyntaxError || error instanceof TypeError && transportPhase === 'decode' ? 'invalid_response' : transportPhase === 'read' ? 'response_read' : 'network';
            if (!dispatched) preDispatchFailure = {rpcMethod: observation.rpcMethod, requestId: observation.requestId, outcome: observation.outcome};
        } finally {
            if (timer) clearTimeout(timer);
            controller.abort();
            if (reader) {
                if (observation.eofMs === null) void reader.cancel().catch(() => {});
                else reader.releaseLock();
            }
            observation.bodySha256 = hash.digest('hex');
            observation.finishedMs = now() - requestStart;
        }
        if (observation.outcome !== 'complete') break;
    }
    return {
        schemaVersion: 'norton-scoped-response-diagnostic.v1', purpose: 'fixed_response_diagnostic_only',
        endpoint: SCOPED_DIAGNOSTIC.endpoint, protocol: '2025-11-25', requestPlanSha256: diagnosticRequestsSha256,
        observations, preDispatchFailure, httpExchanges: observations.length, aggregateBytes, durationMs: now() - started,
        completed: observations.length === 3 && observations.every(o => o.outcome === 'complete'),
        releaseAcceptance: false, productionAuthorized: false, retries: 0,
    };
}

export const diagnosticErrorOutcome = (error: unknown): Outcome|null => error instanceof DiagnosticFault ? error.outcome : null;
