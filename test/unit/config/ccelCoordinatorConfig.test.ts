import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8');
const ownerConfig = readFileSync(
  new URL('../../../wrangler.ccel-coordinator.toml', import.meta.url),
  'utf8',
);
const runtimeTestConfig = readFileSync(
  new URL('../../ccel-coordinator-runtime/wrangler.test.toml', import.meta.url),
  'utf8',
);
const bootstrapWorkflow = readFileSync(
  new URL('../../../.github/workflows/bootstrap-ccel-coordinator.yml', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(
  new URL('../../../package.json', import.meta.url),
  'utf8',
)) as { scripts: Record<string, string> };
const coordinatorTypes = readFileSync(
  new URL('../../../ccel-coordinator-configuration.d.ts', import.meta.url),
  'utf8',
);

describe('CCEL coordinator Worker environments', () => {
  it('keeps live CCEL search false and leaves public coordinator integration absent', () => {
    expect(config.match(/THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "false"/g)).toHaveLength(2);
    expect(config).not.toContain('THEOLOGAI_ENABLE_CCEL_COORDINATOR');
    expect(config).not.toContain('THEOLOGAI_CCEL_COORDINATOR');
    expect(config).not.toContain('script_name = "theologai-ccel-coordinator"');
  });

  it('keeps the existing public Workers unchanged during owner bootstrap', () => {
    expect(config).toContain('name = "theologai"');
    expect(config).toContain('[env.preview]\nname = "theologai-preview"');
    expect(config).not.toContain('new_sqlite_classes');
    expect(config).not.toContain('new_classes');
  });

  it('uses declarative SQLite exports for every brand-new local namespace', () => {
    for (const candidate of [ownerConfig, runtimeTestConfig]) {
      expect(candidate).toContain('[exports.CcelGlobalCoordinator]');
      expect(candidate).toContain('type = "durable-object"');
      expect(candidate).toContain('storage = "sqlite"');
      expect(candidate).not.toContain('[[migrations]]');
      expect(candidate).not.toContain('new_sqlite_classes');
      expect(candidate).not.toContain('new_classes');
    }
    expect(ownerConfig).toContain('name = "theologai-ccel-coordinator"');
    expect(ownerConfig).toContain('workers_dev = false');
  });

  it('validates before approval and creates only an absent owner from main', () => {
    expect(bootstrapWorkflow).toContain('workflow_dispatch:');
    expect(bootstrapWorkflow).not.toMatch(/\n\s+(push|pull_request):/);
    const validateStart = bootstrapWorkflow.indexOf('  validate:\n');
    const deployStart = bootstrapWorkflow.indexOf('  deploy:\n');
    expect(validateStart).toBeGreaterThan(0);
    expect(deployStart).toBeGreaterThan(validateStart);
    expect(bootstrapWorkflow.slice(validateStart, deployStart)).not.toContain('environment:');
    expect(bootstrapWorkflow.slice(deployStart)).toContain('needs: validate');
    expect(bootstrapWorkflow.slice(deployStart)).toContain('environment: production');
    expect(bootstrapWorkflow).toContain("refs/heads/main");
    expect(bootstrapWorkflow).toContain('BOOTSTRAP THEOLOGAI CCEL COORDINATOR');
    expect(bootstrapWorkflow).toContain('/workers/scripts/theologai-ccel-coordinator');
    expect(bootstrapWorkflow).toContain('404)');
    expect(bootstrapWorkflow).toContain('200)');
    expect(bootstrapWorkflow).toContain('ref: ${{ github.sha }}');
    expect(bootstrapWorkflow).toContain('--config wrangler.ccel-coordinator.toml');
  });

  it('commits only generated environment declarations for the owner', () => {
    expect(packageJson.scripts['types:ccel-coordinator']).toContain('--include-runtime false');
    expect(packageJson.scripts['types:ccel-coordinator:check'])
      .toContain('--include-runtime false');
    expect(coordinatorTypes).toContain('durableNamespaces: "CcelGlobalCoordinator"');
    expect(coordinatorTypes).not.toContain('declare class DurableObject');
    expect(coordinatorTypes.split('\n').length).toBeLessThan(50);
  });
});
