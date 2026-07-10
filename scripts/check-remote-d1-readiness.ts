#!/usr/bin/env tsx
/** Read-only remote D1 compatibility gate used only inside approved deploy jobs. */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { johnOneOneReadinessPredicate } from './data-integrity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestBytes = readFileSync(join(ROOT, 'data', 'data-manifest.json'));
const MANIFEST = JSON.parse(manifestBytes.toString('utf8')) as {
  schemaVersion: string;
  expectedCounts: Record<string, number>;
};
const MANIFEST_SHA256 = createHash('sha256').update(manifestBytes).digest('hex');

const REQUIRED_COLUMNS: Record<string, string[]> = {
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
};

export function buildD1ReadinessSql(
  expectedCounts: Record<string, number>,
  schemaVersion = MANIFEST.schemaVersion,
  manifestSha256 = MANIFEST_SHA256,
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
  ];
  const quotedIndexes = requiredIndexes.map(name => `'${name}'`).join(',');
  const indexCheck = `(SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN (${quotedIndexes})) = ${requiredIndexes.length}`;
  const integrityCheck = `(SELECT quick_check FROM pragma_quick_check LIMIT 1) = 'ok'`;
  const foreignKeyCheck = `(SELECT COUNT(*) FROM pragma_foreign_key_check) = 0`;
  if (!/^[a-z0-9_]+$/.test(schemaVersion) || !/^[a-f0-9]{64}$/.test(manifestSha256)) {
    throw new Error('Invalid schema or manifest identity');
  }
  const identityChecks = [
    `(SELECT value FROM theologai_metadata WHERE key = 'schema_version') = '${schemaVersion}'`,
    `(SELECT value FROM theologai_metadata WHERE key = 'corpus_manifest_sha256') = '${manifestSha256}'`,
  ];
  const columnChecks = Object.entries(REQUIRED_COLUMNS).map(([table, columns]) =>
    `(SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_table_info('${table}') ORDER BY cid)) = '${columns.join(',')}'`
  );

  return [
    `SELECT CASE WHEN ${[integrityCheck, foreignKeyCheck, ...identityChecks, ...columnChecks, ...countChecks, indexCheck, johnOneOneReadinessPredicate()].join(' AND ')}`,
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
