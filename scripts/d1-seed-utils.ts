import { createHash } from 'crypto';
import { readFileSync } from 'fs';

export const D1_MAX_STATEMENT_BYTES = 100_000;
export const D1_SEED_FILE_BYTES = 8 * 1024 * 1024;

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

export function insertedRows(
  statement: string,
  expectedCounts: Record<string, number>,
): number {
  const insert = statement.match(/^INSERT INTO "?([a-z_]+)"?/i);
  if (!insert) return 0;
  const table = insert[1];
  if (/\bVALUES\s*\(/i.test(statement)) return 1;
  if (/\bSELECT\b/i.test(statement) && table in expectedCounts) return expectedCounts[table];
  throw new Error(`Cannot determine row count for generated INSERT into ${table}`);
}
