import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proveCompleteCorpus, type CorpusProofSource, type ProofRow } from '../../../scripts/corpus-source-proof.js';

const captured = JSON.parse(readFileSync(new URL('../../fixtures/corpus-proof/preview-schema-line-comments.json', import.meta.url), 'utf8')) as {
  definitions: { source: ProofRow; remote: ProofRow }[];
};
const row = (sql: string, type = 'table'): ProofRow => ({ type, name: 'fixture', tbl_name: 'fixture', sql });
const providers = ['_cf_KV', 'd1_migrations'].map(name => ({ type: 'table', name, tbl_name: name, sql: `CREATE TABLE ${name}(id INTEGER)` }));

// Stop at the next independent gate; these tests cannot scan data or run FTS writes.
async function schemaGate(source: ProofRow[], remote: ProofRow[]): Promise<void> {
  const db = new Database(':memory:');
  const expected: CorpusProofSource = { catalog: source, tables: [], digests: {}, foreignKeyWitnessSha256: 'a'.repeat(64), schemaVersion: 'fixture', migrationNames: [], quickCheckReadCeiling: 1 };
  try {
    await proveCompleteCorpus(db, expected, async query => {
      if (query.label === 'catalog-before') return [...remote, ...providers];
      expect(query.label).toBe('ledger-before');
      throw Error('reached independent migration ledger gate');
    });
  } finally { db.close(); }
}

describe('schema SQL line-comment comparison', () => {
  for (const definition of captured.definitions) it(`accepts captured comment-only drift in ${definition.source.name}`, async () => {
    expect(definition.remote.sql).not.toBe(definition.source.sql);
    await expect(schemaGate([definition.source], [definition.remote])).rejects.toThrow('reached independent migration ledger gate');
  });
  it('accepts all six captured definitions together', async () => {
    expect(captured.definitions).toHaveLength(6);
    await expect(schemaGate(captured.definitions.map(d => d.source), captured.definitions.map(d => d.remote)))
      .rejects.toThrow('reached independent migration ledger gate');
  });

  for (const [name, sql] of [
    ['single-quoted literal', "CREATE TABLE fixture(value TEXT DEFAULT '-- literal')"],
    ['escaped single quote', "CREATE TABLE fixture(value TEXT DEFAULT 'it''s -- literal')"],
    ['double-quoted identifier', 'CREATE TABLE fixture("column--literal" TEXT)'],
    ['escaped double quote', 'CREATE TABLE fixture("column""--literal" TEXT)'],
    ['backtick identifier', 'CREATE TABLE fixture(`column--literal` TEXT)'],
    ['escaped backtick', 'CREATE TABLE fixture(`column``--literal` TEXT)'],
    ['bracket identifier', 'CREATE TABLE fixture([column--literal] TEXT)'],
    ['multiline quoted literal', "CREATE TABLE fixture(value TEXT DEFAULT 'first\n-- literal\nlast')"],
    ['block comment with quote and line markers', "CREATE TABLE fixture(/* ' -- preserved */value TEXT)"],
  ]) {
    it(`preserves ${name} while ignoring an external line comment`, async () => {
      await expect(schemaGate([row(sql!)], [row(sql! + "-- ignored ' quote")]))
        .rejects.toThrow('reached independent migration ledger gate');
    });
    it(`rejects changed comment-like text in ${name}`, async () => {
      await expect(schemaGate([row(sql!)], [row(sql!.replace('--', '-changed-'))]))
        .rejects.toThrow('remote schema differs from source');
    });
  }
  it('retains the newline terminating an inline comment and ignores an EOF comment', async () => {
    await expect(schemaGate([row('CREATE TABLE fixture(\nvalue TEXT)')], [row('CREATE TABLE fixture(-- ignored\nvalue TEXT)-- EOF')]))
      .rejects.toThrow('reached independent migration ledger gate');
  });

  for (const [name, source, remote, type] of [
    ['CHECK constraint', 'CREATE TABLE fixture(id INTEGER CHECK(id > 0))', 'CREATE TABLE fixture(id INTEGER CHECK(id >= 0))', 'table'],
    ['foreign key', 'CREATE TABLE fixture(id REFERENCES parent(id) ON DELETE RESTRICT)', 'CREATE TABLE fixture(id REFERENCES parent(id) ON DELETE CASCADE)', 'table'],
    ['trigger body', 'CREATE TRIGGER fixture AFTER INSERT ON parent BEGIN DELETE FROM child WHERE id=1; END', 'CREATE TRIGGER fixture AFTER INSERT ON parent BEGIN DELETE FROM child WHERE id=2; END', 'trigger'],
    ['ordinary whitespace', 'CREATE TABLE fixture(id INTEGER)', 'CREATE  TABLE fixture(id INTEGER)', 'table'],
    ['newline token boundary', 'CREATE TABLE fixture(value TEXT)', 'CREATE TABLE fixture(value-- ignored\nTEXT)', 'table'],
    ['quoted literal containing comment markers', "CREATE TABLE fixture(value TEXT DEFAULT '/*literal*/')", "CREATE TABLE fixture(value TEXT DEFAULT '/*changed*/')", 'table'],
    ['block comment', 'CREATE TABLE fixture(/* original */id INTEGER)', 'CREATE TABLE fixture(/* changed */id INTEGER)', 'table'],
  ]) it(`rejects a changed ${name}`, async () => {
    await expect(schemaGate([row(source!, type)], [row(remote!, type)])).rejects.toThrow('remote schema differs from source');
  });
  for (const [name, change] of [
    ['object name', { name: 'changed' }], ['object type', { type: 'view' }], ['owning table', { tbl_name: 'changed' }],
    ['missing definition', { sql: null }], ['unexpected metadata', { extra: 'changed' }],
  ] as const) it(`rejects a changed ${name}`, async () => {
    const source = row('CREATE TABLE fixture(id INTEGER)');
    await expect(schemaGate([source], [{ ...source, ...change }])).rejects.toThrow('remote schema differs from source');
  });
  it('rejects missing and extra objects', async () => {
    const source = row('CREATE TABLE fixture(id INTEGER)');
    await expect(schemaGate([source], [])).rejects.toThrow('remote schema differs from source');
    await expect(schemaGate([], [source])).rejects.toThrow('remote schema differs from source');
  });
});
