import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { D1_MAX_STATEMENT_BYTES } from '../../../scripts/d1-seed-utils.js';
import { exportTable } from '../../../scripts/export-for-d1.js';

const TABLE = 'historical_edition_hierarchy_bodies';
const SCHEMA = `CREATE TABLE ${TABLE} (
  hierarchy_id TEXT NOT NULL,
  body_key TEXT NOT NULL,
  body_kind TEXT NOT NULL,
  source_ordinal INTEGER NOT NULL,
  heading TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  content_utf8_bytes INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (hierarchy_id, body_key)
);`;

describe('D1 hierarchy seed export', () => {
  it('reconstructs one generated nonzero long authority body exactly without continuation updates', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'theologai-hierarchy-seed-export-'));
    const sourcePath = join(workspace, 'source.db');
    const targetPath = join(workspace, 'target.db');
    const content = `Aquinas's authority; ${'ἀλήθεια '.repeat(2_000)}`;
    try {
      const source = new Database(sourcePath);
      source.exec(SCHEMA);
      source.prepare(`INSERT INTO ${TABLE} VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('fixture-hierarchy', 'fixture-body', 'article', 1, 'Fixture heading', 'a'.repeat(64), Buffer.byteLength(content, 'utf8'), content);
      source.close();

      const generated = exportTable(sourcePath, TABLE);
      expect(generated).toHaveLength(1);
      expect(generated[0]).toMatchObject({ rows: 1 });
      expect(generated[0]!.sql).toMatch(new RegExp(`^INSERT INTO "${TABLE}"`));
      expect(generated[0]!.sql).not.toContain('UPDATE');
      expect(Buffer.byteLength(generated[0]!.sql, 'utf8')).toBeLessThan(D1_MAX_STATEMENT_BYTES);

      const target = new Database(targetPath);
      target.exec(SCHEMA);
      target.exec(generated[0]!.sql);
      expect(target.prepare(`SELECT hierarchy_id, body_key, content FROM ${TABLE}`).get())
        .toEqual({ hierarchy_id: 'fixture-hierarchy', body_key: 'fixture-body', content });
      target.close();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
