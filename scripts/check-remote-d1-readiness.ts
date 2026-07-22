#!/usr/bin/env tsx
/** Read-only remote D1 compatibility gate used only inside approved deploy jobs. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { genesisOneOneLemmaReadinessPredicate, johnOneOneReadinessPredicate } from './data-integrity.js';
import { computeD1CorpusIdentity, parseDataManifest, verifyD1Migrations } from './d1-corpus-identity.js';
import { UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY, UBS_PARALLEL_PASSAGE_PROVENANCE } from '../src/kernel/ubsParallelSource.js';
import { CANONICAL_BOOK_ORDER_SQL } from '../src/adapters/shared/repositoryUtils.js';
import { CLASSIC_TEXT_LIMITS } from '../src/kernel/classicTextContract.js';
import { BIBLE_BOOKS, getBibleBookBounds } from '../src/kernel/books.js';
import { EXPECTED_HISTORICAL_SECTION_COLLISIONS } from './historical-section-key-plan.js';
import type {
  BiblicalLanguageUnicodeCorrectionLedger,
  MorphologyUnicodeCorrection,
} from './biblical-language-unicode-correction.js';
import { parseHistoricalDocumentCatalog } from './historical-document-catalog.js';
import {
  createUbsSemanticStorageContract,
  type UbsSemanticStorageAudit,
} from './ubs-semantics/storageContract.js';
import {
  auditHistoricalTransform8Authority,
  parseHistoricalTransform8D1Page,
} from './historical-transform8-authority-audit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestBytes = readFileSync(join(ROOT, 'data', 'data-manifest.json'));
const MANIFEST = parseDataManifest(manifestBytes);
verifyD1Migrations(ROOT, MANIFEST);
const D1_CORPUS_IDENTITY = computeD1CorpusIdentity(MANIFEST);
const UNICODE_CORRECTION = JSON.parse(readFileSync(
  join(ROOT, 'data/biblical-languages/UNICODE-CORRECTION.json'),
  'utf8',
)) as BiblicalLanguageUnicodeCorrectionLedger;
const HISTORICAL_CATALOG = parseHistoricalDocumentCatalog(JSON.parse(readFileSync(
  join(ROOT, 'data/historical-document-catalog.json'),
  'utf8',
)));
const UBS_SEMANTIC_AUDIT = JSON.parse(readFileSync(
  join(ROOT, 'data/biblical-languages/ubs-open-license/v0.9.2/SEMANTIC-COMPILATION-AUDIT.json'),
  'utf8',
)) as UbsSemanticStorageAudit & {
  projection: { normalizedCoordinateRows: number; sourceEvidenceWithAmbiguousNormalizedCoordinates: number };
};
const UBS_SEMANTIC_STORAGE = createUbsSemanticStorageContract(UBS_SEMANTIC_AUDIT);

/** D1's command interface is deliberately kept below its request-size ceiling. */
export const MAX_D1_READINESS_SQL_BYTES = 100_000;

export const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  theologai_metadata: ['key', 'value'],
  cross_references: ['from_verse', 'to_verse', 'votes'],
  strongs: ['strongs_number', 'testament', 'lemma', 'transliteration', 'pronunciation', 'definition', 'derivation'],
  strongs_fts: ['strongs_number', 'lemma', 'transliteration', 'definition'],
  morphology: ['book', 'chapter', 'verse', 'position', 'word_text', 'lemma', 'strongs_number', 'morph_code', 'gloss', 'book_order'],
  strongs_usage_stats: ['strongs_key', 'token_count', 'verse_count', 'book_count', 'form_count'],
  strongs_book_stats: ['strongs_key', 'book', 'book_order', 'token_count', 'verse_count'],
  strongs_form_stats: ['strongs_key', 'form_text', 'token_count', 'verse_count', 'first_book', 'first_book_order', 'first_chapter', 'first_verse', 'first_position'],
  stepbible_lexicons: ['strongs_number', 'source', 'extended_data'],
  documents: ['id', 'title', 'type', 'date', 'metadata'],
  document_sections: ['id', 'document_id', 'section_number', 'title', 'content', 'topics'],
  historical_document_delivery_profiles: ['document_id', 'work_id', 'edition_id', 'immutable_corpus_identity', 'section_package_identity', 'delivery_mode', 'section_count', 'landing_max_bytes', 'browse_page_size', 'cursor_version', 'provenance_json', 'rights_json'],
  historical_section_identities: ['document_id', 'section_key', 'source_ordinal', 'document_section_id'],
  historical_section_aliases: ['document_id', 'legacy_section_id', 'section_key', 'source_ordinal'],
  sections_fts: ['title', 'content', 'topics'],
  morph_codes: ['code', 'expansion'],
  ubs_parallel_sources: ['source_id', 'schema_version', 'transform_version', 'artifact_identity', 'title', 'publisher', 'copyright', 'license', 'license_url', 'source_url', 'source_path', 'source_commit', 'source_commit_date', 'source_blob', 'source_bytes', 'source_sha256', 'modified', 'modification_note', 'label', 'directionality'],
  ubs_parallel_groups: ['group_id', 'source_id', 'source_ordinal', 'label', 'directionality'],
  ubs_parallel_members: ['group_id', 'source_order', 'source_reference', 'normalized_reference', 'language_marker', 'alignment_basis', 'alignment_raw'],
  ubs_parallel_segments: ['group_id', 'member_order', 'segment_order', 'book_number', 'chapter', 'start_verse', 'end_verse'],
  ubs_semantic_artifacts: ['artifact_identity', 'schema_version', 'compiler_version', 'transform_version', 'rights_notice_json', 'provenance_notice_json', 'transformation_witness_json'],
  ubs_semantic_sources: ['artifact_identity', 'source_id', 'source_role', 'schema_version', 'transform_version', 'title', 'artifact_name', 'artifact_version', 'language', 'source_url', 'source_commit', 'source_blob', 'source_sha256', 'license', 'license_url', 'publisher', 'modified', 'modification_description'],
  ubs_semantic_domains: ['artifact_identity', 'source_id', 'domain_id', 'source_ordinal', 'parent_domain_id', 'label', 'description'],
  ubs_semantic_entries: ['artifact_identity', 'source_id', 'entry_id', 'source_entry_id', 'source_ordinal', 'lemma', 'part_of_speech_json'],
  ubs_semantic_entry_identities: ['artifact_identity', 'entry_id', 'lexical_identity'],
  ubs_semantic_senses: ['artifact_identity', 'source_id', 'sense_id', 'source_sense_id', 'entry_id', 'source_ordinal', 'definition_status', 'definition', 'definition_exclusion_reasons_json', 'glosses_json'],
  ubs_semantic_sense_domains: ['artifact_identity', 'sense_id', 'domain_id', 'domain_ordinal'],
  ubs_semantic_reference_evidence: ['evidence_key', 'artifact_identity', 'source_id', 'evidence_id', 'sense_id', 'source_ordinal', 'source_reference', 'raw_anchor', 'footnote_suffix', 'native_book_number', 'native_book_code', 'native_chapter', 'native_verse'],
  ubs_semantic_normalized_coordinates: ['coordinate_key', 'evidence_key', 'target_ordinal', 'normalized_book_number', 'normalized_book_code', 'normalized_chapter', 'normalized_verse', 'normalized_reference'],
};

