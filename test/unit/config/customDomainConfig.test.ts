import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALLOWED_ORIGIN as NODE_DEFAULT_ALLOWED_ORIGIN } from '../../../src/http/config.js';
import { DEFAULT_ALLOWED_ORIGIN as WORKER_DEFAULT_ALLOWED_ORIGIN } from '../../../src/http/worker/requestPolicy.js';

async function readProjectFile(path: string): Promise<string> {
  return readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

describe('custom-domain infrastructure contract', () => {
  it('keeps production and preview routes, D1, and rate limits isolated while retaining workers.dev', async () => {
    const config = await readProjectFile('wrangler.toml');
    const previewStart = config.indexOf('[env.preview]');
    expect(previewStart).toBeGreaterThan(0);

    const production = config.slice(0, previewStart);
    const preview = config.slice(previewStart);

    expect(production).toContain('workers_dev = true');
    expect(production).toContain('{ pattern = "mcp.theologai.xyz", custom_domain = true }');
    expect(production).not.toContain('preview-mcp.theologai.xyz');
    expect(production).toContain('database_name = "theologai-production-20260715-a"');
    expect(production).toContain('database_id = "c6535a4a-1953-4279-b277-7368445fc61a"');
    expect(production).toContain('namespace_id = "361201"');

    expect(preview).toContain('workers_dev = true');
    expect(preview).toContain('{ pattern = "preview-mcp.theologai.xyz", custom_domain = true }');
    expect(preview).not.toContain('{ pattern = "mcp.theologai.xyz", custom_domain = true }');
    expect(preview).toContain('database_name = "theologai-preview-20260714-a"');
    expect(preview).toContain('database_id = "0dab804f-8df0-4727-93bd-299612b6e179"');
    expect(preview).toContain('namespace_id = "361202"');

    for (const environment of [production, preview]) {
      expect(environment).toContain(
        'THEOLOGAI_ALLOWED_ORIGINS = "https://theologai.xyz,https://theologai.pages.dev"',
      );
      expect(environment).toContain('limit = 120');
      expect(environment).toContain('period = 60');
    }
  });

  it('publishes canonical deployment URLs without weakening preview authorization', async () => {
    const [productionWorkflow, previewWorkflow] = await Promise.all([
      readProjectFile('.github/workflows/deploy.yml'),
      readProjectFile('.github/workflows/pr.yml'),
    ]);

    expect(productionWorkflow).toContain('name: production');
    expect(productionWorkflow).toContain('url: https://mcp.theologai.xyz/mcp');
    expect(productionWorkflow).toContain('fetch-depth: 2');
    const detectorStart = productionWorkflow.indexOf('- name: Detect production custom-domain declaration change');
    const prerequisiteStart = productionWorkflow.indexOf('- name: Require live website and audited preview custom domain');
    const deployStart = productionWorkflow.indexOf('- name: Deploy to Cloudflare Workers');
    expect(detectorStart).toBeGreaterThan(0);
    expect(prerequisiteStart).toBeGreaterThan(detectorStart);
    expect(prerequisiteStart).toBeGreaterThan(0);
    expect(deployStart).toBeGreaterThan(prerequisiteStart);
    const detector = productionWorkflow.slice(detectorStart, prerequisiteStart);
    expect(detector).toContain('before="${{ github.event.before }}"');
    expect(detector).toContain('git cat-file -e "${before}^{commit}"');
    expect(detector).toContain('git fetch --no-tags --depth=1 origin "$before"');
    expect(detector).toContain('git show "${before}:wrangler.toml"');
    expect(detector).toContain('scripts/detect-production-custom-domain-change.ts');
    expect(detector).toContain('--github-output "$GITHUB_OUTPUT"');
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
    expect(previewWorkflow).toContain('contains(github.event.pull_request.labels.*.name, \'deploy-preview\')');
    expect(previewWorkflow).toContain("if (!labels.includes('deploy-preview')) failures.push('the deploy-preview label is absent')");
    expect(previewWorkflow.match(/github\.rest\.pulls\.get/g)).toHaveLength(2);
    expect(previewWorkflow).toContain('**Canonical MCP Endpoint:** `https://preview-mcp.theologai.xyz/mcp`');
    expect(previewWorkflow).toContain('**Compatibility MCP endpoint:** `https://theologai-preview.tjfrederick.workers.dev/mcp`');
  });

  it('keeps fallback origin behavior on the legacy Pages site during the staged cutover', () => {
    expect(NODE_DEFAULT_ALLOWED_ORIGIN).toBe('https://theologai.pages.dev');
    expect(WORKER_DEFAULT_ALLOWED_ORIGIN).toBe('https://theologai.pages.dev');
  });

  it('documents the baseline, aliases, no-deletion rule, and preview-first merge sequence', async () => {
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
    expect(migration).toMatch(/No existing route, domain,\s+deployment, database, or compatibility endpoint may be deleted/);
    expect(migration).toContain('16e633bc70dbbea668caacf87f994a2536441092');
    expect(migration).toContain('72/72');
    expect(migration).toContain('Do not merge it yet');
    expect(migration).toContain('Merge the same reviewed pull request only after preview and the website have');
  });
});
