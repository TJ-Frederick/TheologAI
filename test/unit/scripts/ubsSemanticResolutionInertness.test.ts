import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repo = new URL('../../../', import.meta.url);
const serviceName = 'HebrewSemanticEvidenceService';

describe('uncomposed legacy UBS semantic resolution seam', () => {
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

  it('keeps semantic resolution uncomposed alongside Transform 9 and the Transform 8 historical release', () => {
    const service = readFileSync(new URL('src/services/languages/HebrewSemanticEvidenceService.ts', repo), 'utf8');
    expect(service).not.toMatch(/from ['"][^'"]*(?:data\/|migrations\/|adapters\/d1|adapters\/data)/);
    const manifest = JSON.parse(readFileSync(new URL('data/data-manifest.json', repo), 'utf8')) as {
      schemaVersion: string;
      materializations: { d1: { transformVersion: number } };
    };
    expect(manifest).toMatchObject({
      schemaVersion: '0007_historical_hierarchy',
      materializations: { d1: { transformVersion: 10 } },
    });
  });
});
