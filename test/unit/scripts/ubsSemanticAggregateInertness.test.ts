import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repo = new URL('../../../', import.meta.url);
const moduleName = 'ubsSemanticEvidenceBundle';

describe('bounded UBS semantic aggregate bundle activation contract', () => {
  it('is wired only through the existing original-language-study composition roots', () => {
    const nodeRoot = readFileSync(new URL('src/tools/v2/index.ts', repo), 'utf8');
    const workerRoot = readFileSync(new URL('src/tools/worker/index.ts', repo), 'utf8');
    expect(nodeRoot).toContain(moduleName);
    expect(workerRoot).toContain(moduleName);
    for (const path of ['src/server.ts', 'src/worker-server.ts', 'src/mcp/prompts.ts', 'wrangler.toml', 'worker-configuration.d.ts']) {
      expect(readFileSync(new URL(path, repo), 'utf8'), path).not.toContain(moduleName);
    }
  });

  it('keeps the aggregate implementation data-free, fixed-operation, and without a new schema/configuration release', () => {
    const source = readFileSync(new URL('src/kernel/ubsSemanticEvidenceBundle.ts', repo), 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*(?:data\/|migrations\/|adapters\/d1|adapters\/data)/);
    expect(source).not.toMatch(/\b(?:SELECT|INSERT|CREATE TABLE|D1Database|better-sqlite3)\b/i);
    const manifest = JSON.parse(readFileSync(new URL('data/data-manifest.json', repo), 'utf8')) as {
      schemaVersion: string;
      materializations: { d1: { transformVersion: number } };
    };
    expect(manifest).toMatchObject({
      schemaVersion: '0005_historical_section_identity_delivery',
      materializations: { d1: { transformVersion: 8 } },
    });
    const adapter = readFileSync(new URL('src/adapters/d1/D1UbsSemanticEvidenceBundleRepository.ts', repo), 'utf8');
    expect(adapter).toContain('exactly five statements');
  });

  it('retains the generated-UBS Worker exclusion while tightly accounting for reviewed v2 runtime growth', () => {
    const guard = readFileSync(new URL('scripts/check-worker-bundle-excludes-ubs.ts', repo), 'utf8');
    expect(guard).toContain("endsWith('ubs-parallel-passages.generated.json')");
    expect(guard).toContain('3.125 * 1024 * 1024');
    expect(guard).toContain('active v2 semantic study adds bounded runtime code');
    expect(guard).toContain('narrow review margin');
    expect(guard).toContain('multi-megabyte compiled UBS JSON artifact');
  });
});
