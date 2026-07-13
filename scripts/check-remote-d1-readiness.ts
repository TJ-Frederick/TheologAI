#!/usr/bin/env tsx
/** Read-only remote D1 compatibility gate used only inside approved deploy jobs. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { genesisOneOneLemmaReadinessPredicate, johnOneOneReadinessPredicate } from './data-integrity.js';
import { computeD1CorpusIdentity, parseDataManifest, verifyD1Migrations } from './d1-corpus-identity.js';
import { UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY, UBS_PARALLEL_PASSAGE_PROVENANCE } from '../src/kernel/ubsParallelSource.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestBytes = readFileSync(join(ROOT, 'data', 'data-manifest.json'));
const MANIFEST = parseDataManifest(manifestBytes);
verifyD1Migrations(ROOT, MANIFEST);
const D1_CORPUS_IDENTITY = computeD1CorpusIdentity(MANIFEST);

export const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  theologai_metadata: ['key', 'value'],
  cross_references: ['from_verse', 'to_verse', 'votes'],
  strongs: ['strongs_number', 'testament', 'lemma', 'transliteration', 'pronunciation', 'definition', 'derivation'],
  strongs_fts: ['strongs_number', 'lemma', 'transliteration', 'definition'],
  morphology: ['book', 'chapter', 'verse', 'position', 'word_text', 'lemma', 'strongs_number', 'morph_code', 'gloss'],
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

  return [
    `SELECT CASE WHEN ${[integrityCheck, foreignKeyCheck, ...identityChecks, ...columnChecks, ...countChecks, indexCheck, ...ubsSemanticChecks, johnOneOneReadinessPredicate(), genesisOneOneLemmaReadinessPredicate()].join(' AND ')}`,
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
