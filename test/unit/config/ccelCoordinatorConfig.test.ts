import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8');

describe('CCEL coordinator Worker environments', () => {
  it('keeps both rollout flags false in root and preview', () => {
    expect(config.match(/THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "false"/g)).toHaveLength(2);
    expect(config.match(/THEOLOGAI_ENABLE_CCEL_COORDINATOR = "false"/g)).toHaveLength(2);
  });

  it('declares separate root and preview namespace bindings', () => {
    expect(config).toContain('name = "theologai"');
    expect(config).toContain('[env.preview]\nname = "theologai-preview"');
    expect(config.match(/name = "THEOLOGAI_CCEL_COORDINATOR"/g)).toHaveLength(2);
    expect(config).toContain('[[durable_objects.bindings]]');
    expect(config).toContain('[[env.preview.durable_objects.bindings]]');
    expect(config).not.toContain('script_name =');
  });

  it('declares the SQLite Durable Object migration', () => {
    expect(config).toContain('new_sqlite_classes = ["CcelGlobalCoordinator"]');
  });
});
