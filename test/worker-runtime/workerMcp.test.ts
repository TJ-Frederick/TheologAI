import { describe, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { createWorkerCompositionRoot } from '../../src/tools/worker/index.js';
import type { Env } from '../../src/worker-env.js';
import { encodeParallelGroupCursor } from '../../src/kernel/parallelGroupCursor.js';
import { parseSourceAttestedLookupReference } from '../../src/kernel/sourceAttestedReference.js';

const MCP_URL = 'https://worker.test/mcp';
const ALLOWED_ORIGIN = 'https://allowed.example';
const LEGACY_PRODUCTION_MCP_URL = 'https://theologai.tjfrederick.workers.dev/mcp';
const PRIMARY_PRODUCTION_MCP_URL = 'https://mcp.theologai.xyz/mcp';
const PREVIEW_MCP_URL = 'https://preview-mcp.theologai.xyz/mcp';
const LEGACY_PRODUCTION_OPERATOR_URL = 'https://theologai.tjfrederick.workers.dev/internal/ccel-coordinator';
const PRIMARY_PRODUCTION_OPERATOR_URL = 'https://mcp.theologai.xyz/internal/ccel-coordinator';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: {
    resources?: unknown[];
    contents?: unknown[];
    prompts?: unknown[];
    messages?: unknown[];
    content?: unknown[];
    isError?: boolean;
    [key: string]: unknown;
  };
  error?: { code: number; message: string; data?: unknown };
}

async function parseMcpResponse(response: Response): Promise<JsonRpcResponse> {
  const body = await response.text();
  if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
    const event = body
      .split('\n')
      .find(line => line.startsWith('data:'));
    if (!event) throw new Error(`MCP SSE response had no data event: ${body}`);
    return JSON.parse(event.slice('data:'.length).trim()) as JsonRpcResponse;
  }
  return JSON.parse(body) as JsonRpcResponse;
}

function textContent(message: JsonRpcResponse): string {
  if (!Array.isArray(message.result?.content)) return '';
  return message.result.content
    .filter((block): block is { text: string } => (
      typeof block === 'object' && block !== null && 'text' in block && typeof block.text === 'string'
    ))
    .map(block => block.text)
    .join('\n');
}

function promptText(message: JsonRpcResponse): string {
  const prompt = message.result?.messages?.[0];
  if (typeof prompt !== 'object' || prompt === null || !('content' in prompt)) return '';
  const content = prompt.content;
  return typeof content === 'object' && content !== null && 'text' in content && typeof content.text === 'string'
    ? content.text
    : '';
}

async function rpc(
  method: string,
  params?: Record<string, unknown>,
  id: number = 1,
): Promise<{ response: Response; message: JsonRpcResponse }> {
  const response = await SELF.fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
      'Mcp-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
  });
  return { response, message: await parseMcpResponse(response) };
}

