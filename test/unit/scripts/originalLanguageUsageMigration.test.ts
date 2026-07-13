import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('migrations/0003_original_language_usage.sql', 'utf8');

function createPreMigrationSchema(db: Database.Database): void {
  db.exec(`CREATE TABLE morphology (
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    position INTEGER NOT NULL,
    word_text TEXT NOT NULL,
    lemma TEXT NOT NULL,
    strongs_number TEXT,
    morph_code TEXT,
    gloss TEXT,
    PRIMARY KEY (book, chapter, verse, position)
  );
  CREATE INDEX idx_morph_strongs ON morphology(strongs_number);`);
}

describe('original-language usage migration', () => {
  it('applies to an empty corpus and requires canonical book order on every inserted row', () => {
    const db = new Database(':memory:');
    createPreMigrationSchema(db);
    expect(() => db.exec(migration)).not.toThrow();

    const column = db.prepare("SELECT \"notnull\", dflt_value FROM pragma_table_info('morphology') WHERE name = 'book_order'")
      .get() as { notnull: number; dflt_value: string | null };
    expect(column).toEqual({ notnull: 1, dflt_value: null });
    expect(() => db.prepare(`INSERT INTO morphology
      (book,chapter,verse,position,word_text,lemma,strongs_number,morph_code,gloss)
      VALUES ('Genesis',1,1,1,'בְּרֵאשִׁית','רֵאשִׁית','H7225','HNcfsa','beginning')`).run())
      .toThrow(/NOT NULL constraint failed: morphology\.book_order/);
    expect(() => db.prepare(`INSERT INTO morphology
      (book,chapter,verse,position,word_text,lemma,strongs_number,morph_code,gloss,book_order)
      VALUES ('Genesis',1,1,1,'בְּרֵאשִׁית','רֵאשִׁית','H7225','HNcfsa','beginning',1)`).run())
      .not.toThrow();
    db.close();
  });

  it('fails closed when a pre-0003 corpus already contains morphology rows', () => {
    const db = new Database(':memory:');
    createPreMigrationSchema(db);
    db.prepare(`INSERT INTO morphology
      (book,chapter,verse,position,word_text,lemma,strongs_number,morph_code,gloss)
      VALUES ('Genesis',1,1,1,'בְּרֵאשִׁית','רֵאשִׁית','H7225','HNcfsa','beginning')`).run();

    expect(() => db.exec(migration)).toThrow(/Cannot add a NOT NULL column with default value NULL/);
    expect(db.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('morphology') WHERE name = 'book_order'").get())
      .toEqual({ count: 0 });
    db.close();
  });
});
