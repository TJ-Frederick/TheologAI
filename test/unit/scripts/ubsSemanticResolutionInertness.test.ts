import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repo = new URL('../../../', import.meta.url);
const serviceName = 'HebrewSemanticEvidenceService';

const activeIdentityPins = {
  'src/tools/toolRegistry.ts': '6847062cd5c9e131f17c5146c5e070283925bed5606a7b68b06538129c92c7f0',
  'src/tools/v2/index.ts': '2bdf52660313eea971ed51253120288488938812c014c7764d6bb85c233251bd',
  'src/tools/worker/index.ts': 'feb1679a520185d11f2b6082b70ea3ef6c2b87652ff49c97c0acedfb76d83b90',
  'src/server.ts': '6b372c049cb7741344bc446b2409524739cc9acba5a3121bc09dbdc8e90acd22',
  'src/worker-server.ts': '3f65b62179b267ac9b15fe682c69342be7ebee8a09430473b797c113e812782a',
  'src/worker.ts': '619a0a66c30ade7ec8f78f13c59ed0791c67d1ae956eb69e0b126ba20f7dc92d',
  'src/mcp/schemas/originalLanguageStudy.ts': 'a98e5966d8a2a850487b4882c49f04c48fc697eee308f6e89c67e06af50fefac',
  'src/presenters/originalLanguageStudyStructured.ts': '49818eb62e89980498669442a4bfc1886944d7751fc675940b17368a030995d9',
  'src/formatters/originalLanguageStudyFormatter.ts': '30a10bf826c6c3174f2e0fb00907f6104735b165fdbfd5915a0ff22bc09b2536',
  'wrangler.toml': 'e2a395dc97b53f0b8da4786a7076dfde76e377fc79eb2058c3e8601fb624ec16',
  'worker-configuration.d.ts': 'e316f64679951b32417f0c85b02fc92e61dae25d879d28921df15caf8706fe55',
  'test/fixtures/ubs-semantics/structured-output-contract.draft.json': 'c5c11254fc84e1ac75200b5b93cb967dfe17e99150e88525cb95d6f58d05c8f2',
} as const;

describe('inactive UBS semantic resolution seam', () => {
  it('does not enter Node, Worker, tool, prompt, resource, or configuration composition', () => {
    for (const path of [
      'src/tools/toolRegistry.ts', 'src/tools/v2/index.ts', 'src/tools/worker/index.ts',
      'src/server.ts', 'src/worker-server.ts', 'src/mcp/prompts.ts', 'src/kernel/index.ts',
      'src/services/index.ts', 'wrangler.toml', 'package.json',
    ]) {
      let source: string;
      try {
        source = readFileSync(new URL(path, repo), 'utf8');
      } catch {
        continue;
      }
      expect(source, path).not.toContain(serviceName);
    }
  });

  it('pins active bundle roots and configuration to the reviewed stack base', () => {
    for (const [path, expected] of Object.entries(activeIdentityPins)) {
      const actual = createHash('sha256').update(readFileSync(new URL(path, repo))).digest('hex');
      expect(actual, path).toBe(expected);
    }
  });

  it('keeps semantic resolution uncomposed under the transform-8 historical successor', () => {
    const service = readFileSync(new URL('src/services/languages/HebrewSemanticEvidenceService.ts', repo), 'utf8');
    expect(service).not.toMatch(/from ['"][^'"]*(?:data\/|migrations\/|adapters\/d1|adapters\/data)/);
    const manifest = JSON.parse(readFileSync(new URL('data/data-manifest.json', repo), 'utf8')) as {
      schemaVersion: string;
      materializations: { d1: { transformVersion: number } };
    };
    expect(manifest).toMatchObject({
      schemaVersion: '0006_historical_source_packs',
      materializations: { d1: { transformVersion: 9 } },
    });
  });
});
