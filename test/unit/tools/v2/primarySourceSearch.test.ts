import { describe, expect, it, vi } from 'vitest';
import { createPrimarySourceSearchHandler } from '../../../../src/tools/v2/primarySourceSearch.js';
import { validatorFor } from '../../../../src/mcp/validation.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

function schemaTerms(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(schemaTerms);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...schemaTerms(nested)]);
}

describe('primary_source_search handler', () => {
  const scope = {
    status: 'matched' as const, requested: {}, eligibleDocumentCount: 1,
    eligibleDocuments: [{ id: 'institutes', title: 'Institutes', metadataStatus: 'reviewed' as const }],
    eligibleDocumentsTruncated: false,
  };
  const resultWindow = (returnedHitCount: number, additionalMatchStatus = 'not_evaluated') => ({
    returnedHitCount, additionalMatchStatus,
  });
  it('advertises the exact closed bounded plan schema and read-only annotations', () => {
    const handler = createPrimarySourceSearchHandler({ search: vi.fn() } as any);
    expect(handler.name).toBe('primary_source_search');
    expect(handler.outputSchema).toMatchObject({
      type: 'object', additionalProperties: false,
      properties: {
        schemaVersion: { const: '3' },
        kind: { const: 'primary_source_search' },
      },
    });
    expect(handler.inputSchema).toMatchObject({ type: 'object', required: ['queries'], additionalProperties: false });
    expect(handler.inputSchema.properties?.queries).toMatchObject({ minItems: 1, maxItems: 4 });
    expect(handler.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(handler.description).toContain('exact local section locators');
    const item = (handler.inputSchema.properties?.queries as any).items;
    expect(item.required).toEqual(['id', 'text', 'providers']);
    expect(item.properties.providers).toMatchObject({ maxItems: 1, items: { enum: ['local'] } });
    expect(item.properties.selection).toMatchObject({ enum: ['relevance', 'work_diversity'], default: 'relevance' });
    expect(item.properties.author.description).toContain('separate query-plan items');
    expect(item.properties.page.description).toContain('only page 1');
    expect(handler.description).toContain('composition-year ranges');
    const outputText = JSON.stringify(handler.outputSchema).toLowerCase();
    expect(outputText).not.toContain('ccel');
    expect(outputText).not.toContain('ccel_section');
    expect(schemaTerms(handler.outputSchema).filter(term => /ccel/i.test(term))).toEqual([]);
    const outputQuery = (handler.outputSchema!.properties!.queries as any).items;
    expect(outputQuery.properties.providers).toMatchObject({ minItems: 1, maxItems: 1 });
    expect(outputQuery.properties.providers.items).toMatchObject({
      type: 'object', additionalProperties: false, properties: { provider: { const: 'local' } },
    });
    expect(outputQuery.properties.providers.items).not.toHaveProperty('oneOf');
    expect(handler.outputSchema!.properties!.coverage.properties).not.toHaveProperty('ccelAttempted');
    expect(handler.outputSchema!.properties!.coverage.properties).not.toHaveProperty('ccelStatus');
    expect(handler.outputSchema!.properties!.coverage.properties).not.toHaveProperty('ccelHitCount');
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
    const query = (providers: any[]) => [{ id: 'q', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers }];
    const provider = (name: 'local' | 'ccel_live', status: string, searched: boolean) => ({
      provider: name, status, searched, page: 1, hitCount: 0, hits: [], notices: [],
      resultWindow: resultWindow(0),
      ...(name === 'local' ? { scope } : {}),
    });
    const coverage = { localAttempted: false, localHitCount: 0, ccelAttempted: false, ccelHitCount: 0, notices: [] };
    const service = { search: vi.fn()
      .mockResolvedValueOnce({ planStatus: 'partial', queries: query([provider('local', 'no_results', true), provider('ccel_live', 'disabled', false)]), coverage })
      .mockResolvedValueOnce({ planStatus: 'unavailable', queries: query([provider('local', 'unavailable', false)]), coverage }) };
    const handler = createPrimarySourceSearchHandler(service as any);
    expect(await handler.handler({ queries: [] })).not.toHaveProperty('isError');
    expect(await handler.handler({ queries: [] })).toMatchObject({ isError: true });
  });

  it('omits an injected foreign provider group without leaking identity, status, counts, notices, or locators', async () => {
    const local = {
      provider: 'local', status: 'no_results', searched: true, page: 1, hitCount: 0,
      resultWindow: resultWindow(0, 'no_additional_match_observed'), hits: [], notices: [], scope,
    } as const;
    const foreign = {
      provider: 'ccel_live', status: 'rate_limited', searched: true, page: 3, hitCount: 7,
      resultWindow: resultWindow(1, 'additional_match_observed'),
      notices: ['Foreign provider secret status and seven-result count.'],
      hits: [{
        queryId: 'q', provider: 'ccel_live', title: 'Foreign secret title', snippet: 'Foreign secret snippet',
        locator: {
          kind: 'ccel_section', work: 'secret/work', section: 'secret-section',
          url: 'https://ccel.example.test/secret/work/secret-section',
        },
        rankWithinProvider: 1, page: 3, snippetOnly: true, attribution: 'Foreign secret attribution',
      }],
    } as const;
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue({
      planStatus: 'partial',
      queries: [{ id: 'q', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [local, foreign] }],
      coverage: {
        localAttempted: true, localStatus: 'no_results', localHitCount: 0,
        ccelAttempted: true, ccelStatus: 'rate_limited', ccelHitCount: 7,
        notices: ['Foreign aggregate secret.'],
      },
    }) } as any);

    const result = await handler.handler({ queries: [{ id: 'q', text: 'faith', providers: ['local'] }] });
    const publicText = JSON.stringify(result);

    expect(result.structuredContent).toMatchObject({
      planStatus: 'partial',
      queries: [{ providers: [{ provider: 'local', status: 'no_results', hitCount: 0 }] }],
      coverage: {
        localAttempted: true, localStatus: 'no_results', localHitCount: 0,
        notices: ['Internal data outside the local public contract was omitted.'],
      },
    });
    expect((result.structuredContent as any).coverage).not.toHaveProperty('ccelAttempted');
    for (const secret of ['ccel', 'rate_limited', 'seven-result', 'Foreign', 'secret/work', 'https://']) {
      expect(publicText.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
    const sdkValidate = new AjvJsonSchemaValidator().getValidator(handler.outputSchema!);
    expect(sdkValidate(result.structuredContent).valid).toBe(true);
  });

  it('substitutes a neutral local placeholder when an injected query contains no local provider', async () => {
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue({
      planStatus: 'unavailable',
      queries: [{
        id: 'q', normalizedMode: 'all_terms', normalizedSelection: 'relevance',
        providers: [{
          provider: 'private_archive', status: 'rate_limited', searched: true, page: 3, hitCount: 19,
          resultWindow: resultWindow(0, 'additional_match_observed'), hits: [],
          notices: ['Private archive identifier, status, and result count.'],
        }],
      }],
      coverage: {
        localAttempted: false, localHitCount: 0,
        ccelAttempted: true, ccelStatus: 'rate_limited', ccelHitCount: 19,
        notices: ['Private archive aggregate detail.'],
      },
    }) } as any);

    const result = await handler.handler({ queries: [{ id: 'q', text: 'faith', providers: ['local'] }] });
    const publicText = JSON.stringify(result);

    expect(result).not.toHaveProperty('isError');
    expect(result.structuredContent).toMatchObject({
      planStatus: 'partial',
      queries: [{ providers: [{
        provider: 'local', status: 'interface_changed', searched: false, hitCount: 0,
        notices: ['Internal data outside the local public contract was omitted.'],
      }] }],
      coverage: {
        localAttempted: false, localStatus: 'interface_changed', localHitCount: 0,
        notices: ['Internal data outside the local public contract was omitted.'],
      },
    });
    for (const secret of ['private_archive', 'rate_limited', '19', 'Private archive', 'ccel']) {
      expect(publicText.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
    const sdkValidate = new AjvJsonSchemaValidator().getValidator(handler.outputSchema!);
    expect(sdkValidate(result.structuredContent).valid).toBe(true);
  });

  it('preserves a service-declared partial aggregate window even when provider statuses are complete', async () => {
    const service = { search: vi.fn().mockResolvedValue({
      planStatus: 'partial',
      queries: [{
        id: 'q', normalizedMode: 'all_terms', normalizedSelection: 'relevance',
        providers: [{
          provider: 'local', status: 'no_results', searched: true, page: 1,
          hitCount: 0, hits: [], notices: ['The plan-wide response budget truncated later provider results.'], scope,
          resultWindow: resultWindow(0, 'additional_match_observed'),
        }],
      }],
      coverage: { localAttempted: true, localHitCount: 0, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    }) };
    const result = await createPrimarySourceSearchHandler(service as any).handler({ queries: [] });
    expect(result.structuredContent).toMatchObject({ planStatus: 'partial' });
  });

  it.each(['unsupported_filter', 'unavailable', 'disabled', 'rate_limited', 'interface_changed'] as const)(
    'preserves the unsearched local %s status when catalog scope is not meaningful',
    async status => {
      const service = { search: vi.fn().mockResolvedValue({
        planStatus: status === 'unsupported_filter' ? 'partial' : 'unavailable',
        queries: [{ id: 'q', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [{
          provider: 'local', status, searched: false, page: 2, hitCount: 0, hits: [], notices: [],
          resultWindow: resultWindow(0),
        }] }],
        coverage: { localAttempted: false, localStatus: status, localHitCount: 0, ccelAttempted: false, ccelHitCount: 0, notices: [] },
      }) };
      const handler = createPrimarySourceSearchHandler(service as any);

      const result = await handler.handler({ queries: [{ id: 'q', text: 'faith', providers: ['local'], page: 2 }] });

      expect(result.structuredContent).toMatchObject({
        queries: [{ providers: [{ provider: 'local', status, searched: false }] }],
        coverage: { localStatus: status },
      });
      expect((result.structuredContent as any).queries[0].providers[0]).not.toHaveProperty('scope');
      expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
    },
  );

  it('still fails closed when a searched local result omits meaningful catalog scope', async () => {
    const service = { search: vi.fn().mockResolvedValue({
      planStatus: 'complete',
      queries: [{ id: 'q', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [{
        provider: 'local', status: 'no_results', searched: true, page: 1, hitCount: 0, hits: [], notices: [],
        resultWindow: resultWindow(0, 'no_additional_match_observed'),
      }] }],
      coverage: { localAttempted: true, localStatus: 'no_results', localHitCount: 0, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    }) };
    const handler = createPrimarySourceSearchHandler(service as any);

    const result = await handler.handler({ queries: [{ id: 'q', text: 'faith', providers: ['local'] }] });

    expect(result.structuredContent).toMatchObject({
      planStatus: 'unavailable',
      queries: [{ providers: [{ status: 'interface_changed', scope: { status: 'metadata_incomplete' } }] }],
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
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
        id: 'q1', normalizedMode: 'all_terms', normalizedSelection: 'relevance',
        providers: [{ provider: 'local', status: 'ok', searched: true, page: 1, hitCount: 2, resultWindow: resultWindow(2), hits: [hit, { ...hit }], notices: [], scope }],
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
      schemaVersion: '3', kind: 'primary_source_search',
      evidencePolicy: {
        snippetUse: 'discovery_only', selectedSectionAccess: 'mcp_resource_read',
        coverageScope: 'bounded_non_exhaustive', editionProvenance: 'incomplete',
        lookupAliasUse: 'exact_routing_only_not_metadata_evidence',
      },
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('omits malicious or noncanonical locators from both structured hits and links', async () => {
    const service = { search: vi.fn().mockResolvedValue({
      planStatus: 'complete',
      queries: [{ id: 'q1', normalizedMode: 'phrase', normalizedSelection: 'relevance', providers: [{
        provider: 'local', status: 'ok', searched: true, page: 1, hitCount: 2, notices: [], scope,
        resultWindow: resultWindow(2),
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

  it('rejects hits attributed to another query or provider, including unknown future providers', async () => {
    const validLocalHit = {
      queryId: 'q1', provider: 'local', title: 'Valid local evidence', snippet: 'Kept.',
      locator: {
        kind: 'local_section', documentId: 'doc', sectionId: '1',
        url: 'theologai://documents/doc#section-1',
      },
      rankWithinProvider: 1, page: 1, snippetOnly: true, attribution: 'Local', resourceSizeBytes: 10,
    } as const;
    const foreignProviderHit = {
      queryId: 'q1', provider: 'ccel_live', title: 'Foreign provider evidence', snippet: 'Rejected.',
      locator: {
        kind: 'ccel_section', work: 'calvin/institutes', section: 'iv.xvii',
        url: 'https://ccel.org/ccel/calvin/institutes/iv.xvii.html',
      },
      rankWithinProvider: 3, page: 1, snippetOnly: true, attribution: 'CCEL',
    } as const;
    const service = { search: vi.fn().mockResolvedValue({
      planStatus: 'complete',
      queries: [{ id: 'q1', normalizedMode: 'phrase', normalizedSelection: 'relevance', providers: [{
        provider: 'local', status: 'ok', searched: true, page: 1, hitCount: 4, notices: [], scope,
        resultWindow: resultWindow(4),
        hits: [
          validLocalHit,
          { ...validLocalHit, queryId: 'q2', title: 'Foreign query evidence', rankWithinProvider: 2 },
          foreignProviderHit,
          { ...validLocalHit, provider: 'future_archive', title: 'Future provider evidence', rankWithinProvider: 4 },
        ],
      }] }],
      coverage: { localAttempted: true, localStatus: 'ok', localHitCount: 4, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    }) };
    const handler = createPrimarySourceSearchHandler(service as any);

    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['local'] }] });

    expect(result.content).toHaveLength(2);
    expect(result.content[1]).toMatchObject({
      type: 'resource_link', uri: 'theologai://documents/doc#section-1', size: 10,
    });
    expect(JSON.stringify(result)).not.toContain('Foreign query evidence');
    expect(JSON.stringify(result)).not.toContain('Foreign provider evidence');
    expect(JSON.stringify(result)).not.toContain('Future provider evidence');
    expect(result.structuredContent).toMatchObject({
      planStatus: 'partial',
      queries: [{ providers: [{
        provider: 'local', status: 'interface_changed', hitCount: 1,
        hits: [{ provider: 'local', queryId: 'q1' }],
        notices: [expect.stringContaining('3 local hits omitted')],
      }] }],
      coverage: { localStatus: 'interface_changed', localHitCount: 1 },
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);

    const schemaInvalidCrossProviderGroup = structuredClone(result.structuredContent) as any;
    schemaInvalidCrossProviderGroup.queries[0].providers[0].hits = [foreignProviderHit];
    schemaInvalidCrossProviderGroup.queries[0].providers[0].hitCount = 1;
    expect(validatorFor(handler.outputSchema!)(schemaInvalidCrossProviderGroup).valid).toBe(false);
  });

  it('fails closed when a service returns excess query groups', async () => {
    const emptyLocalProvider = {
      provider: 'local', status: 'no_results', searched: true, page: 1, hitCount: 0, hits: [], notices: [], scope,
      resultWindow: resultWindow(0, 'no_additional_match_observed'),
    } as const;
    const omittedHit = {
      queryId: 'q5', provider: 'local', title: 'Omitted fifth-query evidence', snippet: 'Must not leak.',
      locator: {
        kind: 'local_section', documentId: 'secret', sectionId: '5',
        url: 'theologai://documents/secret#section-5',
      },
      rankWithinProvider: 1, page: 1, snippetOnly: true, attribution: 'Local', resourceSizeBytes: 25,
    } as const;
    const queries = [1, 2, 3, 4].map(number => ({
      id: `q${number}`, normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [emptyLocalProvider],
    }));
    queries.push({
      id: 'q5', normalizedMode: 'all_terms', normalizedSelection: 'relevance',
      providers: [{ ...emptyLocalProvider, status: 'ok', hitCount: 1, resultWindow: resultWindow(1), hits: [omittedHit] }],
    } as any);
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue({
      planStatus: 'complete', queries,
      coverage: { localAttempted: true, localStatus: 'ok', localHitCount: 1, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    }) } as any);

    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['local'] }] });

    expect(result.structuredContent).toMatchObject({
      planStatus: 'partial',
      queries: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }],
      coverage: {
        localAttempted: true, localStatus: 'interface_changed', localHitCount: 0,
        notices: expect.arrayContaining([expect.stringContaining('1 query group was omitted')]),
      },
    });
    expect(JSON.stringify(result)).not.toContain('q5');
    expect(JSON.stringify(result)).not.toContain('Omitted fifth-query evidence');
    expect(result.content).toHaveLength(1);
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('fails closed when a query returns excess provider groups', async () => {
    const emptyLocalProvider = {
      provider: 'local', status: 'no_results', searched: true, page: 1, hitCount: 0, hits: [], notices: [], scope,
      resultWindow: resultWindow(0, 'no_additional_match_observed'),
    } as const;
    const omittedHit = {
      queryId: 'q1', provider: 'local', title: 'Omitted third-provider evidence', snippet: 'Must not leak.',
      locator: {
        kind: 'local_section', documentId: 'secret', sectionId: '3',
        url: 'theologai://documents/secret#section-3',
      },
      rankWithinProvider: 1, page: 1, snippetOnly: true, attribution: 'Local', resourceSizeBytes: 25,
    } as const;
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue({
      planStatus: 'complete',
      queries: [{ id: 'q1', normalizedMode: 'all_terms', normalizedSelection: 'relevance', providers: [
        emptyLocalProvider,
        emptyLocalProvider,
        { ...emptyLocalProvider, status: 'ok', hitCount: 1, resultWindow: resultWindow(1), hits: [omittedHit] },
      ] }],
      coverage: { localAttempted: true, localStatus: 'ok', localHitCount: 1, ccelAttempted: false, ccelHitCount: 0, notices: [] },
    }) } as any);

    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['local'] }] });

    expect(result.structuredContent).toMatchObject({
      planStatus: 'partial',
      queries: [{ providers: [{ provider: 'local', status: 'interface_changed', hitCount: 0 }] }],
      coverage: {
        localAttempted: true, localStatus: 'interface_changed', localHitCount: 0,
        notices: expect.arrayContaining([expect.stringContaining('2 duplicate local result groups were omitted from query q1')]),
      },
    });
    expect(JSON.stringify(result)).not.toContain('Omitted third-provider evidence');
    expect(JSON.stringify(result)).not.toContain('theologai://documents/secret');
    expect(result.content).toHaveLength(1);
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });
});

describe('primary_source_search v4 contract', () => {
  const v4 = {
    exposeCcelDiscovery: true,
    ccelLiveSearch: false,
    ccelCoordinator: false,
    contractVersion: '4' as const,
    liveCcelEnabled: false,
  };

  function plan(externalUrl = 'https://ccel.org/ccel/calvin/institutes/iv.xvii.html') {
    return {
      planStatus: 'complete' as const,
      queries: [{
        id: 'q1', normalizedMode: 'all_terms' as const, normalizedSelection: 'relevance' as const,
        providers: [{
          provider: 'local' as const, status: 'ok' as const, searched: true, page: 1, hitCount: 1,
          resultWindow: { returnedHitCount: 1, additionalMatchStatus: 'no_additional_match_observed' as const },
          notices: [], scope: {
            status: 'matched' as const, requested: {}, eligibleDocumentCount: 1,
            eligibleDocuments: [{ id: 'doc', title: 'Document', metadataStatus: 'reviewed' as const }],
            eligibleDocumentsTruncated: false,
          },
          hits: [{
            queryId: 'q1', provider: 'local' as const, title: 'Local section', snippet: 'Local evidence lead',
            rankWithinProvider: 1, page: 1, snippetOnly: true as const, attribution: 'Local', resourceSizeBytes: 42,
            locator: { kind: 'local_section' as const, url: 'theologai://documents/doc#section-1', documentId: 'doc', sectionId: '1' },
          }],
        }, {
          provider: 'ccel_live' as const, status: 'ok' as const, searched: true, page: 1, hitCount: 1,
          resultWindow: { returnedHitCount: 1, additionalMatchStatus: 'no_additional_match_observed' as const }, notices: [],
          hits: [{
            queryId: 'q1', provider: 'ccel_live' as const, title: 'External section', snippet: 'Unreviewed external lead',
            rankWithinProvider: 1, page: 1, snippetOnly: true as const, attribution: 'CCEL',
            locator: { kind: 'ccel_section' as const, url: externalUrl, work: 'calvin/institutes', section: 'iv.xvii' },
          }],
        }],
      }],
      coverage: { localAttempted: true, localHitCount: 1, ccelAttempted: true, ccelHitCount: 1, notices: [] },
    };
  }

  it('advertises strict v4 providers and open-world behavior', () => {
    const handler = createPrimarySourceSearchHandler({ search: vi.fn() } as any, v4);
    expect(handler.outputSchema?.properties?.schemaVersion).toEqual({ const: '4' });
    expect(handler.annotations).toMatchObject({ openWorldHint: true });
    const query = (handler.inputSchema.properties?.queries as any).items;
    expect(query.properties.providers).toMatchObject({ maxItems: 2, items: { enum: ['local', 'ccel'] } });
    expect(query.properties.selection.description).toContain('CCEL discovery');
    expect(query.properties.author.description).toContain('unreviewed provider search restriction');
    expect(query.properties.work.description).toContain('unreviewed provider');
    expect(query.properties.startYear.description).toContain('Unsupported for CCEL');
    expect(query.properties.endYear.description).toContain('Unsupported for CCEL');
    expect(query.properties.page.description).toContain('page 1 only');
    expect(query.properties.limit.description).toContain('capped at 5');
    expect(validatorFor(handler.inputSchema)({ queries: [{ id: 'q', text: 'faith', providers: ['ccel'] }] }).valid).toBe(true);
  });

  it('uses exact compact JSON parity and emits native links only for final local hits', async () => {
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue(plan()) } as any, v4);
    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['local', 'ccel'] }] });
    expect(result.content[0]).toEqual({ type: 'text', text: JSON.stringify(result.structuredContent) });
    expect(result.content.filter(item => item.type === 'resource_link')).toHaveLength(1);
    expect(JSON.stringify(result.content.slice(1))).not.toContain('ccel.org');
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '4', responseWindow: { unit: 'utf8_bytes', maximum: 32768, truncated: false },
      queries: [{ providers: [
        { hits: [{ locator: { kind: 'mcp_resource', uri: 'theologai://documents/doc#section-1' } }] },
        { hits: [{ locator: { kind: 'external_url', url: 'https://ccel.org/ccel/calvin/institutes/iv.xvii.html' } }] },
      ] }],
    });
    expect(new TextEncoder().encode((result.content[0] as { text: string }).text).byteLength).toBeLessThanOrEqual(32768);
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('omits control-only optional metadata while preserving a schema-valid v4 hit', async () => {
    const adversarial = plan();
    const local = adversarial.queries[0]!.providers[0]!;
    const hit = local.hits[0]!;
    hit.author = '\u0001';
    hit.sectionLabel = '\u0002';
    hit.documentType = '\u0003';
    hit.documentDate = '\u0004';
    adversarial.queries[0]!.providers = [local];
    adversarial.coverage.ccelAttempted = false;
    adversarial.coverage.ccelHitCount = 0;
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue(adversarial) } as any, v4);

    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['local'] }] });
    const structured = result.structuredContent as any;
    const sanitized = structured.queries[0].providers[0].hits[0];
    expect(sanitized).not.toHaveProperty('author');
    expect(sanitized).not.toHaveProperty('sectionLabel');
    expect(sanitized).not.toHaveProperty('documentType');
    expect(sanitized).not.toHaveProperty('documentDate');
    expect(structured).toMatchObject({ planStatus: 'partial', responseWindow: { truncated: true } });
    expect(result.content[0]).toEqual({ type: 'text', text: JSON.stringify(structured) });
    expect(validatorFor(handler.outputSchema!)(structured).valid).toBe(true);
  });

  it('keeps exact JSON/schema parity for structured unavailable errors', async () => {
    const unavailable = plan();
    unavailable.planStatus = 'unavailable';
    for (const provider of unavailable.queries[0]!.providers) {
      provider.status = 'disabled';
      provider.searched = false;
      provider.hitCount = 0;
      provider.hits = [] as never;
      provider.resultWindow = { returnedHitCount: 0, additionalMatchStatus: 'not_evaluated' };
    }
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue(unavailable) } as any, v4);
    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['local', 'ccel'] }] });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: JSON.stringify(result.structuredContent) });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('requires retry guidance exactly for rate-limited external providers', async () => {
    const rateLimited = plan();
    rateLimited.planStatus = 'unavailable';
    rateLimited.queries[0]!.providers = [{
      provider: 'ccel_live', status: 'rate_limited', searched: false, page: 1, hitCount: 0,
      resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'not_evaluated' },
      hits: [], notices: [], retryAfterSeconds: 7,
    }];
    rateLimited.coverage = { localAttempted: false, localHitCount: 0, ccelAttempted: true, ccelHitCount: 0, notices: [] };
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue(rateLimited) } as any, v4);
    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['ccel'] }] });
    const validate = validatorFor(handler.outputSchema!);
    expect(validate(result.structuredContent).valid).toBe(true);

    const missing = structuredClone(result.structuredContent as object) as any;
    delete missing.queries[0].providers[0].retryAfterSeconds;
    expect(validate(missing).valid).toBe(false);

    const unexpected = structuredClone(result.structuredContent as object) as any;
    unexpected.queries[0].providers[0].status = 'no_results';
    expect(validate(unexpected).valid).toBe(false);
  });

  it.each([
    'http://ccel.org/ccel/calvin/institutes/iv.xvii.html',
    'https://www.ccel.org/ccel/calvin/institutes/iv.xvii.html',
    'https://ccel.org/ccel/calvin/institutes/iv.xvii.html?token=secret',
    'https://ccel.org.evil.test/ccel/calvin/institutes/iv.xvii.html',
  ])('omits a malicious external locator without emitting a link (%s)', async externalUrl => {
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue(plan(externalUrl)) } as any, v4);
    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['local', 'ccel'] }] });
    expect(JSON.stringify(result)).not.toContain(externalUrl);
    expect(result.structuredContent).toMatchObject({ planStatus: 'partial', queries: [{ providers: [{ hitCount: 1 }, { status: 'interface_changed', hitCount: 0 }] }] });
    expect(result.content.filter(item => item.type === 'resource_link')).toHaveLength(1);
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('sanitizes malformed service drift to one global external provider group', async () => {
    const adversarial = plan();
    const external = adversarial.queries[0]!.providers[1]!;
    adversarial.queries.push({
      id: 'q2', normalizedMode: 'all_terms', normalizedSelection: 'relevance',
      providers: [{
        ...external,
        hits: external.hits.map(hit => ({ ...hit, queryId: 'q2' })),
      }],
    });
    const handler = createPrimarySourceSearchHandler({ search: vi.fn().mockResolvedValue(adversarial) } as any, v4);
    const result = await handler.handler({ queries: [{ id: 'q1', text: 'faith', providers: ['ccel'] }] });
    const structured = result.structuredContent as any;
    expect(structured.queries.flatMap((query: any) => query.providers)
      .filter((provider: any) => provider.provider === 'ccel_live')).toHaveLength(1);
    expect(structured).toMatchObject({ planStatus: 'partial', responseWindow: { truncated: true } });
    expect(validatorFor(handler.outputSchema!)(structured).valid).toBe(true);
  });
});
