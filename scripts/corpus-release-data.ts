/** Norton/Aquinas canonical data proof. Reuses the existing delta/keyset algorithms. */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { assertSafeStatement, sha256Buffer } from './d1-seed-utils.js';
export type Row = Record<string, unknown>;
type TableInfo = {
    name: string;
    pk: number;
}[];
type Column = {
    name: string;
    pk: number;
};
export interface DeltaTableDigest {
    rows: number;
    sha256: string;
}
export interface LocalDeltaStatement {
    phase: string;
    table: string;
    sql: string;
    insertedRows: number;
}
export interface ExactInsertRows {
    table: string;
    columns: string[];
    keys: string[];
    rows: Row[];
}
export interface ProofReader {
    query(sql: string, readCeiling: number, writeCeiling?: number): Promise<{
        rows: Row[];
    }>;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function values(row: Row, columns: string[]): unknown[] {
    check(Object.keys(row).length === columns.length && columns.every(name => Object.hasOwn(row, name)), 'Canonical columns differ');
    return columns.map(name => { const value = row[name]; check(value === null || typeof value === 'string' || typeof value === 'number', 'Unsupported canonical cell'); return value; });
}
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const same = (a: unknown, b: unknown, message: string) => check(JSON.stringify(a) === JSON.stringify(b), message);
export const CORPUS_INSERT_TABLES = Object.freeze([
    'documents', 'document_sections', 'historical_source_packs', 'historical_works',
    'historical_editions', 'historical_source_artifacts', 'historical_edition_sections',
    'historical_edition_hierarchies', 'historical_edition_hierarchy_bodies',
    'historical_edition_hierarchy_nodes', 'historical_hierarchy_publications',
    'historical_document_delivery_profiles', 'historical_section_identities',
] as const);
function check(value: unknown, message: string): asserts value { if (!value)
    throw new Error(message); }
function identifier(value: string): string {
    check(/^[a-z_][a-z0-9_]*$/.test(value), 'Unsafe local delta SQL identifier');
    return `"${value}"`;
}
function info(db: Database.Database, table: string): TableInfo {
    return db.prepare(`PRAGMA table_info(${identifier(table)})`).all() as TableInfo;
}
function literal(value: unknown): string {
    if (value === null)
        return 'NULL';
    if (typeof value === 'number') {
        check(Number.isFinite(value), 'Non-finite delta value');
        return String(value);
    }
    if (typeof value === 'bigint')
        return String(value);
    if (typeof value === 'string') {
        check(!value.includes('\0'), 'NUL-containing delta text is unsupported');
        return `'${value.replaceAll("'", "''")}'`;
    }
    if (Buffer.isBuffer(value))
        return `X'${value.toString('hex')}'`;
    throw new Error('Unsupported local delta value type');
}
function rowBytes(row: Row, columns: readonly string[]): string {
    return JSON.stringify(columns.map(column => {
        const value = row[column];
        if (typeof value === 'bigint')
            return { bigint: String(value) };
        if (Buffer.isBuffer(value))
            return { blob: value.toString('hex') };
        return value;
    }));
}
function orderedRows(db: Database.Database, table: string, columns: TableInfo): IterableIterator<Row> {
    const keys = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk);
    const order = (keys.length ? keys : columns).map(column => identifier(column.name)).join(',');
    return db.prepare(`SELECT ${columns.map(column => identifier(column.name)).join(',')} FROM ${identifier(table)} ORDER BY ${order}`).iterate() as IterableIterator<Row>;
}
/** Canonical values, including explicit storage IDs; implicit FTS docids are implementation details. */
export function digestLocalDeltaTable(db: Database.Database, table: string): DeltaTableDigest {
    const columns = info(db, table);
    check(columns.length, `Missing canonical table: ${table}`);
    const names = columns.map(column => column.name);
    const hash = createHash('sha256');
    hash.update(`${JSON.stringify(names)}\n`);
    let rows = 0;
    for (const row of orderedRows(db, table, columns)) {
        hash.update(`${rowBytes(row, names)}\n`);
        rows++;
    }
    return { rows, sha256: hash.digest('hex') };
}
/**
 * Compare every existing primary-key row; changed/deleted rows cannot be hidden
 * by unchanged counts. Only an explicit historical allowlist can gain rows.
 * Both connections must be separate, read-only source databases.
 */
