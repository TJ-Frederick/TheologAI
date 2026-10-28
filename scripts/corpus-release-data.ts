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
    queryReadOnly(page: ReturnType<typeof buildTablePage>): Promise<{
        results: {
            results: Row[];
        }[];
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
/** Indexed PK/rowid pagination; source query plans reject hidden sorts and joins/scans. */
export function buildTablePage(db: Database.Database, table: string, cursor: unknown[] | null, limit = 512): {
    sql: string;
    columns: string[];
    keys: string[];
    readCeiling: number;
    expected: Row[];
    fts: boolean;
} {
    const columns = db.prepare(`PRAGMA table_info(${identifier(table)})`).all() as Column[];
    check(columns.length && limit > 0 && limit <= 512, 'Source table page is unsupported');
    const names = columns.map(column => column.name);
    const keys = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk).map(column => column.name);
    const fts = keys.length === 0;
    let from = `${identifier(table)} b`;
    let selected = names.map(name => `b.${identifier(name)}`).join(',');
    let order = keys.map(key => `b.${identifier(key)}`);
    if (fts) {
        check(['strongs_fts', 'sections_fts', 'historical_edition_sections_fts', 'historical_edition_hierarchy_bodies_fts'].includes(table), 'Unindexed source table is ineligible');
        const definition = (db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(table) as {
            sql: string;
        }).sql;
        const content = /content='([a-z_]+)'/.exec(definition)?.[1];
        const contentRowid = /content_rowid='([a-z_]+)'/.exec(definition)?.[1] ?? 'rowid';
        const base = content ?? `${table}_content`;
        const key = content ? contentRowid : 'id';
        from = `${identifier(base)} b CROSS JOIN ${identifier(table)} f ON f.rowid=b.${identifier(key)}`;
        selected = `b.${identifier(key)} AS _cursor,${names.map(name => `f.${identifier(name)}`).join(',')}`;
        keys.push('_cursor');
        order = [`b.${identifier(key)}`];
    }
    check(cursor === null || cursor.length === keys.length, 'Source keyset cursor shape differs');
    const where = cursor ? ` WHERE (${order.join(',')}) > (${cursor.map(literal).join(',')})` : '';
    const sql = `SELECT ${selected} FROM ${from}${where} ORDER BY ${order.join(',')} LIMIT ${limit};`;
    const details = (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as {
        detail: string;
    }[]).map(row => row.detail);
    check(!details.some(detail => /TEMP B-TREE|CORRELATED|MATERIALIZE/.test(detail)) && details.every(detail => /^(?:SCAN b(?: USING (?:COVERING )?INDEX [a-z0-9_]+)?|SEARCH b USING (?:COVERING )?(?:INDEX [a-z0-9_]+|INTEGER PRIMARY KEY)|SCAN f VIRTUAL TABLE INDEX 0:=)/i.test(detail)), 'Source keyset page lacks an eligible indexed plan');
    const page = { sql, columns: names, keys, readCeiling: 4 * limit + 256, expected: db.prepare(sql).all() as Row[], fts };
    return page;
}
/** A bounded VALUES relation drives exact PK seeks without Workerd's UNION limit. */
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
export async function readTable(session: ProofReader, source: Database.Database, table: string, observe?: (row: Row) => void): Promise<DeltaTableDigest> {
    let cursor: unknown[] | null = null;
    let rows = 0;
    const digest = createHash('sha256');
    const first = buildTablePage(source, table, null);
    digest.update(`${JSON.stringify(first.columns)}\n`);
    const expectedDigest = digestLocalDeltaTable(source, table);
    const maximumFtsRowBytes = first.fts ? (source.prepare(`SELECT ${first.columns.map(identifier).join(',')} FROM ${identifier(table)}`).all() as Row[]).reduce((maximum, row) => Math.max(maximum, Buffer.byteLength(JSON.stringify(row)) + 64), 0) : 0;
    const sorted = first.fts ? new Database(':memory:') : null;
    if (sorted)
        sorted.exec(`CREATE TABLE captured(${first.columns.map(identifier).join(',')})`);
    const insert = sorted?.prepare(`INSERT INTO captured VALUES(${first.columns.map(() => '?').join(',')})`);
    try {
        for (;;) {
            // Source bytes choose a response-safe page before dispatch, including large bodies.
            let limit = first.fts ? Math.max(1, Math.min(512, Math.floor(900000 / Math.max(1, maximumFtsRowBytes)))) : 512;
            let page = buildTablePage(source, table, cursor, limit);
            while (Buffer.byteLength(JSON.stringify(page.expected)) > 900000 && limit > 1) {
                limit = Math.floor(limit / 2);
                page = buildTablePage(source, table, cursor, limit);
            }
            check(Buffer.byteLength(JSON.stringify(page.expected)) <= 900000, 'One source row exceeds the response page bound');
            const result = await session.queryReadOnly(page);
            const actual = result.results[0].results;
            // FTS physical IDs may differ from source, so their page boundaries cannot
            // be compared. Total cardinality and the complete sorted content digest remain exact.
            check(actual.length <= limit && (page.fts || !actual.length || actual.length === page.expected.length), 'D1 source page cardinality differs');
            if (!page.fts)
                same(actual.map(row => values(row, page.columns)), page.expected.map(row => values(row, page.columns)), 'D1 canonical source values differ');
            for (const row of actual) {
                const projected = Object.fromEntries(page.columns.map(name => [name, row[name]]));
                const bytes = values(projected, page.columns);
                if (insert)
                    insert.run(...bytes as (string | number | null)[]);
                else
                    digest.update(`${JSON.stringify(bytes)}\n`);
                if (page.fts)
                    check(Object.keys(row).length === page.columns.length + 1 && count(row._cursor), 'D1 FTS content cursor differs');
                observe?.(row);
                rows++;
            }
            if (!actual.length)
                break;
            cursor = page.keys.map(key => actual.at(-1)![key]);
            check(rows <= expectedDigest.rows, 'D1 source page contains extra rows');
        }
        if (sorted)
            for (const row of sorted.prepare(`SELECT * FROM captured ORDER BY ${first.columns.map(identifier).join(',')}`).iterate() as IterableIterator<Row>)
                digest.update(`${JSON.stringify(values(row, first.columns))}\n`);
        const actual = { rows, sha256: digest.digest('hex') };
        same(actual, expectedDigest, 'Complete D1 canonical table hash differs');
        return actual;
    }
    finally {
        sorted?.close();
    }
}
