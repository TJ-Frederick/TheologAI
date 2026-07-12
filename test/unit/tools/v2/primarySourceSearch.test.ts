import { describe, expect, it, vi } from 'vitest';
import { createPrimarySourceSearchHandler } from '../../../../src/tools/v2/primarySourceSearch.js';

describe('primary_source_search handler', () => {
  it('advertises the exact closed bounded plan schema and read-only annotations', () => {
    const handler = createPrimarySourceSearchHandler({ search: vi.fn() } as any);
    expect(handler.name).toBe('primary_source_search');
    expect(handler.inputSchema).toMatchObject({ type: 'object', required: ['queries'], additionalProperties: false });
    expect(handler.inputSchema.properties?.queries).toMatchObject({ minItems: 1, maxItems: 4 });
    expect(handler.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    expect(handler.description).toContain('snippets and exact locators only');
  });

  it('formats partial results and marks all-provider unavailability as a tool error', async () => {
    const base = {
      queries: [],
      coverage: { localAttempted: false, localHitCount: 0, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    };
    const service = { search: vi.fn().mockResolvedValueOnce({ ...base, planStatus: 'partial' }).mockResolvedValueOnce({ ...base, planStatus: 'unavailable' }) };
    const handler = createPrimarySourceSearchHandler(service as any);
    expect(await handler.handler({ queries: [] })).not.toHaveProperty('isError');
    expect(await handler.handler({ queries: [] })).toMatchObject({ isError: true });
  });
});
