import { describe, expect, it } from 'vitest';
import {
  D1_MAX_STATEMENT_BYTES,
  D1_SEED_BATCH_STATEMENT_BYTES,
  assertSafeStatement,
  batchInsertValueTuples,
  insertedRows,
  splitGeneratedSql,
} from '../../../scripts/d1-seed-utils.js';

describe('D1 seed SQL utilities', () => {
  it('splits statements without treating quoted semicolons or apostrophes as boundaries', () => {
    expect(splitGeneratedSql(
      `INSERT INTO "documents" VALUES('apostle''s; creed');\nUPDATE "documents" SET "title" = 'x';\n`,
    )).toEqual([
      `INSERT INTO "documents" VALUES('apostle''s; creed');`,
      `UPDATE "documents" SET "title" = 'x';`,
    ]);
  });

  it('rejects unterminated generated SQL', () => {
    expect(() => splitGeneratedSql("INSERT INTO t VALUES('x)"))
      .toThrow('inside a string literal');
    expect(() => splitGeneratedSql('SELECT 1'))
      .toThrow('unterminated statement');
  });

  it('enforces the documented UTF-8 statement byte limit', () => {
    expect(assertSafeStatement('a'.repeat(D1_MAX_STATEMENT_BYTES), 'test'))
      .toBe(D1_MAX_STATEMENT_BYTES);
    expect(() => assertSafeStatement('é'.repeat(D1_MAX_STATEMENT_BYTES), 'test'))
      .toThrow('D1 allows at most');
  });

  it('derives inserted rows for one-row and multi-row values plus FTS rebuilds', () => {
    const counts = { documents: 17, strongs_fts: 14_298 };
    expect(insertedRows('INSERT INTO "documents"("id") VALUES(1);', counts)).toBe(1);
    expect(insertedRows("INSERT INTO \"documents\"(\"id\",\"title\") VALUES(1,'apostle''s; creed'),(2,'second');", counts)).toBe(2);
    expect(insertedRows('UPDATE "documents" SET "id" = 2;', counts)).toBe(0);
    expect(insertedRows(
      'INSERT INTO "strongs_fts"("lemma") SELECT "lemma" FROM "strongs";',
      counts,
    )).toBe(14_298);
  });

  it('batches canonical VALUES tuples at a deterministic byte boundary without changing escaped tuples', () => {
    const prefix = 'INSERT INTO "documents"("id","title") VALUES';
    const tuples = ["(1,'apostle''s; creed')", "(2,'second')", "(3,'third')"];
    expect(batchInsertValueTuples(prefix, tuples)).toEqual([
      { sql: "INSERT INTO \"documents\"(\"id\",\"title\") VALUES(1,'apostle''s; creed'),(2,'second'),(3,'third');", rows: 3 },
    ]);
    const boundaryTuples = [`(1,'${'x'.repeat(D1_SEED_BATCH_STATEMENT_BYTES - Buffer.byteLength(prefix, 'utf8') - 8)}')`, "(2,'x')"];
    const batches = batchInsertValueTuples(prefix, boundaryTuples);
    expect(batches).toHaveLength(2);
    expect(batches[0]!.rows).toBe(1);
    expect(batches[1]!.rows).toBe(1);
    expect(batches.every(batch => Buffer.byteLength(batch.sql, 'utf8') <= D1_SEED_BATCH_STATEMENT_BYTES)).toBe(true);
    expect(batchInsertValueTuples(prefix, tuples)).toEqual(batchInsertValueTuples(prefix, tuples));
  });

  it('rejects noncanonical batch shapes and a tuple that cannot fit alone', () => {
    const prefix = 'INSERT INTO "documents"("id") VALUES';
    expect(() => batchInsertValueTuples('INSERT INTO documents VALUES', ['(1)']))
      .toThrow('canonical literal INSERT prefix');
    expect(() => batchInsertValueTuples(prefix, ['1']))
      .toThrow('exactly one canonical VALUES tuple');
    expect(() => batchInsertValueTuples(prefix, [`(1,'${'x'.repeat(D1_SEED_BATCH_STATEMENT_BYTES)}')`]))
      .toThrow('tuple exceeds the local Workerd batch-byte limit');
  });
});
