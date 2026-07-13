import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { BiblicalLanguageUnicodeCorrectionLedger } from './biblical-language-unicode-correction.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function verifyBiblicalLanguageUnicodeD1(
  root: string,
  db: Database.Database,
  expectedCounts: Record<string, number>,
): { sourceCells: number; d1Cells: number; rows: number } {
  const ledger = JSON.parse(readFileSync(
    join(root, 'data/biblical-languages/UNICODE-CORRECTION.json'),
    'utf8',
  )) as BiblicalLanguageUnicodeCorrectionLedger;
  assert(ledger.strongs.length === 9 && ledger.morphology.length === 237,
    'Unicode D1 verifier requires the exact 9 + 237 source-cell ledger');

  let d1Cells = 0;
  for (const correction of ledger.strongs) {
    assert(['lemma', 'translit'].includes(correction.field), `Invalid Strong's correction field: ${correction.field}`);
    const column = correction.field === 'translit' ? 'transliteration' : 'lemma';
    for (const table of ['strongs', 'strongs_fts']) {
      const row = db.prepare(`SELECT ${column} AS value FROM ${table} WHERE strongs_number = ?`)
        .get(correction.strongsNumber) as { value?: unknown } | undefined;
      assert(row?.value === correction.after,
        `Corrected D1 ${table}.${column} drift for ${correction.strongsNumber}`);
      d1Cells++;
    }
  }
  for (const correction of ledger.morphology) {
    assert(['text', 'lemma'].includes(correction.field), `Invalid morphology correction field: ${correction.field}`);
    const column = correction.field === 'text' ? 'word_text' : 'lemma';
    const row = db.prepare(
      `SELECT ${column} AS value FROM morphology
        WHERE book = ? AND chapter = ? AND verse = ? AND position = ?`,
    ).get(correction.book, correction.chapter, correction.verse, correction.position) as { value?: unknown } | undefined;
    assert(row?.value === correction.after,
      `Corrected D1 morphology.${column} drift at ${correction.book} ${correction.chapter}:${correction.verse}#${correction.position}`);
    d1Cells++;
  }
  assert(d1Cells === ledger.contract.d1Cells && d1Cells === 255, `Unicode D1 cell projection drift: ${d1Cells}`);

  for (const [table, columns] of [
    ['strongs', ['strongs_number', 'testament', 'lemma', 'transliteration', 'pronunciation', 'definition', 'derivation']],
    ['strongs_fts', ['strongs_number', 'lemma', 'transliteration', 'definition']],
    ['morphology', ['book', 'word_text', 'lemma', 'strongs_number', 'morph_code', 'gloss']],
  ] as const) {
    const predicate = columns.map(column => `instr(COALESCE(${column}, ''), char(65533)) > 0`).join(' OR ');
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`).get() as { count: number };
    assert(row.count === 0, `${table} contains ${row.count} rows with Unicode replacement characters`);
  }

  let rows = 0;
  for (const [table, expected] of Object.entries(expectedCounts)) {
    assert(/^[a-z_]+$/.test(table), `Invalid expected-count table: ${table}`);
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    assert(row.count === expected, `Unicode D1 verifier row-count drift for ${table}`);
    rows += row.count;
  }
  assert(rows === 859_596, `Unicode D1 total row-count drift: ${rows}`);
  return { sourceCells: ledger.contract.sourceCells, d1Cells, rows };
}
