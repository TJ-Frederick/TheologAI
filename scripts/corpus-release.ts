/** Small corpus-only release path. No network, credential, Wrangler or deployment implementation. */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unstable_splitSqlQuery as split } from 'wrangler';
import { z } from 'zod';
import { canonicalJson } from './audit-historical-core-preview.js';
import { computeD1CorpusIdentity, parseDataManifest, verifyD1Migrations, verifyManifestFileChecksum } from './d1-corpus-identity.js';
import { runRemoteD1ReadinessCheck } from './check-remote-d1-readiness.js';
import { CORPUS_INSERT_TABLES, deriveLocalHistoricalAdditions, digestLocalDeltaTable, readTable, verifyExactInsertRows, type Row, type ExactInsertRows, type ProofReader } from './corpus-release-data.js';
export const TARGETS = Object.freeze({
    preview: { name: 'theologai-preview-20260728-transform11-a', id: '62b871a6-5b4d-4d9b-8f52-301f6c878f48' },
    production: { name: 'theologai-preview-20260811-schema0009-a', id: '74f456e2-6951-4003-bb6f-91951342bf8f' },
    rollback: { name: 'theologai-production-20260811-schema0009-a', id: '9bc79346-338b-439e-a2a5-424f4418eb21' },
});
export const FTS = ['strongs_fts', 'sections_fts', 'historical_edition_sections_fts', 'historical_edition_hierarchy_bodies_fts'] as const;
export const CATALOG_SQL = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name;";
export const LEDGER_SQL = 'SELECT id,name,applied_at FROM d1_migrations ORDER BY id LIMIT 11;';
export const LIMITS = Object.freeze({ dailyReads: 5000000, dailyWrites: 80000, productionReserve: 1000000, lagReserve: 200000,
    proofReads: 3560000, proofWrites: 4100, preparationReads: 250000, preparationWrites: 115000, liveReads: 90000,
    controlsReads: 10000, durationMs: 90 * 60000, freshnessMs: 120 * 60000 });
export const POLICY = 'norton-aquinas-complete-cells-schema-fk-witness-global-quick-four-rank1.v1';
export const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const hash = (value: unknown) => sha(canonicalJson(value));
export function check(value: unknown, message: string): asserts value { if (!value)
    throw Error(`Corpus release refused: ${message}`); }
export function same(a: unknown, b: unknown, label: string) { check(hash(a) === hash(b), label); }
const id = (name: string) => { check(/^[a-z_][a-z0-9_]*$/.test(name), 'unsafe identifier'); return `"${name}"`; };
const literal = (value: unknown): string => { if (value === null)
    return 'NULL'; if (typeof value === 'number' && Number.isFinite(value))
    return String(value); check(typeof value === 'string' && !value.includes('\0'), 'unsupported literal'); return `'${value.replaceAll("'", "''")}'`; };
