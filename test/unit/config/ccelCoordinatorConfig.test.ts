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

  it('requires an explicit production-gated bootstrap confirmation', () => {
    expect(bootstrapWorkflow).toContain('workflow_dispatch:');
    expect(bootstrapWorkflow).not.toMatch(/\n\s+(push|pull_request):/);
    expect(bootstrapWorkflow).toContain('environment: production');
    expect(bootstrapWorkflow).toContain('BOOTSTRAP THEOLOGAI CCEL COORDINATOR');
    expect(bootstrapWorkflow).toContain('--config wrangler.ccel-coordinator.toml');
  });
});
