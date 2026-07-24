const REQUIRED_D1_INDEXES = [
  'idx_xref_from',
  'idx_xref_votes',
  'idx_morph_verse',
  'idx_morph_strongs',
  'idx_morph_strongs_canonical',
  'idx_strongs_book_stats_order',
  'idx_strongs_form_stats_rank',
  'idx_ubs_groups_source_order',
  'idx_ubs_segments_lookup',
  'idx_ubs_semantic_identity_candidate',
  'idx_ubs_semantic_sense_candidate_order',
  'idx_ubs_semantic_sense_domain_order',
  'idx_ubs_semantic_coordinate_lookup',
  'idx_ubs_semantic_evidence_sense_order',
  'idx_document_sections_id_document',
  'idx_historical_section_identities_browse',
  'idx_historical_section_aliases_target',
  'idx_historical_editions_work',
  'idx_historical_editions_pack',
  'idx_historical_source_artifacts_edition',
  'idx_historical_edition_sections_order',
] as const;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Workerd validates JSON literals while compiling a CASE expression, including
 * unreachable branches. Return an ordinary sentinel rather than using an
 * intentionally malformed JSON expression to force a failed readiness state.
 */
export function buildWorkerdSchemaStateSql(
  migrationNames: readonly string[],
  requiredColumns: Readonly<Record<string, readonly string[]>>,
): string {
  const columnChecks = Object.entries(requiredColumns).map(([table, columns]) =>
    `(SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info(${sqlLiteral(table)}) ORDER BY cid)) = ${sqlLiteral(columns.join(','))}`,
  );
  const migrationList = migrationNames.map(sqlLiteral).join(',');
  const indexList = REQUIRED_D1_INDEXES.map(sqlLiteral).join(',');
  return `SELECT CASE WHEN
      (SELECT COUNT(*) FROM d1_migrations) = ${migrationNames.length}
      AND (SELECT group_concat(name, ',') FROM (SELECT name FROM d1_migrations ORDER BY id)) = ${sqlLiteral(migrationNames.join(','))}
      AND (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN (${indexList})) = ${REQUIRED_D1_INDEXES.length}
      AND ${columnChecks.join('\n      AND ')}
      THEN 'schema-ready' ELSE 'schema-mismatch' END AS schema_state;`;
}