const providerNames = ['_cf_KV', 'd1_migrations'];
const appCatalog = (rows: Row[]) => rows.filter(row => !providerNames.includes(String(row.name)));
export function foreignKeyWitness(source: Database.Database, names: string[], replay: Database.Database): string {
    same(source.prepare(CATALOG_SQL).all(), replay.prepare(CATALOG_SQL).all(), 'compiled schema differs from source migrations');
    const relationships: Row[] = [];
    for (const { name } of source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {
        name: string;
    }[]) {
        const rows = source.prepare(`PRAGMA foreign_key_list(${id(name)})`).all() as Row[];
        same(rows, replay.prepare(`PRAGMA foreign_key_list(${id(name)})`).all(), 'source FK definitions differ');
        for (const row of rows) {
            check(names.includes(name) && names.includes(String(row.table)), 'FK child or parent omitted');
            relationships.push({ child: name, ...row });
        }
    }
    same(source.prepare('PRAGMA foreign_key_check').all(), [], 'source FK violation');
    // Exact raw CREATE definitions bind parent uniqueness, collations and FK actions.
    return hash({ method: 'locally_clean_keys_with_complete_child_parent_cells_and_exact_source_schema', relationships });
}
/** Run legacy semantics/authority once locally; never label their metering remote. */
export function buildSourceProof(root: string, databasePath: string) {
    const manifestBytes = readFileSync(join(root, 'data/data-manifest.json'));
    const manifest = parseDataManifest(manifestBytes);
    for (const file of manifest.files)
        verifyManifestFileChecksum(root, file);
    const migrations = verifyD1Migrations(root, manifest);
    const sourceHash = sha(readFileSync(databasePath));
    const source = new Database(databasePath, { readonly: true, fileMustExist: true });
    const replay = new Database(':memory:');
    try {
        for (const migration of migrations)
            replay.exec(migration.toString());
        const names = Object.keys(manifest.expectedCounts).filter(name => !FTS.includes(name as typeof FTS[number]) || name === 'strongs_fts').sort();
        check(names.length === 39, 'canonical inventory differs');
        const local = runRemoteD1ReadinessCheck({ database: 'corpus-source-local', cwd: root }, (_file, args) => {
            const position = args.indexOf('--command');
            check(position >= 0, 'missing local gate SQL');
            return JSON.stringify(split(args[position + 1]!).map(sql => { const statement = source.prepare(sql); check(statement.reader, 'local semantic mutation'); return { success: true, results: statement.all() }; }));
        });
        const canonical = Object.fromEntries(names.map(name => [name, digestLocalDeltaTable(source, name)]));
        const fkWitness = foreignKeyWitness(source, names, replay);
        check(sha(readFileSync(databasePath)) === sourceHash, 'source changed while validating');
        return { policy: POLICY, manifestSha256: sha(manifestBytes), databaseSha256: sourceHash, corpusIdentity: computeD1CorpusIdentity(manifest),
            canonical, catalog: source.prepare(CATALOG_SQL).all() as Row[], fkWitness, localSemanticReceiptSha256: hash(local), migrationNames: manifest.materializations.d1.migrations.map(m => m.path.split('/').at(-1)!) };
    }
    finally {
        source.close();
        replay.close();
    }
}
export type SourceProof = ReturnType<typeof buildSourceProof>;
export interface Operation {
    phase: string;
    sql: string;
    readCeiling: number;
    writeCeiling: number;
}
export interface PreparationPlan {
    schemaVersion: 'norton-aquinas-preparation.v1';
    target: typeof TARGETS.production;
    baselineSha256: string;
    sourceSha256: string;
    operations: Operation[];
    readbacks: ExactInsertRows[];
    sha256: string;
}
/** Only the recursive join order changes; the final source definition is restored. */
export function optimizePreorderTrigger(trigger: string): string {
    const match = 'FROM historical_edition_hierarchy_nodes child\n      JOIN traversal ON traversal.node_key = child.parent_node_key';
    const optimized = trigger.replace(match, 'FROM traversal CROSS JOIN historical_edition_hierarchy_nodes child\n          ON traversal.node_key = child.parent_node_key');
    check(optimized !== trigger, 'reviewed trigger shape changed');
    return optimized;
}

