import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  buildD1ReadinessSql,
  buildMorphologyUnicodeReadinessContract,
} from '../../../scripts/check-remote-d1-readiness.js';
import type { BiblicalLanguageUnicodeCorrectionLedger } from '../../../scripts/biblical-language-unicode-correction.js';

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
    expect(sql).toContain(") = 'τὸν'");
    expect(sql).toContain("strongs_number = 'G1402') = 'doulóō'");
    expect(sql).toContain("strongs_number = 'H8484') = 'תִּיכוֹן'");
    expect(sql).toContain("FROM strongs_fts WHERE strongs_number = 'G1402'");
    expect(sql).toContain('unicode_morphology_expected(book,chapter,verse,position,field,expected_value)');
    expect(sql).toContain('(SELECT COUNT(*) FROM unicode_morphology_expected) = 237');
    expect(sql).toContain('char(65533)');
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

  it('requires every one of the 237 reviewed morphology values by exact locator', () => {
    const ledger = JSON.parse(readFileSync(
      'data/biblical-languages/UNICODE-CORRECTION.json',
      'utf8',
    )) as BiblicalLanguageUnicodeCorrectionLedger;
    const contract = buildMorphologyUnicodeReadinessContract(ledger.morphology);
    expect(contract.correctionCount).toBe(237);
    const apostrophe = structuredClone(ledger.morphology);
    apostrophe[0].after = "O'Brien";
    expect(buildMorphologyUnicodeReadinessContract(apostrophe).cte).toContain("'O''Brien'");
    const invalidField = structuredClone(ledger.morphology);
    invalidField[0].field = 'word_text; DROP TABLE morphology';
    expect(() => buildMorphologyUnicodeReadinessContract(invalidField))
      .toThrow('Invalid morphology Unicode correction readiness locator/value');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE morphology (
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      position INTEGER NOT NULL,
      word_text TEXT,
      lemma TEXT,
      PRIMARY KEY (book, chapter, verse, position)
    )`);
    const rows = new Map<string, {
      book: string; chapter: number; verse: number; position: number; word_text: string; lemma: string;
    }>();
    for (const correction of ledger.morphology) {
      const key = `${correction.book}/${correction.chapter}/${correction.verse}/${correction.position}`;
      const row = rows.get(key) ?? {
        book: correction.book,
        chapter: correction.chapter,
        verse: correction.verse,
        position: correction.position,
        word_text: '__unchanged_word__',
        lemma: '__unchanged_lemma__',
      };
      row[correction.field === 'text' ? 'word_text' : 'lemma'] = correction.after;
      rows.set(key, row);
    }
    const insert = db.prepare(
      'INSERT INTO morphology (book,chapter,verse,position,word_text,lemma) VALUES (?,?,?,?,?,?)',
    );
    for (const row of rows.values()) {
      insert.run(row.book, row.chapter, row.verse, row.position, row.word_text, row.lemma);
    }
    const readiness = () => (db.prepare(
      `WITH ${contract.cte} SELECT (${contract.checks.join(' AND ')}) AS ready`,
    ).get() as { ready: number }).ready;
    expect(readiness()).toBe(1);

    for (const language of ['/greek/', '/hebrew/']) {
      const correction = ledger.morphology.find(candidate => candidate.artifact.includes(language))!;
      const column = correction.field === 'text' ? 'word_text' : 'lemma';
      db.prepare(
        `UPDATE morphology SET ${column} = ? WHERE book = ? AND chapter = ? AND verse = ? AND position = ?`,
      ).run('__wrong_value__', correction.book, correction.chapter, correction.verse, correction.position);
      expect(readiness()).toBe(0);
      db.prepare(
        `UPDATE morphology SET ${column} = ? WHERE book = ? AND chapter = ? AND verse = ? AND position = ?`,
      ).run(correction.after, correction.book, correction.chapter, correction.verse, correction.position);
      expect(readiness()).toBe(1);
    }
    db.close();
  });
});