async function rateLimitKey(ip: string, userAgent: string): Promise<string> {
  const input = new TextEncoder().encode(`theologai-rate-limit-v1\0${ip}\0${userAgent}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

describe('Worker MCP endpoint in workerd', () => {
  it('keeps the legacy production migration browser-safe and scopes the poller guard to production hosts', async () => {
    const browserPreflight = await SELF.fetch(LEGACY_PRODUCTION_MCP_URL, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Mcp-Protocol-Version',
      },
    });
    expect(browserPreflight.status).toBe(204);
    expect(browserPreflight.headers.get('Location')).toBeNull();
    expect(browserPreflight.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);

    const browserRequest = await SELF.fetch(LEGACY_PRODUCTION_MCP_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: ALLOWED_ORIGIN },
      body: '{}',
    });
    expect(browserRequest.status).toBe(308);
    expect(browserRequest.headers.get('Location')).toBe(PRIMARY_PRODUCTION_MCP_URL);
    expect(browserRequest.headers.get('Cache-Control')).toBe('no-store');
    expect(browserRequest.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);

    const legacyOperator = await SELF.fetch(LEGACY_PRODUCTION_OPERATOR_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(legacyOperator.status).toBe(308);
    expect(legacyOperator.headers.get('Location')).toBe(PRIMARY_PRODUCTION_OPERATOR_URL);

    const pollerHeaders = {
      'CF-Connecting-IP': '18.192.206.183',
      'User-Agent': 'Go-http-client/2.0',
    };
    await expect(SELF.fetch(LEGACY_PRODUCTION_MCP_URL, { method: 'POST', headers: pollerHeaders }))
      .resolves.toMatchObject({ status: 410 });
    await expect(SELF.fetch(PRIMARY_PRODUCTION_MCP_URL, { method: 'POST', headers: pollerHeaders }))
      .resolves.toMatchObject({ status: 403 });
    await expect(SELF.fetch(LEGACY_PRODUCTION_OPERATOR_URL, {
      method: 'POST', headers: { ...pollerHeaders, 'Content-Type': 'application/json' }, body: '{}',
    })).resolves.toMatchObject({ status: 410 });

    const previewRequest = await SELF.fetch(PREVIEW_MCP_URL, {
      method: 'POST',
      headers: {
        ...pollerHeaders,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'Mcp-Protocol-Version': '2025-11-25',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 70, method: 'tools/list' }),
    });
    expect(previewRequest.status).toBe(200);
  });

  it('executes the checked-in preview v7 contract without enabling live CCEL', async () => {
    expect(env.THEOLOGAI_EXPOSE_CCEL_DISCOVERY).toBe('true');
    expect(env.THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH).toBe('false');
    expect(env.THEOLOGAI_ENABLE_CCEL_COORDINATOR).toBe('false');
    const root = createWorkerCompositionRoot(env as unknown as Env);
    expect(root.primarySourceContract).toMatchObject({
      contractVersion: '7',
      liveCcelEnabled: false,
    });
    const tool = root.tools.find(candidate => candidate.name === 'primary_source_search')!;
    expect(tool.outputSchema?.properties?.schemaVersion).toEqual({ const: '7' });
    expect(tool.annotations).toMatchObject({ openWorldHint: true });
    const result = await tool.handler({ queries: [{ id: 'external', text: 'grace', providers: ['ccel'] }] });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        schemaVersion: '7', planStatus: 'unavailable',
        coverage: { ccelAttempted: false, ccelStatus: 'disabled', ccelHitCount: 0 },
      },
    });
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('CCEL discovery lead: **disabled**'),
    });
  });

  it('provides the configured rate-limit binding in the Workers runtime', async () => {
    await expect(env.THEOLOGAI_RATE_LIMITER.limit({
      key: `worker-runtime-smoke-${crypto.randomUUID()}`,
    })).resolves.toEqual({ success: true });
  });

  it('returns the configured 429 response after the client fingerprint exhausts its binding limit', async () => {
    const ip = '203.0.113.42';
    const userAgent = 'theologai-worker-runtime-rate-limit-test';
    const key = await rateLimitKey(ip, userAgent);

    for (let requestNumber = 0; requestNumber < 120; requestNumber += 1) {
      const result = await env.THEOLOGAI_RATE_LIMITER.limit({ key });
      expect(result.success).toBe(true);
    }

    const response = await SELF.fetch(MCP_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
        'CF-Connecting-IP': ip,
        'User-Agent': userAgent,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 15, method: 'tools/list' }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    await expect(response.text()).resolves.toBe('Too many requests');
  });

  it('initializes and lists the shared tool registry', async () => {
    const initialized = await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'worker-runtime-test', version: '1.0.0' },
    });

    expect(initialized.response.status).toBe(200);
    expect(initialized.message.error).toBeUndefined();
    expect(initialized.message.result).toMatchObject({
      protocolVersion: '2025-11-25',
      serverInfo: { name: 'theologai-bible-server', version: '3.6.0-test' },
    });

    const listed = await rpc('tools/list', undefined, 2);
    expect(listed.response.status).toBe(200);
    expect(listed.message.error).toBeUndefined();
    expect(listed.message.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: 'bible_lookup',
          outputSchema: expect.objectContaining({ type: 'object', additionalProperties: false }),
        }),
        expect.objectContaining({
          name: 'bible_cross_references',
          outputSchema: expect.objectContaining({
            type: 'object', additionalProperties: false,
            properties: expect.objectContaining({ kind: { type: 'string', const: 'bible_cross_references' } }),
          }),
        }),
        expect.objectContaining({
          name: 'parallel_passages',
          description: expect.stringContaining('pass that `nextCursor` unchanged as `groupCursor` while preserving exactly the same `reference`, `corpora`, and `maxGroups`'),
        }),
        expect.objectContaining({
          name: 'commentary_lookup',
          outputSchema: expect.objectContaining({
            type: 'object', additionalProperties: false,
            properties: expect.objectContaining({
              kind: expect.objectContaining({ const: 'commentary_lookup' }),
              commentary: expect.objectContaining({
                properties: expect.objectContaining({
                  textFormat: expect.objectContaining({ const: 'text/markdown' }),
                }),
              }),
            }),
          }),
        }),
        expect.objectContaining({
          name: 'original_language_lookup',
          outputSchema: expect.objectContaining({ type: 'object', additionalProperties: false }),
        }),
        expect.objectContaining({
          name: 'bible_verse_morphology',
          outputSchema: expect.objectContaining({
            type: 'object', additionalProperties: false,
            properties: expect.objectContaining({ kind: { const: 'bible_verse_morphology' } }),
          }),
        }),
        expect.objectContaining({
          name: 'primary_source_search',
          outputSchema: expect.objectContaining({ type: 'object', additionalProperties: false }),
        }),
        expect.objectContaining({
          name: 'donation_config',
          outputSchema: expect.objectContaining({
            type: 'object', additionalProperties: false,
            properties: expect.objectContaining({
              kind: expect.objectContaining({ const: 'donation_config' }),
            }),
          }),
        }),
        expect.objectContaining({
          name: 'verify_donation',
          outputSchema: expect.objectContaining({
            type: 'object', additionalProperties: false,
            properties: expect.objectContaining({
              kind: expect.objectContaining({ const: 'verify_donation' }),
            }),
          }),
        }),
      ]),
    });
    const primarySourceTool = (listed.message.result?.tools as Array<Record<string, unknown>>)
      .find(tool => tool.name === 'primary_source_search')!;
    expect(primarySourceTool).toMatchObject({
      annotations: { openWorldHint: true },
        outputSchema: { properties: { schemaVersion: { const: '7' } } },
    });
    expect((((primarySourceTool.inputSchema as any).properties.queries.items)
      .properties.providers.items.enum)).toEqual(['local', 'ccel']);
  });

  it('returns structured Bible content alongside the legacy Markdown result', async () => {
    const toolResult = await rpc('tools/call', {
      name: 'bible_lookup',
      arguments: { reference: 'John 3:16', translation: 'KJV' },
    }, 21);

    expect(toolResult.response.status).toBe(200);
    expect(toolResult.message.error).toBeUndefined();
    expect(toolResult.message.result).toMatchObject({
      content: [expect.objectContaining({ type: 'text', text: expect.stringContaining('John 3:16 (KJV)') })],
      structuredContent: {
        schemaVersion: '1',
        kind: 'bible_lookup',
        passages: [expect.objectContaining({ translation: 'KJV', provenanceIds: expect.any(Array) })],
        failures: [],
      },
    });

    const usage = await rpc('tools/call', {
      name: 'original_language_lookup',
      arguments: { strongs_number: 'G26', usage_level: 'technical', occurrence_limit: 1 },
    }, 31);
    expect(usage.response.status).toBe(200);
    expect(usage.message.error).toBeUndefined();
    expect(usage.message.result).toMatchObject({
      content: [expect.objectContaining({ text: expect.stringContaining('1 raw tokens') })],
      structuredContent: {
        schemaVersion: '1', kind: 'original_language_lookup',
        corpusUsage: {
          exactMorphologyKey: 'G0026', attested: true,
          totals: { tokenCount: 1, verseCount: 1, bookCount: 1, sourceSurfaceVariantCount: 1 },
          sourceSurfaceVariants: [expect.objectContaining({ sourceForm: 'ἀγάπη·' })],
          occurrences: [expect.objectContaining({ sourceForm: 'ἀγάπη·', exactMorphologyKey: 'G0026' })],
        },
      },
    });
  });

  it('returns structured donation configuration without changing its Markdown fallback', async () => {
    const donation = await rpc('tools/call', {
      name: 'donation_config',
      arguments: {},
    }, 32);

    expect(donation.response.status).toBe(200);
    expect(donation.message.error).toBeUndefined();
    expect(donation.message.result).toMatchObject({
      content: [expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('[theologai.xyz](https://theologai.xyz/)'),
      })],
      structuredContent: {
        schemaVersion: '1',
        kind: 'donation_config',
        voluntary: true,
        featureAccessIndependentOfDonation: true,
        assetOrderMeaning: 'configured_display_order_not_ranking',
        webDonationUrl: 'https://theologai.xyz/',
        recipientAddress: '0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04',
        assets: [
          expect.objectContaining({
            symbol: 'USDC', chainId: 8453, assetKind: 'token',
            assetAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          }),
          expect.objectContaining({
            symbol: 'USDC', chainId: 1, assetKind: 'token',
            assetAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          }),
          expect.objectContaining({ symbol: 'ETH', chainId: 1, assetKind: 'native', assetAddress: null }),
          expect.objectContaining({ symbol: 'ETH', chainId: 8453, assetKind: 'native', assetAddress: null }),
          expect.objectContaining({
            symbol: 'SBC', chainId: 723, assetKind: 'token',
            assetAddress: '0x33ad9e4bd16b69b5bfded37d8b5d9ff9aba014fb',
          }),
        ],
      },
    });
  });

  it('serves Strong\'s tool and resource results from the isolated D1 fixture', async () => {
    const { response, message } = await rpc('resources/read', {
      uri: 'theologai://strongs/G26',
    });

    expect(response.status).toBe(200);
    expect(message.error).toBeUndefined();
    expect(message.result).toMatchObject({
      contents: [
        expect.objectContaining({
          uri: 'theologai://strongs/G26',
          mimeType: 'text/markdown',
          text: expect.stringContaining('love, goodwill, benevolence'),
        }),
      ],
    });

    const toolResult = await rpc('tools/call', {
      name: 'original_language_lookup',
      arguments: { strongs_number: 'G26' },
    }, 3);

    expect(toolResult.response.status).toBe(200);
    expect(toolResult.message.error).toBeUndefined();
    expect(toolResult.message.result).toMatchObject({
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('love, goodwill, benevolence'),
        }),
      ],
      structuredContent: {
        schemaVersion: '1',
        kind: 'original_language_lookup',
        mode: 'entry',
        entries: [expect.objectContaining({ strongsNumber: 'G0026', language: 'Greek' })],
      },
    });
  });

  it('withholds TBESH Meaning across Worker tool, resource, and contextual-study paths', async () => {
    const forbidden = 'FORBIDDEN ONLINE BIBLE MEANING WORKER SENTINEL';
    const exact = await rpc('tools/call', {
      name: 'original_language_lookup',
      arguments: { strongs_number: 'H9001', include_extended: true, detail_level: 'detailed' },
    }, 33);
    expect(exact.response.status).toBe(200);
    expect(exact.message.error).toBeUndefined();
    expect(JSON.stringify(exact.message)).not.toContain(forbidden);
    expect(textContent(exact.message)).toContain('Gloss: &');
    expect(exact.message.result).toMatchObject({
      structuredContent: {
        entries: [{
          strongsNumber: 'H9001', definition: null, gloss: '&',
          evidencePolicy: { code: 'tbesh_meaning_withheld', semanticEvidence: 'unavailable' },
        }],
      },
    });

    const resource = await rpc('resources/read', { uri: 'theologai://strongs/H9001' }, 34);
    expect(resource.response.status).toBe(200);
    expect(JSON.stringify(resource.message)).not.toContain(forbidden);
    expect(JSON.stringify(resource.message)).toContain('Evidence policy');

    const study = await rpc('tools/call', {
      name: 'original_language_study',
      arguments: { reference: 'Genesis 1:1', target: 'H9001' },
    }, 35);
    expect(study.response.status).toBe(200);
    expect(study.message.error).toBeUndefined();
    expect(JSON.stringify(study.message)).not.toContain(forbidden);
    expect(textContent(study.message)).toContain('TBESH Meaning field is withheld');
    expect(study.message.result).toMatchObject({
      structuredContent: {
        status: 'partial',
        lexiconEvidence: [{
          kind: 'stepbible_lexicon', gloss: '&',
          evidencePolicy: { code: 'tbesh_meaning_withheld', semanticEvidence: 'unavailable' },
        }],
      },
    });
  });

  it('lists the document fixture dynamically and reads its D1-backed resource', async () => {
    const listed = await rpc('resources/list');

    expect(listed.response.status).toBe(200);
    expect(listed.message.error).toBeUndefined();
    expect(listed.message.result?.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uri: 'theologai://primary-sources/catalog',
        mimeType: 'application/json',
      }),
      expect.objectContaining({
        uri: 'theologai://documents/apostles-creed',
        name: "Apostles' Creed",
        description: 'Creed (c. 390); complete document with canonical exact-section children',
      }),
    ]));

    const catalog = await rpc('resources/read', { uri: 'theologai://primary-sources/catalog' }, 40);
    expect(catalog.response.status).toBe(200);
    expect(JSON.parse(String((catalog.message.result?.contents as Array<{ text: string }>)[0].text))).toEqual({
      schemaVersion: '2', kind: 'local_primary_source_catalog', workCount: 1,
      works: [{
        id: 'apostles-creed', title: "Apostles' Creed", documentType: 'Creed',
        lookupAliases: ["The Apostles' Creed", "Apostles' Creed", 'Apostles Creed'],
        composition: { label: 'Before the end of the 4th century (present form)' },
        creators: [], metadataStatus: 'anonymous',
        metadataProvenanceIds: ['hist-meta-crc-apostles'],
        editionReadiness: {
          foundation: 'edition-provenance-foundation.v1', editionIdentity: 'not_established',
          provenance: 'incomplete', exactArtifactRights: 'not_established_by_this_contract',
        },
      }],
      policies: {
        scope: 'hosted_collection_only', lookupAliasUse: 'exact_routing_only_not_metadata_evidence',
        editionProvenance: 'incomplete', rightsStatus: 'not_established',
        editionReadiness: {
          foundation: 'edition-provenance-foundation.v1', editionIdentity: 'not_established',
          provenance: 'incomplete', exactArtifactRights: 'not_established_by_this_contract',
        },
      },
    });

    const read = await rpc('resources/read', {
      uri: 'theologai://documents/apostles-creed',
    }, 4);

    expect(read.response.status).toBe(200);
    expect(read.message.error).toBeUndefined();
    expect(read.message.result?.contents).toEqual([
      expect.objectContaining({
        uri: 'theologai://documents/apostles-creed',
        mimeType: 'text/markdown',
        text: expect.stringMatching(/Apostles' Creed[\s\S]*The First Article[\s\S]*maker of heaven and earth/),
      }),
    ]);

    const exactUri = 'theologai://documents/apostles-creed#section-1';
    const exact = await rpc('resources/read', { uri: exactUri }, 41);
    expect(exact.response.status).toBe(200);
    expect(exact.message.error).toBeUndefined();
    expect(exact.message.result?.contents).toEqual([
      expect.objectContaining({
        uri: exactUri,
        mimeType: 'text/markdown',
        text: expect.stringMatching(/Apostles' Creed[\s\S]*The First Article[\s\S]*maker of heaven and earth/),
      }),
    ]);
    const exactContent = (exact.message.result?.contents as Array<Record<string, unknown>>)[0]!;
    expect(exactContent._meta).toMatchObject({
      'theologai/canonicalUri': 'theologai://documents/apostles-creed#section-source-0001',
      'theologai/sectionKey': 'source-0001', 'theologai/sourceOrdinal': 1,
      'theologai/sectionResolution': 'legacy_alias',
    });

    const canonicalUri = 'theologai://documents/apostles-creed#section-source-0001';
    const canonical = await rpc('resources/read', { uri: canonicalUri }, 43);
    expect(canonical.message.result?.contents).toEqual([
      expect.objectContaining({ uri: canonicalUri, _meta: expect.objectContaining({
        'theologai/canonicalUri': canonicalUri,
        'theologai/sectionResolution': 'canonical',
      }) }),
    ]);
  });

  it('executes cross-reference and expanded morphology tools against D1', async () => {
    const crossReferences = await rpc('tools/call', {
      name: 'bible_cross_references',
      arguments: { reference: 'John 3:16', maxResults: 1 },
    }, 5);

    expect(crossReferences.response.status).toBe(200);
    expect(crossReferences.message.error).toBeUndefined();
    expect(crossReferences.message.result).toMatchObject({
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringMatching(/Cross-References for John 3:16[\s\S]*Romans 5:8[\s\S]*42 votes/),
        }),
      ],
      structuredContent: {
        schemaVersion: '1',
        kind: 'bible_cross_references',
        requestedReference: 'John 3:16',
        resolvedReference: 'John 3:16',
        query: { maxResults: 1, minVotes: 0 },
        ranking: {
          method: 'openbible_votes_descending',
          tieBreak: 'source_reference_ascending',
        },
        semantics: {
          evidenceUse: 'discovery_lead',
          relationshipClassification: 'unspecified',
          directionality: 'unspecified',
        },
        references: [{
          position: 1,
          reference: 'Romans 5:8',
          votes: 42,
          provenanceIds: ['openbible-cross-references'],
        }],
        resultWindow: { returnedCount: 1, qualifyingTotal: 1, hasMore: false },
        provenance: [expect.objectContaining({
          id: 'openbible-cross-references',
          version: '2025-10-13',
        })],
      },
    });

    const morphology = await rpc('tools/call', {
      name: 'bible_verse_morphology',
      arguments: { reference: 'John 3:16', expand_morphology: true },
    }, 6);

    expect(morphology.response.status).toBe(200);
    expect(morphology.message.error).toBeUndefined();
    expect(morphology.message.result).toMatchObject({
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringMatching(/John 3:16[\s\S]*Οὕτως[\s\S]*Adverb[\s\S]*thus/),
        }),
      ],
      structuredContent: {
        schemaVersion: '1',
        kind: 'bible_verse_morphology',
        reference: 'John 3:16',
        testament: 'NT',
        language: 'Greek',
        words: expect.arrayContaining([expect.objectContaining({
          text: 'Οὕτως',
          morphologyCode: expect.any(String),
          morphologyExpansion: 'Adverb',
          provenanceIds: ['stepbible-morphology'],
          lemmaProvenanceIds: ['stepbible-morphology'],
        })]),
        provenance: [expect.objectContaining({
          id: 'stepbible-morphology',
          kind: 'morphology_dataset',
        })],
      },
    });
  });

  it('rejects invalid and non-verse cross-reference inputs before D1 lookup', async () => {
    for (const [id, reference, expected] of [
      [501, 'John 99:1', 'Chapter 99 is out of range'],
      [502, 'John 3', 'requires exactly one Bible verse'],
      [503, 'John 3:16-17', 'requires exactly one Bible verse'],
    ] as const) {
      const result = await rpc('tools/call', {
        name: 'bible_cross_references',
        arguments: { reference },
      }, id);
      expect(result.response.status).toBe(200);
      expect(result.message.error).toBeUndefined();
      expect(result.message.result).toMatchObject({ isError: true });
      expect(textContent(result.message)).toContain(expected);
    }
  });

  it('serves the curated synoptic and quotation groups through the Worker endpoint', async () => {
    const synoptic = await rpc('tools/call', {
      name: 'parallel_passages',
      arguments: {
        reference: 'Matthew 26:26',
        corpora: ['theologai_legacy'],
        mode: 'synoptic',
        maxParallels: 1,
      },
    }, 14);

    expect(synoptic.response.status).toBe(200);
    expect(synoptic.message.error).toBeUndefined();
    expect(synoptic.message.result).toMatchObject({
      content: [expect.objectContaining({
        type: 'text',
        text: expect.stringMatching(/Mark 14:22-25\*\* \[synoptic\]/),
      })],
    });

    const quotation = await rpc('tools/call', {
      name: 'parallel_passages',
      arguments: {
        reference: 'Matthew 1:23',
        corpora: ['theologai_legacy'],
        mode: 'quotation',
        maxParallels: 1,
      },
    }, 15);

    expect(quotation.response.status).toBe(200);
    expect(quotation.message.error).toBeUndefined();
    expect(quotation.message.result).toMatchObject({
      content: [expect.objectContaining({
        type: 'text',
        text: expect.stringMatching(/Isaiah 7:14\*\* \[quotation\]/),
      })],
    });
  });

  it('hard-defaults to complete D1-backed UBS groups without bundled UBS JSON', async () => {
    const result = await rpc('tools/call', {
      name: 'parallel_passages',
      arguments: { reference: 'Luke 6:35', maxGroups: 1 },
    }, 151);

    expect(result.response.status).toBe(200);
    expect(result.message.error).toBeUndefined();
    expect(result.message.result).toMatchObject({
      structuredContent: {
        schemaVersion: '4',
        corpora: ['ubs_source_attested'],
        legacyParallels: [],
        openBibleCrossReferences: [],
        sourceAttestedGroups: [{
          members: [
            expect.objectContaining({ normalizedReference: 'Matthew 5:44-45', matched: false }),
            expect.objectContaining({ normalizedReference: 'Luke 6:27-28,35', matched: true }),
          ],
        }],
        sourceAttestedResultWindow: {
          requestedLimit: 1,
          returnedGroupCount: 1,
          additionalMatchStatus: 'no_additional_match_observed',
        },
        textEnrichment: {
          requested: false, translation: null, uniqueTargetCount: 3,
          scheduledLookupCount: 0, succeededLookupCount: 0, failedLookupCount: 0,
          omittedLookupCount: 0, completionStatus: 'not_requested',
        },
      },
    });
    expect(JSON.stringify(result.message.result?.structuredContent)).not.toContain('alignmentRaw');
    expect(textContent(result.message)).toContain('_Matched passage: Luke 6:27-28,35_');
  });

  it('exposes honest v4 navigable UBS result windows for the reviewed black-box sentinels', async () => {
    const defaultMark = await rpc('tools/call', {
      name: 'parallel_passages', arguments: { reference: 'Mark 10:19' },
    }, 152);
    expect(defaultMark.message.result).toMatchObject({
      structuredContent: {
        schemaVersion: '4',
        sourceAttestedGroups: expect.arrayContaining([expect.any(Object)]),
        sourceAttestedResultWindow: {
          requestedLimit: 5, returnedGroupCount: 5, additionalMatchStatus: 'additional_match_observed',
        },
      },
    });
    const defaultStructured = defaultMark.message.result?.structuredContent as any;
    expect(defaultStructured.sourceAttestedGroups).toHaveLength(5);
    expect(defaultStructured.sourceAttestedResultWindow.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(textContent(defaultMark.message)).toContain('`sourceAttestedResultWindow.nextCursor` back as input `groupCursor`');

    const continuedMark = await rpc('tools/call', {
      name: 'parallel_passages', arguments: {
        reference: 'Mark 10:19', maxGroups: 5,
        groupCursor: defaultStructured.sourceAttestedResultWindow.nextCursor,
      },
    }, 1152);
    const continuedStructured = continuedMark.message.result?.structuredContent as any;
    expect(continuedStructured.sourceAttestedGroups).toHaveLength(2);
    expect(continuedStructured.sourceAttestedResultWindow).toEqual({
      requestedLimit: 5, returnedGroupCount: 2, additionalMatchStatus: 'no_additional_match_observed',
    });
    const previousIds = new Set(defaultStructured.sourceAttestedGroups.map((group: any) => group.groupId));
    const previousLast = defaultStructured.sourceAttestedGroups.at(-1).sourceOrdinal;
    expect(continuedStructured.sourceAttestedGroups.every((group: any) => (
      !previousIds.has(group.groupId) && group.sourceOrdinal > previousLast
    ))).toBe(true);

    const chapterMark = await rpc('tools/call', {
      name: 'parallel_passages', arguments: { reference: 'Mark 10', maxGroups: 5 },
    }, 1155);
    expect(chapterMark.response.status).toBe(200);
    expect(chapterMark.message.error).toBeUndefined();
    const chapterStructured = chapterMark.message.result?.structuredContent as any;
    expect(chapterStructured.sourceAttestedGroups).toHaveLength(5);
    expect(chapterStructured.sourceAttestedResultWindow).toMatchObject({
      requestedLimit: 5,
      returnedGroupCount: 5,
      additionalMatchStatus: 'additional_match_observed',
    });

    const chapterContinued = await rpc('tools/call', {
      name: 'parallel_passages', arguments: {
        reference: 'Mark 10', maxGroups: 5,
        groupCursor: chapterStructured.sourceAttestedResultWindow.nextCursor,
      },
    }, 1156);
    expect(chapterContinued.message.error).toBeUndefined();
    const chapterContinuedStructured = chapterContinued.message.result?.structuredContent as any;
    expect(chapterContinuedStructured.sourceAttestedGroups).toHaveLength(2);
    expect(chapterContinuedStructured.sourceAttestedGroups.every((group: any) => (
      group.sourceOrdinal > chapterStructured.sourceAttestedGroups.at(-1).sourceOrdinal
    ))).toBe(true);

    const falseTerminal = encodeParallelGroupCursor(
      parseSourceAttestedLookupReference('Mark 10').segments,
      { pageSize: 5, afterSourceOrdinal: Number.MAX_SAFE_INTEGER, cumulativeGroupCount: 5 },
    );
    const falseTerminalResult = await rpc('tools/call', {
      name: 'parallel_passages', arguments: {
        reference: 'Mark 10', maxGroups: 5, groupCursor: falseTerminal,
      },
    }, 1157);
    expect(falseTerminalResult.message.result).toMatchObject({ isError: true });
    expect(textContent(falseTerminalResult.message)).toContain('groupCursor is not a valid page boundary');

    const mismatchedChapterCursor = await rpc('tools/call', {
      name: 'parallel_passages', arguments: {
        reference: 'Mark 10:19', maxGroups: 5,
        groupCursor: chapterStructured.sourceAttestedResultWindow.nextCursor,
      },
    }, 1158);
    expect(mismatchedChapterCursor.message.result).toMatchObject({ isError: true });
    expect(textContent(mismatchedChapterCursor.message)).toContain('groupCursor belongs to a different normalized passage query');

    const mixedCursor = await rpc('tools/call', {
      name: 'parallel_passages', arguments: {
        reference: 'Mark 10:19',
        groupCursor: defaultStructured.sourceAttestedResultWindow.nextCursor,
        includeOpenBibleCrossReferences: false,
      },
    }, 1153);
    expect(mixedCursor.message.result).toMatchObject({ isError: true });
    expect(textContent(mixedCursor.message)).toContain('Invalid arguments for parallel_passages');

    const enrichedCursor = await rpc('tools/call', {
      name: 'parallel_passages', arguments: {
        reference: 'Mark 10:19', maxGroups: 5,
        groupCursor: defaultStructured.sourceAttestedResultWindow.nextCursor,
        includeText: true,
      },
    }, 1154);
    expect(enrichedCursor.message.result).toMatchObject({ isError: true });
    expect(textContent(enrichedCursor.message)).toContain('Invalid arguments for parallel_passages');

    const maximumMark = await rpc('tools/call', {
      name: 'parallel_passages', arguments: { reference: 'Mark 10:19', maxGroups: 10 },
    }, 153);
    expect(maximumMark.message.result).toMatchObject({
      structuredContent: {
        sourceAttestedResultWindow: {
          requestedLimit: 10, returnedGroupCount: 7, additionalMatchStatus: 'no_additional_match_observed',
        },
      },
    });
    expect((maximumMark.message.result?.structuredContent as any).sourceAttestedGroups).toHaveLength(7);

    const kings = await rpc('tools/call', {
      name: 'parallel_passages', arguments: { reference: '2 Kings 18:13' },
    }, 154);
    const kingsMembers = (kings.message.result?.structuredContent as any).sourceAttestedGroups[0].members;
    expect(kingsMembers.map((member: any) => member.normalizedReference)).toEqual([
      '2 Kings 18:13', '2 Chronicles 32:1', 'Isaiah 36:1',
    ]);

    const matthew = await rpc('tools/call', {
      name: 'parallel_passages', arguments: { reference: 'Matthew 3:3' },
    }, 155);
    const matthewGroups = (matthew.message.result?.structuredContent as any).sourceAttestedGroups;
    expect(matthewGroups).toHaveLength(2);
    expect(new Set(matthewGroups.map((group: any) => group.groupId)).size).toBe(2);
  });

  it('keeps Worker parallel relationships edge-aware across Gospel and Pauline sources', async () => {
    const gospel = await rpc('tools/call', {
      name: 'parallel_passages',
      arguments: {
        reference: 'Matthew 3:13-17',
        corpora: ['theologai_legacy'],
        mode: 'synoptic',
        useCrossReferences: false,
      },
    }, 16);

    expect(gospel.response.status).toBe(200);
    expect(gospel.message.error).toBeUndefined();
    const gospelText = textContent(gospel.message);
    expect(gospelText).toContain('Mark 1:9-11** [synoptic]');
    expect(gospelText).toContain('Luke 3:21-22** [synoptic]');
    expect(gospelText).not.toContain('John 1:29-34');

    const paulineSynoptic = await rpc('tools/call', {
      name: 'parallel_passages',
      arguments: {
        reference: '1 Corinthians 11:23-26',
        corpora: ['theologai_legacy'],
        mode: 'synoptic',
        useCrossReferences: false,
      },
    }, 17);

    expect(paulineSynoptic.response.status).toBe(200);
    expect(paulineSynoptic.message.error).toBeUndefined();
    expect(textContent(paulineSynoptic.message)).toContain('No TheologAI legacy curated parallels found.');

    const thematic = await rpc('tools/call', {
      name: 'parallel_passages',
      arguments: {
        reference: 'Matthew 26:26',
        corpora: ['theologai_legacy'],
        mode: 'thematic',
        useCrossReferences: false,
      },
    }, 18);

    expect(thematic.response.status).toBe(200);
    expect(thematic.message.error).toBeUndefined();
    const thematicText = textContent(thematic.message);
    expect(thematicText).toContain('1 Corinthians 11:23-26** [thematic]');
    expect(thematicText).not.toContain('Mark 14:22-25** [synoptic]');

    const auto = await rpc('tools/call', {
      name: 'parallel_passages',
      arguments: {
        reference: 'Matthew 26:26',
        corpora: ['theologai_legacy'],
        mode: 'auto',
        useCrossReferences: false,
      },
    }, 19);

    expect(auto.response.status).toBe(200);
    expect(auto.message.error).toBeUndefined();
    const autoText = textContent(auto.message);
    expect(autoText).toContain('Mark 14:22-25** [synoptic]');
    expect(autoText).toContain('1 Corinthians 11:23-26** [thematic]');

    const paulineAuto = await rpc('tools/call', {
      name: 'parallel_passages',
      arguments: {
        reference: '1 Corinthians 11:23-26',
        corpora: ['theologai_legacy'],
        mode: 'auto',
        useCrossReferences: false,
      },
    }, 20);

    expect(paulineAuto.response.status).toBe(200);
    expect(paulineAuto.message.error).toBeUndefined();
    const paulineAutoText = textContent(paulineAuto.message);
    expect(paulineAutoText).toContain('Matthew 26:26-29** [thematic]');
    expect(paulineAutoText).not.toContain('[synoptic]');
  });

  it('searches the historical-document FTS fixture through the MCP tool', async () => {
    const result = await rpc('tools/call', {
      name: 'classic_text_lookup',
      arguments: { query: 'almighty' },
    }, 7);

    expect(result.response.status).toBe(200);
    expect(result.message.error).toBeUndefined();
    expect(result.message.result).toMatchObject({
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringMatching(/Search Results for "almighty"[\s\S]*The First Article[\s\S]*maker of heaven and earth/),
        }),
        expect.objectContaining({
          type: 'resource_link',
          uri: 'theologai://documents/apostles-creed#section-source-0001',
          mimeType: 'text/markdown', size: expect.any(Number),
          annotations: { audience: ['assistant'] },
        }),
      ],
      structuredContent: expect.objectContaining({
        schemaVersion: '2', kind: 'classic_text_lookup', mode: 'search',
        search: expect.objectContaining({
          status: 'ok',
          hits: [expect.objectContaining({ snippetOnly: true })],
        }),
      }),
    });
  });

  it('returns structured primary-source evidence and an exact readable D1 resource link', async () => {
    const result = await rpc('tools/call', {
      name: 'primary_source_search',
      arguments: { queries: [{ id: 'creed', text: 'almighty', providers: ['local'], limit: 1 }] },
    }, 42);

    expect(result.response.status).toBe(200);
    expect(result.message.error).toBeUndefined();
    expect(result.message.result).toMatchObject({
      content: [
        expect.objectContaining({ type: 'text', text: expect.any(String) }),
        expect.objectContaining({
          type: 'resource_link',
          uri: 'theologai://documents/apostles-creed#section-source-0001',
          mimeType: 'text/markdown', size: expect.any(Number),
          annotations: { audience: ['assistant'] },
        }),
      ],
      structuredContent: {
        schemaVersion: '7', kind: 'primary_source_search', planStatus: 'complete',
        responseWindow: { unit: 'utf8_bytes', maximum: 32768, truncated: false },
        queries: [expect.objectContaining({
          normalizedSelection: 'relevance',
          providers: [expect.objectContaining({
            provider: 'local', hitCount: 1,
            resultWindow: { returnedHitCount: 1, additionalMatchStatus: 'no_additional_match_observed' },
            hits: [expect.objectContaining({ documentType: 'Creed', documentDate: 'c. 390' })],
          })],
        })],
        coverage: expect.objectContaining({
          localAttempted: true, localHitCount: 1,
          ccelAttempted: false, ccelHitCount: 0,
          serverObserved: {
            searched: [expect.objectContaining({ queryId: 'creed', provider: 'local', returnedHitCount: 1 })],
            notSearched: [],
          },
        }),
        evidencePolicy: {
          snippetUse: 'discovery_only', localSectionAccess: 'mcp_resource_read',
          externalSectionAccess: 'direct_url_only', coverageScope: 'bounded_non_exhaustive',
          externalRightsStatus: 'not_determined',
          lookupAliasUse: 'exact_routing_only_not_metadata_evidence',
          coverageLedger: {
            searched: 'server_observed_provider_execution',
            read: 'host_observed_successful_exact_resource_or_page_read',
            deferred: 'host_recorded_intentional_deferral',
            notSearched: 'server_observed_provider_non_execution',
          },
        },
      },
    });
    expect((result.message.result?.content as Array<Record<string, unknown>>)[0]).toMatchObject({
      type: 'text', text: expect.stringContaining('# Primary-source discovery'),
    });
    expect(Object.keys((result.message.result?.structuredContent as any).coverage).sort()).toEqual([
      'ccelAttempted', 'ccelHitCount', 'localAttempted', 'localHitCount', 'localStatus', 'notices', 'serverObserved',
    ]);
    const blocks = result.message.result?.content as Array<Record<string, unknown>>;
    const link = blocks.find(block => block.type === 'resource_link')!;
    const read = await rpc('resources/read', { uri: link.uri }, 43);
    const contents = read.message.result?.contents as Array<Record<string, unknown>>;
    expect(new TextEncoder().encode(String(contents[0].text)).byteLength).toBe(link.size);
  });

  it('lists prompts and renders a validated prompt through the Worker endpoint', async () => {
    const listed = await rpc('prompts/list', undefined, 8);

    expect(listed.response.status).toBe(200);
    expect(listed.message.error).toBeUndefined();
    expect(listed.message.result?.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'passage-exegesis' }),
      expect.objectContaining({ name: 'word-study' }),
      expect.objectContaining({
        name: 'primary-source-research',
        description: expect.stringContaining('optional external discovery leads'),
      }),
    ]));

    const primarySourcePrompt = await rpc('prompts/get', {
      name: 'primary-source-research',
      arguments: { topic: 'eucharist', authors: 'Martin Luther' },
    }, 801);
    expect(primarySourcePrompt.message.error).toBeUndefined();
    expect(JSON.stringify(primarySourcePrompt.message.result?.messages)).toContain(
      'Each call contains at most one CCEL-bearing query',
    );
    expect(JSON.stringify(primarySourcePrompt.message.result?.messages)).toContain(
      'Never quote, compare creators or works, or draw substantive conclusions from any search snippet alone',
    );

    const confessionPrompt = await rpc('prompts/get', {
      name: 'confession-study', arguments: { topic: 'justification' },
    }, 802);
    expect(confessionPrompt.message.error).toBeUndefined();
    expect(JSON.stringify(confessionPrompt.message.result?.messages)).toContain(
      'external `external_url` locator',
    );
    expect(JSON.stringify(confessionPrompt.message.result?.messages)).toContain(
      'rights status is not determined',
    );

    const rendered = await rpc('prompts/get', {
      name: 'passage-exegesis',
      arguments: { reference: 'John 3:16', translation: 'NET' },
    }, 9);

    expect(rendered.response.status).toBe(200);
    expect(rendered.message.error).toBeUndefined();
    expect(rendered.message.result?.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: expect.objectContaining({
          type: 'text',
          text: expect.stringMatching(/systematic exegesis of John 3:16[\s\S]*"translation":"NET"/),
        }),
      }),
    ]);
    const renderedPrompt = promptText(rendered.message);
    const initialParallelCall = renderedPrompt.match(/`parallel_passages` with `([^`]+)`/);
    expect(initialParallelCall?.[1]).toBeDefined();
    expect(JSON.parse(initialParallelCall![1]!)).toEqual({
      reference: 'John 3:16', corpora: ['ubs_source_attested'], maxGroups: 5, includeText: false,
    });
    expect(renderedPrompt).toContain('preserving exactly the same `reference`, `corpora`, and `maxGroups`');
    expect(renderedPrompt).toContain('omit `includeText`, translation, alignment, legacy, and OpenBible controls');
    expect(renderedPrompt).toContain('Never inspect, decode, or rewrite the cursor');
    expect(renderedPrompt).toContain('Stop at a terminal window, once the evidence is sufficient, or after two continuation calls');
    expect(renderedPrompt).toContain('if that cap ends a potentially useful survey, disclose that it was bounded');
    expect(renderedPrompt).toContain('Preserve each selected group and every member intact; do not dedupe or flatten the groups');
    expect(renderedPrompt).toContain('separate text-enrichment queue by traversing the selected groups and their members in returned source order');
    expect(renderedPrompt).toContain('Dedupe only that queue by `normalizedReference`, keeping its first occurrence');
    expect(renderedPrompt).toContain('label every later unique queue reference `budget_omitted` before lookup');
    expect(renderedPrompt).toContain('never backfill with later references');
    expect(renderedPrompt).toContain('`bible_cross_references` with `{"reference":"John 3:16"}` separately for broader OpenBible.info discovery');
    expect(renderedPrompt).not.toContain('complete UBS source-attested group metadata');
    expect(renderedPrompt).toContain(
      'do not infer quotation, dependence, synoptic direction, or a thematic relationship',
    );
    expect(renderedPrompt).toContain(
      '`sourceAttestedResultWindow.additionalMatchStatus` is `additional_match_observed`',
    );
    expect(renderedPrompt).toContain(
      'Pass that `nextCursor` unchanged as `groupCursor`',
    );
    expect(renderedPrompt).toContain(
      'at most three pages / 15 groups',
    );
    expect(renderedPrompt).toContain(
      'at most two materially relevant groups',
    );
    expect(renderedPrompt).toContain(
      'only for the first 12 unique queue references',
    );
    expect(renderedPrompt).toContain(
      'Never combine `groupCursor` with `includeText`',
    );
    expect(renderedPrompt).not.toContain(
      'plus `includeText: true`',
    );

    const wrongType = await rpc('prompts/get', {
      name: 'passage-exegesis',
      arguments: { reference: 316 },
    }, 504);
    expect(wrongType.response.status).toBe(200);
    expect(wrongType.message.result).toBeUndefined();
    expect(wrongType.message.error).toMatchObject({
      code: -32602,
      message: expect.stringContaining('Argument "reference" for prompt "passage-exegesis" must be a string'),
    });

    const wrongArgumentsContainer = await rpc('prompts/get', {
      name: 'passage-exegesis',
      arguments: [],
    }, 505);
    expect(wrongArgumentsContainer.message.error).toMatchObject({
      code: -32602,
      message: expect.stringContaining('Arguments for prompt "passage-exegesis" must be an object'),
    });
  });

  it('returns tool execution errors for arguments that violate the advertised schema', async () => {
    const missingRequired = await rpc('tools/call', {
      name: 'bible_cross_references',
      arguments: {},
    }, 10);

    expect(missingRequired.response.status).toBe(200);
    expect(missingRequired.message.error).toBeUndefined();
    expect(missingRequired.message.result).toMatchObject({
      isError: true,
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('missing required argument "reference"'),
        }),
      ],
    });

    const wrongType = await rpc('tools/call', {
      name: 'bible_cross_references',
      arguments: { reference: 'John 3:16', maxResults: 'many' },
    }, 11);

    expect(wrongType.response.status).toBe(200);
    expect(wrongType.message.error).toBeUndefined();
    expect(wrongType.message.result).toMatchObject({
      isError: true,
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('argument "maxResults" must be integer'),
        }),
      ],
    });
  });

  it('returns the MCP resource-not-found protocol error for an unknown URI', async () => {
    const result = await rpc('resources/read', {
      uri: 'theologai://documents/not-in-the-fixture',
    }, 12);

    expect(result.response.status).toBe(200);
    expect(result.message.result).toBeUndefined();
    expect(result.message.error).toMatchObject({
      code: -32002,
      data: { uri: 'theologai://documents/not-in-the-fixture' },
    });
    expect(result.message.error?.message).toContain('Resource not found');
  });

  it('rejects browser origins outside the explicit allowlist', async () => {
    const response = await SELF.fetch(MCP_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: 'https://untrusted.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 13, method: 'tools/list' }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it.each(['GET', 'DELETE'])('rejects stateless %s streams with 405', async method => {
    const response = await SELF.fetch(MCP_URL, {
      method,
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST, OPTIONS');
  });

  it('rejects streamed request bodies above the configured byte limit', async () => {
    const response = await SELF.fetch(MCP_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/list',
        padding: 'x'.repeat(2048),
      }),
    });

    expect(response.status).toBe(413);
  });
});
