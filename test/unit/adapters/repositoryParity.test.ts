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
        strongs_number TEXT, morph_code TEXT, gloss TEXT,
        PRIMARY KEY (book, chapter, verse, position)
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

      INSERT INTO cross_references VALUES
        ('John.3.16', 'Rom.5.8', 42),
        ('John.3.16', '1John.4.9', 30),
        ('John.30.1', 'Rom.5.8', 99),
        ('John.3.17', 'Rom.8.1', 12);

      INSERT INTO strongs VALUES
        ('G0025', 'NT', 'ἀγαπάω', 'agapaō', 'ag-ap-ah-o', 'to love', 'perhaps from agan'),
        ('G2424', 'NT', 'Ἰησοῦς', 'Iēsous', NULL, 'Jesus', NULL),
        ('H0430', 'OT', 'אֱלֹהִים', 'ʼĕlôhîym', NULL, 'God, gods', NULL);
      INSERT INTO strongs_fts
        SELECT strongs_number, lemma, transliteration, definition FROM strongs;
      INSERT INTO stepbible_lexicons VALUES
        ('G0025', 'STEPBible', '{"gloss":"love"}');

      INSERT INTO morphology VALUES
        ('Romans', 8, 28, 1, 'οἴδαμεν', 'οἶδα', 'G1492', 'V-RAI-1P', 'we know'),
        ('John', 3, 16, 1, 'ἠγάπησεν', 'ἀγαπάω', 'G0025', 'V-AAI-3S', 'loved'),
        ('Genesis', 1, 1, 1, 'בְּרֵאשִׁית', 'רֵאשִׁית', 'H7225', 'HNcfsa', 'in beginning'),
        ('Romans', 5, 8, 1, 'συνίστησιν', 'συνίστημι', 'G4921', 'V-PAI-3S', 'demonstrates'),
        ('Romans', 8, 35, 1, 'ἀγάπης', 'ἀγάπη', 'G0025', 'N-GSF', 'love');
      INSERT INTO morph_codes VALUES ('V-AAI-3S', 'Verb Aorist Active Indicative 3rd Singular');

      INSERT INTO documents VALUES
        ('nicene-creed', 'Nicene Creed', 'creed', '381', '{"topics":["trinity"]}');
      INSERT INTO document_sections
        (id, document_id, section_number, title, content, topics) VALUES
        (1, 'nicene-creed', '1', 'The Creed', 'We believe in one almighty God.', '["trinity","God"]'),
        (2, 'nicene-creed', '2', NULL, 'And in one Lord Jesus Christ.', NULL);
      INSERT INTO sections_fts(rowid, title, content, topics)
        SELECT id, title, content, topics FROM document_sections ORDER BY id;
    `);

    const d1 = sqliteAsD1(db);
    sqliteCrossReferences = new CrossReferenceRepository(db);
    d1CrossReferences = new D1CrossReferenceRepository(d1);
    sqliteHistorical = new HistoricalDocumentRepository(db);
    d1Historical = new D1HistoricalDocumentRepository(d1);
    sqliteMorphology = new MorphologyRepository(db);
    d1Morphology = new D1MorphologyRepository(d1);
    sqliteStrongs = new StrongsRepository(db);
    d1Strongs = new D1StrongsRepository(d1);
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
    expect(sqliteMorphology.getAvailableBooks()).toEqual(['Genesis', 'John', 'Romans']);
    expect(sqliteMorphology.getDistribution('G0025').map(row => row.book)).toEqual(['John', 'Romans']);
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
