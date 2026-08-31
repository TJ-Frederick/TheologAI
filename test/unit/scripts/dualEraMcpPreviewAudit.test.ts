import { describe, expect, it } from 'vitest';
import {
  expectedPreviewServerVersion,
  versionNegotiationFor,
} from '../../../scripts/audit-dual-era-mcp-preview.js';

describe('dual-era preview MCP audit configuration', () => {
  it('uses legacy negotiation for the 2025 protocol and exact pinning for the modern protocol', () => {
    expect(versionNegotiationFor('2025-11-25')).toEqual({
      versionNegotiation: { mode: 'legacy' },
    });
    expect(versionNegotiationFor('2026-07-28')).toEqual({
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    });
  });

  it('derives the deployed preview identity from the package version', () => {
    expect(expectedPreviewServerVersion('3.6.0')).toBe('3.6.0-preview');
  });
});
