import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { buildWorkerdSchemaStateSql } from '../../../scripts/d1-workerd-verifier-utils.js';

describe('local Workerd schema preflight SQL', () => {
  it('returns an ordinary mismatch sentinel instead of compiling malformed JSON', () => {
    const database = new Database(':memory:');
    try {
      database.exec(`CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE sample (id TEXT, title TEXT);
        CREATE INDEX idx_xref_from ON sample(id);
        CREATE INDEX idx_xref_votes ON sample(id);
        CREATE INDEX idx_morph_verse ON sample(id);
        CREATE INDEX idx_morph_strongs ON sample(id);
        CREATE INDEX idx_morph_strongs_canonical ON sample(id);
        CREATE INDEX idx_strongs_book_stats_order ON sample(id);
        CREATE INDEX idx_strongs_form_stats_rank ON sample(id);
        CREATE INDEX idx_ubs_groups_source_order ON sample(id);
        CREATE INDEX idx_ubs_segments_lookup ON sample(id);
        CREATE INDEX idx_ubs_semantic_identity_candidate ON sample(id);
        CREATE INDEX idx_ubs_semantic_sense_candidate_order ON sample(id);
        CREATE INDEX idx_ubs_semantic_sense_domain_order ON sample(id);
        CREATE INDEX idx_ubs_semantic_coordinate_lookup ON sample(id);
        CREATE INDEX idx_ubs_semantic_evidence_sense_order ON sample(id);
        CREATE INDEX idx_document_sections_id_document ON sample(id);
        CREATE INDEX idx_historical_section_identities_browse ON sample(id);
        CREATE INDEX idx_historical_section_aliases_target ON sample(id);
        CREATE INDEX idx_historical_editions_work ON sample(id);
        CREATE INDEX idx_historical_editions_pack ON sample(id);
        CREATE INDEX idx_historical_source_artifacts_edition ON sample(id);
        CREATE INDEX idx_historical_edition_sections_order ON sample(id);
        INSERT INTO d1_migrations (id, name) VALUES (1, '0001_initial_schema.sql');`);
      const sql = buildWorkerdSchemaStateSql(['0001_initial_schema.sql'], { sample: ['id', 'title'] });
      expect(sql).toContain("ELSE 'schema-mismatch'");
      expect(sql).not.toContain('json_extract');
      expect(database.prepare(sql).get()).toEqual({ schema_state: 'schema-ready' });

      database.exec('DROP INDEX idx_xref_from');
      expect(database.prepare(sql).get()).toEqual({ schema_state: 'schema-mismatch' });
    } finally {
      database.close();
    }
  });
});
