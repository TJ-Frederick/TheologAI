import { readFile } from 'node:fs/promises';
import { parse } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALLOWED_ORIGIN as NODE_DEFAULT_ALLOWED_ORIGIN } from '../../../src/http/config.js';
import { DEFAULT_ALLOWED_ORIGIN as WORKER_DEFAULT_ALLOWED_ORIGIN } from '../../../src/http/worker/requestPolicy.js';

async function readProjectFile(path: string): Promise<string> {
  return readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

describe('custom-domain infrastructure contract', () => {
  it('keeps production and preview routes, D1, and rate limits isolated while retaining workers.dev', async () => {
    const config = parse(await readProjectFile('wrangler.toml')) as {
      workers_dev: boolean;
      routes: Array<{ pattern: string; custom_domain: boolean }>;
      vars: { THEOLOGAI_ALLOWED_ORIGINS: string };
      d1_databases: Array<{ binding: string; database_name: string; database_id: string }>;
      ratelimits: Array<{ name: string; namespace_id: string; simple: { limit: number; period: number } }>;
      env: {
        preview: {
          workers_dev: boolean;
          routes: Array<{ pattern: string; custom_domain: boolean }>;
          vars: { THEOLOGAI_ALLOWED_ORIGINS: string };
          d1_databases: Array<{ binding: string; database_name: string; database_id: string }>;
          ratelimits: Array<{ name: string; namespace_id: string; simple: { limit: number; period: number } }>;
        };
      };
    };
    const production = config;
    const preview = config.env.preview;

    expect(production.workers_dev).toBe(true);
    expect(production.routes).toEqual([{ pattern: 'mcp.theologai.xyz', custom_domain: true }]);
    expect(production.d1_databases).toContainEqual(expect.objectContaining({
      binding: 'THEOLOGAI_DB',
      database_name: 'theologai-production-20260811-schema0009-a',
      database_id: '9bc79346-338b-439e-a2a5-424f4418eb21',
    }));
    expect(production.ratelimits).toContainEqual({
      name: 'THEOLOGAI_RATE_LIMITER',
      namespace_id: '361201',
      simple: { limit: 120, period: 60 },
    });

    expect(preview.workers_dev).toBe(true);
    expect(preview.routes).toEqual([{ pattern: 'preview-mcp.theologai.xyz', custom_domain: true }]);
    expect(preview.d1_databases).toContainEqual(expect.objectContaining({
      binding: 'THEOLOGAI_DB',
      database_name: 'theologai-preview-20260811-schema0009-a',
      database_id: '74f456e2-6951-4003-bb6f-91951342bf8f',
    }));
    expect(preview.ratelimits).toContainEqual({
      name: 'THEOLOGAI_RATE_LIMITER',
      namespace_id: '361202',
      simple: { limit: 120, period: 60 },
    });

    for (const environment of [production, preview]) {
      expect(environment.vars.THEOLOGAI_ALLOWED_ORIGINS).toBe(
        'https://theologai.xyz,https://theologai.pages.dev',
      );
    }
  });

  it('publishes canonical deployment URLs and preserves release-context detector ordering', async () => {
    const [productionWorkflow, previewWorkflow] = await Promise.all([
      readProjectFile('.github/workflows/deploy.yml'),
      readProjectFile('.github/workflows/pr.yml'),
    ]);

    expect(productionWorkflow).toContain('name: production');
    expect(productionWorkflow).toContain('url: https://mcp.theologai.xyz/mcp');
    const releaseContextStart = productionWorkflow.indexOf('- name: Resolve production release comparison context');
    const releaseContextEnd = productionWorkflow.indexOf('- name: Download verified production deployment plan gate');
    const detectorStart = productionWorkflow.indexOf('- name: Detect production custom-domain declaration change');
    const prerequisiteStart = productionWorkflow.indexOf('- name: Require live website and audited preview custom domain');
    const deployStart = productionWorkflow.indexOf('- name: Deploy to Cloudflare Workers');
    expect(releaseContextStart).toBeGreaterThan(0);
    expect(detectorStart).toBeGreaterThan(releaseContextStart);
    expect(prerequisiteStart).toBeGreaterThan(detectorStart);
    expect(prerequisiteStart).toBeGreaterThan(0);
    expect(deployStart).toBeGreaterThan(prerequisiteStart);
    expect(releaseContextEnd).toBeGreaterThan(releaseContextStart);
    const workflow = parseYaml(productionWorkflow) as {
      jobs: { deploy: { steps: Array<{ name?: string; env?: Record<string, string>; run?: string }> } };
    };
    const releaseContext = workflow.jobs.deploy.steps.find(step => step.name === 'Resolve production release comparison context');
    expect(releaseContext).toBeDefined();
    expect(releaseContext!.env).toEqual({
      PRODUCTION_RELEASE_EVENT_NAME: '${{ github.event_name }}',
      PRODUCTION_RELEASE_REF: '${{ github.ref }}',
      PRODUCTION_RELEASE_HEAD: '${{ github.sha }}',
    });
    expect(releaseContext!.run).toContain('actual_head="$(git rev-parse HEAD)"');
    expect(releaseContext!.run).toContain('test "$actual_head" = "$PRODUCTION_RELEASE_HEAD"');
    expect(releaseContext!.run).toContain('PRODUCTION_RELEASE_FIRST_PARENT="$(git rev-parse HEAD^1)"');
    expect(releaseContext!.run).toContain('resolve-production-release-context.mjs manual-context-output >> "$GITHUB_OUTPUT"');
    expect(releaseContext!.run).toContain("grep -Eq '^[0-9a-f]{40}$'");
    expect(releaseContext!.run).toContain('git cat-file -e "${before}^{commit}"');
    expect(releaseContext!.run).toContain('git merge-base --is-ancestor "$before" HEAD');
    expect(releaseContext!.run).not.toContain('PRODUCTION_RELEASE_PUSH_BEFORE');
    expect(releaseContext!.run).not.toContain('JSON.parse');
    const detector = productionWorkflow.slice(detectorStart, prerequisiteStart);
    expect(detector).toContain('before="${{ steps.production-release-context.outputs.before }}"');
    expect(detector).toContain('git cat-file -e "${before}^{commit}"');
    expect(detector).toContain('git fetch --no-tags --depth=1 origin "$before"');
    expect(detector).toContain('git show "${before}:wrangler.toml"');
    expect(detector).toContain('scripts/detect-production-custom-domain-change.ts');
    expect(detector).toContain('--github-output "$GITHUB_OUTPUT"');
    expect(detector).toContain("if [ '${{ steps.production-release-context.outputs.custom_domain_required }}' = 'true' ]; then");
    expect(detector).toContain("echo 'required=true' >> \"$GITHUB_OUTPUT\"");
    const prerequisite = productionWorkflow.slice(prerequisiteStart, deployStart);
    expect(prerequisite).toContain("if: steps.production-custom-domain-change.outputs.required == 'true'");
    expect(prerequisite).toContain('https://theologai.xyz/');
    expect(prerequisite).toContain('https://preview-mcp.theologai.xyz/mcp');
    expect(prerequisite).toContain("%{url_effective}");
    expect(prerequisite).toContain('test "$website_effective_url" = "https://theologai.xyz/"');
    expect(prerequisite).toContain("--request OPTIONS");
    expect(prerequisite).toContain("--header 'Origin: https://theologai.xyz'");
    expect(prerequisite).toContain('access-control-allow-origin:[[:space:]]*https://theologai\\.xyz');
    expect(prerequisite.match(/grep -Eiq/g)).toHaveLength(2);
    expect(prerequisite).not.toContain('rg --ignore-case');
    expect(prerequisite).toContain('npm run audit:parallel-preview');
    expect(prerequisite).toContain('$RUNNER_TEMP/pre-production-preview-mcp-audit.json');
    expect(prerequisite).toContain('test -s "$RUNNER_TEMP/pre-production-preview-mcp-audit.json"');
    expect(prerequisite).toContain('$RUNNER_TEMP/theologai-website.html');
    expect(prerequisite).toContain('$RUNNER_TEMP/preview-mcp-options.headers');

    expect(previewWorkflow).toContain('name: preview');
    expect(previewWorkflow).toContain('url: https://preview-mcp.theologai.xyz/mcp');
    expect(previewWorkflow).toContain('**Canonical MCP Endpoint:** `https://preview-mcp.theologai.xyz/mcp`');
    expect(previewWorkflow).toContain('**Compatibility MCP endpoint:** `https://theologai-preview.tjfrederick.workers.dev/mcp`');
  });

  it('keeps fallback origin behavior on the legacy Pages site during the staged cutover', () => {
    expect(NODE_DEFAULT_ALLOWED_ORIGIN).toBe('https://theologai.pages.dev');
    expect(WORKER_DEFAULT_ALLOWED_ORIGIN).toBe('https://theologai.pages.dev');
  });

  it('documents the release-time baseline, aliases, no-deletion rule, and preview-first merge sequence', async () => {
    const migration = await readProjectFile('docs/CUSTOM-DOMAIN-MIGRATION.md');
    for (const value of [
      'https://theologai.xyz',
      'https://mcp.theologai.xyz/mcp',
      'https://preview-mcp.theologai.xyz/mcp',
      'https://theologai.pages.dev/',
      'https://theologai.tjfrederick.workers.dev/mcp',
      'https://theologai-preview.tjfrederick.workers.dev/mcp',
    ]) {
      expect(migration).toContain(value);
    }
    expect(migration).toMatch(/No existing\s+route, domain,\s*deployment, database, or compatibility endpoint may be deleted/);
    expect(migration).toContain('Release-time known-good baseline');
    expect(migration).not.toContain('PR #50 production');
    expect(migration).toContain('Do not merge it yet');
    expect(migration).toContain('Merge the same reviewed pull request only after preview and the website have');
    expect(migration).toContain('sampled guard diagnostic');
    expect(migration).toContain('$workers.event.response.status');
    expect(migration).toMatch(/Never treat this sampled view as\s+an exact\s+billing, invocation, or guard-block count/);
    expect(migration).toContain('Cache-Control: no-store');
    expect(migration).toContain('Authorization');
  });
});
