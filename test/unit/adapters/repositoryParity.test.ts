import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CrossReferenceRepository } from '../../../src/adapters/data/CrossReferenceRepository.js';
import { HistoricalDocumentRepository } from '../../../src/adapters/data/HistoricalDocumentRepository.js';
import { MorphologyRepository } from '../../../src/adapters/data/MorphologyRepository.js';
import { StrongsRepository } from '../../../src/adapters/data/StrongsRepository.js';
import { D1CrossReferenceRepository } from '../../../src/adapters/d1/D1CrossReferenceRepository.js';
import { D1HistoricalDocumentRepository } from '../../../src/adapters/d1/D1HistoricalDocumentRepository.js';
import { D1MorphologyRepository } from '../../../src/adapters/d1/D1MorphologyRepository.js';
import { D1StrongsRepository } from '../../../src/adapters/d1/D1StrongsRepository.js';
import { D1UbsParallelPassageRepository } from '../../../src/adapters/d1/D1UbsParallelPassageRepository.js';
import { UbsParallelPassageRepository } from '../../../src/adapters/shared/UbsParallelPassageRepository.js';
import { UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY, UBS_PARALLEL_PASSAGE_PROVENANCE } from '../../../src/kernel/ubsParallelSource.js';
import { ubsFixture } from '../../fixtures/ubsParallelCorpus.js';
import { StrongsService } from '../../../src/services/languages/StrongsService.js';

function sqliteAsD1(db: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      const execute = (bindings: unknown[]) => ({
        async all<T>() {
          return { results: statement.all(...bindings) as T[], success: true, meta: {} };
        },
        async first<T>() {
          return (statement.get(...bindings) as T | undefined) ?? null;
        },
        async run() {
          return { success: true, meta: {}, results: [], ...statement.run(...bindings) } as never;
        },
      });
      return {
        bind: (...bindings: unknown[]) => execute(bindings),
        ...execute([]),
      } as unknown as D1PreparedStatement;
    },
  } as D1Database;
}