export interface MorphologyUnicodeReadinessContract {
  cte: string;
  checks: string[];
  correctionCount: number;
}

interface D1ReadinessCheck {
  id: string;
  predicate: string;
}

interface D1ReadinessQueryContract {
  ctes: string[];
  checks: D1ReadinessCheck[];
}

export function classicTextSectionReadinessPredicate(): string {
  return `(SELECT COUNT(*) FROM document_sections WHERE typeof(id) != 'integer' OR id < 0 OR id > ${Number.MAX_SAFE_INTEGER} OR typeof(document_id) != 'text' OR length(document_id) NOT BETWEEN 1 AND ${CLASSIC_TEXT_LIMITS.documentIdCharacters} OR document_id NOT GLOB '[A-Za-z0-9]*' OR document_id GLOB '*[^A-Za-z0-9._-]*' OR document_id IN ('.','..') OR typeof(section_number) != 'text' OR length(section_number) NOT BETWEEN 1 AND ${CLASSIC_TEXT_LIMITS.sectionNumberCharacters} OR section_number NOT GLOB '[A-Za-z0-9]*' OR section_number GLOB '*[^A-Za-z0-9._:-]*' OR section_number IN ('.','..') OR length('theologai://documents/' || document_id || '#section-' || section_number) > ${CLASSIC_TEXT_LIMITS.resourceUriCharacters} OR typeof(title) != 'text' OR length(title) > ${CLASSIC_TEXT_LIMITS.sectionTitleCharacters} OR typeof(content) != 'text' OR CASE WHEN topics IS NULL OR topics = '' THEN 0 WHEN typeof(topics) != 'text' THEN 1 WHEN json_valid(topics) != 1 THEN 1 WHEN json_type(topics) != 'array' THEN 1 WHEN EXISTS (SELECT 1 FROM json_each(topics) WHERE type != 'text') THEN 1 ELSE 0 END) = 0`;
}

interface RemoteD1ReadinessOptions {
  database: string;
  env?: string;
  wrangler?: string;
  cwd?: string;
}

type ReadinessCommandExecutor = (
  file: string,
  args: readonly string[],
  options: { cwd: string; stdio: 'inherit' | 'pipe'; encoding?: 'utf8' },
) => unknown;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Read-only assertions shared by remote D1 and local Workerd seed gates.
 * The stored display reference is the exact string later used by the inactive
 * aggregate lookup, so it must remain a deterministic projection of the
 * normalized coordinate rather than merely non-empty text. The globally unique
 * evidence key is the child-to-parent lineage boundary: evidence IDs are read
 * only from the parent row and cannot drift in a duplicated child column.
 */
export function buildUbsSemanticStoredIntegrityPredicates(): readonly string[] {
  const canonicalCase = (column: 'name' | 'helloaoCode') => `CASE c.normalized_book_number\n${BIBLE_BOOKS
    .map(book => `WHEN ${book.number} THEN ${sqlLiteral(book[column])}`).join('\n')}\nEND`;
  const canonicalName = canonicalCase('name');
  const canonicalCode = canonicalCase('helloaoCode');
  // One compact JSON array-of-arrays carries the full canonical chapter and
  // verse bounds into the read-only SQL gate. D1 and SQLite both expose the
  // JSON functions used here, and the literal is emitted once inside this
  // self-contained scalar CTE rather than repeated for every Bible book.
  const canonicalVerseBounds = sqlLiteral(JSON.stringify(
    BIBLE_BOOKS.map(book => getBibleBookBounds(book).maxVerseByChapter),
  ));
  return Object.freeze([
    `(SELECT COUNT(*) FROM ubs_semantic_normalized_coordinates c
      LEFT JOIN ubs_semantic_reference_evidence e
        ON e.evidence_key = c.evidence_key
      WHERE e.evidence_key IS NULL) = 0`,
    `(SELECT COUNT(*) FROM (
      SELECT evidence_key, target_ordinal
      FROM ubs_semantic_normalized_coordinates
      GROUP BY evidence_key, target_ordinal HAVING COUNT(*) != 1
    )) = 0`,
    `(SELECT COUNT(*) FROM ubs_semantic_normalized_coordinates c
      WHERE c.normalized_book_code IS NOT (${canonicalCode})
         OR c.normalized_reference IS NOT printf('%s %d:%d', (${canonicalName}), c.normalized_chapter, c.normalized_verse)
         OR (c.normalized_verse = 0 AND c.normalized_book_number != 19)) = 0`,
    `(WITH canonical_verse_bounds(bounds_json) AS (VALUES (${canonicalVerseBounds}))
      SELECT COUNT(*) FROM (
        SELECT DISTINCT normalized_book_number, normalized_chapter, normalized_verse
        FROM ubs_semantic_normalized_coordinates
      ) c
      CROSS JOIN canonical_verse_bounds b
      WHERE c.normalized_chapter NOT BETWEEN 1 AND json_array_length(
              b.bounds_json, '$[' || (c.normalized_book_number - 1) || ']')
         OR c.normalized_verse NOT BETWEEN
              CASE WHEN c.normalized_book_number = 19 THEN 0 ELSE 1 END
              AND json_extract(b.bounds_json, '$[' || (c.normalized_book_number - 1)
                || '][' || (c.normalized_chapter - 1) || ']')) = 0`,
    `(SELECT COUNT(*) FROM (
      SELECT evidence_key
      FROM ubs_semantic_normalized_coordinates
      GROUP BY evidence_key
      HAVING MIN(target_ordinal) != 1 OR MAX(target_ordinal) != COUNT(*)
    )) = 0`,
  ]);
}

