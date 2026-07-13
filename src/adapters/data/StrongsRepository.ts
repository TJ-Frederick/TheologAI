/**
 * Strong's concordance data access via SQLite + FTS5.
 *
 * Replaces in-memory Greek/Hebrew Maps from biblicalLanguagesAdapter.ts.
 * FTS5 enables 10x faster lemma search.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';
import type { IStrongsRepository, StrongsEntry, LexiconEntry } from '../../kernel/repositories.js';
import {
  isAsciiTransliterationQuery,
  normalizeTransliteration,
  normalizedTransliterationSql,
} from '../../kernel/transliteration.js';
import { parseStrongsIdentity } from '../../kernel/strongs.js';

export type { StrongsEntry, LexiconEntry } from '../../kernel/repositories.js';

export class StrongsRepository implements IStrongsRepository {
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
      `SELECT s.strongs_number, s.testament, s.lemma, s.transliteration,
              s.pronunciation, s.definition, s.derivation
       FROM strongs_fts
       JOIN strongs s ON s.strongs_number = strongs_fts.strongs_number
       WHERE strongs_fts MATCH ?
       ORDER BY rank, s.strongs_number
       LIMIT ?`
    );
    this.stmtLexicon = this.db.prepare(
      'SELECT * FROM stepbible_lexicons WHERE strongs_number = ?'
    );
  }

  /** Look up a Strong's number (e.g. "G25", "H430") */
  lookup(strongsNumber: string): StrongsEntry | undefined {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return undefined;

    // A suffixed identity is exact: never silently substitute the base entry.
    let row = this.stmtLookup.get(identity.publicId) as StrongsEntry | undefined;
    if (row) return row;

    // Compatibility with databases that stored concordance keys padded.
    if (identity.morphologyKey !== identity.publicId) {
      row = this.stmtLookup.get(identity.morphologyKey) as StrongsEntry | undefined;
    }
    return row;
  }

  /** FTS search by lemma, transliteration, or definition text */
  search(query: string, limit: number = 10): StrongsEntry[] {
    // Escape special FTS5 characters and add prefix matching
    const escaped = query.replace(/['"*]/g, '');
    const ftsQuery = `"${escaped}"*`;
    const results = this.stmtFtsSearch.all(ftsQuery, limit) as StrongsEntry[];
    if (!isAsciiTransliterationQuery(query)) return results;

    const normalizedQuery = normalizeTransliteration(query);
    if (normalizedQuery.length < 2) return results;

    // The canonical FTS index stores diacritics and transliteration markers.
    // Match a normalized SQL expression as a fallback so ASCII `elohim` can
    // find STEPBible's `ʼĕlôhîym` without changing the source or FTS schema.
    const normalizedRows = this.db.prepare(
      `SELECT strongs_number, testament, lemma, transliteration,
              pronunciation, definition, derivation
         FROM strongs s
        WHERE ${normalizedTransliterationSql('s.transliteration')} LIKE ? || '%'
        ORDER BY strongs_number
        LIMIT ?`,
    ).all(normalizedQuery, limit) as StrongsEntry[];

    return mergeSearchResults(results, normalizedRows, limit);
  }

  /** Get STEPBible lexicon data for a Strong's number */
  getLexiconEntry(strongsNumber: string): LexiconEntry | undefined {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) return undefined;
    const row = this.stmtLexicon.get(identity.morphologyKey) as { strongs_number: string; source: string; extended_data: string } | undefined;
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

function mergeSearchResults(
  primary: StrongsEntry[],
  fallback: StrongsEntry[],
  limit: number,
): StrongsEntry[] {
  const seen = new Set<string>();
  const merged: StrongsEntry[] = [];
  for (const entry of [...primary, ...fallback]) {
    if (seen.has(entry.strongs_number)) continue;
    seen.add(entry.strongs_number);
    merged.push(entry);
    if (merged.length >= limit) break;
  }
  return merged;
}
