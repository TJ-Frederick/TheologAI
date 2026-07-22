import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import {
  buildD1ReadinessDiagnosticSql,
  buildD1ReadinessSql,
  buildMorphologyUnicodeReadinessContract,
  buildUbsSemanticStoredIntegrityPredicates,
  classicTextSectionReadinessPredicate,
  MAX_D1_READINESS_SQL_BYTES,
  runRemoteD1ReadinessCheck,
} from '../../../scripts/check-remote-d1-readiness.js';
import type { BiblicalLanguageUnicodeCorrectionLedger } from '../../../scripts/biblical-language-unicode-correction.js';
import { createUbsSemanticStorageContract } from '../../../scripts/ubs-semantics/storageContract.js';
import {
  assertUbsSemanticStoredArtifactIdentity,
  assertUbsSemanticStoredContract,
} from '../../../scripts/ubs-semantics/storageReconstruction.js';
import { buildHistoricalTransform8ExpectedAuthority } from '../../../scripts/historical-transform8-authority-audit.js';
import { CLASSIC_TEXT_LIMITS } from '../../../src/kernel/classicTextContract.js';

const generatedDbPath = process.env.THEOLOGAI_TEST_DATABASE_PATH?.trim();

function remoteAuthorityExecutor(): {
  calls: string[][];
  execute: (_file: string, args: readonly string[], options: { stdio: 'inherit' | 'pipe' }) => string | undefined;
  close: () => void;
} {
  const expected = buildHistoricalTransform8ExpectedAuthority(process.cwd());
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE historical_document_delivery_profiles (
      document_id TEXT, work_id TEXT, edition_id TEXT, immutable_corpus_identity TEXT,
      section_package_identity TEXT, delivery_mode TEXT, section_count INTEGER,
      landing_max_bytes INTEGER, browse_page_size INTEGER, cursor_version INTEGER,
      provenance_json TEXT, rights_json TEXT
    );
    CREATE TABLE historical_section_identities (
      document_id TEXT, section_key TEXT, source_ordinal INTEGER, document_section_id INTEGER
    );
    CREATE TABLE historical_section_aliases (
      document_id TEXT, legacy_section_id TEXT, section_key TEXT, source_ordinal INTEGER
    );
    CREATE TABLE document_sections (
      id INTEGER PRIMARY KEY, document_id TEXT, section_number TEXT, title TEXT, content TEXT, topics TEXT
    );
    CREATE TABLE sections_fts (title TEXT, content TEXT, topics TEXT);`);
  const insertProfile = db.prepare(`INSERT INTO historical_document_delivery_profiles VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of expected.profiles) {
    insertProfile.run(row.documentId, row.workId, row.editionId, row.immutableCorpusIdentity,
      row.sectionPackageIdentity, row.deliveryMode, row.sectionCount, row.landingMaxBytes,
      row.browsePageSize, row.cursorVersion, row.provenanceJson, row.rightsJson);
  }
  const insertIdentity = db.prepare('INSERT INTO historical_section_identities VALUES (?, ?, ?, ?)');
  for (const [index, row] of expected.identities.entries()) {
    insertIdentity.run(row.documentId, row.sectionKey, row.sourceOrdinal, index + 1);
  }
  const insertAlias = db.prepare('INSERT INTO historical_section_aliases VALUES (?, ?, ?, ?)');
  for (const row of expected.aliases) insertAlias.run(row.documentId, row.legacySectionId, row.sectionKey, row.sourceOrdinal);
  const insertSection = db.prepare('INSERT INTO document_sections VALUES (?, ?, ?, ?, ?, ?)');
  const insertFts = db.prepare('INSERT INTO sections_fts(rowid, title, content, topics) VALUES (?, ?, ?, ?)');
  for (const [index, row] of expected.bodyFtsSample.entries()) {
    insertSection.run(index + 1, row.documentId, row.legacySectionId, row.title, row.content, row.topics);
    insertFts.run(index + 1, row.ftsTitle, row.ftsContent, row.ftsTopics);
  }
  const calls: string[][] = [];
  return {
    calls,
    execute: (_file, args, options) => {
      calls.push([...args]);
      if (options.stdio === 'inherit') return undefined;
      const sql = args[args.indexOf('--command') + 1]!;
      return JSON.stringify([{ success: true, results: db.prepare(sql).all() }]);
    },
    close: () => db.close(),
  };
}

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
    expect(sql).toContain("('historical.output.work_count', (");
    expect(sql).toContain("('historical.output.sections_per_work', (");
    expect(sql).toContain("('historical.output.document_metadata', (");
    expect(sql).toContain("('historical.output.section_metadata', (");
    expect(sql).toContain("('historical.transform8.collision_groups', (");
    expect(sql).toContain("('historical.transform8.collision_affected_sections', (");
    expect(sql).toContain("('historical.transform8.collision_newly_addressable_sections', (");
    expect(sql).toContain("('historical.transform8.full_fts_parity', (");
    expect(sql).toContain('LEFT JOIN sections_fts fts ON fts.rowid = section.id');
    expect(sql).toContain(') = 23');
    expect(sql).toContain(') = 256');
    expect(sql).toContain(') = 233');
    expect(sql).toContain(`length(title) NOT BETWEEN 1 AND ${CLASSIC_TEXT_LIMITS.titleCharacters}`);
    expect(sql).toContain(`json_array_length(metadata, '$.topics') > ${CLASSIC_TEXT_LIMITS.topicCount}`);
    expect(sql).toContain(`length(section_number) NOT BETWEEN 1 AND ${CLASSIC_TEXT_LIMITS.sectionNumberCharacters}`);
    expect(sql).toContain(`HAVING COUNT(*) > ${CLASSIC_TEXT_LIMITS.sectionsPerWork}`);
    expect(sql).toContain("alignment_raw GLOB '*[^0-8]*'");
    expect(sql).toContain("language_marker = 'GRK' AND alignment_basis != 'UBSGNT5'");
    expect(sql).toContain("'ubs_hebrew_semantic.coordinate_evidence_binding'");
    expect(sql).toContain("'ubs_hebrew_semantic.coordinate_ordinal_unique'");
    expect(sql).toContain("'ubs_hebrew_semantic.coordinate_reference_canonical'");
    expect(sql).toContain("'ubs_hebrew_semantic.coordinate_bounds_canonical'");
    expect(sql).toContain("'ubs_hebrew_semantic.coordinate_ordinals_contiguous'");
    expect(sql).toContain('ON e.evidence_key = c.evidence_key');
    expect(sql).toContain("printf('%s %d:%d'");
    expect(sql).toContain('canonical_verse_bounds(bounds_json)');
    expect(sql).toContain('json_array_length');
    expect(sql).toContain('json_extract');
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
    expect(Buffer.byteLength(sql, 'utf8')).toBeLessThanOrEqual(MAX_D1_READINESS_SQL_BYTES);
  });

  it('rejects negative Psalm and out-of-canon chapter/verse coordinates in every shared D1 gate', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE ubs_semantic_reference_evidence (evidence_key INTEGER PRIMARY KEY);
      CREATE TABLE ubs_semantic_normalized_coordinates (
        coordinate_key INTEGER PRIMARY KEY,
        evidence_key INTEGER NOT NULL,
        target_ordinal INTEGER NOT NULL,
        normalized_book_number INTEGER NOT NULL,
        normalized_book_code TEXT NOT NULL,
        normalized_chapter INTEGER NOT NULL,
        normalized_verse INTEGER NOT NULL,
        normalized_reference TEXT NOT NULL
      );
      INSERT INTO ubs_semantic_reference_evidence VALUES (1);
      INSERT INTO ubs_semantic_normalized_coordinates
        VALUES (1, 1, 1, 1, 'GEN', 1, 31, 'Genesis 1:31');`);
    const predicates = buildUbsSemanticStoredIntegrityPredicates();
    const readiness = () => (db.prepare(
      `SELECT CASE WHEN ${predicates.join(' AND ')} THEN 1 ELSE 0 END AS ready`,
    ).get() as { ready: number }).ready;
    const setCoordinate = db.prepare(`UPDATE ubs_semantic_normalized_coordinates SET
      normalized_book_number = ?, normalized_book_code = ?, normalized_chapter = ?,
      normalized_verse = ?, normalized_reference = ? WHERE coordinate_key = 1`);
    try {
      expect(readiness()).toBe(1);
      setCoordinate.run(19, 'PSA', 1, 0, 'Psalms 1:0');
      expect(readiness()).toBe(1);
      setCoordinate.run(19, 'PSA', 1, -1, 'Psalms 1:-1');
      expect(readiness()).toBe(0);
      setCoordinate.run(1, 'GEN', 99, 99, 'Genesis 99:99');
      expect(readiness()).toBe(0);
      setCoordinate.run(1, 'GEN', 1, 32, 'Genesis 1:32');
      expect(readiness()).toBe(0);

      // The seed-import and local Workerd verifiers execute this exact shared
      // predicate inventory, so their gates cannot silently omit the bounds.
      const seedImport = readFileSync('scripts/verify-d1-seed-import.ts', 'utf8');
      const workerd = readFileSync('scripts/verify-d1-seed-workerd.ts', 'utf8');
      expect(seedImport).toContain('buildUbsSemanticStoredIntegrityPredicates().join');
      expect(workerd).toContain('buildD1ReadinessSql(sourceManifest.expectedCounts)');
      expect(workerd).toContain('auditHistoricalTransform8Authority(ROOT');
    } finally {
      db.close();
    }
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
    expect(Buffer.byteLength(primary, 'utf8')).toBeLessThanOrEqual(MAX_D1_READINESS_SQL_BYTES);
    expect(Buffer.byteLength(diagnostic, 'utf8')).toBeLessThanOrEqual(MAX_D1_READINESS_SQL_BYTES);
    const targeted = buildD1ReadinessDiagnosticSql(
      expectedCounts,
      '0001_initial_schema',
      'a'.repeat(64),
      ['identity.schema_version'],
    );
    expect(checkIds(targeted)).toEqual(['identity.schema_version']);
    expect(() => buildD1ReadinessDiagnosticSql(expectedCounts, undefined, undefined, []))
      .toThrow('At least one D1 readiness check is required');
    expect(() => buildD1ReadinessDiagnosticSql(expectedCounts, undefined, undefined, ['unknown.check']))
      .toThrow('Unknown D1 readiness check ID: unknown.check');
    expect(() => buildD1ReadinessDiagnosticSql(
      expectedCounts,
      undefined,
      undefined,
      ['identity.schema_version', 'identity.schema_version'],
    )).toThrow('Duplicate D1 readiness check ID');
  });

  it('accepts valid section content/topics boundaries and rejects corrupt stored values', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE document_sections (
      id, document_id, section_number, title, content, topics
    )`);
    const insert = db.prepare('INSERT INTO document_sections VALUES (1, ?, ?, ?, ?, ?)');
    const readiness = () => (db.prepare(
      `SELECT ${classicTextSectionReadinessPredicate()} AS ready`,
    ).get() as { ready: number }).ready;
    try {
      for (const topics of [null, '', '[]', '["topic",""]']) {
        db.exec('DELETE FROM document_sections');
        insert.run('document', '1', '', '', topics);
        expect(readiness(), `valid topics boundary ${String(topics)}`).toBe(1);
      }
      for (const [content, topics] of [
        [Buffer.from('not text'), '[]'],
        ['', Buffer.from('not text')],
        ['', '['],
        ['', '{}'],
        ['', '["topic",1]'],
      ] as const) {
        db.exec('DELETE FROM document_sections');
        insert.run('document', '1', '', content, topics);
        expect(readiness(), `invalid content/topics ${String(topics)}`).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  it('runs primary readiness, then bounded authority pages, and requests diagnostics only after failure', () => {
    const remote = remoteAuthorityExecutor();
    try {
      runRemoteD1ReadinessCheck({ database: 'preview', env: 'preview', wrangler: '/tmp/wrangler' }, remote.execute);
      expect(remote.calls).toHaveLength(27); // production readiness plus 26 bounded audit reads
      expect(remote.calls[0]).toContain('--json');
      expect(remote.calls[0]).toContain('--env');
      expect(remote.calls[0].join('\n')).toContain('WHERE passed IS 1');
      expect(remote.calls.slice(1).every(call => call.join('\n').includes('LIMIT 256') || call.join('\n').includes('LIMIT 32'))).toBe(true);
      expect(remote.calls.slice(1).every(call => call.join('\n').includes('--remote'))).toBe(true);
    } finally {
      remote.close();
    }

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

  it('fails closed before issuing an oversized primary or diagnostic D1 request', () => {
    const oversizedSchema = 'a'.repeat(MAX_D1_READINESS_SQL_BYTES + 1);
    expect(() => buildD1ReadinessSql({ documents: 17 }, oversizedSchema, 'a'.repeat(64)))
      .toThrow(`D1 readiness primary SQL exceeds ${MAX_D1_READINESS_SQL_BYTES} bytes`);
    expect(() => buildD1ReadinessDiagnosticSql({ documents: 17 }, oversizedSchema, 'a'.repeat(64)))
      .toThrow(`D1 readiness diagnostic SQL exceeds ${MAX_D1_READINESS_SQL_BYTES} bytes`);
  });

  it.skipIf(!generatedDbPath)('fails when generated readiness predicates detect aggregate or semantic drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-readiness-mutation-'));
    const databasePath = join(root, 'theologai.db');
    copyFileSync(generatedDbPath!, databasePath);
    const manifest = JSON.parse(readFileSync('data/data-manifest.json', 'utf8')) as {
      expectedCounts: Record<string, number>;
    };
    const sql = buildD1ReadinessSql(manifest.expectedCounts);
    const db = new Database(databasePath);
    const assertReady = () => expect(db.prepare(sql).get()).toEqual({ readiness: 'ready' });
    const assertFailedChecks = (checkNames: readonly string[]) => {
      const diagnostics = db.prepare(buildD1ReadinessDiagnosticSql(
        manifest.expectedCounts,
        undefined,
        undefined,
        checkNames,
      )).all() as Array<{ check_name: string; passed: number | null }>;
      expect(diagnostics.map(row => row.check_name)).toEqual([...checkNames].sort());
      expect(diagnostics.every(row => row.passed !== 1)).toBe(true);
    };
    const withRollback = (callback: () => void) => {
      db.exec('SAVEPOINT readiness_mutation');
      try {
        callback();
      } finally {
        db.exec('ROLLBACK TO readiness_mutation');
        db.exec('RELEASE readiness_mutation');
      }
    };
    try {
      // Keep one end-to-end execution of the complete production inventory.
      // Individual corruptions below select only their check(s) from that same
      // generated inventory, avoiding repeated 258 MiB aggregate scans.
      assertReady();
      const usage = db.prepare('SELECT strongs_key, token_count FROM strongs_usage_stats ORDER BY strongs_key LIMIT 1')
        .get() as { strongs_key: string; token_count: number };
      withRollback(() => {
        db.prepare('UPDATE strongs_usage_stats SET token_count = ? WHERE strongs_key = ?')
          .run(usage.token_count + 1, usage.strongs_key);
        assertFailedChecks(['usage.summary_extra', 'usage.summary_missing']);
      });

      withRollback(() => {
        db.prepare("DELETE FROM theologai_metadata WHERE key = 'schema_version'").run();
        assertFailedChecks(['identity.schema_version']);
      });

      withRollback(() => {
        db.prepare("UPDATE ubs_semantic_artifacts SET rights_notice_json = '{}'").run();
        assertFailedChecks(['ubs_hebrew_semantic.artifact_contract']);
      });

      withRollback(() => {
        db.prepare(`UPDATE ubs_semantic_sources SET source_blob = ?
          WHERE source_id = 'ubs-hebrew-dictionary-en-v0.9.2'`).run('0'.repeat(40));
        assertFailedChecks(['ubs_hebrew_semantic.source_contract']);
      });

      const coordinate = db.prepare(`SELECT coordinate_key
        FROM ubs_semantic_normalized_coordinates ORDER BY coordinate_key LIMIT 1`)
        .get() as { coordinate_key: number };
      withRollback(() => {
        db.prepare('UPDATE ubs_semantic_normalized_coordinates SET normalized_reference = ? WHERE coordinate_key = ?')
          .run('Not a canonical reference', coordinate.coordinate_key);
        assertFailedChecks(['ubs_hebrew_semantic.coordinate_reference_canonical']);
      });

      const form = db.prepare('SELECT strongs_key, form_text, first_book FROM strongs_form_stats ORDER BY strongs_key, form_text LIMIT 1')
        .get() as { strongs_key: string; form_text: string; first_book: string };
      withRollback(() => {
        db.prepare('UPDATE strongs_form_stats SET first_book = ? WHERE strongs_key = ? AND form_text = ?')
          .run(form.first_book === 'Genesis' ? 'Exodus' : 'Genesis', form.strongs_key, form.form_text);
        assertFailedChecks(['usage.form_first_occurrence']);
      });
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it.skipIf(!generatedDbPath)('binds semantic provenance and every relational semantic row to the pinned artifact identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'theologai-semantic-identity-mutation-'));
    const databasePath = join(root, 'theologai.db');
    copyFileSync(generatedDbPath!, databasePath);
    const audit = JSON.parse(readFileSync(
      'data/biblical-languages/ubs-open-license/v0.9.2/SEMANTIC-COMPILATION-AUDIT.json', 'utf8',
    ));
    const contract = createUbsSemanticStorageContract(audit);
    const db = new Database(databasePath);
    const withRollback = (callback: () => void) => {
      db.exec('SAVEPOINT semantic_identity_mutation');
      try {
        callback();
      } finally {
        db.exec('ROLLBACK TO semantic_identity_mutation');
        db.exec('RELEASE semantic_identity_mutation');
      }
    };
    try {
      expect(() => assertUbsSemanticStoredContract(db, contract)).not.toThrow();
      expect(() => assertUbsSemanticStoredArtifactIdentity(db, contract)).not.toThrow();
      const coordinate = db.prepare(`SELECT coordinate_key, evidence_key
        FROM ubs_semantic_normalized_coordinates ORDER BY coordinate_key LIMIT 1`)
        .get() as { coordinate_key: number; evidence_key: number };
      withRollback(() => {
        db.prepare('UPDATE ubs_semantic_reference_evidence SET evidence_id = ? WHERE evidence_key = ?')
          .run('tampered-evidence-id', coordinate.evidence_key);
        expect(() => assertUbsSemanticStoredArtifactIdentity(db, contract))
          .toThrow('do not reproduce their declared artifact identity');
      });
      db.pragma('foreign_keys = ON');
      withRollback(() => {
        expect(() => db.prepare('UPDATE ubs_semantic_normalized_coordinates SET evidence_key = ? WHERE coordinate_key = ?')
          .run(-1, coordinate.coordinate_key)).toThrow();
      });
      withRollback(() => {
        db.prepare('UPDATE ubs_semantic_normalized_coordinates SET normalized_reference = ? WHERE coordinate_key = ?')
          .run('Not a canonical reference', coordinate.coordinate_key);
        expect(() => assertUbsSemanticStoredArtifactIdentity(db, contract))
          .toThrow('non-canonical normalized reference');
      });
      const entry = db.prepare('SELECT entry_id, lemma FROM ubs_semantic_entries ORDER BY entry_id LIMIT 1')
        .get() as { entry_id: string; lemma: string };
      withRollback(() => {
        db.prepare('UPDATE ubs_semantic_entries SET lemma = ? WHERE entry_id = ?')
          .run(`${entry.lemma} altered`, entry.entry_id);
        expect(() => assertUbsSemanticStoredArtifactIdentity(db, contract))
          .toThrow('do not reproduce their declared artifact identity');
      });
      withRollback(() => {
        db.prepare("UPDATE ubs_semantic_artifacts SET provenance_notice_json = '{}'").run();
        expect(() => assertUbsSemanticStoredContract(db, contract))
          .toThrow('artifact metadata is incomplete or stale');
      });
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
