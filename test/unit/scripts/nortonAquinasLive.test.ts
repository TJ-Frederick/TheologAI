import { existsSync } from 'node:fs';
import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Native } from '../../helpers/corpusNative.js';
import { corpusMcp } from '../../helpers/corpusMcp.js';
import { runCorpusAcceptance, type AcceptanceOptions } from '../../../scripts/release-acceptance.js';
// These probes use real asynchronous SQLite I/O. The fault fixture injects one
// HTTP response at a known probe. Keep its real request deadlines independent
// of CI load. The release workflow rehearses the default pacing on real Workerd.
const localFixturePace: NonNullable<AcceptanceOptions['pace']> = async (signal, guard, dispatch) => {
    signal.throwIfAborted();
    guard();
    return dispatch();
};

for (const role of ['preview', 'production'] as const)
    it.skipIf(!existsSync('data/theologai.db'))(`checks actual ${role} MCP calls in both eras against exact corpus bodies and fixed language assertions`, async () => {
        const dir = mkdtempSync(join(tmpdir(), 'corpus-live-')), native = new Native(dir);
        const queries: {
            sql: string;
            reads: number;
        }[] = [];
        try {
            await native.load('data/theologai.db');
            const receipt = await runCorpusAcceptance({ pace: localFixturePace, guard: () => {}, role, endpoint: 'https://local.test/mcp', serverVersion: role === 'preview' ? '3.6.0-preview' : '3.6.0', databasePath: 'data/theologai.db', root: process.cwd(), fetch: corpusMcp(native, role === 'preview', (sql, reads) => queries.push({ sql, reads })) });
            expect(receipt.failure).toBeUndefined();
            expect(receipt.checks).toHaveLength(370);
            const reads = queries.reduce((n, r) => n + r.reads, 0);
            expect(reads).toBeLessThan(90000);
            expect(receipt.protocols).toHaveLength(2);
            expect(receipt.broaderV9Features).toBe(false);
            mkdirSync(join(process.cwd(),'test-output'),{recursive:true});
            writeFileSync(join(process.cwd(), `test-output/implementation-live-${role}.json`), JSON.stringify({ ...receipt, metering: { rowsRead: reads, rowsWritten: 0, sqlRequests: queries.length }, localOnly: true }, null, 2));
        }
        finally {
            await native.close();
            rmSync(dir, { recursive: true, force: true });
        }
    }, 120000);

it.skipIf(!existsSync('data/theologai.db'))('replays the modern Wesley HTTP 503 and stops at the same acceptance boundary', async () => {
    const endpoint = 'https://local.test/mcp';
    const dir = mkdtempSync(join(tmpdir(), 'corpus-wesley-failure-'));
    const databasePath = 'data/theologai.db';
    const native = new Native(dir);
    try {
        await native.load(databasePath);
        const localFetch = corpusMcp(native, true, () => {});
        let wesleyDispatches = 0, afterFailure = 0;
        const replay: typeof fetch = async (input, init) => {
            if (wesleyDispatches > 0) afterFailure++;
            const rpc = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
            const modern = new Headers(init?.headers).get('mcp-protocol-version') === '2026-07-28';
            if (modern && rpc?.method === 'tools/call' && rpc.params?.name === 'primary_source_search'
                && rpc.params.arguments?.queries?.[0]?.work === 'wesley-standard-sermons') {
                wesleyDispatches++;
                return Response.json({ diagnostic: 'local simulated provider response' }, { status: 503 });
            }
            return localFetch(input, init);
        };
        const receipt = await runCorpusAcceptance({
            pace: localFixturePace,
            role: 'preview', endpoint, serverVersion: '3.6.0-preview', databasePath, fetch: replay, guard: () => {},
        });
        expect(receipt, JSON.stringify(receipt.failure)).toMatchObject({ passed: false, failure: {
            category: 'http_status', era: '2026-07-28', probeId: 'search:wesley-standard-sermons',
            lastHttpStatus: 503, completedChecks: 222, lastCompletedProbe: 'global-search-body:wesley-standard-sermons',
        } });
        expect(wesleyDispatches).toBe(1);
        expect(afterFailure).toBe(0);
        expect(JSON.stringify(receipt)).not.toContain('local simulated provider response');
    } finally {
        await native.close();
        rmSync(dir, { recursive: true, force: true });
    }
}, 120000);