/**
 * Materialize every reviewed morphology correction as SQL data, then require an
 * exact locator/value match. Fields are converted to fixed column names only
 * after validation; ledger strings are always SQL-escaped literals.
 */
export function buildMorphologyUnicodeReadinessContract(
  corrections: readonly MorphologyUnicodeCorrection[],
): MorphologyUnicodeReadinessContract {
  const locators = new Set<string>();
  const values = corrections.map(correction => {
    if (!/^[1-3]?[A-Za-z]+$/.test(correction.book)
      || !Number.isSafeInteger(correction.chapter) || correction.chapter < 1
      || !Number.isSafeInteger(correction.verse) || correction.verse < 1
      || !Number.isSafeInteger(correction.position) || correction.position < 1
      || !['text', 'lemma'].includes(correction.field)
      || typeof correction.after !== 'string' || correction.after.includes('\uFFFD')) {
      throw new Error('Invalid morphology Unicode correction readiness locator/value');
    }
    const column = correction.field === 'text' ? 'word_text' : 'lemma';
    const locator = `${correction.book}/${correction.chapter}/${correction.verse}/${correction.position}/${column}`;
    if (locators.has(locator)) throw new Error(`Duplicate morphology Unicode correction readiness locator: ${locator}`);
    locators.add(locator);
    return `(${sqlLiteral(correction.book)},${correction.chapter},${correction.verse},${correction.position},${sqlLiteral(column)},${sqlLiteral(correction.after)})`;
  });
  if (values.length !== 237) {
    throw new Error(`Expected 237 morphology Unicode correction readiness cells, received ${values.length}`);
  }
  const cte = `unicode_morphology_expected(book,chapter,verse,position,field,expected_value) AS (VALUES\n${values.join(',\n')}\n)`;
  const join = `m.book = e.book AND m.chapter = e.chapter AND m.verse = e.verse AND m.position = e.position`;
  const selectedValue = `CASE e.field WHEN 'word_text' THEN m.word_text WHEN 'lemma' THEN m.lemma END`;
  return {
    cte,
    correctionCount: values.length,
    checks: [
      `(SELECT COUNT(*) FROM unicode_morphology_expected) = ${values.length}`,
      `(SELECT COUNT(*) FROM unicode_morphology_expected e JOIN morphology m ON ${join}) = ${values.length}`,
      `(SELECT COUNT(*) FROM unicode_morphology_expected e JOIN morphology m ON ${join} WHERE ${selectedValue} IS NOT e.expected_value) = 0`,
    ],
  };
}

