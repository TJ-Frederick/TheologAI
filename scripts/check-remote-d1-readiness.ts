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
import type {
  BiblicalLanguageUnicodeCorrectionLedger,
  MorphologyUnicodeCorrection,
} from './biblical-language-unicode-correction.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestBytes = readFileSync(join(ROOT, 'data', 'data-manifest.json'));
const MANIFEST = parseDataManifest(manifestBytes);
verifyD1Migrations(ROOT, MANIFEST);
const D1_CORPUS_IDENTITY = computeD1CorpusIdentity(MANIFEST);
const UNICODE_CORRECTION = JSON.parse(readFileSync(
  join(ROOT, 'data/biblical-languages/UNICODE-CORRECTION.json'),
  'utf8',
)) as BiblicalLanguageUnicodeCorrectionLedger;

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
  sections_fts: ['title', 'content', 'topics'],
  morph_codes: ['code', 'expansion'],
  ubs_parallel_sources: ['source_id', 'schema_version', 'transform_version', 'artifact_identity', 'title', 'publisher', 'copyright', 'license', 'license_url', 'source_url', 'source_path', 'source_commit', 'source_commit_date', 'source_blob', 'source_bytes', 'source_sha256', 'modified', 'modification_note', 'label', 'directionality'],
  ubs_parallel_groups: ['group_id', 'source_id', 'source_ordinal', 'label', 'directionality'],
  ubs_parallel_members: ['group_id', 'source_order', 'source_reference', 'normalized_reference', 'language_marker', 'alignment_basis', 'alignment_raw'],
  ubs_parallel_segments: ['group_id', 'member_order', 'segment_order', 'book_number', 'chapter', 'start_verse', 'end_verse'],
};

