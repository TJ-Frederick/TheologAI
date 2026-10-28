import { createWorkerCompositionRoot } from '../../src/tools/worker/index.js';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createTheologAiMcpServer, STATELESS_HTTP_CAPABILITIES } from '../../src/mcp/server.js';
import type { Native } from './corpusNative.js';
export function corpusMcp(native: Native, preview: boolean, record: (sql: string, reads: number) => void): typeof fetch {
    function statement(sql: string, bindings: any[] = []): any {
        const all = async () => { const result = await native.bound(sql, bindings); if (result.rowsWritten)
            throw Error('Application attempted a write'); record(sql, result.rowsRead); return { success: true, results: result.rows, meta: { rows_read: result.rowsRead, rows_written: 0, changes: 0 } }; };
        return { bind: (...values: any[]) => statement(sql, values), all, first: async (column?: string) => { const row = (await all()).results[0] ?? null; return column && row ? row[column] : row; }, raw: async () => (await all()).results.map(Object.values), run: () => { throw Error('Application writes forbidden'); } };
    }
    const database = { prepare: statement, batch: async (statements: any[]) => { const results = []; for (const s of statements)
            results.push(await s.all()); return results; } };
    const env = { THEOLOGAI_DB: database, THEOLOGAI_EXPOSE_CCEL_DISCOVERY: preview ? 'true' : 'false', THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'false', THEOLOGAI_ENABLE_CCEL_COORDINATOR: 'false' };
    return (async (input: any, init?: any) => {
        const root = createWorkerCompositionRoot(env as any);
        const handler = createMcpHandler(({ era }) => createTheologAiMcpServer(root, preview ? '3.6.0-preview' : '3.6.0', STATELESS_HTTP_CAPABILITIES, era), { legacy: 'stateless', responseMode: 'auto' });
        return handler.fetch(input instanceof Request ? input : new Request(String(input), init));
    }) as typeof fetch;
}
