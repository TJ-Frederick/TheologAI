import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

describe('Transform 8 historical materialization atomicity', () => {
  it('rolls back every historical body, FTS, and sidecar row after a forced late failure', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'theologai-transform8-atomicity-'));
    const output = join(workspace, 'target.db');
    const target = new Database(output);
    try {
      target.pragma('foreign_keys = ON');
      for (const migration of [
        '0001_initial_schema.sql',
        '0002_ubs_parallel_passages.sql',
        '0003_original_language_usage.sql',
        '0004_ubs_hebrew_semantics.sql',
        '0005_historical_section_identity_delivery.sql',
      ]) target.exec(requireMigration(migration));
      target.close();

      expect(() => execFileSync(process.execPath, [
        TSX,
        join(ROOT, 'scripts', 'build-database.ts'),
        '--output', output,
      ], {
        cwd: ROOT,
        env: { ...process.env, THEOLOGAI_TRANSFORM8_TEST_FAIL_AFTER_SIDECARS: '1' },
        stdio: 'ignore',
      })).toThrow();

      const preserved = new Database(output, { readonly: true, fileMustExist: true });
      try {
        for (const table of [
          'documents',
          'document_sections',
          'sections_fts',
          'historical_document_delivery_profiles',
          'historical_section_identities',
          'historical_section_aliases',
        ]) {
          expect((preserved.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count)
            .toBe(0);
        }
      } finally {
        preserved.close();
      }
      expect(readdirSync(workspace).filter(name => name.includes('.tmp-'))).toEqual([]);
    } finally {
      if (target.open) target.close();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 30_000);
});

function requireMigration(filename: string): string {
  return readFileSync(join(ROOT, 'migrations', filename), 'utf8');
}
