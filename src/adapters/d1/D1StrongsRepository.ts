/**
 * Strong's concordance repository backed by Cloudflare D1.
 *
 * Same SQL queries as the better-sqlite3 version, but using
 * the D1 async binding API.
 */

import type { IStrongsRepository, StrongsEntry, LexiconEntry } from '../../kernel/repositories.js';

// D1 binding type (subset used by this repo)
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

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
      'SELECT strongs_number, lemma, transliteration, definition FROM strongs_fts WHERE strongs_fts MATCH ? ORDER BY rank LIMIT ?'
    ).bind(ftsQuery, limit).all<StrongsEntry>();
    return results;
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
