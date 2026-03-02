/**
 * STEPBible morphology repository backed by Cloudflare D1.
 *
 * Same SQL queries as the better-sqlite3 version, but using
 * the D1 async binding API.
 */

import type { IMorphologyRepository, MorphWord, WordOccurrence, BookDistribution } from '../../kernel/repositories.js';
import { expandHebrewMorphCode } from '../shared/hebrewMorphExpander.js';

// D1 binding type (subset used by this repo)
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

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
    return results.map(r => r.book);
  }

  async hasVerse(book: string, chapter: number, verse: number): Promise<boolean> {
    return (await this.getVerseMorphology(book, chapter, verse)).length > 0;
  }

  async getOccurrences(strongsNumber: string, limit: number = 100): Promise<WordOccurrence[]> {
    const { results } = await this.db.prepare(
      'SELECT DISTINCT book, chapter, verse, word_text, gloss FROM morphology WHERE strongs_number = ? ORDER BY rowid LIMIT ?'
    ).bind(strongsNumber, limit).all<WordOccurrence>();
    return results;
  }

  async getDistribution(strongsNumber: string): Promise<BookDistribution[]> {
    const { results } = await this.db.prepare(
      `SELECT book, COUNT(DISTINCT chapter || ':' || verse) as verse_count
       FROM morphology WHERE strongs_number = ? GROUP BY book ORDER BY rowid`
    ).bind(strongsNumber).all<BookDistribution>();
    return results;
  }
}
