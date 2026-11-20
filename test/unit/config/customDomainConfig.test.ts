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

  it('restricts ordinary releases to their existing custom domain and legacy endpoint exposure', async () => {
    const driver = await readProjectFile('.github/scripts/release-workers.sh');
    for (const [role, file, hostname] of [
      ['production', 'deploy.yml', 'mcp.theologai.xyz'], ['preview', 'pr.yml', 'preview-mcp.theologai.xyz'],
    ]) {
      expect(await readProjectFile('.github/workflows/' + file)).toContain('url: https://' + hostname + '/mcp');
      expect(driver).toContain('domain=' + hostname);
      expect(driver).toContain(role + ')');
    }
    expect(driver).toContain('.routes == [{pattern: $domain, custom_domain: true}] and .workers_dev == true');
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
