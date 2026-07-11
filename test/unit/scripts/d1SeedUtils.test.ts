import { describe, expect, it } from 'vitest';
import {
  D1_MAX_STATEMENT_BYTES,
  assertSafeStatement,
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

  it('derives inserted rows for one-row values and FTS rebuilds', () => {
    const counts = { documents: 17, strongs_fts: 14_298 };
    expect(insertedRows('INSERT INTO "documents"("id") VALUES(1);', counts)).toBe(1);
    expect(insertedRows('UPDATE "documents" SET "id" = 2;', counts)).toBe(0);
    expect(insertedRows(
      'INSERT INTO "strongs_fts"("lemma") SELECT "lemma" FROM "strongs";',
      counts,
    )).toBe(14_298);
  });
});
