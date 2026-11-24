import type Database from 'better-sqlite3';
import { computeD1CorpusIdentity, type DataManifest } from './d1-corpus-identity.js';

/** Verify the supplied SQLite database belongs to the manifest's D1 materialization. */
export function assertSqliteCorpusMarkers(db: Database.Database, manifest: DataManifest): string {
  const metadata = Object.fromEntries(
    (db.prepare('SELECT key, value FROM theologai_metadata').all() as Array<{ key: string; value: string }>)
      .map(row => [row.key, row.value]),
  );
  if (metadata.schema_version !== manifest.schemaVersion) {
    throw new Error(`Schema version marker mismatch: ${metadata.schema_version ?? 'missing'}`);
  }
  const d1CorpusIdentity = computeD1CorpusIdentity(manifest);
  if (metadata.corpus_manifest_sha256 !== d1CorpusIdentity) {
    throw new Error('D1 corpus identity marker mismatch');
  }
  return d1CorpusIdentity;
}
