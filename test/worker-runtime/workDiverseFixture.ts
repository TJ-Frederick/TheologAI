// Pre-optimization SQL kept as an independent parity oracle.
export function baselineWorkDiverseSql(scoped: boolean): string {
  const scope = scoped ? "AND ds.document_id IN (SELECT value FROM json_each(?) WHERE type = 'text')" : '';
  return `WITH matching_sections AS (
    SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics,
           i.section_key, i.source_ordinal,
           d.title AS document_title, d.type AS document_type, d.date AS document_date,
           d.metadata AS document_metadata, bm25(sections_fts) AS relevance_rank
      FROM sections_fts
      JOIN document_sections ds ON ds.id = sections_fts.rowid
      JOIN historical_section_identities i ON i.document_section_id = ds.id AND i.document_id = ds.document_id
      JOIN documents d ON d.id = ds.document_id
     WHERE sections_fts MATCH ? ${scope}
  ), ranked_sections AS (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY document_id ORDER BY relevance_rank, id
    ) AS work_rank
      FROM matching_sections
  )
  SELECT id, document_id, section_number, title, content, topics, section_key, source_ordinal,
         document_title, document_type, document_date, document_metadata
    FROM ranked_sections
   ORDER BY work_rank, relevance_rank, id
   LIMIT ?`;
}

export const workDiverseFixtureSql = [
  `INSERT INTO documents VALUES
    ('diverse-many', 'Prolific Work', 'treatise', '1600', '{"topics":["café"]}'),
    ('diverse-one', 'Sparse Work One', 'creed', NULL, '{}'),
    ('diverse-two', 'Sparse Work Two', 'confession', '1700', '{}')`,
  `INSERT INTO historical_document_delivery_profiles
    (document_id, immutable_corpus_identity, delivery_mode, section_count,
     landing_max_bytes, browse_page_size, cursor_version, provenance_json, rights_json)
    VALUES
    ('diverse-many', '${'a'.repeat(64)}', 'complete_document', 3, 0, 0, 0, '{}', '{}'),
    ('diverse-one', '${'a'.repeat(64)}', 'complete_document', 1, 0, 0, 0, '{}', '{}'),
    ('diverse-two', '${'a'.repeat(64)}', 'complete_document', 1, 0, 0, 0, '{}', '{}')`,
  `INSERT INTO document_sections VALUES
    (100, 'diverse-many', '0', 'Heading', 'café grâce café grâce', '[]'),
    (101, 'diverse-many', '1', 'Heading', 'café grâce', '[]'),
    (102, 'diverse-many', '2', 'Heading', 'café grâce', '[]'),
    (103, 'diverse-one', '1', 'Heading', 'café grâce', '[]'),
    (104, 'diverse-two', '1', 'Heading', 'café grâce', '[]'),
    (105, 'diverse-many', '3', 'Heading', 'café et grâce', '[]')`,
  `INSERT INTO historical_section_identities (document_id, section_key, source_ordinal, document_section_id) VALUES
    ('diverse-many', 'first', 1, 101), ('diverse-many', 'second', 2, 102), ('diverse-many', 'third', 3, 105),
    ('diverse-one', 'first', 1, 103), ('diverse-two', 'first', 1, 104)`,
  `INSERT INTO sections_fts (rowid, title, content, topics)
    SELECT id, title, content, topics FROM document_sections WHERE id BETWEEN 100 AND 105`,
];

export const workDiverseCases = [
  { text: 'café grâce', match: 'all_terms', ids: undefined, expected: [101, 103, 104, 102, 105] },
  { text: 'cafe\u0301 grâce', match: 'phrase', ids: undefined, expected: [101, 103, 104, 102] },
  { text: 'café grâce', match: 'all_terms', ids: ['diverse-many', 'diverse-two'], expected: [101, 104, 102, 105] },
  { text: 'grâce', match: 'all_terms', ids: ['diverse-one'], expected: [103] },
  { text: 'qzx-no-match', match: 'phrase', ids: undefined, expected: [] },
] as const;
