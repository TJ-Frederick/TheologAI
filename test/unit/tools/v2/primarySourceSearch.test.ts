import { describe, expect, it, vi } from 'vitest';
import { createPrimarySourceSearchHandler } from '../../../../src/tools/v2/primarySourceSearch.js';
import { validatorFor } from '../../../../src/mcp/validation.js';

describe('primary_source_search handler', () => {
  it('advertises the exact closed bounded plan schema and read-only annotations', () => {
    const handler = createPrimarySourceSearchHandler({ search: vi.fn() } as any);
    expect(handler.name).toBe('primary_source_search');
    expect(handler.outputSchema).toMatchObject({
      type: 'object', additionalProperties: false,
      properties: {
        schemaVersion: { const: '1' },
        kind: { const: 'primary_source_search' },
      },
    });
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
    const query = (providers: any[]) => [{ id: 'q', normalizedMode: 'all_terms', providers }];
    const provider = (name: 'local' | 'ccel_live', status: string, searched: boolean) => ({
      provider: name, status, searched, page: 1, hitCount: 0, hits: [], notices: [],
    });
    const coverage = { localAttempted: false, localHitCount: 0, ccelAttempted: false, ccelHitCount: 0, notices: [] };
    const service = { search: vi.fn()
      .mockResolvedValueOnce({ planStatus: 'partial', queries: query([provider('local', 'no_results', true), provider('ccel_live', 'disabled', false)]), coverage })
      .mockResolvedValueOnce({ planStatus: 'unavailable', queries: query([provider('local', 'unavailable', false)]), coverage }) };
    const handler = createPrimarySourceSearchHandler(service as any);
    expect(await handler.handler({ queries: [] })).not.toHaveProperty('isError');
    expect(await handler.handler({ queries: [] })).toMatchObject({ isError: true });
  });

  it('returns Markdown first, strict structured output, and one deduplicated native exact-section link', async () => {
    const hit = {
      queryId: 'q1', provider: 'local', title: 'Institutes', sectionLabel: 'Faith',
      snippet: 'The evidence snippet.',
      locator: {
        kind: 'local_section', documentId: 'institutes', sectionId: '3.1',
        url: 'theologai://documents/institutes#section-3.1',
      },
      rankWithinProvider: 1, page: 1, snippetOnly: true, attribution: 'Local collection',
      documentType: 'treatise', documentDate: '1559', resourceSizeBytes: 321,
    } as const;
    const service = { search: vi.fn().mockResolvedValue({
      planStatus: 'complete',
      queries: [{
        id: 'q1', normalizedMode: 'all_terms',
        providers: [{ provider: 'local', status: 'ok', searched: true, page: 1, hitCount: 2, hits: [hit, { ...hit }], notices: [] }],
      }],
      coverage: { localAttempted: true, localStatus: 'ok', localHitCount: 2, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    }) };
    const handler = createPrimarySourceSearchHandler(service as any);

    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['local'] }] });

    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('# Primary-source discovery') });
    expect(result.content.slice(1)).toEqual([{
      type: 'resource_link',
      uri: 'theologai://documents/institutes#section-3.1',
      name: 'local-primary-source/institutes/3.1',
      title: 'Institutes — Faith',
      description: 'treatise, 1559. Exact local section selected by primary-source discovery.',
      mimeType: 'text/markdown',
      size: 321,
      annotations: { audience: ['assistant'] },
    }]);
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '1', kind: 'primary_source_search',
      evidencePolicy: {
        snippetUse: 'discovery_only', selectedSectionAccess: 'mcp_resource_read',
        coverageScope: 'bounded_non_exhaustive', editionProvenance: 'incomplete',
      },
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('omits malicious or noncanonical locators from both structured hits and links', async () => {
    const service = { search: vi.fn().mockResolvedValue({
      planStatus: 'complete',
      queries: [{ id: 'q1', normalizedMode: 'phrase', providers: [{
        provider: 'local', status: 'ok', searched: true, page: 1, hitCount: 2, notices: [],
        hits: [{
          queryId: 'q1', provider: 'local', title: 'Forged', snippet: 'snippet',
          locator: { kind: 'local_section', documentId: '../secret', sectionId: '1', url: 'https://evil.test' },
          rankWithinProvider: 1, page: 1, snippetOnly: true, attribution: 'Local', resourceSizeBytes: 12,
        }, {
          queryId: 'q1', provider: 'local', title: 'Oversized', snippet: 'snippet',
          locator: { kind: 'local_section', documentId: 'doc', sectionId: '2', url: 'theologai://documents/doc#section-2' },
          rankWithinProvider: 2, page: 1, snippetOnly: true, attribution: 'Local', resourceSizeBytes: Number.MAX_SAFE_INTEGER + 1,
        }],
      }] }],
      coverage: { localAttempted: true, localStatus: 'ok', localHitCount: 2, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    }) };
    const handler = createPrimarySourceSearchHandler(service as any);

    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['local'] }] });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).not.toContain('evil.test');
    expect(result.content[0].text).not.toContain('Oversized');
    expect(JSON.stringify(result.structuredContent)).not.toContain('evil.test');
    expect(result.structuredContent).toMatchObject({
      planStatus: 'unavailable',
      queries: [{ providers: [{ status: 'interface_changed', hitCount: 0, hits: [], notices: [expect.stringContaining('2 local hits omitted')] }] }],
      coverage: { localStatus: 'interface_changed', localHitCount: 0 },
    });
    expect(result.isError).toBe(true);
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });
});
