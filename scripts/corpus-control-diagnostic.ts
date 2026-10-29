/** Proposed one-shot, zero-SQL preview control diagnostic. Never produces a release receipt. */
import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCorpusApi } from './corpus-release-api.js';
import { captureUnboundCorpusControl, CORPUS_ACCOUNT_ID, CORPUS_CONTROL_LIMITS, CORPUS_USAGE_QUERY } from './corpus-release-control.js';
import { parseExecutionApproval } from './corpus-release-operator.js';
import { check, hash, sha, TARGETS } from './corpus-release.js';

type Entry = Record<string, unknown>;
export function diagnosticFetch(fetchImpl: typeof fetch, append: (entry: Entry) => Promise<void>, now = Date.now, tokenIdentityOnly = false): typeof fetch {
    const started = now(), prefix = `https://api.cloudflare.com/client/v4/accounts/${CORPUS_ACCOUNT_ID}`;
    let requests = 0, aggregateBytes = 0, graphql = 0;
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input), method = init?.method ?? 'GET';
        const isGraphql = method === 'POST' && url === 'https://api.cloudflare.com/client/v4/graphql';
        const isTokenVerify = method === 'GET' && [prefix + '/tokens/verify', 'https://api.cloudflare.com/client/v4/user/tokens/verify'].includes(url);
        check(tokenIdentityOnly ? isTokenVerify : ((method === 'GET' && url.startsWith(prefix + '/')) || isGraphql), 'diagnostic forbids SQL and unrelated routes');
        if (url.includes('/d1/'))
            check(method === 'GET' && url === prefix + '/d1/database/' + TARGETS.preview.id, 'diagnostic permits only fixed candidate metadata');
        if (isGraphql) {
            const body = JSON.parse(String(init?.body)), day = new Date(now()).toISOString().slice(0, 10);
            check(body.query === CORPUS_USAGE_QUERY && body.variables?.accountTag === CORPUS_ACCOUNT_ID && body.variables.start === day && body.variables.end === day && ++graphql <= 2, 'diagnostic analytics scope differs');
        }
        check(++requests <= (tokenIdentityOnly ? 2 : CORPUS_CONTROL_LIMITS.exchanges) && now() - started < CORPUS_CONTROL_LIMITS.durationMs, 'diagnostic request/time limit');
        const index = requests - 1, route = isGraphql ? '/graphql' : url.startsWith(prefix) ? url.slice(prefix.length) : '/user/tokens/verify';
        await append({ state: 'intent', index, method, route });
        try {
            const response = await fetchImpl(input, init), chunks: Uint8Array[] = [];
            let bytes = 0;
            if (response.body) {
                const reader = response.body.getReader();
                try {
                    for (;;) {
                        const item = await reader.read();
                        if (item.done) break;
                        bytes += item.value.byteLength;
                        aggregateBytes += item.value.byteLength;
                        check(bytes <= CORPUS_CONTROL_LIMITS.responseBytes && aggregateBytes <= CORPUS_CONTROL_LIMITS.aggregateBytes && now() - started < CORPUS_CONTROL_LIMITS.durationMs, 'diagnostic response bound');
                        chunks.push(item.value);
                    }
                } finally { await reader.cancel().catch(() => {}); }
            }
            const body = Buffer.concat(chunks);
            let providerCodes: number[] = [];
            try {
                const parsed = JSON.parse(body.toString('utf8'));
                if (Array.isArray(parsed.errors))
                    providerCodes = parsed.errors.map((e: { code?: unknown }) => e?.code).filter((code: unknown): code is number => Number.isSafeInteger(code)).slice(0, 32);
            } catch { /* Status and hash still describe a non-JSON response. */ }
            await append({ state: 'complete', index, method, route, httpStatus: response.status, responseBytes: bytes, responseSha256: sha(body), providerCodes });
            return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, headers: response.headers });
        } catch {
            await append({ state: 'failed', index, method, route, category: 'transport_body_or_durability_failure' });
            throw Error('Control diagnostic stopped; no retry. Inspect sanitized journal.');
        }
    }) as typeof fetch;
}

