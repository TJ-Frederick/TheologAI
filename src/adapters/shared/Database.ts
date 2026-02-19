/**
 * SQLite connection manager.
 *
 * Singleton better-sqlite3 connection to data/theologai.db with:
 *   - WAL mode for concurrent reads
 *   - Prepared statement caching
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let instance: Database.Database | null = null;

/**
 * Get the singleton database connection.
 * Creates the connection on first call, reuses on subsequent calls.
 */
export function getDatabase(dbPath?: string): Database.Database {
  if (instance) return instance;

  const resolvedPath = dbPath ?? join(__dirname, '..', '..', '..', 'data', 'theologai.db');

  if (!existsSync(resolvedPath)) {
    throw new Error(
      `Database not found at ${resolvedPath}. Run "npm run build:db" to create it.`
    );
  }

  instance = new Database(resolvedPath, { readonly: true });
  instance.pragma('journal_mode = WAL');
  instance.pragma('cache_size = -64000'); // 64MB cache
  instance.pragma('mmap_size = 268435456'); // 256MB mmap

  return instance;
}

/** Close the database connection (for graceful shutdown) */
export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

/**
 * Open a writable database connection (for build scripts only).
 */
export function openWritableDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  return db;
}
