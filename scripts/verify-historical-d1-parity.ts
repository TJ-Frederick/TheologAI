#!/usr/bin/env tsx
/**
 * Exhaustively compare Transform-8 section resolution through the synchronous
 * Node repository and the asynchronous D1 repository over one built corpus.
 *
 * This is deliberately part of the local data pipeline: it validates the D1
 * adapter's real SQL/mapping behavior without contacting a remote database.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HistoricalDocumentRepository } from '../src/adapters/data/HistoricalDocumentRepository.js';
import { D1HistoricalDocumentRepository } from '../src/adapters/d1/D1HistoricalDocumentRepository.js';
import { verifyHistoricalSectionCompatibilityAttestationFromDisk } from './historical-section-compatibility-compiler.js';
import { EXPECTED_HISTORICAL_SECTION_COLLISIONS } from './historical-section-key-plan.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Transform8Identity {
  documentId: string;
  sectionKey: string;
  sourceOrdinal: number;
}

interface Transform8Alias extends Transform8Identity {
  legacySectionId: string;
}

function sqliteAsD1(database: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      const statement = database.prepare(sql);
      const execute = (bindings: unknown[]) => ({
        async all<T>() {
          return { results: statement.all(...bindings) as T[], success: true, meta: {} };
        },
        async first<T>() {
          return (statement.get(...bindings) as T | undefined) ?? null;
        },
        async run() {
          return { success: true, meta: {}, results: [], ...statement.run(...bindings) } as never;
        },
      });
      return {
        bind: (...bindings: unknown[]) => execute(bindings),
        ...execute([]),
      } as unknown as D1PreparedStatement;
    },
  } as D1Database;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Transform 8 Node/D1 parity drifted for ${label}`);
  }
}

export async function verifyHistoricalD1Parity(databasePath: string): Promise<void> {
  if (!existsSync(databasePath)) throw new Error(`Database not found: ${databasePath}`);
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const identities = database.prepare(`SELECT document_id AS documentId, section_key AS sectionKey,
      source_ordinal AS sourceOrdinal FROM historical_section_identities
      ORDER BY document_id, source_ordinal, section_key`).all() as Transform8Identity[];
    const aliases = database.prepare(`SELECT document_id AS documentId, legacy_section_id AS legacySectionId,
      section_key AS sectionKey, source_ordinal AS sourceOrdinal FROM historical_section_aliases
      ORDER BY document_id, legacy_section_id`).all() as Transform8Alias[];
    if (identities.length !== 3566 || aliases.length !== 2821) {
      throw new Error(`Transform 9 D1 parity corpus count drifted: ${identities.length} identities, ${aliases.length} aliases`);
    }

    const compilation = verifyHistoricalSectionCompatibilityAttestationFromDisk(ROOT);
    const expectedAliases = compilation.map.documents.flatMap(document => document.legacyAliases.map(alias => ({
      documentId: document.documentId,
      legacySectionId: alias.legacySectionId,
      sectionKey: alias.targetSectionKey,
      sourceOrdinal: alias.targetSourceOrdinal,
    })));
    assertEqual(aliases, expectedAliases, 'approved legacy-alias projection');
    const collisionGroups = compilation.map.documents.flatMap(document => {
      const counts = new Map<string, number>();
      for (const section of document.sections) {
        counts.set(section.legacySectionId, (counts.get(section.legacySectionId) ?? 0) + 1);
      }
      return [...counts.values()].filter(count => count > 1);
    });
    if (collisionGroups.length !== EXPECTED_HISTORICAL_SECTION_COLLISIONS.collisionGroups) {
      throw new Error(`Transform 8 D1 parity collision-group drifted: ${collisionGroups.length}`);
    }

    const node = new HistoricalDocumentRepository(database);
    const d1 = new D1HistoricalDocumentRepository(sqliteAsD1(database));
    for (const identity of identities) {
      const nodeResolved = node.resolveSection(identity.documentId, identity.sectionKey);
      const d1Resolved = await d1.resolveSection(identity.documentId, identity.sectionKey);
      assertEqual(d1Resolved, nodeResolved, `${identity.documentId}#${identity.sectionKey}`);
      if (!nodeResolved || nodeResolved.resolution !== 'canonical'
        || nodeResolved.sectionKey !== identity.sectionKey || nodeResolved.sourceOrdinal !== identity.sourceOrdinal) {
        throw new Error(`Transform 8 Node canonical projection drifted: ${identity.documentId}#${identity.sectionKey}`);
      }
    }
    for (const alias of aliases) {
      const nodeResolved = node.resolveSection(alias.documentId, alias.legacySectionId);
      const d1Resolved = await d1.resolveSection(alias.documentId, alias.legacySectionId);
      assertEqual(d1Resolved, nodeResolved, `${alias.documentId}#${alias.legacySectionId}`);
      const expectedResolution = alias.legacySectionId === alias.sectionKey ? 'canonical' : 'legacy_alias';
      if (!nodeResolved || nodeResolved.resolution !== expectedResolution
        || nodeResolved.sectionKey !== alias.sectionKey || nodeResolved.sourceOrdinal !== alias.sourceOrdinal) {
        throw new Error(`Transform 8 alias projection drifted: ${alias.documentId}#${alias.legacySectionId}`);
      }
    }
    assertEqual(
      await d1.resolveSection('nicene-creed', 'not-a-reviewed-section-key'),
      node.resolveSection('nicene-creed', 'not-a-reviewed-section-key'),
      'unknown-section not-found boundary',
    );
  } finally {
    database.close();
  }
}

function databasePathFromArgs(argv: readonly string[]): string {
  const value = argv.find(arg => arg.startsWith('--database='))?.slice('--database='.length)
    ?? argv[argv.indexOf('--database') + 1];
  if (!value || value.startsWith('--')) throw new Error('Usage: verify-historical-d1-parity.ts --database <path>');
  return isAbsolute(value) ? value : resolve(ROOT, value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const databasePath = databasePathFromArgs(process.argv.slice(2));
  await verifyHistoricalD1Parity(databasePath);
  console.error(`[verify-historical-d1-parity] Verified Node/D1 resolution parity for ${databasePath}.`);
}
