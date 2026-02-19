/**
 * Strong's concordance data access via SQLite + FTS5.
 *
 * Replaces in-memory Greek/Hebrew Maps from biblicalLanguagesAdapter.ts.
 * FTS5 enables 10x faster lemma search.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';

export interface StrongsEntry {
  strongs_number: string;
  testament: 'OT' | 'NT';
  lemma: string;
  transliteration: string | null;
  pronunciation: string | null;
  definition: string;
  derivation: string | null;
}

export interface LexiconEntry {
  strongs_number: string;
  source: string;
  extended_data: Record<string, unknown>;
}

export class StrongsRepository {
  private db: Database.Database;
  private stmtLookup: Database.Statement;
  private stmtFtsSearch: Database.Statement;
  private stmtLexicon: Database.Statement;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
    this.stmtLookup = this.db.prepare(
      'SELECT * FROM strongs WHERE strongs_number = ?'
    );
    this.stmtFtsSearch = this.db.prepare(
      "SELECT strongs_number, lemma, transliteration, definition FROM strongs_fts WHERE strongs_fts MATCH ? ORDER BY rank LIMIT ?"
    );
    this.stmtLexicon = this.db.prepare(
      'SELECT * FROM stepbible_lexicons WHERE strongs_number = ?'
    );
  }

  /** Look up a Strong's number (e.g. "G25", "H430") */
  lookup(strongsNumber: string): StrongsEntry | undefined {
    const normalized = strongsNumber.toUpperCase().trim();
    // Try exact match first
    let row = this.stmtLookup.get(normalized) as StrongsEntry | undefined;
    if (row) return row;

    // Try padded: G25 → G0025 (for lexicon lookup)
    const padded = normalized.replace(/^([GH])(\d+)$/, (_, prefix, num) =>
      prefix + num.padStart(4, '0')
    );
    if (padded !== normalized) {
      row = this.stmtLookup.get(padded) as StrongsEntry | undefined;
    }
    return row;
  }

  /** FTS search by lemma, transliteration, or definition text */
  search(query: string, limit: number = 10): StrongsEntry[] {
    // Escape special FTS5 characters and add prefix matching
    const escaped = query.replace(/['"*]/g, '');
    const ftsQuery = `"${escaped}"*`;
    return this.stmtFtsSearch.all(ftsQuery, limit) as StrongsEntry[];
  }

  /** Get STEPBible lexicon data for a Strong's number */
  getLexiconEntry(strongsNumber: string): LexiconEntry | undefined {
    const padded = strongsNumber.toUpperCase().trim().replace(
      /^([GH])(\d+)$/,
      (_, prefix, num) => prefix + num.padStart(4, '0')
    );
    const row = this.stmtLexicon.get(padded) as { strongs_number: string; source: string; extended_data: string } | undefined;
    if (!row) return undefined;

    return {
      strongs_number: row.strongs_number,
      source: row.source,
      extended_data: JSON.parse(row.extended_data),
    };
  }

  /** Get total entry counts */
  getStats(): { greek: number; hebrew: number; total: number } {
    const greek = (this.db.prepare("SELECT COUNT(*) as c FROM strongs WHERE testament = 'NT'").get() as any).c;
    const hebrew = (this.db.prepare("SELECT COUNT(*) as c FROM strongs WHERE testament = 'OT'").get() as any).c;
    return { greek, hebrew, total: greek + hebrew };
  }
}
