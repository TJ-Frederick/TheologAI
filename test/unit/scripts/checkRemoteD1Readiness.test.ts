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
    expect(sql).toContain("word_text FROM morphology WHERE book = 'John' AND chapter = 1 AND verse = 1 AND position = 11");
    expect(sql).toContain("lemma FROM morphology WHERE book = 'Genesis' AND chapter = 1 AND verse = 1 AND position = 3");
    expect(sql).toContain(") = 'τὸ'");
    expect(sql).toContain("'idx_ubs_groups_source_order','idx_ubs_segments_lookup'");
    expect(sql).toContain('a5fd0d4646cb69f426f592c6e334866191201fbe64691cd55c7f7ecd0ca9d4cc');
    expect(sql).toContain('MAX(source_ordinal) = COUNT(*)');
    expect(sql).toContain('MAX(source_order)');
    expect(sql).toContain('MAX(segment_order)');
    expect(sql).toContain("alignment_raw GLOB '*[^0-8]*'");
    expect(sql).toContain("language_marker = 'GRK' AND alignment_basis != 'UBSGNT5'");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
  });

  it('rejects unsafe manifest identifiers', () => {
    expect(() => buildD1ReadinessSql({ 'documents; DROP TABLE documents': 17 }))
      .toThrow('Invalid expected D1 count');
  });
});
