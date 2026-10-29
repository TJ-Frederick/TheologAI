/** Fixed-account transport, derived from the existing bounded release API. No credential discovery or retries. */
import { CORPUS_ACCOUNT_ID, CORPUS_USAGE_QUERY, type CorpusControlApi } from './corpus-release-control.js';
import { TARGETS, check } from './corpus-release.js';
export function createCorpusApi(role: 'preview' | 'production', readToken: () => Promise<string>, fetchImpl: typeof fetch = fetch): CorpusControlApi & {
    authorizedFetch: typeof fetch;
} {
    const prefix = `https://api.cloudflare.com/client/v4/accounts/${CORPUS_ACCOUNT_ID}`;
    let nextStart = 0;
    const authorizedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input), method = init?.method ?? 'GET';
        if (method === 'GET')
            check(url.startsWith(prefix + '/') && /^\/(?:workers\/scripts(?:\/[A-Za-z0-9_-]+\/(?:settings|deployments|versions(?:\/[0-9a-f-]{36})?))?|pages\/projects(?:\/[A-Za-z0-9_-]+(?:\/deployments)?)?|d1\/database\/[0-9a-f-]{36})(?:\?(?:page|per_page|limit|cursor)=[A-Za-z0-9_-]+(?:&(?:page|per_page|limit|cursor)=[A-Za-z0-9_-]+)*)?$/.test(url.slice(prefix.length)), 'metadata route outside corpus scope');
        else if (url === 'https://api.cloudflare.com/client/v4/graphql') {
            const body = JSON.parse(String(init?.body));
            check(method === 'POST' && body.query === CORPUS_USAGE_QUERY && body.variables?.accountTag === CORPUS_ACCOUNT_ID, 'unapproved analytics query');
        }
        else
            check(method === 'POST' && url === prefix + '/d1/database/' + TARGETS[role].id + '/query', 'D1 route outside fixed target');
        check(init?.body === undefined || Buffer.byteLength(String(init.body)) <= 110000, 'request exceeds bound');
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
        try {
            const delay = Math.max(0, nextStart - Date.now());
            if (delay)
                await new Promise(r => setTimeout(r, delay));
            nextStart = Date.now() + 500;
            const token = await readToken();
            check(typeof token === 'string' && token.length > 0 && token.length <= 8192 && !/[\r\n]/.test(token), 'protected credential unavailable');
            const response = await fetchImpl(url, { ...init, redirect: 'error', signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal, headers: { ...Object.fromEntries(new Headers(init?.headers)), authorization: `Bearer ${token}`, accept: 'application/json' } });
            check(response.ok && response.body, 'API response failed or missing');
            const reader = response.body.getReader(), chunks: Uint8Array[] = [];
            let size = 0;
            for (;;) {
                const item = await reader.read();
                if (item.done)
                    break;
                size += item.value.byteLength;
                if (size > 1250000) {
                    await reader.cancel();
                    throw Error('response bound exceeded');
                }
                chunks.push(item.value);
            }
            return new Response(Buffer.concat(chunks), { status: response.status, headers: { 'content-type': 'application/json' } });
        }
        catch {
            controller.abort();
            throw Error('Corpus authenticated API failed or outcome unknown; no retry');
        }
        finally {
            clearTimeout(timer);
        }
    }) as typeof fetch;
    return { authorizedFetch, get: path => authorizedFetch(prefix + path), graphql: body => authorizedFetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) };
}
