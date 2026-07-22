import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
    const snapshot = join(workspace, 'post-rollback-snapshot.json');
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
        env: {
          ...process.env,
          THEOLOGAI_TRANSFORM8_TEST_FAIL_AFTER_SIDECARS: '1',
          THEOLOGAI_TRANSFORM8_TEST_FAILURE_SNAPSHOT: snapshot,
        },
        stdio: 'ignore',
      })).toThrow();

      // The build script records this while the temporary database is still
      // open, after the outer Transform-8 transaction has rolled back and
      // before its catch block removes temporary files. This proves rollback
      // rather than inferring it only from the preserved destination database.
      expect(existsSync(snapshot)).toBe(true);
      const failedTransaction = JSON.parse(readFileSync(snapshot, 'utf8')) as {
        kind: string;
        forcedLateFailure: boolean;
        error: string;
        rowCounts: Record<string, number>;
      };
      expect(failedTransaction.kind).toBe('transform8_late_failure_post_rollback_pre_cleanup');
      expect(failedTransaction.forcedLateFailure).toBe(true);
      expect(failedTransaction.error).toContain('Forced Transform 8 late failure');
      expect(failedTransaction.rowCounts).toEqual({
        documents: 0,
        document_sections: 0,
        sections_fts: 0,
        historical_document_delivery_profiles: 0,
        historical_section_identities: 0,
        historical_section_aliases: 0,
      });

      // Destination preservation remains a secondary external observation.
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

  it('keeps the forced build error primary when the optional failure snapshot cannot be written', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'theologai-transform8-snapshot-failure-'));
    const output = join(workspace, 'target.db');
    const invalidSnapshot = join(workspace, 'missing-parent', 'snapshot.json');
    try {
      let failure: { stderr?: unknown } | undefined;
      try {
        execFileSync(process.execPath, [
          TSX,
          join(ROOT, 'scripts', 'build-database.ts'),
          '--output', output,
        ], {
          cwd: ROOT,
          env: {
            ...process.env,
            THEOLOGAI_TRANSFORM8_TEST_FAIL_AFTER_SIDECARS: '1',
            THEOLOGAI_TRANSFORM8_TEST_FAILURE_SNAPSHOT: invalidSnapshot,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        failure = error as { stderr?: unknown };
      }
      expect(failure).toBeDefined();
      expect(String(failure?.stderr)).toContain('Forced Transform 8 late failure after historical sidecar assertions');
      expect(existsSync(output)).toBe(false);
      expect(readdirSync(workspace).filter(name => name.includes('.tmp-'))).toEqual([]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 30_000);
});

function requireMigration(filename: string): string {
  return readFileSync(join(ROOT, 'migrations', filename), 'utf8');
}
