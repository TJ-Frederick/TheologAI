import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditPersistentLocalD1, localD1AuthorityPage, planLocalAuthority,
  verifyLocalAuthorityPages, LOCAL_AUTHORITY_RESULT_MAX_BYTES,
} from '../../../scripts/verify-d1-seed-workerd.js';

describe('persistent local D1 authority verification', () => {
  it('preserves all typed rows and the empty terminal page in exact query order', async () => {
    const sql = ['SELECT first', 'SELECT second', 'SELECT terminal'];
    const rows = [[{ text: 'λόγος', value: null, ordinal: 1 }], [{ text: '', value: 0, ordinal: 2 }], []];
    const read = vi.fn(async (query: string) => ({ rows: rows[sql.indexOf(query)]!, responseBytes: 100 }));
    const result = await verifyLocalAuthorityPages(sql, read, reader => sql.map(query => reader(query).rows));
    expect(result).toEqual(rows);
    expect(read.mock.calls.map(([query]) => query)).toEqual(sql);
  });

  it.each(['reordered', 'skipped', 'extra', 'unconsumed'])('refuses %s replay rather than substituting source results', async fault => {
    const plan = ['SELECT a', 'SELECT b'];
    const read = vi.fn(async () => ({ rows: [], responseBytes: 1 }));
    await expect(verifyLocalAuthorityPages(plan, read, reader => {
      if (fault === 'reordered') return reader(plan[1]!);
      reader(plan[0]!);
      if (fault === 'skipped') return reader('SELECT c');
      if (fault === 'unconsumed') return;
      reader(plan[1]!);
      return reader('SELECT extra');
    })).rejects.toThrow(/SQL\/order|consume every actual page/);
  });

  it('stops after a query failure and never falls back to source rows', async () => {
    const read = vi.fn(async (sql: string) => {
      if (sql === 'SELECT bad') throw Error('actual local query failure');
      return { rows: [], responseBytes: 1 };
    });
    const audit = vi.fn();
    await expect(verifyLocalAuthorityPages(['SELECT first', 'SELECT bad', 'SELECT never'], read, audit))
      .rejects.toThrow('actual local query failure');
    expect(read).toHaveBeenCalledTimes(2);
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([-1, NaN, 1.5])('rejects invalid response bytes %s', async responseBytes => {
    await expect(verifyLocalAuthorityPages(['SELECT a'], async () => ({ rows: [], responseBytes }), () => undefined))
      .rejects.toThrow('Invalid local D1 authority page');
  });

  it('fails at the aggregate limit without trimming data or invoking the audit', async () => {
    const pageBytes = 1_000_000;
    const plan = Array.from({ length: 200 }, (_, i) => 'SELECT ' + i);
    const read = vi.fn(async () => ({ rows: [{ unchanged: 'all result rows' }], responseBytes: pageBytes }));
    const audit = vi.fn();
    await expect(verifyLocalAuthorityPages(plan, read, audit)).rejects.toThrow('exceed128MiB; no rows discarded');
    expect(read).toHaveBeenCalledTimes(Math.floor(LOCAL_AUTHORITY_RESULT_MAX_BYTES / pageBytes) + 1);
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([[[]], [Array(1_001).fill('SELECT 1')]])('rejects an empty or unbounded source plan before querying', async plan => {
    const read = vi.fn();
    await expect(verifyLocalAuthorityPages(plan, read, () => undefined)).rejects.toThrow('page count');
    expect(read).not.toHaveBeenCalled();
  });

  it('preserves valid pinned Wrangler mapping and rejects malformed SELECT replies', () => {
    const page = localD1AuthorityPage([{ success: true, results: [{ nullable: null, integer: 2, text: 'é', bytes: [0, 255] }], meta: { duration: 0 } }]);
    expect(page.rows).toEqual([{ nullable: null, integer: 2, text: 'é', bytes: '[0, 255]' }]);
    expect(localD1AuthorityPage([{ success: true, results: [] }]).rows).toEqual([]);
    for (const results of [null, [], [{ success: false }], [{ success: true }], [{ success: true, results: null }], [{ success: true, results: [null] }], [{ success: true, results: ['wrong'] }], [{ success: true, results: [new Date()] }], [{ success: true, results: [Object.create({ inherited: true })] }], [{ success: true }, { success: true }]] as any[]) {
      expect(() => localD1AuthorityPage(results)).toThrow('one successful statement with a row array');
    }
    expect(() => localD1AuthorityPage([{ success: true, results: [{ text: 'x'.repeat(1_250_000) }] }]))
      .toThrow('envelope limit');
  });

  it('fails explicitly on a missing generated source DB without creating or replacing one', () => {
    const directory = mkdtempSync(join(tmpdir(), 'local-authority-source-'));
    const missing = join(directory, 'missing.db');
    try {
      expect(() => planLocalAuthority(process.cwd(), missing)).toThrow();
      expect(existsSync(missing)).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(['create', 'ready', 'query', 'replay', 'dispose'])('disposes its owned runtime on %s failure', async stage => {
    const dispose = vi.fn(async () => { if (stage === 'dispose') throw Error('dispose failed'); });
    const prepare = vi.fn(() => ({}));
    const batch = vi.fn(async () => {
      if (stage === 'query') throw Error('query failed');
      return [{ success: true, results: [] }];
    });
    const getD1Database = vi.fn(async () => {
      if (stage === 'ready' || stage === 'dispose') throw Error('ready failed');
      return { prepare, batch };
    });
    const factory = vi.fn(() => {
      if (stage === 'create') throw Error('create failed');
      return { getD1Database, dispose } as any;
    });
    await expect(auditPersistentLocalD1(process.cwd(), ['SELECT fixture'], '/owned/local/state', 'local-fixture', factory))
      .rejects.toThrow(stage === 'replay' ? 'SQL/order' : stage + ' failed');
    expect(dispose).toHaveBeenCalledTimes(stage === 'create' ? 0 : 1);
    expect(factory).toHaveBeenCalledWith({ modules: true, script: '', d1Persist: '/owned/local/state/v3/d1', d1Databases: { DATABASE: 'local-fixture' }, cf: false });
    if (stage !== 'create') expect(getD1Database).toHaveBeenCalledWith('DATABASE');
  });
});
