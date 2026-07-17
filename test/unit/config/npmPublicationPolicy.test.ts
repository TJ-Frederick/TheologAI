import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('npm publication policy', () => {
  it('declares npm publication unsupported for this checkout', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    expect(packageJson.private).toBe(true);
  });
});