/** Only the retained populated schema0009 baseline is eligible, never an empty DB. */
export function planPreparation(root: string, baselinePath: string, sourcePath: string): PreparationPlan {
    check(sha(readFileSync(baselinePath)) === '6ec5e7d77c65c4df9910b4e21f603fc61f39498b87a6556ed5d1ca2284d48b16', 'local baseline bytes differ from retained source');
    const old = new Database(baselinePath, { readonly: true, fileMustExist: true }), source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    try {
        const metadata = (db: Database.Database) => Object.fromEntries((db.prepare('SELECT key,value FROM theologai_metadata ORDER BY key').all() as {
            key: string;
            value: string;
        }[]).map(r => [r.key, r.value]));
        check(Object.values(metadata(old)).includes('66c148a206b9b0eb1bf7552572570c42dabfd0ba591b63e0cf0d02adda35aa07'), 'wrong populated baseline identity');
        check(Object.values(metadata(source)).includes('ef42dfff4fda29d708f2bd340bbd4463ab4a128408651cea887a97bc28199bb1'), 'wrong successor identity');
        check((old.prepare('SELECT count(*) n FROM morphology').get() as {
            n: number;
        }).n > 400000, 'empty/incomplete baseline');
        const manifest = parseDataManifest(readFileSync(join(root, 'data/data-manifest.json')));
        const migrations = verifyD1Migrations(root, manifest);
        const replay = new Database(':memory:');
        try {
            for (const bytes of migrations.slice(0, 9))
                replay.exec(bytes.toString());
            same(old.prepare(CATALOG_SQL).all(), replay.prepare(CATALOG_SQL).all(), 'local baseline schema differs from first nine source migrations');
        }
        finally {
            replay.close();
        }
        for (const name of Object.keys(manifest.expectedCounts).filter(t => !FTS.includes(t as typeof FTS[number]) && !CORPUS_INSERT_TABLES.includes(t as typeof CORPUS_INSERT_TABLES[number]) && !['theologai_metadata', 'historical_corpus_seal'].includes(t)))
            same(digestLocalDeltaTable(old, name), digestLocalDeltaTable(source, name), `foundation changed: ${name}`);
        const delta = deriveLocalHistoricalAdditions(old, source, CORPUS_INSERT_TABLES);
        check(delta.statements.length === 10134, 'unexpected additive row count');
        const trigger = (source.prepare("SELECT sql FROM sqlite_master WHERE name='historical_edition_hierarchy_node_preorder_insert'").get() as {
            sql: string;
        }).sql;
        const optimized = optimizePreorderTrigger(trigger);
        const operations: Operation[] = [];
        const add = (phase: string, sql: string, readCeiling = 256, writeCeiling = 256) => operations.push({ phase, sql, readCeiling, writeCeiling });
        add('unseal', 'DELETE FROM historical_corpus_seal WHERE seal_id=1;', 8, 8);
        for (const sql of split(readFileSync(join(root, 'migrations/0010_active_aquinas_hierarchy_publication.sql'), 'utf8')))
            add('migration10', sql, 4096, 256);
        add('ledger10', "INSERT INTO d1_migrations(name) VALUES('0010_active_aquinas_hierarchy_publication.sql');", 16, 16);
        add('temporary-trigger', 'DROP TRIGGER historical_edition_hierarchy_node_preorder_insert;', 4096, 32);
        add('temporary-trigger', optimized, 4096, 32);
        const terminalSql = delta.statements.filter(op => op.table === 'historical_edition_hierarchy_nodes').at(-1)!.sql;
        for (const op of delta.statements)
            add('additions:' + op.table, op.sql, op.sql === terminalSql ? 30000 : 256, 256);
        for (const [index, table] of FTS.slice(1).entries())
            add('rebuild:' + table, `INSERT INTO ${table}(${table}) VALUES('rebuild');`, 30000, [25852, 17285, 12401][index]);
        for (const table of FTS)
            add('integrity:' + table, `INSERT INTO ${table}(${table},rank) VALUES('integrity-check',1);`, 1024, 1025);
        add('restore-trigger', 'DROP TRIGGER historical_edition_hierarchy_node_preorder_insert;', 4096, 32);
        add('restore-trigger', trigger, 4096, 32);
        for (const [key, value] of Object.entries(metadata(source)))
            add('identity', `UPDATE theologai_metadata SET value=${literal(value)} WHERE key=${literal(key)};`, 8, 8);
        const seal = source.prepare('SELECT * FROM historical_corpus_seal').get() as Row;
        add('seal', `INSERT INTO historical_corpus_seal(${Object.keys(seal).map(id).join(',')}) VALUES(${Object.values(seal).map(literal).join(',')});`, 256, 32);
        const readbacks: ExactInsertRows[] = [];
        for (const table of CORPUS_INSERT_TABLES) {
            const info = source.prepare(`PRAGMA table_info(${id(table)})`).all() as {
                name: string;
                pk: number;
            }[];
            const columns = info.map(c => c.name), keys = info.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
            const lookup = old.prepare(`SELECT 1 FROM ${id(table)} WHERE ${keys.map(k => `${id(k)} IS ?`).join(' AND ')}`);
            const rows = (source.prepare(`SELECT * FROM ${id(table)} ORDER BY ${keys.map(id).join(',')}`).all() as Row[]).filter(r => !lookup.get(...keys.map(k => r[k])));
            for (let offset = 0; offset < rows.length;) {
                let n = Math.min(25, rows.length - offset);
                while (Buffer.byteLength(JSON.stringify(rows.slice(offset, offset + n))) > 900000 && n > 1)
                    n = Math.floor(n / 2);
                readbacks.push({ table, columns, keys, rows: rows.slice(offset, offset + n) });
                offset += n;
            }
        }
        const batched: Operation[] = [];
        let pending: Operation[] = [];
        const flush = () => { if (pending.length) {
            batched.push({ phase: pending[0].phase, sql: pending.map(op => op.sql.trim().replace(/;?$/, ';')).join('\n'), readCeiling: pending.reduce((n, op) => n + op.readCeiling, 0), writeCeiling: pending.reduce((n, op) => n + op.writeCeiling, 0) });
            pending = [];
        } };
        for (const op of operations) {
            if (pending.length && (pending[0].phase !== op.phase || pending.length >= 25 || Buffer.byteLength(pending.map(p => p.sql).join('\n') + '\n' + op.sql) > 90000))
                flush();
            pending.push(op);
        }
        flush();
        const body = { schemaVersion: 'norton-aquinas-preparation.v1' as const, target: TARGETS.production, baselineSha256: sha(readFileSync(baselinePath)), sourceSha256: sha(readFileSync(sourcePath)), operations: batched, readbacks };
        return { ...body, sha256: hash(body) };
    }
    finally {
        old.close();
        source.close();
    }
}
export interface Meter {
    rows: Row[];
    rowsRead: number;
    rowsWritten: number;
}
export interface Usage {
    windowStart: string;
    observedAt: string;
    rowsRead: number;
    rowsWritten: number;
}
export interface JournalEntry {
    index: number;
    sqlSha256: string;
    state: 'intent' | 'complete';
    readCeiling?: number;
    writeCeiling?: number;
    result?: {
        rowsRead: number;
        rowsWritten: number;
        responseSha256: string;
    };
}
/** Dependencies must implement the existing authenticated/control wrappers after approval. */
export type CorpusExecutor = ((sql: string) => Promise<Meter>) & { databaseId?: string };
export interface SessionDependencies {
    databaseId: string;
    productionReadReserve?: number;
    execute: CorpusExecutor;
    usage(): Promise<Usage>;
    guard(): Promise<void>;
    append(entry: JournalEntry): Promise<void>;
}
export class AllowancePause extends Error {
}
export class CorpusSession implements ProofReader {
    halted = false;
    reads = 0;
    writes = 0;
    requests = 0;
    private busy = false;
    private anchor: Usage | null = null;
    private windowReads = 0;
    private windowWrites = 0;
    transcript: {
        sqlSha256: string;
        rowsRead: number;
        rowsWritten: number;
        responseSha256: string;
    }[] = [];
    constructor(readonly dependencies: SessionDependencies, readonly maximum: {
        reads: number;
        writes: number;
    } = { reads: LIMITS.proofReads, writes: LIMITS.proofWrites }, readonly now = () => Date.now()) {
        check([TARGETS.preview.id, TARGETS.production.id].includes(dependencies.databaseId), 'unknown session target');
        check(dependencies.execute.databaseId === undefined || dependencies.execute.databaseId === dependencies.databaseId, 'executor/session target mismatch');
        const reserve = dependencies.productionReadReserve ?? LIMITS.productionReserve;
        check(Number.isSafeInteger(reserve) && reserve >= 0 && reserve <= LIMITS.productionReserve, 'invalid production read reserve');
        check(reserve === LIMITS.productionReserve || (dependencies.databaseId === TARGETS.preview.id && new Date(now()).toISOString().slice(0, 10) === '2026-10-29'), 'reduced reserve is only authorized for the October 29 preview');
    }
    async query(sql: string, readCeiling: number, writeCeiling = 0): Promise<Meter> {
        check(!this.busy, 'concurrent operation');
        this.busy = true;
        try {
            return await this.perform(sql, readCeiling, writeCeiling);
        }
        finally {
            this.busy = false;
        }
    }
    private async perform(sql: string, readCeiling: number, writeCeiling = 0): Promise<Meter> {
        check(!this.halted, 'session halted or concurrent operation; outcome reconciliation required');
        check(Number.isSafeInteger(readCeiling) && readCeiling >= 0 && Number.isSafeInteger(writeCeiling) && writeCeiling >= 0, 'invalid operation ceiling');
        await this.dependencies.guard();
        const usage = await this.dependencies.usage();
        check(Date.parse(usage.observedAt) <= this.now() + 30000 && this.now() - Date.parse(usage.observedAt) <= 300000, 'stale usage observation');
        check(usage.windowStart === new Date(this.now()).toISOString().slice(0, 10) + 'T00:00:00.000Z' && [usage.rowsRead, usage.rowsWritten].every(n => Number.isSafeInteger(n) && n >= 0), 'stale or unknown usage');
        if (!this.anchor || this.anchor.windowStart !== usage.windowStart) {
            this.anchor = { ...usage };
            this.windowReads = 0;
            this.windowWrites = 0;
        }
        const effectiveReads = Math.max(usage.rowsRead, this.anchor.rowsRead + this.windowReads), effectiveWrites = Math.max(usage.rowsWritten, this.anchor.rowsWritten + this.windowWrites);
        if (effectiveReads + readCeiling + (this.dependencies.productionReadReserve ?? LIMITS.productionReserve) + LIMITS.lagReserve > LIMITS.dailyReads || effectiveWrites + writeCeiling > LIMITS.dailyWrites || this.reads + readCeiling > this.maximum.reads || this.writes + writeCeiling > this.maximum.writes)
            throw new AllowancePause('Operation not admitted; pause before dispatch');
        const index = this.requests;
        const sqlSha256 = sha(sql);
        // Durable intent precedes dispatch. A crash before complete is UNKNOWN, including integrity commands.
        this.busy = true;
        this.halted = true;
        await this.dependencies.append({ index, sqlSha256, state: 'intent', readCeiling, writeCeiling });
        const result = await this.dependencies.execute(sql);
        check(result && Array.isArray(result.rows) && [result.rowsRead, result.rowsWritten].every(n => Number.isSafeInteger(n) && n >= 0), 'unknown metering/outcome');
        this.reads += result.rowsRead;
        this.writes += result.rowsWritten;
        this.windowReads += result.rowsRead;
        this.windowWrites += result.rowsWritten;
        this.requests++;
        check(result.rowsRead <= readCeiling && result.rowsWritten <= writeCeiling, `actual cost exceeds reserved ceiling for ${sqlSha256}: ${result.rowsRead}/${readCeiling} reads, ${result.rowsWritten}/${writeCeiling} writes`);
        await this.dependencies.append({ index, sqlSha256, state: 'complete', result: { rowsRead: result.rowsRead, rowsWritten: result.rowsWritten, responseSha256: hash(result.rows) } });
        this.transcript.push({ sqlSha256, rowsRead: result.rowsRead, rowsWritten: result.rowsWritten, responseSha256: hash(result.rows) });
        this.halted = false;
        this.busy = false;
        return result;
    }
    async queryReadOnly(page: ReturnType<typeof import('./corpus-release-data.js').buildTablePage>) { const result = await this.query(page.sql, page.readCeiling); return { results: [{ results: result.rows }] }; }
}
/** A partial/unknown journal is never accepted for automatic replay. */
export function assertDefinitiveJournal(entries: JournalEntry[]): void {
    check(entries.length % 2 === 0, 'unknown operation: do not retry');
    for (let i = 0; i < entries.length; i += 2) {
        const a = entries[i], b = entries[i + 1];
        check(a.state === 'intent' && b.state === 'complete' && a.index === i / 2 && b.index === a.index && a.sqlSha256 === b.sqlSha256 && !!b.result, 'unknown or mismatched journal');
    }
}
export async function applyPreparation(plan: PreparationPlan, session: CorpusSession, source: Database.Database, completed: JournalEntry[] = []) {
    check(session.dependencies.databaseId === TARGETS.production.id, 'preparation session target mismatch');
    check(!session.requests && !session.reads && !session.writes, 'preparation requires its own fresh session after preflight');
    assertDefinitiveJournal(completed);
    const sourcePath = (source.pragma('database_list') as {
        name: string;
        file: string;
    }[]).find(row => row.name === 'main')?.file;
    check(sourcePath && sha(readFileSync(sourcePath)) === plan.sourceSha256, 'preparation source bytes changed');
    const { sha256, ...body } = plan;
    same(hash(body), sha256, 'preparation plan changed');
    same(plan.target, TARGETS.production, 'preparation target differs');
    check(completed.length / 2 <= plan.operations.length, 'resume contains non-preparation operations');
    for (let i = 0; i < completed.length; i += 2)
        same(completed[i].sqlSha256, sha(plan.operations[i / 2].sql), 'resume journal is not the exact plan prefix');
    session.requests = completed.length / 2;
    for (const entry of completed.filter(e => e.state === 'complete')) {
        session.reads += entry.result!.rowsRead;
        session.writes += entry.result!.rowsWritten;
    }
    for (const op of plan.operations.slice(completed.length / 2))
        await session.query(op.sql, op.readCeiling, op.writeCeiling);
    const readbacks = [];
    for (const proof of plan.readbacks)
        readbacks.push(await verifyExactInsertRows(session, source, proof));
    return { planSha256: plan.sha256, readbacksSha256: hash(readbacks), rowsRead: session.reads, rowsWritten: session.writes };
}
export const PROVIDER_CATALOG: Row[] = [
    { type: 'table', name: '_cf_KV', tbl_name: '_cf_KV', sql: 'CREATE TABLE _cf_KV (\n        key TEXT PRIMARY KEY,\n        value BLOB\n      ) WITHOUT ROWID' },
    { type: 'table', name: 'd1_migrations', tbl_name: 'd1_migrations', sql: 'CREATE TABLE "d1_migrations"(\n\t\tid         INTEGER PRIMARY KEY AUTOINCREMENT,\n\t\tname       TEXT UNIQUE,\n\t\tapplied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL\n)' }
];
function assertCatalog(rows: Row[], source: SourceProof) {
    same(appCatalog(rows), source.catalog, 'application schema changed');
    same(rows.filter(r => providerNames.includes(String(r.name))), PROVIDER_CATALOG, 'unreviewed provider schema');
}
function assertLedger(rows: Row[], source: SourceProof) {
    check(rows.length === 10, 'migration ledger cardinality differs');
    rows.forEach((row, index) => { check(row.id === index + 1 && row.name === source.migrationNames[index] && typeof row.applied_at === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(row.applied_at), 'migration ledger differs'); });
}
export interface Control {
    databaseId: string;
    sourceCommit: string;
    sourceTree: string;
    unbound: true;
    ownerCustodySha256: string;
    bindingInventorySha256: string;
}
const checksum = z.string().regex(/^[0-9a-f]{64}$/), git = z.string().regex(/^[0-9a-f]{40}$/), count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const controlSchema = z.object({ databaseId: z.string().uuid(), sourceCommit: git, sourceTree: git, unbound: z.literal(true), ownerCustodySha256: checksum, bindingInventorySha256: checksum }).strict();
const digestSchema = z.object({ rows: count, sha256: checksum }).strict();
export const receiptSchema = z.object({ schemaVersion: z.literal('norton-aquinas-verification.v1'), policy: z.literal(POLICY), role: z.enum(['preview', 'production']),
    target: z.object({ name: z.string(), id: z.string().uuid() }).strict(), sourceCommit: git, sourceTree: git, startedAt: z.string().datetime(), completedAt: z.string().datetime(),
    source: z.object({ manifestSha256: checksum, databaseSha256: checksum, corpusIdentity: checksum, canonical: z.record(z.string(), digestSchema), catalogSha256: checksum, fkWitness: checksum, localSemanticReceiptSha256: checksum }).strict(),
    observed: z.object({ canonical: z.record(z.string(), digestSchema), catalogSha256: checksum, ledgerSha256: checksum, quickCheck: z.literal('ok'), fkMethod: z.literal('complete_source_equivalence_with_local_fk_witness'), ftsRank1: z.array(z.string()), control: controlSchema }).strict(),
    metering: z.object({ requests: count, rowsRead: count, rowsWritten: count, transcriptSha256: checksum }).strict(),
}).strict();
export type VerificationReceipt = z.infer<typeof receiptSchema>;
function receiptSource(source: SourceProof) { const { policy: _, catalog, migrationNames: __, ...rest } = source; return { ...rest, catalogSha256: hash(catalog) }; }
export function verifyReceipt(value: unknown, source: SourceProof, expected: {
    role: 'preview' | 'production';
    sourceCommit: string;
    sourceTree: string;
    control: Control;
    ledger: Row[];
}, now = Date.now()): VerificationReceipt {
    const receipt = receiptSchema.parse(value);
    same(receipt.source, receiptSource(source), 'receipt source differs');
    check(receipt.role === expected.role && receipt.sourceCommit === expected.sourceCommit && receipt.sourceTree === expected.sourceTree, 'receipt source/role differs');
    same(receipt.target, TARGETS[expected.role], 'receipt target differs');
    same(receipt.observed.control, expected.control, 'receipt custody/control changed');
    check(expected.control.databaseId === receipt.target.id && expected.control.sourceCommit === receipt.sourceCommit && expected.control.sourceTree === receipt.sourceTree, 'control target/source differs');
    same(receipt.observed.canonical, source.canonical, 'complete canonical cells differ');
    assertLedger(expected.ledger, source);
    same(receipt.observed.ledgerSha256, hash(expected.ledger), 'ledger receipt differs');
    same(receipt.observed.catalogSha256, hash([...source.catalog, ...PROVIDER_CATALOG].sort((a, b) => (String(a.type) < String(b.type) ? -1 : String(a.type) > String(b.type) ? 1 : String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0))), 'exact provider catalog differs');
    same(receipt.observed.ftsRank1, FTS, 'four rank-1 checks required');
    const start = Date.parse(receipt.startedAt), end = Date.parse(receipt.completedAt);
    check(start <= end && end <= now + 30000 && now - end <= LIMITS.freshnessMs && end - start <= LIMITS.durationMs && receipt.startedAt.slice(0, 10) === receipt.completedAt.slice(0, 10), 'receipt time window invalid');
    check(receipt.metering.requests >= 3300 && receipt.metering.rowsRead > 0 && receipt.metering.rowsRead <= LIMITS.proofReads && receipt.metering.rowsWritten <= LIMITS.proofWrites, 'receipt usage invalid');
    return receipt;
}
/** One uninterrupted unbound/custodied proof, one UTC window. No scratch schema or postings scan. */
export async function verifyCorpus(source: SourceProof, db: Database.Database, session: CorpusSession, input: {
    role: 'preview' | 'production';
    sourceCommit: string;
    sourceTree: string;
    expectedLedger: Row[];
    captureControl: () => Promise<Control>;
}) {
    check(session.dependencies.databaseId === TARGETS[input.role].id, 'verification session target mismatch');
    const startedAt = new Date(session.now()).toISOString();
    check(!session.requests && !session.reads && !session.writes, 'proof needs its own fresh session');
    const before = controlSchema.parse(await input.captureControl());
    check(before.databaseId === TARGETS[input.role].id && before.sourceCommit === input.sourceCommit && before.sourceTree === input.sourceTree, 'wrong verification control');
    const boundary = async () => {
        const catalog = (await session.query(CATALOG_SQL, 4096)).rows;
        assertCatalog(catalog, source);
        const ledger = (await session.query(LEDGER_SQL, 16)).rows;
        assertLedger(ledger, source);
        return { catalog, ledger };
    };
    const first = await boundary();
    check(input.expectedLedger.length === (input.role === 'preview' ? 10 : 9), 'reviewed baseline ledger inventory differs');
    same(first.ledger.slice(0, input.expectedLedger.length), input.expectedLedger, 'reviewed baseline migration ledger changed');
    const canonical: SourceProof['canonical'] = {};
    for (const table of Object.keys(source.canonical))
        canonical[table] = await readTable(session, db, table);
    same(canonical, source.canonical, 'complete canonical proof differs');
    same((await session.query('PRAGMA quick_check;', 1849389)).rows, [{ quick_check: 'ok' }], 'global physical failure');
    for (const table of FTS)
        same((await session.query(`INSERT INTO ${table}(${table},rank) VALUES('integrity-check',1);`, 1024, 1025)).rows, [], 'rank-1 integrity failure');
    const last = await boundary();
    same(first, last, 'schema or ledger changed during proof');
    const after = controlSchema.parse(await input.captureControl());
    same(after, before, 'custody or assignments changed during proof');
    const receipt: VerificationReceipt = { schemaVersion: 'norton-aquinas-verification.v1', policy: POLICY, role: input.role, target: TARGETS[input.role], sourceCommit: input.sourceCommit, sourceTree: input.sourceTree,
        startedAt, completedAt: new Date(session.now()).toISOString(), source: receiptSource(source), observed: { canonical, catalogSha256: hash(last.catalog), ledgerSha256: hash(last.ledger), quickCheck: 'ok', fkMethod: 'complete_source_equivalence_with_local_fk_witness', ftsRank1: [...FTS], control: after },
        metering: { requests: session.requests, rowsRead: session.reads, rowsWritten: session.writes, transcriptSha256: hash(session.transcript) } };
    return verifyReceipt(receipt, source, { ...input, control: after, ledger: last.ledger }, session.now());
}
/** Bounded preflight for the selected populated target. Full equivalence is proved after preparation. */
export async function checkPreparationBaseline(session: CorpusSession, baseline: Database.Database, source: SourceProof) {
    const catalog = (await session.query(CATALOG_SQL, 4096)).rows;
    same(appCatalog(catalog), baseline.prepare(CATALOG_SQL).all(), 'target is not the retained schema0009 baseline');
    same(catalog.filter(r => providerNames.includes(String(r.name))), PROVIDER_CATALOG, 'provider schema differs before preparation');
    const ledger = (await session.query(LEDGER_SQL, 16)).rows;
    check(ledger.length === 9, 'target is not schema0009');
    ledger.forEach((row, i) => check(row.id === i + 1 && row.name === source.migrationNames[i], 'baseline ledger differs'));
    same((await session.query('SELECT key,value FROM theologai_metadata ORDER BY key;', 16)).rows, baseline.prepare('SELECT key,value FROM theologai_metadata ORDER BY key;').all(), 'baseline identity changed');
    same((await session.query('SELECT * FROM historical_corpus_seal;', 8)).rows, baseline.prepare('SELECT * FROM historical_corpus_seal;').all(), 'baseline seal differs');
    return { catalogSha256: hash(catalog), ledgerSha256: hash(ledger) };
}
/** Use an already-authorized fetch wrapper. This module never obtains a token. No retries. */
export function createCorpusD1Executor(role: 'preview' | 'production', authorizedFetch: typeof fetch): CorpusExecutor {
    const account = '0594ed1e4c9fe35ab7d9f47991e99f3e';
    const target = TARGETS[role];
    return Object.assign(async (sql: string) => {
        check(Buffer.byteLength(sql) <= 100000 && split(sql).length >= 1 && split(sql).length <= 25, 'SQL operation exceeds its bounded statement boundary');
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await authorizedFetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${target.id}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params: [] }), signal: controller.signal, redirect: 'error' });
            check(response.ok && response.body, 'D1 outcome unknown');
            const reader = response.body.getReader();
            let bytes = 0;
            const chunks: Uint8Array[] = [];
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                bytes += value.byteLength;
                if (bytes > 1048576) {
                    await reader.cancel();
                    throw Error('D1 response exceeds bound; outcome unknown');
                }
                chunks.push(value);
            }
            const envelope = JSON.parse(Buffer.concat(chunks).toString());
            check(envelope.success === true && Array.isArray(envelope.result) && envelope.result.length === split(sql).length, 'D1 operation failed or unknown');
            for (const result of envelope.result)
                check(result.success === true && Array.isArray(result.results) && result.meta && [result.meta.rows_read, result.meta.rows_written].every(n => Number.isSafeInteger(n) && n >= 0), 'D1 result incomplete');
            return { rows: envelope.result.flatMap((r: any) => r.results), rowsRead: envelope.result.reduce((n: number, r: any) => n + r.meta.rows_read, 0), rowsWritten: envelope.result.reduce((n: number, r: any) => n + r.meta.rows_written, 0) };
        }
        catch {
            throw Error('Corpus D1 request failed or has an unknown outcome; no retry');
        }
        finally {
            clearTimeout(timer);
        }
    }, { databaseId: target.id });
}
