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
  UsageStats,
  BookUsage,
  FormUsage,
  CanonicalOccurrencePosition,
  TokenOccurrence,
  TokenOccurrencePage,
} from '../../kernel/repositories.js';
import { expandHebrewMorphCode } from '../shared/hebrewMorphExpander.js';
import { CANONICAL_BOOK_ORDER_SQL, sortByCanonicalBook } from '../shared/repositoryUtils.js';
import { parseStrongsIdentity } from '../../kernel/strongs.js';
import {
  assertOccurrencePosition,
  assertUsageLimit,
  tokenOccurrencePage,
  toFormUsage,
  type FormUsageRow,
} from '../shared/morphologyUsage.js';

export type { MorphWord } from '../../kernel/repositories.js';

export class MorphologyRepository implements IMorphologyRepository {
  private db: Database.Database;
  private stmtVerse: Database.Statement;
  private stmtMorphExpand: Database.Statement;
  private stmtBookList: Database.Statement;
  private stmtOccurrences: Database.Statement;
  private stmtDistribution: Database.Statement;
  private stmtUsageStats: Database.Statement;
  private stmtBookUsage: Database.Statement;
  private stmtFormUsage: Database.Statement;
  private stmtFormUsageLimited: Database.Statement;
  private stmtTokenOccurrences: Database.Statement;
  private stmtTokenOccurrencesAfter: Database.Statement;

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
    this.stmtUsageStats = this.db.prepare(
      `SELECT strongs_key, token_count, verse_count, book_count, form_count
       FROM strongs_usage_stats WHERE strongs_key = ?`
    );
    this.stmtBookUsage = this.db.prepare(
      `SELECT book, book_order, token_count, verse_count
       FROM strongs_book_stats WHERE strongs_key = ?
       ORDER BY book_order`
    );
    const formUsageSql = `SELECT form_text, token_count, verse_count,
         first_book, first_book_order, first_chapter, first_verse, first_position
       FROM strongs_form_stats WHERE strongs_key = ?
       ORDER BY token_count DESC, verse_count DESC, form_text`;
    this.stmtFormUsage = this.db.prepare(formUsageSql);
    this.stmtFormUsageLimited = this.db.prepare(`${formUsageSql} LIMIT ?`);
    const tokenColumns = `book, book_order, chapter, verse, position, word_text, lemma,
         strongs_number, morph_code, gloss`;
    this.stmtTokenOccurrences = this.db.prepare(
      `SELECT ${tokenColumns} FROM morphology WHERE strongs_number = ?
       ORDER BY book_order, chapter, verse, position LIMIT ?`
    );
    this.stmtTokenOccurrencesAfter = this.db.prepare(
      `SELECT ${tokenColumns} FROM morphology
       WHERE strongs_number = ? AND (book_order, chapter, verse, position) > (?, ?, ?, ?)
       ORDER BY book_order, chapter, verse, position LIMIT ?`
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

  getUsageStats(strongsNumber: string): UsageStats | undefined {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return undefined;
    return this.stmtUsageStats.get(identity.morphologyKey) as UsageStats | undefined;
  }

  getBookUsage(strongsNumber: string): BookUsage[] {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return [];
    return this.stmtBookUsage.all(identity.morphologyKey) as BookUsage[];
  }

  getFormUsage(strongsNumber: string, limit?: number): FormUsage[] {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return [];
    if (limit !== undefined) assertUsageLimit(limit);
    const rows = (limit === undefined
      ? this.stmtFormUsage.all(identity.morphologyKey)
      : this.stmtFormUsageLimited.all(identity.morphologyKey, limit)) as FormUsageRow[];
    return rows.map(toFormUsage);
  }

  getTokenOccurrences(
    strongsNumber: string,
    after?: CanonicalOccurrencePosition,
    limit: number = 100,
  ): TokenOccurrencePage {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return { occurrences: [] };
    assertUsageLimit(limit);
    if (after) assertOccurrencePosition(after);
    const rows = (after
      ? this.stmtTokenOccurrencesAfter.all(
        identity.morphologyKey,
        after.book_order,
        after.chapter,
        after.verse,
        after.position,
        limit + 1,
      )
      : this.stmtTokenOccurrences.all(identity.morphologyKey, limit + 1)) as TokenOccurrence[];
    return tokenOccurrencePage(rows, limit);
  }
}
