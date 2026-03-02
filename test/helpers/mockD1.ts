/**
 * Reusable D1Database mock for testing D1 repository implementations.
 *
 * Simulates Cloudflare's D1 chained API:
 *   db.prepare(sql).bind(...args).all()   → { results: T[] }
 *   db.prepare(sql).bind(...args).first() → T | null
 *   db.prepare(sql).bind(...args).run()   → {}
 */

import { vi } from 'vitest';

export interface QueryConfig {
  /** Match SQL by substring or regex */
  sql: string | RegExp;
  /** Return value for .all() — should be { results: any[] } */
  all?: { results: any[] };
  /** Return value for .first() — row or null */
  first?: any;
  /** Return value for .run() */
  run?: any;
}

/**
 * Create a configurable D1 mock that routes queries by SQL pattern.
 *
 * Usage:
 *   const db = createMockD1([
 *     { sql: /SELECT.*cross_references.*LIMIT/, all: { results: [row1] } },
 *     { sql: /COUNT/, first: { count: 5 } },
 *   ]);
 *   const repo = new D1SomeRepository(db as any);
 */
export function createMockD1(configs: QueryConfig[] = {}) {
  const db = {
    prepare: vi.fn().mockImplementation((sql: string) => {
      const config = configs.find(c =>
        typeof c.sql === 'string' ? sql.includes(c.sql) : c.sql.test(sql),
      );

      const bound = {
        all: config?.all !== undefined
          ? vi.fn().mockResolvedValue(config.all)
          : vi.fn().mockResolvedValue({ results: [] }),
        first: config?.first !== undefined
          ? vi.fn().mockResolvedValue(config.first)
          : vi.fn().mockResolvedValue(null),
        run: config?.run !== undefined
          ? vi.fn().mockResolvedValue(config.run)
          : vi.fn().mockResolvedValue({}),
      };

      return {
        bind: vi.fn().mockReturnValue(bound),
        // Also expose directly for parameterless queries
        all: bound.all,
        first: bound.first,
        run: bound.run,
      };
    }),
  };

  return db;
}

/**
 * Convenience: single-pattern D1 mock where all queries return the same data.
 */
export function createSimpleD1(
  allResults: any[] = [],
  firstResult: any = null,
) {
  return createMockD1([{
    sql: /.*/,
    all: { results: allResults },
    first: firstResult,
  }]);
}
