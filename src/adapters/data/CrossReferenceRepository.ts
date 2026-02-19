/**
 * Cross-reference data access via SQLite.
 *
 * Replaces the in-memory Map approach in crossReferenceService.ts
 * that loaded 30-50MB at startup. SQLite queries are indexed and
 * only load what's needed.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';
import { normalizeOpenBibleRef, parseReference, formatReference } from '../../kernel/reference.js';

export interface CrossRefRow {
  reference: string;
  votes: number;
}

export interface CrossRefResult {
  references: CrossRefRow[];
  total: number;
  showing: number;
  hasMore: boolean;
}

export interface CrossRefOptions {
  maxResults?: number;
  minVotes?: number;
}

export class CrossReferenceRepository {
  private db: Database.Database;
  private stmtByFrom: Database.Statement;
  private stmtCountByFrom: Database.Statement;
  private stmtChapter: Database.Statement;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
    this.stmtByFrom = this.db.prepare(
      'SELECT to_verse, votes FROM cross_references WHERE from_verse = ? AND votes >= ? ORDER BY votes DESC LIMIT ?'
    );
    this.stmtCountByFrom = this.db.prepare(
      'SELECT COUNT(*) as count FROM cross_references WHERE from_verse = ? AND votes >= ?'
    );
    this.stmtChapter = this.db.prepare(
      "SELECT from_verse, COUNT(*) as ref_count FROM cross_references WHERE from_verse LIKE ? || '%' GROUP BY from_verse ORDER BY ref_count DESC"
    );
  }

  /**
   * Get cross-references for a given verse.
   * Accepts any reference format — normalizes via kernel.
   */
  getCrossReferences(reference: string, options: CrossRefOptions = {}): CrossRefResult {
    const { maxResults = 5, minVotes = 0 } = options;
    const key = this.normalizeKey(reference);

    const rows = this.stmtByFrom.all(key, minVotes, maxResults) as Array<{ to_verse: string; votes: number }>;
    const totalRow = this.stmtCountByFrom.get(key, minVotes) as { count: number };

    const references = rows.map(r => ({
      reference: this.tryNormalize(r.to_verse),
      votes: r.votes,
    }));

    return {
      references,
      total: totalRow.count,
      showing: references.length,
      hasMore: totalRow.count > maxResults,
    };
  }

  hasReferences(reference: string): boolean {
    const key = this.normalizeKey(reference);
    const row = this.stmtCountByFrom.get(key, 0) as { count: number };
    return row.count > 0;
  }

  getChapterStatistics(bookChapter: string): {
    totalVerses: number;
    totalCrossRefs: number;
    verseStats: Array<{ verse: number; refCount: number }>;
  } {
    const normalized = this.normalizeKey(bookChapter);
    const rows = this.stmtChapter.all(normalized) as Array<{ from_verse: string; ref_count: number }>;

    const verseStats = rows.map(r => {
      const verseMatch = r.from_verse.match(/\.(\d+)$/);
      return {
        verse: verseMatch ? parseInt(verseMatch[1], 10) : 0,
        refCount: r.ref_count,
      };
    }).filter(v => v.verse > 0);

    return {
      totalVerses: verseStats.length,
      totalCrossRefs: verseStats.reduce((sum, v) => sum + v.refCount, 0),
      verseStats,
    };
  }

  /**
   * Normalize a user-provided reference to the OpenBible TSV format
   * stored in the database (e.g. "Gen.1.1").
   */
  private normalizeKey(ref: string): string {
    // The DB stores raw OpenBible format: "Gen.1.1"
    // If the input already looks like OpenBible format, pass through
    if (/^[A-Za-z0-9]+\.\d+\.\d+$/.test(ref.trim())) {
      return ref.trim();
    }

    // Otherwise, parse and convert to OpenBible format
    try {
      const parsed = parseReference(ref);
      return `${parsed.book.abbreviation}.${parsed.chapter}.${parsed.startVerse ?? ''}`.replace(/\.$/, '');
    } catch {
      // Last resort: pass through as-is
      return ref.trim();
    }
  }

  private tryNormalize(openBibleRef: string): string {
    try {
      return normalizeOpenBibleRef(openBibleRef);
    } catch {
      return openBibleRef;
    }
  }
}
