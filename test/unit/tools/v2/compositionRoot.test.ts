import { readFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompositionRoot } from '../../../../src/tools/v2/index.js';

const databases: Database.Database[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const database of databases.splice(0)) database.close();
});

describe('Node composition root original-language-study v2 activation', () => {
  it('registers the existing tool with the active v2 schemas and SQLite aggregate repository', async () => {
    const database = new Database(':memory:');
    databases.push(database);
    for (const migration of [
      '0001_initial_schema.sql',
      '0002_ubs_parallel_passages.sql',
      '0003_original_language_usage.sql',
      '0004_ubs_hebrew_semantics.sql',
      '0005_historical_section_identity_delivery.sql',
    ]) {
      database.exec(await readFile(new URL(`../../../../migrations/${migration}`, import.meta.url), 'utf8'));
    }

    const tool = createCompositionRoot({ database }).tools
      .find(candidate => candidate.name === 'original_language_study');

    expect(tool?.inputSchema).toMatchObject({
      additionalProperties: false,
      properties: {
        detail: { enum: ['summary', 'detailed'] },
        cursor: { pattern: '^olsv2c1_(?:[0-9a-f]{2})+$' },
      },
    });
    expect(tool?.outputSchema).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({ properties: expect.objectContaining({ schemaVersion: { const: '2' } }) }),
      ]),
    });
  });
});

describe('Node composition root primary-source research foundation', () => {
  it('selects the same dormant v8 descriptor without enabling live discovery', async () => {
    vi.stubEnv('THEOLOGAI_EXPOSE_CCEL_DISCOVERY', 'true');
    vi.stubEnv('THEOLOGAI_ENABLE_PRIMARY_SOURCE_RESEARCH_V8', 'true');
    vi.stubEnv('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH', 'false');
    vi.stubEnv('THEOLOGAI_ENABLE_CCEL_COORDINATOR', 'false');
    const database = new Database(':memory:');
    databases.push(database);
    for (const migration of [
      '0001_initial_schema.sql',
      '0002_ubs_parallel_passages.sql',
      '0003_original_language_usage.sql',
      '0004_ubs_hebrew_semantics.sql',
      '0005_historical_section_identity_delivery.sql',
    ]) {
      database.exec(await readFile(new URL(`../../../../migrations/${migration}`, import.meta.url), 'utf8'));
    }

    const root = createCompositionRoot({ database });

    expect(root.primarySourceContract).toMatchObject({ contractVersion: '8', liveCcelEnabled: false });
    expect(root.primarySourceSearch.descriptor).toMatchObject({
      contractVersion: '8', outputSchema: { properties: { schemaVersion: { const: '8' } } },
    });
  });
});
