import { describe, expect, it } from 'vitest';
import {
  localPrimarySourceScopedSearchSql,
  localPrimarySourceWorkDiverseScopedSearchSql,
} from '../../../../src/adapters/shared/primarySourceSearchSql.js';

describe('primary-source scoped SQL bounds', () => {
  it.each([
    localPrimarySourceScopedSearchSql,
    localPrimarySourceWorkDiverseScopedSearchSql,
  ])('accepts 1..100 documents with one JSON scope bind and rejects values outside that bound', buildSql => {
    const sql = buildSql(100);
    expect(sql.match(/\?/g)).toHaveLength(3);
    expect(sql).toContain("ds.document_id IN (SELECT value FROM json_each(?) WHERE type = 'text')");
    for (const invalid of [0, 101, 1.5, Number.NaN]) {
      expect(() => buildSql(invalid)).toThrow('1..100 documents');
    }
  });
});
