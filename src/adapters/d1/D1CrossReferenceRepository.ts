/**
 * Cross-reference repository backed by Cloudflare D1.
 *
 * Same SQL queries as the better-sqlite3 version, but using
 * the D1 async binding API.
 */

import type { ICrossReferenceRepository, CrossRefResult, CrossRefOptions } from '../../kernel/repositories.js';
import { fromOpenBibleKey, toOpenBibleKey } from '../shared/repositoryUtils.js';

export class D1CrossReferenceRepository implements ICrossReferenceRepository {
  constructor(private db: D1Database) {}

  async getCrossReferences(reference: string, options: CrossRefOptions = {}): Promise<CrossRefResult> {
    const { maxResults = 5, minVotes = 0 } = options;
    const key = toOpenBibleKey(reference);

    const [rows, totalRow] = await Promise.all([
      this.db.prepare(
        'SELECT to_verse, votes FROM cross_references WHERE from_verse = ? AND votes >= ? ORDER BY votes DESC, to_verse ASC LIMIT ?'
      ).bind(key, minVotes, maxResults).all<{ to_verse: string; votes: number }>(),
      this.db.prepare(
        'SELECT COUNT(*) as count FROM cross_references WHERE from_verse = ? AND votes >= ?'
      ).bind(key, minVotes).first<{ count: number }>(),
    ]);

    const references = rows.results.map(r => ({
      reference: fromOpenBibleKey(r.to_verse),
      votes: r.votes,
    }));

    return {
      references,
      total: totalRow?.count ?? 0,
      showing: references.length,
      hasMore: (totalRow?.count ?? 0) > maxResults,
    };
  }

  async hasReferences(reference: string): Promise<boolean> {
    const key = toOpenBibleKey(reference);
    const row = await this.db.prepare(
      'SELECT COUNT(*) as count FROM cross_references WHERE from_verse = ? AND votes >= 0'
    ).bind(key).first<{ count: number }>();
    return (row?.count ?? 0) > 0;
  }

  async getChapterStatistics(bookChapter: string): Promise<{
    totalVerses: number;
    totalCrossRefs: number;
    verseStats: Array<{ verse: number; refCount: number }>;
  }> {
    const normalized = toOpenBibleKey(bookChapter);
    const { results: rows } = await this.db.prepare(
      "SELECT from_verse, COUNT(*) as ref_count FROM cross_references WHERE from_verse LIKE ? || '.%' GROUP BY from_verse ORDER BY ref_count DESC, from_verse ASC"
    ).bind(normalized).all<{ from_verse: string; ref_count: number }>();

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
