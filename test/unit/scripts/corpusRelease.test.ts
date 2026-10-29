import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Native } from '../../helpers/corpusNative.js';
import { buildExactInsertQuery, digestLocalDeltaTable, type Row } from '../../../scripts/corpus-release-data.js';
import { buildSourceProof, planPreparation, applyPreparation, verifyCorpus, verifyReceipt, CorpusSession, AllowancePause, assertDefinitiveJournal, TARGETS, PROVIDER_CATALOG, FTS, LIMITS, hash, type JournalEntry, type SourceProof, type VerificationReceipt, type Control, type Meter } from '../../../scripts/corpus-release.js';
const root = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'corpus-release-test-'));
const baseline = process.env.THEOLOGAI_LOCAL_BASELINE;
let source: SourceProof;
beforeAll(() => { if(existsSync('data/theologai.db'))source = buildSourceProof(root, 'data/theologai.db'); }, 120000);
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const now = Date.parse('2026-10-27T12:00:00Z');
function control(role: 'preview' | 'production'): Control { return { databaseId: TARGETS[role].id, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), unbound: true, ownerCustodySha256: 'c'.repeat(64), bindingInventorySha256: 'd'.repeat(64) }; }
function fixture(path: string, count = 10) { const db = new Database(path); for (const row of PROVIDER_CATALOG)
    db.exec(String(row.sql)); source.migrationNames.slice(0, count).forEach((name, i) => db.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(?,?,?)').run(i + 1, name, '2026-10-27 10:00:00')); db.close(); }
function session(execute: (sql: string) => Promise<Meter>, maximum: {
    reads: number;
    writes: number;
} = { reads: LIMITS.proofReads, writes: LIMITS.proofWrites }, role:'preview'|'production'='preview') {
    const journal: JournalEntry[] = [];
    const result = new CorpusSession({ databaseId:TARGETS[role].id, execute, guard: async () => { }, usage: async () => ({ windowStart: '2026-10-27T00:00:00.000Z', observedAt: new Date(now).toISOString(), rowsRead: 0, rowsWritten: 0 }), append: async (e) => { journal.push(e); } }, maximum, () => now);
    return { result, journal };
}
describe.skipIf(!existsSync('data/theologai.db'))('actual Norton/Aquinas release implementation', () => {
    it('validates all source cells/schema and all local semantic/authority checks within the bounded setup timeout', () => {
        expect(Object.keys(source.canonical)).toHaveLength(39);
        expect(Object.values(source.canonical).reduce((n, t) => n + t.rows, 0)).toBe(1635226);
        expect(source.corpusIdentity).toBe('ef42dfff4fda29d708f2bd340bbd4463ab4a128408651cea887a97bc28199bb1');
    });
    it('forces bounded primary-key seeks for both singleton readbacks', () => {
        const db = new Database('data/theologai.db', { readonly: true });
        try {
            for (const table of ['historical_edition_hierarchies', 'historical_hierarchy_publications']) {
                const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {
                    name: string;
                    pk: number;
                }[], rows = db.prepare(`SELECT * FROM ${table}`).all() as Row[];
                const sql = buildExactInsertQuery(db, { table, columns: columns.map(c => c.name), keys: columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name), rows });
                expect(sql).toContain('INDEXED BY');
                expect(db.prepare('EXPLAIN QUERY PLAN ' + sql).all().some((r: any) => /^SEARCH b USING/.test(r.detail))).toBe(true);
            }
        }
        finally {
            db.close();
        }
    });
    it('stops on unknown outcomes and never dispatches a replacement', async () => {
        let calls = 0;
        const { result, journal } = session(async () => { calls++; throw Error('transport vanished'); });
        await expect(result.query('SELECT 1', 1)).rejects.toThrow();
        expect(result.halted).toBe(true);
        expect(() => assertDefinitiveJournal(journal)).toThrow('unknown');
        await expect(result.query('SELECT 1', 1)).rejects.toThrow('halted');
        expect(calls).toBe(1);
    });
    it('admits each operation and accounts for analytics lag using local metering', async () => {
        let calls = 0;
        const { result } = session(async () => { calls++; return { rows: [], rowsRead: 100, rowsWritten: 0 }; }, { reads: 100, writes: 0 });
        await result.query('SELECT 1', 100);
        await expect(result.query('SELECT 2', 1)).rejects.toBeInstanceOf(AllowancePause);
        expect(calls).toBe(1);
        expect(result.halted).toBe(false);
    });
    it('never records source bodies in the journal', async () => {
        const { result, journal } = session(async () => ({ rows: [{ content: 'private-body-sentinel' }], rowsRead: 1, rowsWritten: 0 }));
        await result.query('SELECT 1', 1);
        expect(JSON.stringify(journal)).not.toContain('private-body-sentinel');
        assertDefinitiveJournal(journal);
    });
    it.skipIf(!baseline||!existsSync('data/theologai.db'))('prepares the populated schema0009 baseline through actual triggers, four rank-1 checks, exact schema restoration and all 10,134 readbacks', async () => {
        expect(baseline, 'set THEOLOGAI_LOCAL_BASELINE to a retained populated schema0009 database').toBeTruthy();
        const plan = planPreparation(root, baseline!, 'data/theologai.db');
        const path = join(directory, 'preparation.db');
        copyFileSync(baseline!, path);
        fixture(path, 9);
        const native = new Native(join(directory, 'prep-native'));
        await native.load(path);
        const db = new Database('data/theologai.db', { readonly: true });
        const { result, journal } = session(sql => native.exec(sql), { reads: LIMITS.preparationReads, writes: LIMITS.preparationWrites },'production');
        try {
            const prepared = await applyPreparation(plan, result, db);
            expect(prepared.rowsWritten).toBe(51459);
            expect(plan.readbacks.reduce((n, r) => n + r.rows.length, 0)).toBe(10134);
            assertDefinitiveJournal(journal);
            const saved = join(directory, 'prepared.db');
            await native.save(saved);
            const final = new Database(saved, { readonly: true });
            try {
                for (const [name, digest] of Object.entries(source.canonical))
                    expect(digestLocalDeltaTable(final, name), name).toEqual(digest);
                expect(final.prepare("SELECT sql FROM sqlite_master WHERE name='historical_edition_hierarchy_node_preorder_insert'").get()).toEqual(db.prepare("SELECT sql FROM sqlite_master WHERE name='historical_edition_hierarchy_node_preorder_insert'").get());
            }
            finally {
                final.close();
            }
            writeFileSync(join(root, '../implementation-preparation.json'), JSON.stringify({ ...prepared, operations: plan.operations.length, phaseCosts: plan.operations.map((op, i) => ({ phase: op.phase, ...result.transcript[i] })), exactReadbackRequests: plan.readbacks.length, localOnly: true }, null, 2));
        }
        finally {
            db.close();
            await native.close();
        }
    }, 120000);
    it('runs one complete native proof and rejects omitted cells, index checks, altered custody, source, target and stale receipts', async () => {
        const path = join(directory, 'proof.db');
        copyFileSync('data/theologai.db', path);
        fixture(path);
        const native = new Native(join(directory, 'proof-native'));
        await native.load(path);
        const db = new Database('data/theologai.db', { readonly: true });
        const { result, journal } = session(sql => native.exec(sql));
        try {
            const receipt = await verifyCorpus(source, db, result, { role: 'preview', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), expectedLedger: source.migrationNames.slice(0, 10).map((name,i)=>({id:i+1,name,applied_at:'2026-10-27 10:00:00'})), captureControl: async () => control('preview') });
            assertDefinitiveJournal(journal);
            expect(receipt.metering.rowsRead).toBeLessThanOrEqual(LIMITS.proofReads);
            expect(receipt.metering.rowsWritten).toBe(4);
            expect(receipt.observed.ftsRank1).toEqual(FTS);
            const ledger = (await native.exec('SELECT id,name,applied_at FROM d1_migrations ORDER BY id LIMIT 11')).rows;
            const expected = { role: 'preview' as const, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), control: control('preview'), ledger };
            const changes: ((r: VerificationReceipt) => void)[] = [r => { delete r.observed.canonical.morphology; }, r => { r.observed.ftsRank1.pop(); }, r => { r.observed.control.ownerCustodySha256 = 'f'.repeat(64); }, r => { r.sourceTree = 'f'.repeat(40); }, r => { r.target.id = TARGETS.production.id; }, r => { r.startedAt = '2026-10-26T23:59:00.000Z'; }, r => { r.metering.rowsRead = LIMITS.proofReads + 1; }];
            for (const change of changes) {
                const modified = structuredClone(receipt);
                change(modified);
                expect(() => verifyReceipt(modified, source, expected, now)).toThrow();
            }
            writeFileSync(join(root, '../implementation-verification.json'), JSON.stringify({ ...receipt, localOnly: true, syntheticProviderLedger: true }, null, 2));
        }
        finally {
            db.close();
            await native.close();
        }
    }, 120000);
});
it.skipIf(!baseline)('verifies the actually prepared production candidate in its own complete proof window', async () => {
    const native = new Native(join(directory, 'production-proof-native'));
    await native.load(join(directory, 'prepared.db'));
    const db = new Database('data/theologai.db', { readonly: true });
    const { result } = session(sql => native.exec(sql),undefined,'production');
    try {
        const receipt = await verifyCorpus(source, db, result, { role: 'production', sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), expectedLedger: source.migrationNames.slice(0, 9).map((name,i)=>({id:i+1,name,applied_at:'2026-10-27 10:00:00'})), captureControl: async () => control('production') });
        expect(receipt.observed.ftsRank1).toEqual(FTS);
        writeFileSync(join(root, '../implementation-verification-production.json'), JSON.stringify({ ...receipt, localOnly: true, syntheticProviderLedger: true }, null, 2));
    }
    finally {
        db.close();
        await native.close();
    }
}, 120000);
