/**
 * STEPBible morphology data access via SQLite.
 *
 * Replaces gzip decompression + manual LRU cache from
 * biblicalLanguagesAdapter.ts. All 447k+ words indexed.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';

export interface MorphWord {
  position: number;
  word_text: string;
  lemma: string;
  strongs_number: string | null;
  morph_code: string | null;
  gloss: string | null;
}

export class MorphologyRepository {
  private db: Database.Database;
  private stmtVerse: Database.Statement;
  private stmtMorphExpand: Database.Statement;
  private stmtBookList: Database.Statement;

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
  }

  /** Get word-by-word morphology for a specific verse */
  getVerseMorphology(book: string, chapter: number, verse: number): MorphWord[] {
    return this.stmtVerse.all(book, chapter, verse) as MorphWord[];
  }

  /** Expand a morphology code to human-readable form */
  expandMorphCode(code: string): string | undefined {
    const row = this.stmtMorphExpand.get(code) as { expansion: string } | undefined;
    return row?.expansion;
  }

  /** List all books that have morphology data */
  getAvailableBooks(): string[] {
    return (this.stmtBookList.all() as Array<{ book: string }>).map(r => r.book);
  }

  /** Check if morphology data exists for a verse */
  hasVerse(book: string, chapter: number, verse: number): boolean {
    return this.getVerseMorphology(book, chapter, verse).length > 0;
  }
}
