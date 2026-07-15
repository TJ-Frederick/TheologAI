import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import {
  buildD1ReadinessDiagnosticSql,
  buildD1ReadinessSql,
  buildMorphologyUnicodeReadinessContract,
  runRemoteD1ReadinessCheck,
} from '../../../scripts/check-remote-d1-readiness.js';
import type { BiblicalLanguageUnicodeCorrectionLedger } from '../../../scripts/biblical-language-unicode-correction.js';

const generatedDbPath = process.env.THEOLOGAI_TEST_DATABASE_PATH?.trim();

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
    expect(sql).toContain('usage_expected(strongs_key,token_count,verse_count,book_count) AS');
    expect(sql).toContain('book_usage_expected(strongs_key,book,book_order,token_count,verse_count) AS');
    expect(sql).toContain('form_usage_expected(strongs_key,form_text,token_count,verse_count,first_key) AS');
    expect(sql).toContain('FROM usage_expected expected JOIN form_counts_expected forms');
    expect(sql).toContain('FROM book_usage_expected EXCEPT SELECT strongs_key');
    expect(sql).toContain('FROM form_usage_expected EXCEPT SELECT strongs_key');
    expect(sql).not.toContain('FROM strongs_usage_stats usage WHERE usage.token_count != (SELECT COUNT(*) FROM morphology');
    expect(sql).not.toContain('FROM strongs_form_stats form WHERE form.token_count != (SELECT COUNT(*) FROM morphology');
    expect(sql).toContain('readiness_checks(check_name, passed) AS (VALUES');
    expect(sql).toContain('FROM readiness_checks WHERE passed IS 1');
    expect(sql).toContain("('integrity.quick_check', (");
    expect(sql).toContain("('data.genesis_1_1_lemma', (");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
  });

  it('uses the same stable, unique check inventory for failure diagnostics', () => {
    const expectedCounts = { morphology: 12, documents: 17 };
    const primary = buildD1ReadinessSql(expectedCounts, '0001_initial_schema', 'a'.repeat(64));
    const diagnostic = buildD1ReadinessDiagnosticSql(expectedCounts, '0001_initial_schema', 'a'.repeat(64));
    const checkIds = (sql: string) => [...sql.matchAll(/^\('([^']+)', \(/gm)].map(match => match[1]);
    const primaryIds = checkIds(primary);
    expect(primaryIds.length).toBeGreaterThan(50);
    expect(new Set(primaryIds).size).toBe(primaryIds.length);
    expect(checkIds(diagnostic)).toEqual(primaryIds);
    expect(diagnostic).toContain('WHERE passed IS NOT 1 ORDER BY check_name');
  });

  it('makes one primary call on success and requests diagnostics only after failure', () => {
    const calls: string[][] = [];
    const execute = (_file: string, args: readonly string[]) => {
      calls.push([...args]);
    };
    runRemoteD1ReadinessCheck({ database: 'preview', env: 'preview', wrangler: '/tmp/wrangler' }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('--json');
    expect(calls[0]).toContain('--env');
    expect(calls[0].join('\n')).toContain('WHERE passed IS 1');

    const primaryError = new Error('primary failed');
    const failedCalls: string[][] = [];
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(() => runRemoteD1ReadinessCheck(
        { database: 'preview', wrangler: '/tmp/wrangler' },
        (_file, args) => {
          failedCalls.push([...args]);
          if (failedCalls.length === 1) throw primaryError;
        },
      )).toThrow(primaryError);
    } finally {
      stderr.mockRestore();
    }
    expect(failedCalls).toHaveLength(2);
    expect(failedCalls[1].join('\n')).toContain('WHERE passed IS NOT 1 ORDER BY check_name');
  });

  it('rejects unsafe manifest identifiers', () => {
    expect(() => buildD1ReadinessSql({ 'documents; DROP TABLE documents': 17 }))
      .toThrow('Invalid expected D1 count');
  });

  it.skipIf(!generatedDbPath)('fails when set-based usage totals or first-occurrence evidence drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-readiness-mutation-'));
    const databasePath = join(root, 'theologai.db');
    copyFileSync(generatedDbPath!, databasePath);
    const manifest = JSON.parse(readFileSync('data/data-manifest.json', 'utf8')) as {
      expectedCounts: Record<string, number>;
    };
    const sql = buildD1ReadinessSql(manifest.expectedCounts);
    const db = new Database(databasePath);
    const assertReady = () => expect(db.prepare(sql).get()).toEqual({ readiness: 'ready' });
    const assertRejected = () => expect(() => db.prepare(sql).get()).toThrow();
    try {
      assertReady();
      const usage = db.prepare('SELECT strongs_key, token_count FROM strongs_usage_stats ORDER BY strongs_key LIMIT 1')
        .get() as { strongs_key: string; token_count: number };
      db.prepare('UPDATE strongs_usage_stats SET token_count = ? WHERE strongs_key = ?')
        .run(usage.token_count + 1, usage.strongs_key);
      assertRejected();
      db.prepare('UPDATE strongs_usage_stats SET token_count = ? WHERE strongs_key = ?')
        .run(usage.token_count, usage.strongs_key);
      assertReady();

      const schemaVersion = db.prepare("SELECT value FROM theologai_metadata WHERE key = 'schema_version'")
        .pluck().get() as string;
      db.prepare("DELETE FROM theologai_metadata WHERE key = 'schema_version'").run();
      assertRejected();
      const diagnostics = db.prepare(buildD1ReadinessDiagnosticSql(manifest.expectedCounts)).all() as Array<{
        check_name: string;
        passed: number | null;
      }>;
      expect(diagnostics).toContainEqual({ check_name: 'identity.schema_version', passed: null });
      db.prepare("INSERT INTO theologai_metadata (key, value) VALUES ('schema_version', ?)").run(schemaVersion);
      assertReady();

      const form = db.prepare('SELECT strongs_key, form_text, first_book FROM strongs_form_stats ORDER BY strongs_key, form_text LIMIT 1')
        .get() as { strongs_key: string; form_text: string; first_book: string };
      db.prepare('UPDATE strongs_form_stats SET first_book = ? WHERE strongs_key = ? AND form_text = ?')
        .run(form.first_book === 'Genesis' ? 'Exodus' : 'Genesis', form.strongs_key, form.form_text);
      assertRejected();
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

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
