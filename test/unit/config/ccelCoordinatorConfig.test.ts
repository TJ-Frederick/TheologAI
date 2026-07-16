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
const workerTypes = readFileSync(
  new URL('../../../worker-configuration.d.ts', import.meta.url),
  'utf8',
);

const productionConfig = config.slice(0, config.indexOf('[env.preview]'));
const previewConfig = config.slice(config.indexOf('[env.preview]'));

describe('CCEL coordinator Worker environments', () => {
  it('exposes v4 only in preview while keeping every execution gate false', () => {
    expect(productionConfig).toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY = "false"');
    expect(productionConfig).toContain('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "false"');
    expect(productionConfig).toContain('THEOLOGAI_ENABLE_CCEL_COORDINATOR = "false"');
    expect(productionConfig).not.toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY = "true"');

    expect(previewConfig).toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY = "true"');
    expect(previewConfig).toContain('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "false"');
    expect(previewConfig).toContain('THEOLOGAI_ENABLE_CCEL_COORDINATOR = "false"');
    expect(previewConfig).not.toContain('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "true"');
    expect(previewConfig).not.toContain('THEOLOGAI_ENABLE_CCEL_COORDINATOR = "true"');
  });

  it('generates exact production/preview rollout literals from Wrangler config', () => {
    expect(workerTypes).toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY: "true" | "false";');
    const previewEnv = workerTypes.slice(
      workerTypes.indexOf('interface PreviewEnv'),
      workerTypes.indexOf('interface Env extends __BaseEnv_Env'),
    );
    expect(previewEnv).toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY: "true";');
    expect(previewEnv).toContain('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: "false";');
    expect(previewEnv).toContain('THEOLOGAI_ENABLE_CCEL_COORDINATOR: "false";');
  });

  it('binds both public Workers externally to the same owner', () => {
    expect(config).toContain('name = "theologai"');
    expect(config).toContain('[env.preview]\nname = "theologai-preview"');
    expect(config.match(/name = "THEOLOGAI_CCEL_COORDINATOR"/g)).toHaveLength(2);
    expect(config.match(/class_name = "CcelGlobalCoordinator"/g)).toHaveLength(2);
    expect(config.match(/script_name = "theologai-ccel-coordinator"/g)).toHaveLength(2);
    expect(config).not.toContain('new_sqlite_classes');
    expect(config).not.toContain('new_classes');
    expect(config).not.toContain('[[migrations]]');
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