function buildD1ReadinessQueryContract(
  expectedCounts: Record<string, number>,
  schemaVersion = MANIFEST.schemaVersion,
  d1CorpusIdentity = D1_CORPUS_IDENTITY,
): D1ReadinessQueryContract {
  const countChecks = Object.entries(expectedCounts).map(([table, count]): D1ReadinessCheck => {
    if (!/^[a-z_]+$/.test(table) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Invalid expected D1 count: ${table}=${count}`);
    }
    return { id: `counts.${table}`, predicate: `(SELECT COUNT(*) FROM "${table}") = ${count}` };
  });
  const requiredIndexes = [
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
  ];
  const quotedIndexes = requiredIndexes.map(name => `'${name}'`).join(',');
  const indexCheck = `(SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN (${quotedIndexes})) = ${requiredIndexes.length}`;
  const integrityCheck = `(SELECT quick_check FROM pragma_quick_check LIMIT 1) = 'ok'`;
  const foreignKeyCheck = `(SELECT COUNT(*) FROM pragma_foreign_key_check) = 0`;
  if (!/^[a-z0-9_]+$/.test(schemaVersion) || !/^[a-f0-9]{64}$/.test(d1CorpusIdentity)) {
    throw new Error('Invalid schema or D1 corpus identity');
  }
  const identityChecks: D1ReadinessCheck[] = [
    { id: 'identity.schema_version', predicate: `(SELECT value FROM theologai_metadata WHERE key = 'schema_version') = '${schemaVersion}'` },
    { id: 'identity.corpus_manifest_sha256', predicate: `(SELECT value FROM theologai_metadata WHERE key = 'corpus_manifest_sha256') = '${d1CorpusIdentity}'` },
    { id: 'identity.ubs_artifact', predicate: `(SELECT artifact_identity FROM ubs_parallel_sources WHERE source_id = 'ubs_paratext_parallel_passages') = '${UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY}'` },
    { id: 'identity.ubs_source', predicate: `(SELECT source_sha256 FROM ubs_parallel_sources WHERE source_id = 'ubs_paratext_parallel_passages') = '${UBS_PARALLEL_PASSAGE_PROVENANCE.sourceSha256}'` },
    { id: 'identity.ubs_transform', predicate: `(SELECT transform_version FROM ubs_parallel_sources WHERE source_id = 'ubs_paratext_parallel_passages') = ${UBS_PARALLEL_PASSAGE_PROVENANCE.transformVersion}` },
  ];
  const historicalCatalogChecks: D1ReadinessCheck[] = [
    { id: 'historical.catalog_count', predicate: `(SELECT COUNT(*) FROM documents WHERE json_type(metadata, '$.catalog') = 'object') = ${HISTORICAL_CATALOG.length}` },
    ...HISTORICAL_CATALOG.map(entry => {
      const metadata = JSON.stringify({
        lookupAliases: entry.lookupAliases,
        composition: entry.composition,
        creators: entry.creators,
        metadataStatus: entry.metadataStatus,
        metadataProvenanceIds: entry.metadataProvenanceIds,
      });
      return {
        id: `historical.catalog.${entry.documentId}`,
        predicate: `((SELECT json_extract(metadata, '$.catalog') FROM documents WHERE id = ${sqlLiteral(entry.documentId)}) = ${sqlLiteral(metadata)} AND (SELECT date FROM documents WHERE id = ${sqlLiteral(entry.documentId)}) = ${sqlLiteral(entry.composition.label)})`,
      };
    }),
  ];
  const historicalOutputChecks: D1ReadinessCheck[] = [
    {
      id: 'historical.output.work_count',
      predicate: `(SELECT COUNT(*) FROM documents) <= ${CLASSIC_TEXT_LIMITS.workCount}`,
    },
    {
      id: 'historical.output.sections_per_work',
      predicate: `(SELECT COUNT(*) FROM (SELECT document_id FROM document_sections GROUP BY document_id HAVING COUNT(*) > ${CLASSIC_TEXT_LIMITS.sectionsPerWork})) = 0`,
    },
    {
      id: 'historical.output.document_metadata',
      predicate: `(SELECT COUNT(*) FROM documents WHERE typeof(id) != 'text' OR length(id) NOT BETWEEN 1 AND ${CLASSIC_TEXT_LIMITS.documentIdCharacters} OR id NOT GLOB '[A-Za-z0-9]*' OR id GLOB '*[^A-Za-z0-9._-]*' OR id IN ('.','..') OR length('theologai://documents/' || id) > ${CLASSIC_TEXT_LIMITS.resourceUriCharacters} OR typeof(title) != 'text' OR length(title) NOT BETWEEN 1 AND ${CLASSIC_TEXT_LIMITS.titleCharacters} OR typeof(type) != 'text' OR length(type) NOT BETWEEN 1 AND ${CLASSIC_TEXT_LIMITS.typeCharacters} OR (date IS NOT NULL AND (typeof(date) != 'text' OR length(date) NOT BETWEEN 1 AND ${CLASSIC_TEXT_LIMITS.dateCharacters})) OR CASE WHEN metadata IS NULL OR metadata = '' THEN 0 WHEN json_valid(metadata) != 1 THEN 1 WHEN json_type(metadata) != 'object' THEN 1 WHEN json_type(metadata, '$.topics') IS NULL THEN 0 WHEN json_type(metadata, '$.topics') != 'array' THEN 1 WHEN json_array_length(metadata, '$.topics') > ${CLASSIC_TEXT_LIMITS.topicCount} THEN 1 WHEN EXISTS (SELECT 1 FROM json_each(metadata, '$.topics') WHERE type != 'text' OR length(value) > ${CLASSIC_TEXT_LIMITS.topicCharacters}) THEN 1 ELSE 0 END) = 0`,
    },
    {
      id: 'historical.output.section_metadata',
      predicate: classicTextSectionReadinessPredicate(),
    },
    {
      id: 'historical.transform8.profile_coverage',
      predicate: `(SELECT COUNT(*) FROM historical_document_delivery_profiles) = (SELECT COUNT(*) FROM documents) AND (SELECT COUNT(*) FROM documents d LEFT JOIN historical_document_delivery_profiles p ON p.document_id = d.id WHERE p.document_id IS NULL) = 0`,
    },
    {
      id: 'historical.transform8.legacy_profile_contract',
      predicate: `(SELECT COUNT(*) FROM historical_document_delivery_profiles WHERE work_id IS NOT NULL OR edition_id IS NOT NULL OR section_package_identity IS NOT NULL OR delivery_mode != 'complete_document' OR landing_max_bytes != 0 OR browse_page_size != 0 OR cursor_version != 0 OR section_count < 1 OR json_valid(provenance_json) != 1 OR json_type(provenance_json) != 'object' OR json_valid(rights_json) != 1 OR json_type(rights_json) != 'object') = 0`,
    },
    {
      id: 'historical.transform8.identity_coverage',
      predicate: `(SELECT COUNT(*) FROM historical_section_identities) = (SELECT COUNT(*) FROM document_sections) AND (SELECT COUNT(*) FROM document_sections s LEFT JOIN historical_section_identities i ON i.document_section_id = s.id AND i.document_id = s.document_id WHERE i.document_section_id IS NULL) = 0 AND (SELECT COUNT(*) FROM historical_section_identities i LEFT JOIN document_sections s ON s.id = i.document_section_id AND s.document_id = i.document_id WHERE s.id IS NULL) = 0`,
    },
    {
      id: 'historical.transform8.source_ordinals',
      predicate: `(SELECT COUNT(*) FROM historical_document_delivery_profiles p WHERE (SELECT MIN(source_ordinal) FROM historical_section_identities i WHERE i.document_id = p.document_id) != 1 OR (SELECT MAX(source_ordinal) FROM historical_section_identities i WHERE i.document_id = p.document_id) != p.section_count OR (SELECT COUNT(*) FROM historical_section_identities i WHERE i.document_id = p.document_id) != p.section_count) = 0`,
    },
    {
      id: 'historical.transform8.alias_coverage_source_first',
      predicate: `(WITH legacy_groups AS (SELECT s.document_id, s.section_number AS legacy_section_id, MIN(i.source_ordinal) AS source_ordinal, COUNT(*) AS members FROM document_sections s JOIN historical_section_identities i ON i.document_section_id = s.id AND i.document_id = s.document_id GROUP BY s.document_id, s.section_number) SELECT COUNT(*) FROM legacy_groups g LEFT JOIN historical_section_aliases a ON a.document_id = g.document_id AND a.legacy_section_id = g.legacy_section_id AND a.source_ordinal = g.source_ordinal WHERE a.document_id IS NULL) = 0 AND (SELECT COUNT(*) FROM historical_section_aliases) = (SELECT COUNT(*) FROM (SELECT document_id, section_number FROM document_sections GROUP BY document_id, section_number))`,
    },
    {
      id: 'historical.transform8.alias_non_shadowing',
      predicate: `(SELECT COUNT(*) FROM historical_section_aliases a JOIN historical_section_identities i ON i.document_id = a.document_id AND i.section_key = a.legacy_section_id WHERE i.section_key != a.section_key) = 0`,
    },
    {
      // The count gate for sections_fts is generated from the manifest; this
      // join proves each of those rows still mirrors its source section.
      id: 'historical.transform8.full_fts_parity',
      predicate: `(SELECT COUNT(*) FROM document_sections section LEFT JOIN sections_fts fts ON fts.rowid = section.id WHERE fts.rowid IS NULL OR fts.title IS NOT section.title OR fts.content IS NOT section.content OR fts.topics IS NOT section.topics) = 0`,
    },
    {
      id: 'historical.transform8.collision_groups',
      predicate: `(SELECT COUNT(*) FROM (SELECT document_id, section_number FROM document_sections GROUP BY document_id, section_number HAVING COUNT(*) > 1)) = ${EXPECTED_HISTORICAL_SECTION_COLLISIONS.collisionGroups}`,
    },
    {
      id: 'historical.transform8.collision_affected_sections',
      predicate: `(SELECT COALESCE(SUM(member_count), 0) FROM (SELECT COUNT(*) AS member_count FROM document_sections GROUP BY document_id, section_number HAVING COUNT(*) > 1)) = ${EXPECTED_HISTORICAL_SECTION_COLLISIONS.affectedSections}`,
    },
    {
      id: 'historical.transform8.collision_newly_addressable_sections',
      predicate: `(SELECT COALESCE(SUM(member_count - 1), 0) FROM (SELECT COUNT(*) AS member_count FROM document_sections GROUP BY document_id, section_number HAVING COUNT(*) > 1)) = ${EXPECTED_HISTORICAL_SECTION_COLLISIONS.newlyAddressableSections}`,
    },
  ];
  const columnChecks = Object.entries(REQUIRED_COLUMNS).map(([table, columns]): D1ReadinessCheck => ({
    id: `schema.columns.${table}`,
    predicate: `(SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info('${table}') ORDER BY cid)) = '${columns.join(',')}'`,
  }));
  const ubsSemanticChecks: D1ReadinessCheck[] = [
    { id: 'ubs.source_ordinals', predicate: `(SELECT MIN(source_ordinal) = 1 AND MAX(source_ordinal) = COUNT(*) FROM ubs_parallel_groups)` },
    { id: 'ubs.group_metadata', predicate: `(SELECT COUNT(*) FROM ubs_parallel_groups g WHERE g.source_id != 'ubs_paratext_parallel_passages' OR g.label != 'source_attested_parallel' OR g.directionality != 'unspecified') = 0` },
    { id: 'ubs.member_ordinals', predicate: `(SELECT COUNT(*) FROM ubs_parallel_groups g WHERE NOT EXISTS (SELECT 1 FROM ubs_parallel_members m WHERE m.group_id = g.group_id) OR (SELECT MIN(source_order) FROM ubs_parallel_members m WHERE m.group_id = g.group_id) != 1 OR (SELECT MAX(source_order) FROM ubs_parallel_members m WHERE m.group_id = g.group_id) != (SELECT COUNT(*) FROM ubs_parallel_members m WHERE m.group_id = g.group_id)) = 0` },
    { id: 'ubs.segment_ordinals', predicate: `(SELECT COUNT(*) FROM ubs_parallel_members m WHERE NOT EXISTS (SELECT 1 FROM ubs_parallel_segments s WHERE s.group_id = m.group_id AND s.member_order = m.source_order) OR (SELECT MIN(segment_order) FROM ubs_parallel_segments s WHERE s.group_id = m.group_id AND s.member_order = m.source_order) != 1 OR (SELECT MAX(segment_order) FROM ubs_parallel_segments s WHERE s.group_id = m.group_id AND s.member_order = m.source_order) != (SELECT COUNT(*) FROM ubs_parallel_segments s WHERE s.group_id = m.group_id AND s.member_order = m.source_order)) = 0` },
    { id: 'ubs.member_values', predicate: `(SELECT COUNT(*) FROM ubs_parallel_members WHERE source_reference != trim(source_reference) OR length(source_reference) <= 4 OR source_reference NOT GLOB '[A-Z0-9][A-Z0-9][A-Z0-9] *' OR normalized_reference = '' OR normalized_reference != trim(normalized_reference) OR alignment_raw = '' OR alignment_raw GLOB '*[^0-8]*' OR (language_marker = 'GRK' AND alignment_basis != 'UBSGNT5') OR (language_marker = 'HEB' AND alignment_basis NOT IN ('BHS','LXX'))) = 0` },
    { id: 'ubs.segment_values', predicate: `(SELECT COUNT(*) FROM ubs_parallel_segments WHERE book_number NOT BETWEEN 1 AND 66 OR chapter < 1 OR start_verse < 1 OR end_verse < start_verse) = 0` },
  ];
  const semanticArtifact = UBS_SEMANTIC_STORAGE.artifact;
  const semanticSourcePredicate = (source: typeof UBS_SEMANTIC_STORAGE.sources[number]) => [
    `artifact_identity = ${sqlLiteral(semanticArtifact.artifactIdentity)}`,
    `source_id = ${sqlLiteral(source.sourceId)}`,
    `source_role = ${sqlLiteral(source.sourceRole)}`,
    `schema_version = ${sqlLiteral(source.schemaVersion)}`,
    `transform_version = ${source.transformVersion}`,
    `title = ${sqlLiteral(source.title)}`,
    `artifact_name = ${sqlLiteral(source.artifactName)}`,
    `artifact_version = ${sqlLiteral(source.artifactVersion)}`,
    `language = 'Hebrew'`,
    `source_url = ${sqlLiteral(source.sourceUrl)}`,
    `source_commit = ${sqlLiteral(source.sourceCommit)}`,
    `source_blob = ${sqlLiteral(source.sourceBlob)}`,
    `source_sha256 = ${sqlLiteral(source.sourceSha256)}`,
    `license = ${sqlLiteral(source.license)}`,
    `license_url = ${sqlLiteral(source.licenseUrl)}`,
    `publisher = ${sqlLiteral(source.publisher)}`,
    `modified = 1`,
    `modification_description = ${sqlLiteral(source.modificationDescription)}`,
  ].join(' AND ');
  const [coordinateEvidenceBinding, coordinateOrdinalUniqueness, coordinateCanonicalReference,
    coordinateCanonicalBounds, coordinateOrdinalContiguity] =
    buildUbsSemanticStoredIntegrityPredicates();
  const ubsHebrewSemanticChecks: D1ReadinessCheck[] = [
    { id: 'ubs_hebrew_semantic.artifact_identity', predicate: `(SELECT artifact_identity FROM ubs_semantic_artifacts) = ${sqlLiteral(semanticArtifact.artifactIdentity)}` },
    { id: 'ubs_hebrew_semantic.artifact_contract', predicate: `(SELECT COUNT(*) FROM ubs_semantic_artifacts WHERE artifact_identity = ${sqlLiteral(semanticArtifact.artifactIdentity)} AND schema_version = ${sqlLiteral(semanticArtifact.schemaVersion)} AND compiler_version = ${semanticArtifact.compilerVersion} AND transform_version = ${semanticArtifact.transformVersion} AND rights_notice_json = ${sqlLiteral(semanticArtifact.rightsNoticeJson)} AND provenance_notice_json = ${sqlLiteral(semanticArtifact.provenanceNoticeJson)} AND transformation_witness_json = ${sqlLiteral(semanticArtifact.transformationWitnessJson)}) = 1 AND (SELECT COUNT(*) FROM ubs_semantic_artifacts) = 1` },
    { id: 'ubs_hebrew_semantic.source_contract', predicate: `(SELECT COUNT(*) FROM ubs_semantic_sources) = ${UBS_SEMANTIC_STORAGE.sources.length} AND ${UBS_SEMANTIC_STORAGE.sources.map(source => `(SELECT COUNT(*) FROM ubs_semantic_sources WHERE ${semanticSourcePredicate(source)}) = 1`).join(' AND ')}` },
    { id: 'ubs_hebrew_semantic.normalized_coordinates', predicate: `(SELECT COUNT(*) FROM ubs_semantic_normalized_coordinates) = ${UBS_SEMANTIC_AUDIT.projection.normalizedCoordinateRows} AND (SELECT COUNT(*) FROM ubs_semantic_normalized_coordinates WHERE normalized_verse < 0 OR normalized_reference = '') = 0` },
    { id: 'ubs_hebrew_semantic.coordinate_cardinality', predicate: `(SELECT COUNT(*) FROM (SELECT evidence_key FROM ubs_semantic_normalized_coordinates GROUP BY evidence_key HAVING COUNT(*) > 1)) = ${UBS_SEMANTIC_AUDIT.projection.sourceEvidenceWithAmbiguousNormalizedCoordinates}` },
    { id: 'ubs_hebrew_semantic.coordinate_evidence_binding', predicate: coordinateEvidenceBinding },
    { id: 'ubs_hebrew_semantic.coordinate_ordinal_unique', predicate: coordinateOrdinalUniqueness },
    { id: 'ubs_hebrew_semantic.coordinate_reference_canonical', predicate: coordinateCanonicalReference },
    { id: 'ubs_hebrew_semantic.coordinate_bounds_canonical', predicate: coordinateCanonicalBounds },
    { id: 'ubs_hebrew_semantic.coordinate_ordinals_contiguous', predicate: coordinateOrdinalContiguity },
    { id: 'ubs_hebrew_semantic.relationships', predicate: `(SELECT COUNT(*) FROM ubs_semantic_reference_evidence e LEFT JOIN ubs_semantic_senses s ON s.artifact_identity = e.artifact_identity AND s.sense_id = e.sense_id WHERE s.sense_id IS NULL) = 0` },
  ];
  if (UNICODE_CORRECTION.strongs.length !== 9 || UNICODE_CORRECTION.morphology.length !== 237
    || UNICODE_CORRECTION.contract.d1Cells !== 255) {
    throw new Error('Biblical-language Unicode correction readiness contract drift');
  }
  const strongsSemanticChecks = UNICODE_CORRECTION.strongs.flatMap((correction): D1ReadinessCheck[] => {
    if (!/^[GH]\d+$/.test(correction.strongsNumber) || !['lemma', 'translit'].includes(correction.field)) {
      throw new Error(`Invalid Strong's Unicode correction readiness locator`);
    }
    const column = correction.field === 'translit' ? 'transliteration' : 'lemma';
    const expected = sqlLiteral(correction.after);
    const strongsNumber = sqlLiteral(correction.strongsNumber);
    return [
      { id: `unicode.strongs.${correction.strongsNumber.toLowerCase()}.${column}.table`, predicate: `(SELECT ${column} FROM strongs WHERE strongs_number = ${strongsNumber}) = ${expected}` },
      { id: `unicode.strongs.${correction.strongsNumber.toLowerCase()}.${column}.fts`, predicate: `(SELECT ${column} FROM strongs_fts WHERE strongs_number = ${strongsNumber}) = ${expected}` },
    ];
  });
  const morphologyUnicodeContract = buildMorphologyUnicodeReadinessContract(UNICODE_CORRECTION.morphology);
  const usageFoundationCtes = `usage_expected(strongs_key,token_count,verse_count,book_count) AS (
    SELECT strongs_number, COUNT(*), COUNT(DISTINCT printf('%d:%d:%d', book_order, chapter, verse)), COUNT(DISTINCT book_order)
    FROM morphology WHERE strongs_number IS NOT NULL AND strongs_number != '' GROUP BY strongs_number
  ), book_usage_expected(strongs_key,book,book_order,token_count,verse_count) AS (
    SELECT strongs_number, book, book_order, COUNT(*), COUNT(DISTINCT printf('%d:%d:%d', book_order, chapter, verse))
    FROM morphology WHERE strongs_number IS NOT NULL AND strongs_number != '' GROUP BY strongs_number, book, book_order
  ), form_usage_expected(strongs_key,form_text,token_count,verse_count,first_key) AS (
    SELECT strongs_number, word_text, COUNT(*), COUNT(DISTINCT printf('%d:%d:%d', book_order, chapter, verse)),
           MIN(printf('%02d:%05d:%05d:%05d', book_order, chapter, verse, position))
    FROM morphology WHERE strongs_number IS NOT NULL AND strongs_number != '' GROUP BY strongs_number, word_text
  ), form_counts_expected(strongs_key,form_count) AS (
    SELECT strongs_key, COUNT(*) FROM form_usage_expected GROUP BY strongs_key
  )`;
  const usageFoundationChecks: D1ReadinessCheck[] = [
    { id: 'usage.book_order_range', predicate: `(SELECT COUNT(*) FROM morphology WHERE book_order NOT BETWEEN 1 AND 66) = 0` },
    { id: 'usage.book_order_canonical', predicate: `(SELECT COUNT(*) FROM morphology WHERE book_order != ${CANONICAL_BOOK_ORDER_SQL}) = 0` },
    { id: 'usage.summary_missing', predicate: `(SELECT COUNT(*) FROM (SELECT expected.strongs_key, expected.token_count, expected.verse_count, expected.book_count, forms.form_count FROM usage_expected expected JOIN form_counts_expected forms USING (strongs_key) EXCEPT SELECT strongs_key, token_count, verse_count, book_count, form_count FROM strongs_usage_stats)) = 0` },
    { id: 'usage.summary_extra', predicate: `(SELECT COUNT(*) FROM (SELECT strongs_key, token_count, verse_count, book_count, form_count FROM strongs_usage_stats EXCEPT SELECT expected.strongs_key, expected.token_count, expected.verse_count, expected.book_count, forms.form_count FROM usage_expected expected JOIN form_counts_expected forms USING (strongs_key))) = 0` },
    { id: 'usage.books_missing', predicate: `(SELECT COUNT(*) FROM (SELECT * FROM book_usage_expected EXCEPT SELECT strongs_key, book, book_order, token_count, verse_count FROM strongs_book_stats)) = 0` },
    { id: 'usage.books_extra', predicate: `(SELECT COUNT(*) FROM (SELECT strongs_key, book, book_order, token_count, verse_count FROM strongs_book_stats EXCEPT SELECT * FROM book_usage_expected)) = 0` },
    { id: 'usage.forms_missing', predicate: `(SELECT COUNT(*) FROM (SELECT strongs_key, form_text, token_count, verse_count, first_key FROM form_usage_expected EXCEPT SELECT strongs_key, form_text, token_count, verse_count, printf('%02d:%05d:%05d:%05d', first_book_order, first_chapter, first_verse, first_position) FROM strongs_form_stats)) = 0` },
    { id: 'usage.forms_extra', predicate: `(SELECT COUNT(*) FROM (SELECT strongs_key, form_text, token_count, verse_count, printf('%02d:%05d:%05d:%05d', first_book_order, first_chapter, first_verse, first_position) FROM strongs_form_stats EXCEPT SELECT strongs_key, form_text, token_count, verse_count, first_key FROM form_usage_expected)) = 0` },
    { id: 'usage.form_first_occurrence', predicate: `(SELECT COUNT(*) FROM strongs_form_stats form WHERE NOT EXISTS (SELECT 1 FROM morphology token WHERE token.strongs_number = form.strongs_key AND token.word_text = form.form_text AND token.book = form.first_book AND token.book_order = form.first_book_order AND token.chapter = form.first_chapter AND token.verse = form.first_verse AND token.position = form.first_position)) = 0` },
  ];
  const unicodeAbsenceChecks = [
    ['strongs', ['strongs_number', 'testament', 'lemma', 'transliteration', 'pronunciation', 'definition', 'derivation']],
    ['strongs_fts', ['strongs_number', 'lemma', 'transliteration', 'definition']],
    ['morphology', ['book', 'word_text', 'lemma', 'strongs_number', 'morph_code', 'gloss']],
  ].map(([table, columns]): D1ReadinessCheck => {
    const predicate = (columns as string[]).map(column => `instr(COALESCE(${column}, ''), char(65533)) > 0`).join(' OR ');
    return { id: `unicode.replacement_absent.${table}`, predicate: `(SELECT COUNT(*) FROM ${table} WHERE ${predicate}) = 0` };
  });

  const checks: D1ReadinessCheck[] = [
    { id: 'integrity.quick_check', predicate: integrityCheck },
    { id: 'integrity.foreign_keys', predicate: foreignKeyCheck },
    ...identityChecks,
    ...historicalCatalogChecks,
    ...historicalOutputChecks,
    ...columnChecks,
    ...countChecks,
    { id: 'schema.required_indexes', predicate: indexCheck },
    ...ubsSemanticChecks,
    ...ubsHebrewSemanticChecks,
    ...strongsSemanticChecks,
    ...morphologyUnicodeContract.checks.map((predicate, index): D1ReadinessCheck => ({
      id: ['unicode.morphology.expected_count', 'unicode.morphology.locators', 'unicode.morphology.values'][index]!,
      predicate,
    })),
    ...usageFoundationChecks,
    ...unicodeAbsenceChecks,
    { id: 'data.john_1_1', predicate: johnOneOneReadinessPredicate() },
    { id: 'data.genesis_1_1_lemma', predicate: genesisOneOneLemmaReadinessPredicate() },
  ];
  const ids = new Set<string>();
  for (const check of checks) {
    if (!/^[a-z0-9._:-]+$/.test(check.id) || ids.has(check.id)) {
      throw new Error(`Invalid or duplicate D1 readiness check ID: ${check.id}`);
    }
    ids.add(check.id);
  }
  return {
    ctes: [morphologyUnicodeContract.cte, usageFoundationCtes],
    checks,
  };
}

