/**
 * Deterministic parent-before-child seed order for an empty migrated D1 target.
 * The source-pack edition must exist before its active delivery profile: the
 * migration deliberately validates that relationship with an insert trigger.
 */
export const D1_SEED_BASE_TABLES = [
  'theologai_metadata',
  'morph_codes',
  'documents',
  'document_sections',
  'historical_source_packs',
  'historical_works',
  'historical_editions',
  'historical_source_artifacts',
  'historical_edition_sections',
  'historical_document_delivery_profiles',
  'historical_section_identities',
  'historical_section_aliases',
  'strongs',
  'stepbible_lexicons',
  'cross_references',
  'morphology',
  'strongs_usage_stats',
  'strongs_book_stats',
  'strongs_form_stats',
  'ubs_parallel_sources',
  'ubs_parallel_groups',
  'ubs_parallel_members',
  'ubs_parallel_segments',
  'ubs_semantic_artifacts',
  'ubs_semantic_sources',
  'ubs_semantic_domains',
  'ubs_semantic_entries',
  'ubs_semantic_entry_identities',
  'ubs_semantic_senses',
  'ubs_semantic_sense_domains',
  'ubs_semantic_reference_evidence',
  'ubs_semantic_normalized_coordinates',
] as const;

export const D1_SEED_EXPORT_ORDER = [...D1_SEED_BASE_TABLES, 'fts'] as const;
