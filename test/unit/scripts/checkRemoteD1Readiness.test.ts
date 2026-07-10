import { describe, expect, it } from 'vitest';
import { buildD1ReadinessSql } from '../../../scripts/check-remote-d1-readiness.js';

describe('remote D1 readiness query', () => {
  it('builds a read-only exact-count and index gate', () => {
    const sql = buildD1ReadinessSql(
      { morphology: 12, documents: 17 },
      '0001_initial_schema',
      'a'.repeat(64),
    );

    expect(sql).toContain("(SELECT quick_check FROM pragma_quick_check LIMIT 1) = 'ok'");
    expect(sql).toContain('(SELECT COUNT(*) FROM pragma_foreign_key_check) = 0');
    expect(sql).toContain("key = 'schema_version') = '0001_initial_schema'");
    expect(sql).toContain("key = 'corpus_manifest_sha256') = '");
    expect(sql).toContain("pragma_table_info('morphology')");
    expect(sql).toContain('(SELECT COUNT(*) FROM "morphology") = 12');
    expect(sql).toContain('(SELECT COUNT(*) FROM "documents") = 17');
    expect(sql).toContain("name IN ('idx_xref_from','idx_xref_votes','idx_morph_verse','idx_morph_strongs')");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
  });

  it('rejects unsafe manifest identifiers', () => {
    expect(() => buildD1ReadinessSql({ 'documents; DROP TABLE documents': 17 }))
      .toThrow('Invalid expected D1 count');
  });
});