describe('SQLite and D1 repository parity with identical real data', () => {
  const db = new Database(':memory:');
  let sqliteCrossReferences: CrossReferenceRepository;
  let d1CrossReferences: D1CrossReferenceRepository;
  let sqliteHistorical: HistoricalDocumentRepository;
  let d1Historical: D1HistoricalDocumentRepository;
  let sqliteMorphology: MorphologyRepository;
  let d1Morphology: D1MorphologyRepository;
  let sqliteStrongs: StrongsRepository;
  let d1Strongs: D1StrongsRepository;
  let nodeUbs: UbsParallelPassageRepository;
  let d1Ubs: D1UbsParallelPassageRepository;

  beforeAll(() => {
    db.exec(`
      CREATE TABLE cross_references (
        from_verse TEXT NOT NULL, to_verse TEXT NOT NULL, votes INTEGER NOT NULL,
        PRIMARY KEY (from_verse, to_verse)
      );
      CREATE TABLE strongs (
        strongs_number TEXT PRIMARY KEY, testament TEXT NOT NULL, lemma TEXT NOT NULL,
        transliteration TEXT, pronunciation TEXT, definition TEXT NOT NULL, derivation TEXT
      );
      CREATE VIRTUAL TABLE strongs_fts USING fts5(
        strongs_number UNINDEXED, lemma, transliteration, definition
      );
      CREATE TABLE stepbible_lexicons (
        strongs_number TEXT PRIMARY KEY, source TEXT NOT NULL, extended_data TEXT NOT NULL
      );
      CREATE TABLE morphology (
        book TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL,
        position INTEGER NOT NULL, word_text TEXT NOT NULL, lemma TEXT NOT NULL,
        strongs_number TEXT, morph_code TEXT, gloss TEXT, book_order INTEGER NOT NULL,
        PRIMARY KEY (book, chapter, verse, position)
      );
      CREATE INDEX idx_morph_strongs_canonical ON morphology(strongs_number, book_order, chapter, verse, position);
      CREATE TABLE strongs_usage_stats (
        strongs_key TEXT PRIMARY KEY, token_count INTEGER, verse_count INTEGER, book_count INTEGER, form_count INTEGER
      );
      CREATE TABLE strongs_book_stats (
        strongs_key TEXT, book TEXT, book_order INTEGER, token_count INTEGER, verse_count INTEGER,
        PRIMARY KEY (strongs_key, book)
      );
      CREATE TABLE strongs_form_stats (
        strongs_key TEXT, form_text TEXT, token_count INTEGER, verse_count INTEGER,
        first_book TEXT, first_book_order INTEGER, first_chapter INTEGER, first_verse INTEGER, first_position INTEGER,
        PRIMARY KEY (strongs_key, form_text)
      );
      CREATE TABLE morph_codes (code TEXT PRIMARY KEY, expansion TEXT NOT NULL);
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL, date TEXT, metadata TEXT
      );
      CREATE TABLE document_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL,
        section_number TEXT, title TEXT, content TEXT NOT NULL, topics TEXT
      );
      CREATE VIRTUAL TABLE sections_fts USING fts5(title, content, topics);
      CREATE TABLE ubs_parallel_sources (source_id TEXT PRIMARY KEY, schema_version TEXT, transform_version INTEGER, artifact_identity TEXT, title TEXT, publisher TEXT, copyright TEXT, license TEXT, license_url TEXT, source_url TEXT, source_path TEXT, source_commit TEXT, source_commit_date TEXT, source_blob TEXT, source_bytes INTEGER, source_sha256 TEXT, modified INTEGER, modification_note TEXT, label TEXT, directionality TEXT);
      CREATE TABLE ubs_parallel_groups (group_id TEXT PRIMARY KEY, source_id TEXT, source_ordinal INTEGER, label TEXT, directionality TEXT);
      CREATE TABLE ubs_parallel_members (group_id TEXT, source_order INTEGER, source_reference TEXT, normalized_reference TEXT, language_marker TEXT, alignment_basis TEXT, alignment_raw TEXT, PRIMARY KEY(group_id, source_order));
      CREATE TABLE ubs_parallel_segments (group_id TEXT, member_order INTEGER, segment_order INTEGER, book_number INTEGER, chapter INTEGER, start_verse INTEGER, end_verse INTEGER, PRIMARY KEY(group_id, member_order, segment_order));

      INSERT INTO cross_references VALUES
        ('John.3.16', 'Rom.5.8', 42),
        ('John.3.16', '1John.4.9', 30),
        ('John.30.1', 'Rom.5.8', 99),
        ('John.3.17', 'Rom.8.1', 12),
        ('Gen.2.1', 'Rom.5.8', 30),
        ('Gen.2.1', '1John.4.9', 30);

      INSERT INTO strongs VALUES
        ('G0025', 'NT', 'ἀγαπάω', 'agapaō', 'ag-ap-ah-o', 'to love', 'perhaps from agan'),
        ('G2424', 'NT', 'Ἰησοῦς', 'Iēsous', NULL, 'Jesus', NULL),
        ('H0430', 'OT', 'אֱלֹהִים', 'ʼĕlôhîym', NULL, 'God, gods', NULL);
      INSERT INTO strongs_fts
        SELECT strongs_number, lemma, transliteration, definition FROM strongs;
      INSERT INTO stepbible_lexicons VALUES
        ('G0025', 'STEPBible', '{"gloss":"love"}'),
        ('G6000', 'STEPBible', '{"gloss":"to report"}'),
        ('G21502', 'STEPBible', '{"gloss":"Heneia"}'),
        ('H9001', 'STEPBible', '{"gloss":"&"}'),
        ('H9049', 'STEPBible', '{"gloss":"they"}');

      INSERT INTO morphology VALUES
        ('Romans', 8, 28, 1, 'οἴδαμεν', 'οἶδα', 'G1492', 'V-RAI-1P', 'we know', 45),
        ('John', 3, 16, 1, 'ἠγάπησεν', 'ἀγαπάω', 'G0025', 'V-AAI-3S', 'loved', 43),
        ('Genesis', 1, 1, 1, 'בְּרֵאשִׁית', 'רֵאשִׁית', 'H7225', 'HNcfsa', 'in beginning', 1),
        ('Romans', 5, 8, 1, 'συνίστησιν', 'συνίστημι', 'G4921', 'V-PAI-3S', 'demonstrates', 45),
        ('Romans', 8, 35, 1, 'ἀγάπης', 'ἀγάπη', 'G0025', 'N-GSF', 'love', 45),
        ('John', 1, 1, 1, 'fixture-g6000', 'fixture', 'G6000', 'G:V', 'report', 43),
        ('John', 1, 1, 2, 'fixture-g21502', 'fixture', 'G21502', 'G:N-PRI', 'Heneia', 43),
        ('John', 1, 1, 3, 'fixture-h9001', 'fixture', 'H9001', 'H:Conj', '&', 43),
        ('John', 1, 1, 4, 'fixture-h9049', 'fixture', 'H9049', 'Sp3f', 'they', 43),
        ('Psalms', 3, 0, 1, 'מִזְמוֹר', 'מִזְמוֹר', 'H9998', 'HNcmsa', 'psalm', 19),
        ('Psalms', 3, 0, 2, 'לְדָוִד', 'דָּוִד', 'H9998', 'HNp', 'of David', 19),
        ('Psalms', 3, 1, 1, 'יְהוָה', 'יְהוָה', 'H9998', 'HNp', 'Lord', 19);
      INSERT INTO strongs_usage_stats VALUES ('G0025', 2, 2, 2, 2);
      INSERT INTO strongs_book_stats VALUES
        ('G0025', 'John', 43, 1, 1), ('G0025', 'Romans', 45, 1, 1);
      INSERT INTO strongs_form_stats VALUES
        ('G0025', 'ἠγάπησεν', 1, 1, 'John', 43, 3, 16, 1),
        ('G0025', 'ἀγάπης', 1, 1, 'Romans', 45, 8, 35, 1);
      INSERT INTO morph_codes VALUES ('V-AAI-3S', 'Verb Aorist Active Indicative 3rd Singular');

      INSERT INTO documents VALUES
        ('nicene-creed', 'Nicene Creed', 'creed', '381', '{"topics":["trinity"]}'),
        ('augsburg-confession', 'Augsburg Confession', 'confession', '1530', '{"topics":["doctrine"]}');
      INSERT INTO document_sections
        (id, document_id, section_number, title, content, topics) VALUES
        (1, 'nicene-creed', '1', 'The Creed', 'We believe in one almighty God.', '["trinity","God"]'),
        (2, 'nicene-creed', '2', NULL, 'And in one Lord Jesus Christ.', NULL),
        (3, 'augsburg-confession', '1', 'God', 'Our churches teach with common consent one divine essence.', NULL),
        (4, 'augsburg-confession', '2', 'The Son', 'One Christ is true God and true man.', NULL);
      INSERT INTO sections_fts(rowid, title, content, topics)
        SELECT id, title, content, topics FROM document_sections ORDER BY id;
    `);

    const artifact = ubsFixture() as any;
    const p = UBS_PARALLEL_PASSAGE_PROVENANCE;
    db.prepare('INSERT INTO ubs_parallel_sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      p.sourceId, 'ubs-parallel-passages.v2', p.transformVersion, UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY,
      p.title, p.publisher, p.copyright, p.license, p.licenseUrl, p.sourceUrl, p.sourcePath, p.sourceCommit,
      p.sourceCommitDate, p.sourceBlob, p.sourceBytes, p.sourceSha256, 1, p.modificationNote,
      'source_attested_parallel', 'unspecified',
    );
    for (const group of artifact.groups) {
      db.prepare('INSERT INTO ubs_parallel_groups VALUES (?,?,?,?,?)').run(group.groupId, p.sourceId, group.sourceOrdinal, group.label, group.directionality);
      for (const member of group.members) {
        db.prepare('INSERT INTO ubs_parallel_members VALUES (?,?,?,?,?,?,?)').run(group.groupId, member.sourceOrder, member.sourceReference, member.normalizedReference, member.languageMarker, member.alignmentBasis, member.alignmentRaw);
        member.segments.forEach((segment: any, index: number) => db.prepare('INSERT INTO ubs_parallel_segments VALUES (?,?,?,?,?,?,?)').run(group.groupId, member.sourceOrder, index + 1, segment.bookNumber, segment.chapter, segment.startVerse, segment.endVerse));
      }
    }

    const d1 = sqliteAsD1(db);
    sqliteCrossReferences = new CrossReferenceRepository(db);
    d1CrossReferences = new D1CrossReferenceRepository(d1);
    sqliteHistorical = new HistoricalDocumentRepository(db);
    d1Historical = new D1HistoricalDocumentRepository(d1);
    sqliteMorphology = new MorphologyRepository(db);
    d1Morphology = new D1MorphologyRepository(d1);
    sqliteStrongs = new StrongsRepository(db);
    d1Strongs = new D1StrongsRepository(d1);
    nodeUbs = new UbsParallelPassageRepository(artifact, artifact.artifactIdentity);
    d1Ubs = new D1UbsParallelPassageRepository(d1);
  });

  afterAll(() => db.close());

  it('returns canonical cross-reference rows and identical statistics', async () => {
    await expect(d1CrossReferences.getCrossReferences('John 3:16', { maxResults: 1 }))
      .resolves.toEqual(sqliteCrossReferences.getCrossReferences('John 3:16', { maxResults: 1 }));
    expect(sqliteCrossReferences.getCrossReferences('John 3:16').references[0].reference).toBe('Romans 5:8');
    await expect(d1CrossReferences.hasReferences('John 3:16'))
      .resolves.toBe(sqliteCrossReferences.hasReferences('John 3:16'));
    await expect(d1CrossReferences.getChapterStatistics('John 3'))
      .resolves.toEqual(sqliteCrossReferences.getChapterStatistics('John 3'));
    expect(sqliteCrossReferences.getChapterStatistics('John 3')).toMatchObject({
      totalVerses: 2,
      totalCrossRefs: 3,
    });
    expect(sqliteCrossReferences.getChapterStatistics('John 3').verseStats)
      .not.toContainEqual(expect.objectContaining({ verse: 1, refCount: 99 }));
  });

  it('orders equal raw votes by the source reference key identically in SQLite and D1', async () => {
    const expected = {
      references: [
        { reference: '1 John 4:9', votes: 30 },
        { reference: 'Romans 5:8', votes: 30 },
      ],
      total: 2,
      showing: 2,
      hasMore: false,
    };

    expect(sqliteCrossReferences.getCrossReferences('Genesis 2:1')).toEqual(expected);
    await expect(d1CrossReferences.getCrossReferences('Genesis 2:1')).resolves.toEqual(expected);
  });

  it('returns complete and identical historical-document rows, including FTS search', async () => {
    await expect(d1Historical.listDocuments()).resolves.toEqual(sqliteHistorical.listDocuments());
    await expect(d1Historical.getDocument('nicene-creed'))
      .resolves.toEqual(sqliteHistorical.getDocument('nicene-creed'));
    await expect(d1Historical.getSections('nicene-creed'))
      .resolves.toEqual(sqliteHistorical.getSections('nicene-creed'));
    await expect(d1Historical.getSection('nicene-creed', '1'))
      .resolves.toEqual(sqliteHistorical.getSection('nicene-creed', '1'));
    await expect(d1Historical.search('almighty'))
      .resolves.toEqual(sqliteHistorical.search('almighty'));
    expect(sqliteHistorical.search('almighty')[0]).toMatchObject({
      document_id: 'nicene-creed',
      section_number: '1',
    });
    await expect(d1Historical.findDocumentByName('Nicene'))
      .resolves.toEqual(sqliteHistorical.findDocumentByName('Nicene'));
    const primaryOptions = { text: 'one almighty', match: 'all_terms' as const, documentIds: ['nicene-creed'], limit: 8 };
    await expect(d1Historical.searchPrimarySources(primaryOptions))
      .resolves.toEqual(sqliteHistorical.searchPrimarySources(primaryOptions));
    expect(sqliteHistorical.searchPrimarySources(primaryOptions)[0]).toMatchObject({
      document: { id: 'nicene-creed', title: 'Nicene Creed' },
      section: { section_number: '1' },
    });
    const workDiverseOptions = {
      text: 'one', match: 'all_terms' as const, selection: 'work_diversity' as const, limit: 3,
    };
    const sqliteDiverse = sqliteHistorical.searchPrimarySources(workDiverseOptions);
    await expect(d1Historical.searchPrimarySources(workDiverseOptions)).resolves.toEqual(sqliteDiverse);
    expect(new Set(sqliteDiverse.slice(0, 2).map(row => row.document.id))).toEqual(
      new Set(['nicene-creed', 'augsburg-confession']),
    );
  });

  it('returns identical morphology with shared fallback and canonical book ordering', async () => {
    await expect(d1Morphology.getVerseMorphology('John', 3, 16))
      .resolves.toEqual(sqliteMorphology.getVerseMorphology('John', 3, 16));
    await expect(d1Morphology.expandMorphCode('V-AAI-3S'))
      .resolves.toBe(sqliteMorphology.expandMorphCode('V-AAI-3S'));
    await expect(d1Morphology.expandMorphCode('HVqp3ms'))
      .resolves.toBe(sqliteMorphology.expandMorphCode('HVqp3ms'));
    await expect(d1Morphology.getAvailableBooks())
      .resolves.toEqual(sqliteMorphology.getAvailableBooks());
    await expect(d1Morphology.hasVerse('Genesis', 1, 1))
      .resolves.toBe(sqliteMorphology.hasVerse('Genesis', 1, 1));
    await expect(d1Morphology.getOccurrences('G0025'))
      .resolves.toEqual(sqliteMorphology.getOccurrences('G0025'));
    await expect(d1Morphology.getDistribution('G0025'))
      .resolves.toEqual(sqliteMorphology.getDistribution('G0025'));
    await expect(d1Morphology.getUsageStats('G0025'))
      .resolves.toEqual(sqliteMorphology.getUsageStats('G0025'));
    await expect(d1Morphology.getBookUsage('G0025'))
      .resolves.toEqual(sqliteMorphology.getBookUsage('G0025'));
    await expect(d1Morphology.getFormUsage('G0025'))
      .resolves.toEqual(sqliteMorphology.getFormUsage('G0025'));
    await expect(d1Morphology.getTokenOccurrences('G0025'))
      .resolves.toEqual(sqliteMorphology.getTokenOccurrences('G0025'));
    expect(sqliteMorphology.getAvailableBooks()).toEqual(['Genesis', 'Psalms', 'John', 'Romans']);
    expect(sqliteMorphology.getDistribution('G0025').map(row => row.book)).toEqual(['John', 'Romans']);
  });

  it('produces identical Node and D1 public usage pages and opaque cursors', async () => {
    const node = new StrongsService(sqliteStrongs, sqliteMorphology);
    const worker = new StrongsService(d1Strongs, d1Morphology);
    await expect(worker.getCorpusUsage('G25', 'overview'))
      .resolves.toEqual(await node.getCorpusUsage('G0025', 'overview'));

    const nodeFirst = await node.getCorpusUsage('G25', 'technical', 1);
    const workerFirst = await worker.getCorpusUsage('g0025', 'technical', 1);
    expect(workerFirst).toEqual(nodeFirst);
    expect(nodeFirst.occurrences).toHaveLength(1);
    expect(nodeFirst.nextOccurrenceCursor).toMatch(/^[A-Za-z0-9_-]+$/);

    const nodeSecond = await node.getCorpusUsage('G25', 'technical', 1, nodeFirst.nextOccurrenceCursor);
    const workerSecond = await worker.getCorpusUsage('G25', 'technical', 1, workerFirst.nextOccurrenceCursor);
    expect(workerSecond).toEqual(nodeSecond);
    expect(nodeSecond.occurrences?.[0]).toMatchObject({ book: 'Romans', chapter: 8, verse: 35 });
  });

  it('round-trips a verse-zero Psalm superscription keyset cursor identically', async () => {
    const sqliteFirst = sqliteMorphology.getTokenOccurrences('H9998', undefined, 2);
    const d1First = await d1Morphology.getTokenOccurrences('H9998', undefined, 2);
    expect(d1First).toEqual(sqliteFirst);
    expect(sqliteFirst.next_after).toEqual({ book_order: 19, chapter: 3, verse: 0, position: 2 });

    const sqliteSecond = sqliteMorphology.getTokenOccurrences('H9998', sqliteFirst.next_after, 2);
    const d1Second = await d1Morphology.getTokenOccurrences('H9998', d1First.next_after, 2);
    expect(d1Second).toEqual(sqliteSecond);
    expect(sqliteSecond.occurrences).toHaveLength(1);
    expect(sqliteSecond.occurrences[0]).toMatchObject({ verse: 1, position: 1 });
    expect(sqliteSecond.next_after).toBeUndefined();
  });

  it('returns complete and identical Strong entries for lookup and search', async () => {
    await expect(d1Strongs.lookup('g25')).resolves.toEqual(sqliteStrongs.lookup('g25'));
    await expect(d1Strongs.search('love')).resolves.toEqual(sqliteStrongs.search('love'));
    expect(sqliteStrongs.search('love')[0]).toMatchObject({
      testament: 'NT',
      pronunciation: 'ag-ap-ah-o',
      derivation: 'perhaps from agan',
    });
    await expect(d1Strongs.getLexiconEntry('G25'))
      .resolves.toEqual(sqliteStrongs.getLexiconEntry('G25'));
    await expect(d1Strongs.getStats()).resolves.toEqual(sqliteStrongs.getStats());
  });

  it.each(['G6000', 'H9001', 'H9049', 'G21502'])('preserves extended identity %s across SQLite and D1 lexicon/morphology repositories', async identity => {
    await expect(d1Strongs.getLexiconEntry(identity)).resolves.toEqual(sqliteStrongs.getLexiconEntry(identity));
    await expect(d1Morphology.getOccurrences(identity)).resolves.toEqual(sqliteMorphology.getOccurrences(identity));
    await expect(d1Morphology.getDistribution(identity)).resolves.toEqual(sqliteMorphology.getDistribution(identity));
    expect(sqliteStrongs.getLexiconEntry(identity)?.strongs_number).toBe(identity);
    expect(sqliteMorphology.getOccurrences(identity)).toHaveLength(1);
  });

  it('reconstructs complete source-attested groups identically from Node JSON and D1', async () => {
    await expect(d1Ubs.findGroups('Luke 6:35', 2)).resolves.toEqual(nodeUbs.findGroups('Luke 6:35', 2));
    await expect(d1Ubs.getProvenance()).resolves.toEqual(nodeUbs.getProvenance());
  });

  it('normalizes ASCII transliteration search identically in SQLite and D1', async () => {
    const sqliteResults = sqliteStrongs.search('elohim');
    await expect(d1Strongs.search('elohim')).resolves.toEqual(sqliteResults);
    expect(sqliteResults).toContainEqual(expect.objectContaining({ strongs_number: 'H0430' }));
  });

  it('does not broaden a short iy search into unrelated i transliterations', async () => {
    const sqliteResults = sqliteStrongs.search('iy');
    await expect(d1Strongs.search('iy')).resolves.toEqual(sqliteResults);
    expect(sqliteResults).not.toContainEqual(expect.objectContaining({ strongs_number: 'G2424' }));
  });

  it('preserves Unicode lemma search alongside transliteration fallback', async () => {
    const sqliteResults = sqliteStrongs.search('אֱלֹהִים');
    await expect(d1Strongs.search('אֱלֹהִים')).resolves.toEqual(sqliteResults);
    expect(sqliteResults).toContainEqual(expect.objectContaining({ strongs_number: 'H0430' }));

    const greekResults = sqliteStrongs.search('ἀγαπάω');
    await expect(d1Strongs.search('ἀγαπάω')).resolves.toEqual(greekResults);
    expect(greekResults).toContainEqual(expect.objectContaining({ strongs_number: 'G0025' }));

    const diacriticResults = sqliteStrongs.search('agapaō');
    await expect(d1Strongs.search('agapaō')).resolves.toEqual(diacriticResults);
    expect(diacriticResults).toContainEqual(expect.objectContaining({ strongs_number: 'G0025' }));
  });
});
