/**
 * Cross-reference data access via SQLite.
 *
 * Replaces the in-memory Map approach in crossReferenceService.ts
 * that loaded 30-50MB at startup. SQLite queries are indexed and
 * only load what's needed.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';
import { fromOpenBibleKey, toOpenBibleKey } from '../shared/repositoryUtils.js';
import type {
  ICrossReferenceRepository,
  CrossRefRow,
  CrossRefResult,
  CrossRefOptions,
} from '../../kernel/repositories.js';

export type { CrossRefRow, CrossRefResult, CrossRefOptions } from '../../kernel/repositories.js';

export class CrossReferenceRepository implements ICrossReferenceRepository {
  private db: Database.Database;
  private stmtByFrom: Database.Statement;
  private stmtCountByFrom: Database.Statement;
  private stmtChapter: Database.Statement;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
    this.stmtByFrom = this.db.prepare(
      'SELECT to_verse, votes FROM cross_references WHERE from_verse = ? AND votes >= ? ORDER BY votes DESC, to_verse ASC LIMIT ?'
    );
    this.stmtCountByFrom = this.db.prepare(
      'SELECT COUNT(*) as count FROM cross_references WHERE from_verse = ? AND votes >= ?'
    );
    this.stmtChapter = this.db.prepare(
      "SELECT from_verse, COUNT(*) as ref_count FROM cross_references WHERE from_verse LIKE ? || '.%' GROUP BY from_verse ORDER BY ref_count DESC, from_verse ASC"
    );
  }

  /**
   * Get cross-references for a given verse.
   * Accepts any reference format — normalizes via kernel.
   */
  getCrossReferences(reference: string, options: CrossRefOptions = {}): CrossRefResult {
    const { maxResults = 5, minVotes = 0 } = options;
    const key = toOpenBibleKey(reference);

    const rows = this.stmtByFrom.all(key, minVotes, maxResults) as Array<{ to_verse: string; votes: number }>;
    const totalRow = this.stmtCountByFrom.get(key, minVotes) as { count: number };

    const references = rows.map(r => ({
      reference: fromOpenBibleKey(r.to_verse),
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
    const key = toOpenBibleKey(reference);
    const row = this.stmtCountByFrom.get(key, 0) as { count: number };
    return row.count > 0;
  }

  getChapterStatistics(bookChapter: string): {
    totalVerses: number;
    totalCrossRefs: number;
    verseStats: Array<{ verse: number; refCount: number }>;
  } {
    const normalized = toOpenBibleKey(bookChapter);
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

}