export async function runControlDiagnostic(input: { approval: unknown; output: string; readToken(): Promise<string>; fetch: typeof fetch; now?: () => number }) {
    const now = input.now ?? Date.now, value = input.approval as Record<string, unknown> | null;
    check(value && value.status === 'control-diagnostic', 'explicit control-diagnostic approval required');
    const { identifyPreviewTokenOnly, ...execution } = value;
    check(identifyPreviewTokenOnly === undefined || identifyPreviewTokenOnly === true, 'unsupported token identity mode');
    const approval = parseExecutionApproval({ ...execution, status: 'approved' }, 'preview', now());
    check(Date.parse(approval.expiresAt) - now() >= 150000, 'insufficient diagnostic custody time');
    mkdirSync(dirname(input.output), { recursive: true });
    const journal = input.output + '.events.jsonl';
    const fd = openSync(journal, 'wx', 0o600);
    closeSync(fd);
    const append = async (entry: Entry) => {
        const handle = openSync(journal, 'a', 0o600);
        try { appendFileSync(handle, JSON.stringify({ ...entry, at: new Date(now()).toISOString() }) + '\n'); fsyncSync(handle); }
        finally { closeSync(handle); }
    };
    const readToken = async () => { parseExecutionApproval({ ...execution, status: 'approved' }, 'preview', now()); return input.readToken(); };
    if (identifyPreviewTokenOnly) {
        const token = await readToken();
        check(token.length > 0 && token.length <= 8192 && !/[\r\n]/.test(token), 'protected credential unavailable');
        const audited = diagnosticFetch(input.fetch, append, now, true);
        for (const owner of ['user', 'account'] as const) {
            const url = owner === 'user' ? 'https://api.cloudflare.com/client/v4/user/tokens/verify' : `https://api.cloudflare.com/client/v4/accounts/${CORPUS_ACCOUNT_ID}/tokens/verify`;
            const response = await audited(url, { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
            if (owner === 'user' && [401, 403].includes(response.status)) continue;
            check(response.status === 200, 'preview token identity could not be verified');
            const result = await response.json() as { success?: boolean; result?: { id?: string; status?: string } };
            check(result.success === true && /^[0-9a-f]{32}$/.test(result.result?.id ?? '') && result.result?.status === 'active' && result.result.id !== token, 'invalid preview token identity');
            writeFileSync(input.output, JSON.stringify({ schemaVersion: 'norton-aquinas-preview-token-identity.v1', tokenId: result.result!.id, tokenOwner: owner, status: 'active', environment: 'preview', secretName: 'CLOUDFLARE_API_TOKEN', sourceCommit: process.env.CORPUS_SOURCE_COMMIT, sourceTree: process.env.CORPUS_SOURCE_TREE, capturedAt: new Date(now()).toISOString(), sqlCalls: 0, writes: 0, readinessReceipt: false, deployment: false }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            return;
        }
        throw Error('Preview token identity unavailable; no other credential was inspected.');
    }
    const api = createCorpusApi('preview', readToken, diagnosticFetch(input.fetch, append, now));
    const control = await captureUnboundCorpusControl({ role: 'preview', api, now });
    parseExecutionApproval({ ...execution, status: 'approved' }, 'preview', now());
    writeFileSync(input.output, JSON.stringify({ schemaVersion: 'norton-aquinas-control-diagnostic.v1', result: 'CONTROL_CAPTURE_COMPLETE_ONLY', databaseId: TARGETS.preview.id, capturedAt: control.capturedAt, inventorySha256: control.inventorySha256, controlSha256: hash(control), sqlCalls: 0, writes: 0, readinessReceipt: false, deployment: false }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    try {
        check(process.argv.length === 2, 'diagnostic takes no target or SQL arguments');
        const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' }).trim();
        git(['ls-files', '--error-unmatch', 'scripts/corpus-control-diagnostic.ts']);
        git(['diff', '--quiet', 'HEAD']);
        check(git(['rev-parse', 'HEAD']) === process.env.CORPUS_SOURCE_COMMIT && git(['rev-parse', 'HEAD^{tree}']) === process.env.CORPUS_SOURCE_TREE && process.env.GITHUB_REPOSITORY === 'TJ-Frederick/TheologAI' && process.env.CORPUS_PULL_REQUEST === '168' && process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_RUN_ATTEMPT === '1', 'diagnostic protected source context differs');
        check(process.env.RUNNER_TEMP, 'protected runner output unavailable');
        await runControlDiagnostic({ approval: JSON.parse(process.env.CORPUS_EXECUTION_APPROVAL ?? 'null'), output: join(process.env.RUNNER_TEMP, 'corpus-control-diagnostic.json'), readToken: async () => { check(process.env.CLOUDFLARE_API_TOKEN, 'protected credential unavailable'); return process.env.CLOUDFLARE_API_TOKEN; }, fetch });
        console.log('Control-only diagnostic completed; no corpus readiness or deployment is authorized.');
    } catch { console.error('Control-only diagnostic stopped. Preserve sanitized evidence; no retry.'); process.exitCode = 1; }
}
