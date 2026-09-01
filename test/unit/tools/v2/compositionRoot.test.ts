import { readFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createCompositionRoot } from '../../../../src/tools/v2/index.js';

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe('Node composition root original-language-study v3 activation', () => {
  it('registers the depth contract and schema v3 with the existing SQLite evidence repositories', async () => {
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
        depth: { enum: ['beginner', 'intermediate', 'technical'] },
        cursor: { maxLength: 12 * 1024 },
      },
    });
    expect(tool?.outputSchema).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({ properties: expect.objectContaining({ schemaVersion: { const: '3' } }) }),
      ]),
    });
  });
});
