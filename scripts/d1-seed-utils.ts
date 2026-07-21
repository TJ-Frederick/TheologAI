import { createHash } from 'crypto';
import { readFileSync } from 'fs';

export const D1_MAX_STATEMENT_BYTES = 100_000;
export const D1_SEED_FILE_BYTES = 8 * 1024 * 1024;
/** Conservative local-Workerd parser ceiling; remains below D1's 100 KB max. */
export const D1_SEED_BATCH_STATEMENT_BYTES = 16 * 1024;

export interface D1InsertValuesBatch {
  readonly sql: string;
  readonly rows: number;
}

export function sha256Buffer(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256File(path: string): string {
  return sha256Buffer(readFileSync(path));
}

/**
 * Split generated SQL at semicolons outside SQLite single-quoted literals.
 * The seed exporter deliberately emits no comments, quoted identifiers with
 * semicolons, triggers, or other SQL constructs that require a general parser.
 */
export function splitGeneratedSql(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let inString = false;

  for (let index = 0; index < sql.length; index++) {
    const character = sql[index];
    if (character === "'") {
      if (inString && sql[index + 1] === "'") {
        index++;
      } else {
        inString = !inString;
      }
    } else if (character === ';' && !inString) {
      const statement = sql.slice(start, index + 1).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }

  if (inString) throw new Error('Generated SQL ends inside a string literal');
  if (sql.slice(start).trim()) throw new Error('Generated SQL has an unterminated statement');
  return statements;
}

export function statementBytes(statement: string): number {
  return Buffer.byteLength(statement, 'utf8');
}

export function assertSafeStatement(statement: string, label: string): number {
  const bytes = statementBytes(statement);
  if (bytes > D1_MAX_STATEMENT_BYTES) {
    throw new Error(
      `${label} is ${bytes.toLocaleString()} bytes; D1 allows at most ` +
      `${D1_MAX_STATEMENT_BYTES.toLocaleString()} bytes per SQL statement`,
    );
  }
  return bytes;
}

/**
 * Deterministically combine already-quoted VALUES tuples without crossing
 * both D1's documented SQL-statement limit and the more conservative local
 * Workerd parser ceiling. This reduces import overhead while retaining
 * literal-only seed SQL and row accounting.
 */
export function batchInsertValueTuples(
  insertPrefix: string,
  tuples: readonly string[],
): readonly D1InsertValuesBatch[] {
  if (!/^INSERT INTO "[a-z_][a-z0-9_]*"\(["a-z0-9_,]+\) VALUES$/.test(insertPrefix)) {
    throw new Error('D1 INSERT batch prefix is not a canonical literal INSERT prefix');
  }
  if (tuples.length === 0) return [];
  const batches: D1InsertValuesBatch[] = [];
  let current: string[] = [];
  let currentBytes = Buffer.byteLength(`${insertPrefix};`, 'utf8');
  for (const tuple of tuples) {
    if (!tuple.startsWith('(') || !tuple.endsWith(')')
      || countValuesTuples(`${insertPrefix}${tuple};`) !== 1) {
      throw new Error('D1 INSERT batch tuple is not exactly one canonical VALUES tuple');
    }
    const tupleBytes = Buffer.byteLength(tuple, 'utf8');
    const separatorBytes = current.length === 0 ? 0 : 1;
    if (current.length > 0 && currentBytes + separatorBytes + tupleBytes > D1_SEED_BATCH_STATEMENT_BYTES) {
      const sql = `${insertPrefix}${current.join(',')};`;
      assertSafeStatement(sql, 'D1 INSERT batch');
      batches.push({ sql, rows: current.length });
      current = [];
      currentBytes = Buffer.byteLength(`${insertPrefix};`, 'utf8');
    }
    if (currentBytes + tupleBytes > D1_SEED_BATCH_STATEMENT_BYTES) {
      throw new Error('D1 INSERT batch tuple exceeds the local Workerd batch-byte limit');
    }
    current.push(tuple);
    currentBytes += (current.length === 1 ? 0 : 1) + tupleBytes;
  }
  if (current.length > 0) {
    const sql = `${insertPrefix}${current.join(',')};`;
    assertSafeStatement(sql, 'D1 INSERT batch');
    batches.push({ sql, rows: current.length });
  }
  return batches;
}

export function insertedRows(
  statement: string,
  expectedCounts: Record<string, number>,
): number {
  const insert = statement.match(/^INSERT INTO "?([a-z_]+)"?/i);
  if (!insert) return 0;
  const table = insert[1];
  if (/\bVALUES\s*\(/i.test(statement)) return countValuesTuples(statement);
  if (/\bSELECT\b/i.test(statement) && table in expectedCounts) return expectedCounts[table];
  throw new Error(`Cannot determine row count for generated INSERT into ${table}`);
}

function countValuesTuples(statement: string): number {
  const values = statement.match(/\bVALUES\s*/i);
  if (!values || values.index === undefined) throw new Error('Generated INSERT has no VALUES clause');
  let inString = false;
  let depth = 0;
  let tuples = 0;
  for (let index = values.index + values[0].length; index < statement.length; index++) {
    const character = statement[index]!;
    if (character === "'") {
      if (inString && statement[index + 1] === "'") {
        index++;
      } else {
        inString = !inString;
      }
      continue;
    }
    if (inString) continue;
    if (character === '(') {
      if (depth === 0) tuples++;
      depth++;
    } else if (character === ')') {
      depth--;
      if (depth < 0) throw new Error('Generated INSERT has unbalanced VALUES parentheses');
    }
  }
  if (inString || depth !== 0 || tuples === 0) {
    throw new Error('Generated INSERT has malformed VALUES tuples');
  }
  return tuples;
}