function buildD1ReadinessChecksCte(contract: D1ReadinessQueryContract): string {
  const values = contract.checks.map(check =>
    `(${sqlLiteral(check.id)}, (${check.predicate}))`
  ).join(',\n');
  return `WITH ${contract.ctes.join(',\n')},\nreadiness_checks(check_name, passed) AS (VALUES\n${values}\n)`;
}

/**
 * Return a checked, minimal projection of the fixed readiness inventory.
 *
 * The remote gate always evaluates the complete inventory. Targeted
 * projections are intentionally limited to diagnostics and local corruption
 * tests: they reuse the production predicates rather than maintaining a
 * second, weaker copy of a check just to make a failure observable.
 */
function selectD1ReadinessChecks(
  contract: D1ReadinessQueryContract,
  checkNames: readonly string[] | undefined,
): D1ReadinessQueryContract {
  if (checkNames === undefined) return contract;
  if (checkNames.length === 0) throw new Error('At least one D1 readiness check is required');

  const available = new Map(contract.checks.map(check => [check.id, check]));
  const selected = checkNames.map(checkName => {
    if (!/^[a-z0-9._:-]+$/.test(checkName)) {
      throw new Error(`Invalid D1 readiness check ID: ${checkName}`);
    }
    const check = available.get(checkName);
    if (!check) throw new Error(`Unknown D1 readiness check ID: ${checkName}`);
    return check;
  });
  if (new Set(checkNames).size !== checkNames.length) {
    throw new Error('Duplicate D1 readiness check ID');
  }
  return { ...contract, checks: selected };
}

