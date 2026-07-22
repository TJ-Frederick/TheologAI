import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const HASH = 'a'.repeat(64);

function database(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of [
    '0001_initial_schema.sql',
    '0002_ubs_parallel_passages.sql',
    '0003_original_language_usage.sql',
    '0004_ubs_hebrew_semantics.sql',
    '0005_historical_section_identity_delivery.sql',
  ]) {
    db.exec(readFileSync(join(ROOT, 'migrations', migration), 'utf8'));
  }
  db.prepare('INSERT INTO documents (id, title, type, date, metadata) VALUES (?, ?, ?, ?, ?)')
    .run('legacy-document', 'Legacy document', 'document', null, '{}');
  db.prepare('INSERT INTO documents (id, title, type, date, metadata) VALUES (?, ?, ?, ?, ?)')
    .run('other-document', 'Other document', 'document', null, '{}');
  db.prepare('INSERT INTO document_sections (document_id, section_number, title, content, topics) VALUES (?, ?, ?, ?, ?)')
    .run('legacy-document', '1', 'One', 'Body one', '[]');
  db.prepare('INSERT INTO document_sections (document_id, section_number, title, content, topics) VALUES (?, ?, ?, ?, ?)')
    .run('other-document', '1', 'One', 'Other body', '[]');
  return db;
}

function insertCompleteProfile(db: Database.Database, documentId = 'legacy-document'): void {
  db.prepare(`INSERT INTO historical_document_delivery_profiles (
    document_id, work_id, edition_id, immutable_corpus_identity, section_package_identity,
    delivery_mode, section_count, landing_max_bytes, browse_page_size, cursor_version,
    provenance_json, rights_json
  ) VALUES (?, NULL, NULL, ?, NULL, 'complete_document', 1, 0, 0, 0, '{}', '{}')`)
    .run(documentId, HASH);
}

describe('Transform 8 historical identity/delivery migration', () => {
  it('accepts the intentionally non-edition legacy complete-document profile', () => {
    const db = database();
    try {
      insertCompleteProfile(db);
      expect(db.prepare('SELECT document_id, work_id, edition_id, section_package_identity, cursor_version FROM historical_document_delivery_profiles').get())
        .toEqual({ document_id: 'legacy-document', work_id: null, edition_id: null, section_package_identity: null, cursor_version: 0 });
    } finally {
      db.close();
    }
  });

  it('requires work, edition, package, and exact 16KiB/32/cursor-v1 bounds for sectioned editions', () => {
    const db = database();
    try {
      db.prepare(`INSERT INTO historical_document_delivery_profiles (
        document_id, work_id, edition_id, immutable_corpus_identity, section_package_identity,
        delivery_mode, section_count, landing_max_bytes, browse_page_size, cursor_version,
        provenance_json, rights_json
      ) VALUES (?, ?, ?, ?, ?, 'sectioned_only', 1, 16384, 32, 1, '{}', '{}')`)
        .run('legacy-document', 'work-1', 'edition-1', HASH, 'b'.repeat(64));
      expect(() => db.prepare(`INSERT INTO historical_document_delivery_profiles (
        document_id, work_id, edition_id, immutable_corpus_identity, section_package_identity,
        delivery_mode, section_count, landing_max_bytes, browse_page_size, cursor_version,
        provenance_json, rights_json
      ) VALUES (?, NULL, NULL, ?, NULL, 'complete_document', 1, 16384, 32, 1, '{}', '{}')`)
        .run('other-document', HASH)).toThrow();
    } finally {
      db.close();
    }
  });

  it('prevents same-document drift, canonical shadowing, and all hostile sidecar updates or deletes', () => {
    const db = database();
    try {
      insertCompleteProfile(db, 'legacy-document');
      insertCompleteProfile(db, 'other-document');
      db.prepare('INSERT INTO historical_section_identities (document_id, section_key, source_ordinal, document_section_id) VALUES (?, ?, ?, ?)')
        .run('legacy-document', 'canonical-1', 1, 1);
      db.prepare('INSERT INTO historical_section_aliases (document_id, legacy_section_id, section_key, source_ordinal) VALUES (?, ?, ?, ?)')
        .run('legacy-document', '1', 'canonical-1', 1);

      expect(() => db.prepare('INSERT INTO historical_section_identities (document_id, section_key, source_ordinal, document_section_id) VALUES (?, ?, ?, ?)')
        .run('other-document', 'wrong-document', 1, 1)).toThrow();
      db.prepare('INSERT INTO document_sections (document_id, section_number, title, content, topics) VALUES (?, ?, ?, ?, ?)')
        .run('legacy-document', 'legacy-shadow', 'Shadow', 'Shadow body', '[]');
      db.prepare('INSERT INTO historical_section_identities (document_id, section_key, source_ordinal, document_section_id) VALUES (?, ?, ?, ?)')
        .run('legacy-document', 'legacy-shadow', 2, 3);
      expect(() => db.prepare('INSERT INTO historical_section_aliases (document_id, legacy_section_id, section_key, source_ordinal) VALUES (?, ?, ?, ?)')
        .run('legacy-document', 'legacy-shadow', 'canonical-1', 1)).toThrow('legacy alias may not shadow');

      expect(() => db.prepare('UPDATE historical_document_delivery_profiles SET rights_json = ?').run('{"changed":true}'))
        .toThrow('immutable');
      expect(() => db.prepare('UPDATE historical_section_identities SET section_key = ?').run('changed'))
        .toThrow('immutable');
      expect(() => db.prepare('UPDATE historical_section_aliases SET section_key = ?').run('changed'))
        .toThrow('immutable');
      expect(() => db.prepare('DELETE FROM historical_section_aliases').run()).toThrow('cannot be deleted');
      expect(() => db.prepare('DELETE FROM historical_section_identities').run()).toThrow('cannot be deleted');
      expect(() => db.prepare('DELETE FROM historical_document_delivery_profiles').run()).toThrow('cannot be deleted');
      expect(() => db.prepare('DELETE FROM document_sections WHERE id = 1').run()).toThrow();
    } finally {
      db.close();
    }
  });
});
