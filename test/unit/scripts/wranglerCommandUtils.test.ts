import { describe, expect, it, vi } from 'vitest';
import {
  ensureWranglerLogDirectory,
  formatWranglerCommandFailure,
} from '../../../scripts/wrangler-command-utils.js';

describe('Wrangler command utilities', () => {
  it('creates the configured log directory before a local command runs', () => {
    const mkdir = vi.fn();
    ensureWranglerLogDirectory('test-output/wrangler/logs', mkdir);
    expect(mkdir).toHaveBeenCalledExactlyOnceWith('test-output/wrangler/logs', { recursive: true });
  });

  it('uses useful non-empty command output and redacts credentials', () => {
    expect(formatWranglerCommandFailure({
      stderr: '',
      stdout: Buffer.from('local D1 command failed'),
      message: 'command failed',
    })).toBe('local D1 command failed');

    const diagnostic = formatWranglerCommandFailure({
      stderr: 'Authorization: Bearer top-secret\nCLOUDFLARE_API_TOKEN=also-secret',
    });
    expect(diagnostic).toContain('Authorization: Bearer [REDACTED]');
    expect(diagnostic).toContain('CLOUDFLARE_API_TOKEN=[REDACTED]');
    expect(diagnostic).not.toContain('top-secret');
    expect(diagnostic).not.toContain('also-secret');
  });
});