export function buildD1ReadinessSql(
  expectedCounts: Record<string, number>,
  schemaVersion = MANIFEST.schemaVersion,
  d1CorpusIdentity = D1_CORPUS_IDENTITY,
): string {
  const contract = buildD1ReadinessQueryContract(expectedCounts, schemaVersion, d1CorpusIdentity);
  const expectedCheckCount = contract.checks.length;
  return assertD1ReadinessSqlByteBound('primary', [
    buildD1ReadinessChecksCte(contract),
    `SELECT CASE`,
    `WHEN (SELECT COUNT(*) FROM readiness_checks) != ${expectedCheckCount} THEN json_extract('D1 readiness check inventory mismatch', '$')`,
    `WHEN (SELECT COUNT(*) FROM readiness_checks WHERE passed IS 1) != ${expectedCheckCount} THEN json_extract('D1 readiness check failed', '$')`,
    `ELSE 'ready' END AS readiness;`,
  ].join('\n'));
}

export function buildD1ReadinessDiagnosticSql(
  expectedCounts: Record<string, number>,
  schemaVersion = MANIFEST.schemaVersion,
  d1CorpusIdentity = D1_CORPUS_IDENTITY,
  checkNames?: readonly string[],
): string {
  const contract = selectD1ReadinessChecks(
    buildD1ReadinessQueryContract(expectedCounts, schemaVersion, d1CorpusIdentity),
    checkNames,
  );
  return assertD1ReadinessSqlByteBound('diagnostic', [
    buildD1ReadinessChecksCte(contract),
    `SELECT check_name, passed FROM readiness_checks WHERE passed IS NOT 1 ORDER BY check_name;`,
  ].join('\n'));
}

