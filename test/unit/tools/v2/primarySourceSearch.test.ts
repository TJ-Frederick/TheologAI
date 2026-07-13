import { describe, expect, it, vi } from 'vitest';
import { createPrimarySourceSearchHandler } from '../../../../src/tools/v2/primarySourceSearch.js';
import { validatorFor } from '../../../../src/mcp/validation.js';

describe('primary_source_search handler', () => {
  it('advertises the exact closed bounded plan schema and read-only annotations', () => {
    const handler = createPrimarySourceSearchHandler({ search: vi.fn() } as any);
    expect(handler.name).toBe('primary_source_search');
    expect(handler.inputSchema).toMatchObject({ type: 'object', required: ['queries'], additionalProperties: false });
    expect(handler.inputSchema.properties?.queries).toMatchObject({ minItems: 1, maxItems: 4 });
    expect(handler.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    expect(handler.description).toContain('exact local section locators only');
    const item = (handler.inputSchema.properties?.queries as any).items;
    expect(item.required).toEqual(['id', 'text', 'providers']);
    expect(item.properties.providers).toMatchObject({ maxItems: 1, items: { enum: ['local'] } });
    expect(item.properties.author.description).toContain('unsupported_filter');
    expect(item.properties.page.description).toContain('only page 1');
    expect(handler.description).toContain('does not retrieve or republish CCEL document bodies');
    const validate = validatorFor(handler.inputSchema);
    expect(validate({ queries: [{ id: 'local', text: 'faith', providers: ['local'], author: 'Calvin', page: 2 }] }).valid).toBe(true);
    expect(validate({ queries: [{ id: 'remote', text: 'faith', providers: ['ccel'] }] }).valid).toBe(false);
  });

  it('forces every public query through the local provider', async () => {
    const search = vi.fn().mockResolvedValue({
      queries: [], planStatus: 'complete',
      coverage: { localAttempted: true, localHitCount: 0, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    });
    const handler = createPrimarySourceSearchHandler({ search } as any);

    await handler.handler({ queries: [{ id: 'local', text: 'justification', providers: ['local'], work: 'westminster-confession' }] });

    expect(search).toHaveBeenCalledWith({
      queries: [{ id: 'local', text: 'justification', work: 'westminster-confession', providers: ['local'] }],
    });
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
