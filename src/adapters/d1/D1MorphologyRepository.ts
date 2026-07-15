/**
 * STEPBible morphology repository backed by Cloudflare D1.
 *
 * Same SQL queries as the better-sqlite3 version, but using
 * the D1 async binding API.
 */

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

export class D1MorphologyRepository implements IMorphologyRepository {
  constructor(private db: D1Database) {}

  async getVerseMorphology(book: string, chapter: number, verse: number): Promise<MorphWord[]> {
    const { results } = await this.db.prepare(
      'SELECT position, word_text, lemma, strongs_number, morph_code, gloss FROM morphology WHERE book = ? AND chapter = ? AND verse = ? ORDER BY position'
    ).bind(book, chapter, verse).all<MorphWord>();
    return results;
  }

  async expandMorphCode(code: string): Promise<string | undefined> {
    const row = await this.db.prepare(
      'SELECT expansion FROM morph_codes WHERE code = ?'
    ).bind(code).first<{ expansion: string }>();
    if (row) return row.expansion;
    // Programmatic fallback for Hebrew TAHOT codes
    if (code.startsWith('H')) return expandHebrewMorphCode(code);
    return undefined;
  }

  async getAvailableBooks(): Promise<string[]> {
    const { results } = await this.db.prepare(
      'SELECT DISTINCT book FROM morphology ORDER BY book'
    ).all<{ book: string }>();
    return sortByCanonicalBook(results).map(r => r.book);
  }

  async hasVerse(book: string, chapter: number, verse: number): Promise<boolean> {
    return (await this.getVerseMorphology(book, chapter, verse)).length > 0;
  }

  async getOccurrences(strongsNumber: string, limit: number = 100): Promise<WordOccurrence[]> {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return [];
    const { results } = await this.db.prepare(
      `SELECT DISTINCT book, chapter, verse, word_text, gloss
       FROM morphology WHERE strongs_number = ?
       ORDER BY ${CANONICAL_BOOK_ORDER_SQL}, chapter, verse, word_text, gloss
       LIMIT ?`
    ).bind(identity.morphologyKey, limit).all<WordOccurrence>();
    return results;
  }

  async getDistribution(strongsNumber: string): Promise<BookDistribution[]> {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return [];
    const { results } = await this.db.prepare(
      `SELECT book, COUNT(DISTINCT chapter || ':' || verse) as verse_count
       FROM morphology WHERE strongs_number = ? GROUP BY book
       ORDER BY ${CANONICAL_BOOK_ORDER_SQL}, book`
    ).bind(identity.morphologyKey).all<BookDistribution>();
    return sortByCanonicalBook(results);
  }

  async getUsageStats(strongsNumber: string): Promise<UsageStats | undefined> {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return undefined;
    return (await this.db.prepare(
      `SELECT strongs_key, token_count, verse_count, book_count, form_count
       FROM strongs_usage_stats WHERE strongs_key = ?`
    ).bind(identity.morphologyKey).first<UsageStats>()) ?? undefined;
  }

  async getBookUsage(strongsNumber: string): Promise<BookUsage[]> {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return [];
    const { results } = await this.db.prepare(
      `SELECT book, book_order, token_count, verse_count
       FROM strongs_book_stats WHERE strongs_key = ?
       ORDER BY book_order`
    ).bind(identity.morphologyKey).all<BookUsage>();
    return results;
  }

  async getFormUsage(strongsNumber: string, limit?: number): Promise<FormUsage[]> {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return [];
    if (limit !== undefined) assertUsageLimit(limit);
    const sql = `SELECT form_text, token_count, verse_count,
         first_book, first_book_order, first_chapter, first_verse, first_position
       FROM strongs_form_stats WHERE strongs_key = ?
       ORDER BY token_count DESC, verse_count DESC, form_text${limit === undefined ? '' : ' LIMIT ?'}`;
    const statement = this.db.prepare(sql);
    const { results } = limit === undefined
      ? await statement.bind(identity.morphologyKey).all<FormUsageRow>()
      : await statement.bind(identity.morphologyKey, limit).all<FormUsageRow>();
    return results.map(toFormUsage);
  }

  async getTokenOccurrences(
    strongsNumber: string,
    after?: CanonicalOccurrencePosition,
    limit: number = 100,
  ): Promise<TokenOccurrencePage> {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return { occurrences: [] };
    assertUsageLimit(limit);
    if (after) assertOccurrencePosition(after);
    const columns = `book, book_order, chapter, verse, position, word_text, lemma,
         strongs_number, morph_code, gloss`;
    const statement = after
      ? this.db.prepare(
        `SELECT ${columns} FROM morphology
         WHERE strongs_number = ? AND (book_order, chapter, verse, position) > (?, ?, ?, ?)
         ORDER BY book_order, chapter, verse, position LIMIT ?`
      ).bind(identity.morphologyKey, after.book_order, after.chapter, after.verse, after.position, limit + 1)
      : this.db.prepare(
        `SELECT ${columns} FROM morphology WHERE strongs_number = ?
         ORDER BY book_order, chapter, verse, position LIMIT ?`
      ).bind(identity.morphologyKey, limit + 1);
    const { results } = await statement.all<TokenOccurrence>();
    return tokenOccurrencePage(results, limit);
  }
}