function assertD1ReadinessSqlByteBound(kind: 'primary' | 'diagnostic', sql: string): string {
  const bytes = Buffer.byteLength(sql, 'utf8');
  if (bytes > MAX_D1_READINESS_SQL_BYTES) {
    throw new Error(`D1 readiness ${kind} SQL exceeds ${MAX_D1_READINESS_SQL_BYTES} bytes: ${bytes}`);
  }
  return sql;
}

function parseArguments(argv: string[]): { database: string; env?: string; printOnly: boolean } {
  let database: string | undefined;
  let env: string | undefined;
  let printOnly = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--database') database = argv[++index];
    else if (argument === '--env') env = argv[++index];
    else if (argument === '--print') printOnly = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!database || database.startsWith('--')) throw new Error('--database is required');
  if (env?.startsWith('--')) throw new Error('--env requires a value');
  return { database, env, printOnly };
}

export function runRemoteD1ReadinessCheck(
  options: RemoteD1ReadinessOptions,
  execute: ReadinessCommandExecutor = execFileSync,
): void {
  const wrangler = options.wrangler ?? join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const cwd = options.cwd ?? ROOT;
  const executeSql = (sql: string, capture = false): unknown => {
    const args = [wrangler, 'd1', 'execute', options.database, '--remote', '--command', sql, '--json'];
    if (options.env) args.push('--env', options.env);
    return execute(process.execPath, args, capture ? { cwd, stdio: 'pipe', encoding: 'utf8' } : { cwd, stdio: 'inherit' });
  };

  try {
    executeSql(buildD1ReadinessSql(MANIFEST.expectedCounts));
    const audit = auditHistoricalTransform8Authority(ROOT, sql => {
      const result = executeSql(sql, true);
      return parseHistoricalTransform8D1Page(
        typeof result === 'string' ? result : Buffer.isBuffer(result) ? result.toString('utf8') : String(result),
      );
    });
    process.stderr.write(`Transform-8 D1 authority audit passed (${audit.pages.profiles}/${audit.pages.identities}/${audit.pages.aliases} pages).\n`);
  } catch (primaryError) {
    process.stderr.write('Primary D1 readiness gate failed; requesting failed-check diagnostics.\n');
    try {
      executeSql(buildD1ReadinessDiagnosticSql(MANIFEST.expectedCounts));
    } catch {
      process.stderr.write('D1 readiness diagnostics could not be retrieved.\n');
    }
    throw primaryError;
  }
}

function main(): void {
  const { database, env, printOnly } = parseArguments(process.argv.slice(2));
  const sql = buildD1ReadinessSql(MANIFEST.expectedCounts);
  if (printOnly) {
    process.stdout.write(`${sql}\n`);
    return;
  }

  runRemoteD1ReadinessCheck({ database, env });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