export function deriveLocalHistoricalAdditions(predecessor: Database.Database, current: Database.Database, tables: readonly string[]): {
    statements: LocalDeltaStatement[];
    tables: Record<string, {
        before: DeltaTableDigest;
        after: DeltaTableDigest;
        additions: number;
    }>;
} {
    const statements: LocalDeltaStatement[] = [];
    const result: Record<string, {
        before: DeltaTableDigest;
        after: DeltaTableDigest;
        additions: number;
    }> = {};
    check(new Set(tables).size === tables.length, 'Duplicate canonical delta table');
    for (const table of tables) {
        const columns = info(current, table);
        const oldColumns = info(predecessor, table);
        check(columns.length, `Missing current table: ${table}`);
        const allowed = (CORPUS_INSERT_TABLES as readonly string[]).includes(table);
        check(oldColumns.length || allowed, `Missing predecessor table: ${table}`);
        if (oldColumns.length)
            check(JSON.stringify(columns) === JSON.stringify(oldColumns), `Unsupported column change: ${table}`);
        const keys = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk).map(column => column.name);
        check(keys.length, `Missing deterministic primary key: ${table}`);
        const lookup = oldColumns.length ? predecessor.prepare(`SELECT ${columns.map(column => identifier(column.name)).join(',')} FROM ${identifier(table)} WHERE ${keys.map(key => `${identifier(key)} IS ?`).join(' AND ')}`) : undefined;
        let matched = 0;
        const additions: Row[] = [];
        const names = columns.map(column => column.name);
        for (const row of orderedRows(current, table, columns)) {
            const existing = lookup?.get(...keys.map(key => row[key])) as Row | undefined;
            if (existing) {
                check(rowBytes(existing, names) === rowBytes(row, names), `Unsupported existing-row change: ${table}`);
                matched++;
            }
            else {
                check(allowed, `Unsupported non-historical addition: ${table}`);
                additions.push(row);
            }
        }
        const before = oldColumns.length ? digestLocalDeltaTable(predecessor, table) : { rows: 0, sha256: sha256Buffer(`${JSON.stringify(names)}\n`) };
        check(matched === before.rows, `Unsupported existing-row deletion: ${table}`);
        // Parent-first topology is required by hierarchy insertion triggers.
        if (table === 'historical_edition_hierarchy_nodes')
            additions.sort((a, b) => Number(a.flat_ordinal) - Number(b.flat_ordinal));
        if (table === 'historical_edition_hierarchy_bodies')
            additions.sort((a, b) => Number(a.source_ordinal) - Number(b.source_ordinal));
        for (const row of additions) {
            const sql = `INSERT INTO ${identifier(table)}(${names.map(identifier).join(',')}) VALUES(${names.map(name => literal(row[name])).join(',')});`;
            assertSafeStatement(sql, `${table} additive INSERT`);
            statements.push({ phase: 'historical_additions', table, sql, insertedRows: 1 });
        }
        result[table] = { before, after: digestLocalDeltaTable(current, table), additions: additions.length };
    }
    return { statements, tables: result };
}
export function buildExactInsertQuery(source: Database.Database, proof: ExactInsertRows): string {
    const columns = source.prepare(`PRAGMA table_info(${identifier(proof.table)})`).all() as Column[];
    same(columns.map(column => column.name), proof.columns, 'Exact insert source columns differ');
    same(columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk).map(column => column.name), proof.keys, 'Exact insert source keys differ');
    check(proof.keys.length > 0 && proof.rows.length > 0 && proof.rows.length <= 25, 'Exact insert source cardinality is invalid');
    const seen = new Set<string>();
    const tuples = proof.rows.map(row => {
        values(row, proof.columns);
        const key = hash(proof.keys.map(name => row[name]));
        check(!seen.has(key), 'Duplicate exact insert source key');
        seen.add(key);
        return `(${proof.keys.map(name => literal(row[name])).join(',')})`;
    });
    const primaryIndex = (source.prepare(`PRAGMA index_list(${identifier(proof.table)})`).all() as {
        name: string;
        origin: string;
    }[]).find(index => index.origin === 'pk');
    if (primaryIndex)
        same((source.prepare(`PRAGMA index_info(${identifier(primaryIndex.name)})`).all() as {
            name: string;
        }[]).map(column => column.name), proof.keys, 'Primary-key index shape differs');
    const indexHint = primaryIndex ? ` INDEXED BY ${identifier(primaryIndex.name)}` : '';
    const sql = `WITH requested(${proof.keys.map(identifier).join(',')}) AS (VALUES ${tuples.join(',')}) SELECT ${proof.columns.map(name => `b.${identifier(name)}`).join(',')} FROM requested r CROSS JOIN ${identifier(proof.table)} b${indexHint} WHERE ${proof.keys.map(name => `b.${identifier(name)}=r.${identifier(name)}`).join(' AND ')};`;
    const details = (source.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as {
        detail: string;
    }[]).map(row => row.detail);
    const constantRows = proof.rows.length === 1 ? 'SCAN CONSTANT ROW' : `SCAN ${proof.rows.length} CONSTANT ROWS`;
    // Only the explicitly bounded key relation may scan. Target data must use a
    // primary-key/index seek for every key; full scans and hidden sorts fail.
    check(details.filter(detail => /^SEARCH b USING /.test(detail)).length === 1 && details.every(detail => detail === 'CO-ROUTINE requested' || detail === constantRows || detail === 'SCAN r'
        || /^SEARCH b USING (?:COVERING )?(?:INDEX [a-z0-9_]+|INTEGER PRIMARY KEY|PRIMARY KEY)/i.test(detail)), 'Exact insert query lacks bounded primary-key seeks');
    same(source.prepare(sql).all(), proof.rows, 'Exact insert source rows differ');
    return sql;
}
/** Hash only remotely observed complete cells; missing/duplicate/extra/wrong keys fail. */
export async function verifyExactInsertRows(session: ProofReader, source: Database.Database, proof: ExactInsertRows): Promise<DeltaTableDigest> {
    const sql = buildExactInsertQuery(source, proof);
    const response = await session.query(sql, proof.rows.length * (proof.keys.length + 2) + 256);
    const actual = response.rows;
    check(actual.length === proof.rows.length, 'Exact inserted row cardinality differs');
    const keyed = new Map<string, Row>();
    for (const row of actual) {
        values(row, proof.columns);
        const key = hash(proof.keys.map(name => row[name]));
        check(!keyed.has(key), 'Duplicate exact inserted key');
        keyed.set(key, row);
    }
    const digest = createHash('sha256');
    digest.update(`${JSON.stringify(proof.columns)}\n`);
    for (const expected of proof.rows) {
        const key = hash(proof.keys.map(name => expected[name]));
        const row = keyed.get(key);
        check(row, 'Missing or extra exact inserted key');
        same(values(row, proof.columns), values(expected, proof.columns), 'Exact inserted source values differ');
        digest.update(`${JSON.stringify(values(row, proof.columns))}\n`);
    }
    return { rows: actual.length, sha256: digest.digest('hex') };
}
