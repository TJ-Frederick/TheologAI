/**
 * Strong's concordance repository backed by Cloudflare D1.
 *
 * Same SQL queries as the better-sqlite3 version, but using
 * the D1 async binding API.
 */

import type { IStrongsRepository, StrongsEntry, LexiconEntry } from '../../kernel/repositories.js';
import {
  isAsciiTransliterationQuery,
  normalizeTransliteration,
  normalizedTransliterationSql,
} from '../../kernel/transliteration.js';

export class D1StrongsRepository implements IStrongsRepository {
  constructor(private db: D1Database) {}

  async lookup(strongsNumber: string): Promise<StrongsEntry | undefined> {
    const normalized = strongsNumber.toUpperCase().trim();

    // Try exact match first
    let row = await this.db.prepare(
      'SELECT * FROM strongs WHERE strongs_number = ?'
    ).bind(normalized).first<StrongsEntry>();
    if (row) return row;

    // Try padded: G25 → G0025
    const padded = normalized.replace(/^([GH])(\d+)$/, (_, prefix, num) =>
      prefix + num.padStart(4, '0')
    );
    if (padded !== normalized) {
      row = await this.db.prepare(
        'SELECT * FROM strongs WHERE strongs_number = ?'
      ).bind(padded).first<StrongsEntry>();
    }
    return row ?? undefined;
  }

  async search(query: string, limit: number = 10): Promise<StrongsEntry[]> {
    const escaped = query.replace(/['"*]/g, '');
    const ftsQuery = `"${escaped}"*`;
    const { results } = await this.db.prepare(
      `SELECT s.strongs_number, s.testament, s.lemma, s.transliteration,
              s.pronunciation, s.definition, s.derivation
       FROM strongs_fts
       JOIN strongs s ON s.strongs_number = strongs_fts.strongs_number
       WHERE strongs_fts MATCH ?
       ORDER BY rank, s.strongs_number
       LIMIT ?`
    ).bind(ftsQuery, limit).all<StrongsEntry>();
    if (!isAsciiTransliterationQuery(query)) return results;

    const normalizedQuery = normalizeTransliteration(query);
    if (normalizedQuery.length < 2) return results;

    const normalized = await this.db.prepare(
      `SELECT strongs_number, testament, lemma, transliteration,
              pronunciation, definition, derivation
         FROM strongs s
        WHERE ${normalizedTransliterationSql('s.transliteration')} LIKE ? || '%'
        ORDER BY strongs_number
        LIMIT ?`,
    ).bind(normalizedQuery, limit).all<StrongsEntry>();

    return mergeSearchResults(results, normalized.results, limit);
  }

  async getLexiconEntry(strongsNumber: string): Promise<LexiconEntry | undefined> {
    const padded = strongsNumber.toUpperCase().trim().replace(
      /^([GH])(\d+)$/,
      (_, prefix, num) => prefix + num.padStart(4, '0')
    );
    const row = await this.db.prepare(
      'SELECT * FROM stepbible_lexicons WHERE strongs_number = ?'
    ).bind(padded).first<{ strongs_number: string; source: string; extended_data: string }>();
    if (!row) return undefined;

    return {
      strongs_number: row.strongs_number,
      source: row.source,
      extended_data: JSON.parse(row.extended_data),
    };
  }

  async getStats(): Promise<{ greek: number; hebrew: number; total: number }> {
    const [greekRow, hebrewRow] = await Promise.all([
      this.db.prepare("SELECT COUNT(*) as c FROM strongs WHERE testament = 'NT'").first<{ c: number }>(),
      this.db.prepare("SELECT COUNT(*) as c FROM strongs WHERE testament = 'OT'").first<{ c: number }>(),
    ]);
    const greek = greekRow?.c ?? 0;
    const hebrew = hebrewRow?.c ?? 0;
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
