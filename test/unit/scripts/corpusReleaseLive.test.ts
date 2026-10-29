import { existsSync } from 'node:fs';
import { it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Native } from '../../helpers/corpusNative.js';
import { corpusMcp } from '../../helpers/corpusMcp.js';
import { auditCorpusRelease } from '../../../scripts/audit-corpus-release.js';
for (const role of ['preview', 'production'] as const)
    it.skipIf(!existsSync('data/theologai.db'))(`checks actual ${role} MCP calls in both eras against exact corpus bodies and fixed language assertions`, async () => {
        const dir = mkdtempSync(join(tmpdir(), 'corpus-live-')), native = new Native(dir);
        const queries: {
            sql: string;
            reads: number;
        }[] = [];
        try {
            await native.load('data/theologai.db');
            const receipt = await auditCorpusRelease({ role, endpoint: 'https://local.test/mcp', serverVersion: role === 'preview' ? '3.6.0-preview' : '3.6.0', databasePath: 'data/theologai.db', root: process.cwd(), fetch: corpusMcp(native, role === 'preview', (sql, reads) => queries.push({ sql, reads })) });
            const reads = queries.reduce((n, r) => n + r.reads, 0);
            expect(reads).toBeLessThan(90000);
            expect(receipt.protocols).toHaveLength(2);
            expect(receipt.broaderV9Features).toBe(false);
            writeFileSync(join(process.cwd(), `../implementation-live-${role}.json`), JSON.stringify({ ...receipt, metering: { rowsRead: reads, rowsWritten: 0, sqlRequests: queries.length }, localOnly: true }, null, 2));
        }
        finally {
            await native.close();
            rmSync(dir, { recursive: true, force: true });
        }
    }, 120000);
