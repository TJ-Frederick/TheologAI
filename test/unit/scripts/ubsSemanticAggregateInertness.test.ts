import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repo = new URL('../../../', import.meta.url);
const moduleName = 'ubsSemanticEvidenceBundle';

const reviewedBasePins = {
  'src/kernel/index.ts': '7df4dc9b32e1a9d4589296d2a32e743eb1e812711e0e4faba8b58066a7b1cde6',
  'src/tools/v2/index.ts': '2bdf52660313eea971ed51253120288488938812c014c7764d6bb85c233251bd',
  'src/tools/worker/index.ts': 'feb1679a520185d11f2b6082b70ea3ef6c2b87652ff49c97c0acedfb76d83b90',
  'src/worker.ts': '07a439b6f5f20be1e6651ceaad71b4ca189579592c743e5e0f3770d80ba12d44',
  'src/worker-server.ts': '3f65b62179b267ac9b15fe682c69342be7ebee8a09430473b797c113e812782a',
  'data/data-manifest.json': 'ba4f6fc73086716bd03f8e8d65a181719fba834aa61a90e65b168169744fa424',
  'wrangler.toml': '50dd24d0963893b5c8b17ec61d4ebe7c98eeb7f7692a988684bde09835017e4f',
  'worker-configuration.d.ts': 'e316f64679951b32417f0c85b02fc92e61dae25d879d28921df15caf8706fe55',
  'package.json': '4a9e337f9ee795a2d962ad9d6b5161fb36d166a7bf5547aca0c69813709f1ec4',
} as const;

describe('inactive UBS semantic aggregate bundle contract', () => {
  it('is absent from Node, Worker, MCP, service, prompt, resource, and tool composition', () => {
    for (const path of [
      'src/kernel/index.ts', 'src/tools/v2/index.ts',
      'src/tools/worker/index.ts', 'src/worker.ts', 'src/worker-server.ts',
      'src/server.ts', 'src/mcp/prompts.ts', 'src/tools/toolRegistry.ts',
    ]) {
      expect(readFileSync(new URL(path, repo), 'utf8'), path).not.toContain(moduleName);
    }
  });

  it('preserves reviewed Worker inputs, configuration, inventory, and active data identity', () => {
    for (const [path, expected] of Object.entries(reviewedBasePins)) {
      const actual = createHash('sha256').update(readFileSync(new URL(path, repo))).digest('hex');
      expect(actual, path).toBe(expected);
    }
  });

  it('contains no storage layout, source bytes, migration, D1 adapter, or runtime binding', () => {
    const source = readFileSync(new URL('src/kernel/ubsSemanticEvidenceBundle.ts', repo), 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*(?:data\/|migrations\/|adapters\/d1|adapters\/data)/);
    expect(source).not.toMatch(/\b(?:SELECT|INSERT|CREATE TABLE|D1Database|better-sqlite3)\b/i);
    const manifest = JSON.parse(readFileSync(new URL('data/data-manifest.json', repo), 'utf8')) as {
      schemaVersion: string;
      materializations: { d1: { transformVersion: number } };
    };
    expect(manifest).toMatchObject({
      schemaVersion: '0003_original_language_usage',
      materializations: { d1: { transformVersion: 6 } },
    });
  });
});