export interface MorphologyUnicodeReadinessContract {
  cte: string;
  checks: string[];
  correctionCount: number;
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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

export function buildD1ReadinessSql(
  expectedCounts: Record<string, number>,
  schemaVersion = MANIFEST.schemaVersion,
  d1CorpusIdentity = D1_CORPUS_IDENTITY,
): string {
  const countChecks = Object.entries(expectedCounts).map(([table, count]) => {
    if (!/^[a-z_]+$/.test(table) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Invalid expected D1 count: ${table}=${count}`);
    }
    return `(SELECT COUNT(*) FROM "${table}") = ${count}`;
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
  ];
  const quotedIndexes = requiredIndexes.map(name => `'${name}'`).join(',');
  const indexCheck = `(SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN (${quotedIndexes})) = ${requiredIndexes.length}`;
  const integrityCheck = `(SELECT quick_check FROM pragma_quick_check LIMIT 1) = 'ok'`;
  const foreignKeyCheck = `(SELECT COUNT(*) FROM pragma_foreign_key_check) = 0`;
  if (!/^[a-z0-9_]+$/.test(schemaVersion) || !/^[a-f0-9]{64}$/.test(d1CorpusIdentity)) {
    throw new Error('Invalid schema or D1 corpus identity');
  }
  const identityChecks = [
    `(SELECT value FROM theologai_metadata WHERE key = 'schema_version') = '${schemaVersion}'`,
    `(SELECT value FROM theologai_metadata WHERE key = 'corpus_manifest_sha256') = '${d1CorpusIdentity}'`,
    `(SELECT artifact_identity FROM ubs_parallel_sources WHERE source_id = 'ubs_paratext_parallel_passages') = '${UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY}'`,
    `(SELECT source_sha256 FROM ubs_parallel_sources WHERE source_id = 'ubs_paratext_parallel_passages') = '${UBS_PARALLEL_PASSAGE_PROVENANCE.sourceSha256}'`,
    `(SELECT transform_version FROM ubs_parallel_sources WHERE source_id = 'ubs_paratext_parallel_passages') = ${UBS_PARALLEL_PASSAGE_PROVENANCE.transformVersion}`,
  ];
  const columnChecks = Object.entries(REQUIRED_COLUMNS).map(([table, columns]) =>
    `(SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info('${table}') ORDER BY cid)) = '${columns.join(',')}'`
  );
  const ubsSemanticChecks = [
    `(SELECT MIN(source_ordinal) = 1 AND MAX(source_ordinal) = COUNT(*) FROM ubs_parallel_groups)`,
    `(SELECT COUNT(*) FROM ubs_parallel_groups g WHERE g.source_id != 'ubs_paratext_parallel_passages' OR g.label != 'source_attested_parallel' OR g.directionality != 'unspecified') = 0`,
    `(SELECT COUNT(*) FROM ubs_parallel_groups g WHERE NOT EXISTS (SELECT 1 FROM ubs_parallel_members m WHERE m.group_id = g.group_id) OR (SELECT MIN(source_order) FROM ubs_parallel_members m WHERE m.group_id = g.group_id) != 1 OR (SELECT MAX(source_order) FROM ubs_parallel_members m WHERE m.group_id = g.group_id) != (SELECT COUNT(*) FROM ubs_parallel_members m WHERE m.group_id = g.group_id)) = 0`,
    `(SELECT COUNT(*) FROM ubs_parallel_members m WHERE NOT EXISTS (SELECT 1 FROM ubs_parallel_segments s WHERE s.group_id = m.group_id AND s.member_order = m.source_order) OR (SELECT MIN(segment_order) FROM ubs_parallel_segments s WHERE s.group_id = m.group_id AND s.member_order = m.source_order) != 1 OR (SELECT MAX(segment_order) FROM ubs_parallel_segments s WHERE s.group_id = m.group_id AND s.member_order = m.source_order) != (SELECT COUNT(*) FROM ubs_parallel_segments s WHERE s.group_id = m.group_id AND s.member_order = m.source_order)) = 0`,
    `(SELECT COUNT(*) FROM ubs_parallel_members WHERE source_reference != trim(source_reference) OR length(source_reference) <= 4 OR source_reference NOT GLOB '[A-Z0-9][A-Z0-9][A-Z0-9] *' OR normalized_reference = '' OR normalized_reference != trim(normalized_reference) OR alignment_raw = '' OR alignment_raw GLOB '*[^0-8]*' OR (language_marker = 'GRK' AND alignment_basis != 'UBSGNT5') OR (language_marker = 'HEB' AND alignment_basis NOT IN ('BHS','LXX'))) = 0`,
    `(SELECT COUNT(*) FROM ubs_parallel_segments WHERE book_number NOT BETWEEN 1 AND 66 OR chapter < 1 OR start_verse < 1 OR end_verse < start_verse) = 0`,
  ];
  if (UNICODE_CORRECTION.strongs.length !== 9 || UNICODE_CORRECTION.morphology.length !== 237
    || UNICODE_CORRECTION.contract.d1Cells !== 255) {
    throw new Error('Biblical-language Unicode correction readiness contract drift');
  }
  const strongsSemanticChecks = UNICODE_CORRECTION.strongs.flatMap(correction => {
    if (!/^[GH]\d+$/.test(correction.strongsNumber) || !['lemma', 'translit'].includes(correction.field)) {
      throw new Error(`Invalid Strong's Unicode correction readiness locator`);
    }
    const column = correction.field === 'translit' ? 'transliteration' : 'lemma';
    const expected = sqlLiteral(correction.after);
    const strongsNumber = sqlLiteral(correction.strongsNumber);
    return [
      `(SELECT ${column} FROM strongs WHERE strongs_number = ${strongsNumber}) = ${expected}`,
      `(SELECT ${column} FROM strongs_fts WHERE strongs_number = ${strongsNumber}) = ${expected}`,
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
  const usageFoundationChecks = [
    `(SELECT COUNT(*) FROM morphology WHERE book_order NOT BETWEEN 1 AND 66) = 0`,
    `(SELECT COUNT(*) FROM morphology WHERE book_order != ${CANONICAL_BOOK_ORDER_SQL}) = 0`,
    `(SELECT COUNT(*) FROM (SELECT expected.strongs_key, expected.token_count, expected.verse_count, expected.book_count, forms.form_count FROM usage_expected expected JOIN form_counts_expected forms USING (strongs_key) EXCEPT SELECT strongs_key, token_count, verse_count, book_count, form_count FROM strongs_usage_stats)) = 0`,
    `(SELECT COUNT(*) FROM (SELECT strongs_key, token_count, verse_count, book_count, form_count FROM strongs_usage_stats EXCEPT SELECT expected.strongs_key, expected.token_count, expected.verse_count, expected.book_count, forms.form_count FROM usage_expected expected JOIN form_counts_expected forms USING (strongs_key))) = 0`,
    `(SELECT COUNT(*) FROM (SELECT * FROM book_usage_expected EXCEPT SELECT strongs_key, book, book_order, token_count, verse_count FROM strongs_book_stats)) = 0`,
    `(SELECT COUNT(*) FROM (SELECT strongs_key, book, book_order, token_count, verse_count FROM strongs_book_stats EXCEPT SELECT * FROM book_usage_expected)) = 0`,
    `(SELECT COUNT(*) FROM (SELECT strongs_key, form_text, token_count, verse_count, first_key FROM form_usage_expected EXCEPT SELECT strongs_key, form_text, token_count, verse_count, printf('%02d:%05d:%05d:%05d', first_book_order, first_chapter, first_verse, first_position) FROM strongs_form_stats)) = 0`,
    `(SELECT COUNT(*) FROM (SELECT strongs_key, form_text, token_count, verse_count, printf('%02d:%05d:%05d:%05d', first_book_order, first_chapter, first_verse, first_position) FROM strongs_form_stats EXCEPT SELECT strongs_key, form_text, token_count, verse_count, first_key FROM form_usage_expected)) = 0`,
    `(SELECT COUNT(*) FROM strongs_form_stats form WHERE NOT EXISTS (SELECT 1 FROM morphology token WHERE token.strongs_number = form.strongs_key AND token.word_text = form.form_text AND token.book = form.first_book AND token.book_order = form.first_book_order AND token.chapter = form.first_chapter AND token.verse = form.first_verse AND token.position = form.first_position)) = 0`,
  ];
  const unicodeAbsenceChecks = [
    ['strongs', ['strongs_number', 'testament', 'lemma', 'transliteration', 'pronunciation', 'definition', 'derivation']],
    ['strongs_fts', ['strongs_number', 'lemma', 'transliteration', 'definition']],
    ['morphology', ['book', 'word_text', 'lemma', 'strongs_number', 'morph_code', 'gloss']],
  ].map(([table, columns]) => {
    const predicate = (columns as string[]).map(column => `instr(COALESCE(${column}, ''), char(65533)) > 0`).join(' OR ');
    return `(SELECT COUNT(*) FROM ${table} WHERE ${predicate}) = 0`;
  });

  return [
    `WITH ${morphologyUnicodeContract.cte},\n${usageFoundationCtes}`,
    `SELECT CASE WHEN ${[integrityCheck, foreignKeyCheck, ...identityChecks, ...columnChecks, ...countChecks, indexCheck, ...ubsSemanticChecks, ...strongsSemanticChecks, ...morphologyUnicodeContract.checks, ...usageFoundationChecks, ...unicodeAbsenceChecks, johnOneOneReadinessPredicate(), genesisOneOneLemmaReadinessPredicate()].join(' AND ')}`,
    `THEN 'ready' ELSE json_extract('D1 readiness check failed', '$') END AS readiness;`,
  ].join('\n');
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

function main(): void {
  const { database, env, printOnly } = parseArguments(process.argv.slice(2));
  const sql = buildD1ReadinessSql(MANIFEST.expectedCounts);
  if (printOnly) {
    process.stdout.write(`${sql}\n`);
    return;
  }

  const wrangler = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const args = [wrangler, 'd1', 'execute', database, '--remote', '--command', sql, '--json'];
  if (env) args.push('--env', env);
  execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
