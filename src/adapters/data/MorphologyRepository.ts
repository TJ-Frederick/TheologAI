/**
 * STEPBible morphology data access via SQLite.
 *
 * Replaces gzip decompression + manual LRU cache from
 * biblicalLanguagesAdapter.ts. All 447k+ words indexed.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';
import type {
  IMorphologyRepository,
  MorphWord,
  WordOccurrence,
  BookDistribution,
} from '../../kernel/repositories.js';
import { expandHebrewMorphCode } from '../shared/hebrewMorphExpander.js';
import { CANONICAL_BOOK_ORDER_SQL, sortByCanonicalBook } from '../shared/repositoryUtils.js';
import { parseStrongsIdentity } from '../../kernel/strongs.js';

export type { MorphWord } from '../../kernel/repositories.js';

export class MorphologyRepository implements IMorphologyRepository {
  private db: Database.Database;
  private stmtVerse: Database.Statement;
  private stmtMorphExpand: Database.Statement;
  private stmtBookList: Database.Statement;
  private stmtOccurrences: Database.Statement;
  private stmtDistribution: Database.Statement;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
    this.stmtVerse = this.db.prepare(
      'SELECT position, word_text, lemma, strongs_number, morph_code, gloss FROM morphology WHERE book = ? AND chapter = ? AND verse = ? ORDER BY position'
    );
    this.stmtMorphExpand = this.db.prepare(
      'SELECT expansion FROM morph_codes WHERE code = ?'
    );
    this.stmtBookList = this.db.prepare(
      'SELECT DISTINCT book FROM morphology ORDER BY book'
    );
    this.stmtOccurrences = this.db.prepare(
      `SELECT DISTINCT book, chapter, verse, word_text, gloss
       FROM morphology WHERE strongs_number = ?
       ORDER BY ${CANONICAL_BOOK_ORDER_SQL}, chapter, verse, word_text, gloss
       LIMIT ?`
    );
    this.stmtDistribution = this.db.prepare(
      `SELECT book, COUNT(DISTINCT chapter || ':' || verse) as verse_count
       FROM morphology WHERE strongs_number = ? GROUP BY book
       ORDER BY ${CANONICAL_BOOK_ORDER_SQL}, book`
    );
  }

  /** Get word-by-word morphology for a specific verse */
  getVerseMorphology(book: string, chapter: number, verse: number): MorphWord[] {
    return this.stmtVerse.all(book, chapter, verse) as MorphWord[];
  }

  /** Expand a morphology code to human-readable form */
  expandMorphCode(code: string): string | undefined {
    const row = this.stmtMorphExpand.get(code) as { expansion: string } | undefined;
    if (row) return row.expansion;
    return code.startsWith('H') ? expandHebrewMorphCode(code) : undefined;
  }

  /** List all books that have morphology data */
  getAvailableBooks(): string[] {
    return sortByCanonicalBook(this.stmtBookList.all() as Array<{ book: string }>).map(r => r.book);
  }

  /** Check if morphology data exists for a verse */
  hasVerse(book: string, chapter: number, verse: number): boolean {
    return this.getVerseMorphology(book, chapter, verse).length > 0;
  }

  /** Find verse occurrences for a Strong's number */
  getOccurrences(strongsNumber: string, limit: number = 100): WordOccurrence[] {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return [];
    return this.stmtOccurrences.all(identity.morphologyKey, limit) as WordOccurrence[];
  }

  /** Count distinct verse occurrences by book for a Strong's number */
  getDistribution(strongsNumber: string): BookDistribution[] {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return [];
    return sortByCanonicalBook(this.stmtDistribution.all(identity.morphologyKey) as BookDistribution[]);
  }
}
