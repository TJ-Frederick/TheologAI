import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createTheologAiMcpServer } from '../../../src/mcp/server.js';
import { BibleMCPServer } from '../../../src/server.js';
import { createWorkerMcpServer } from '../../../src/worker-server.js';
import {
  createDeterministicMcpFixture,
  type DeterministicMcpRoot,
} from '../../fixtures/mcpCompositionRoot.js';

interface ServerHarness {
  server: Server;
  connect(transport: Transport): Promise<void>;
}

const SERVER_FACTORIES: Array<{
  name: string;
  logging: boolean;
  create(root: DeterministicMcpRoot, version: string): ServerHarness;
}> = [
  {
    name: 'shared MCP factory',
    logging: true,
    create(root, version) {
      const mcpServer = createTheologAiMcpServer(root, version);
      return {
        server: mcpServer.server,
        connect: transport => mcpServer.connect(transport),
      };
    },
  },
  {
    name: 'Node compatibility adapter',
    logging: true,
    create(root, version) {
      const nodeServer = new BibleMCPServer(root, version);
      return {
        server: nodeServer.getServer(),
        connect: transport => nodeServer.connect(transport),
      };
    },
  },
  {
    name: 'Worker compatibility adapter',
    logging: false,
    create(root, version) {
      const mcpServer = createWorkerMcpServer(root, version);
      return {
        server: mcpServer.server,
        connect: transport => mcpServer.connect(transport),
      };
    },
  },
];

describe.each(SERVER_FACTORIES)('$name protocol contract', ({ create, logging }) => {
  it('initializes, lists registered tools, and dispatches a real tool handler', async () => {
    const { root, biblePassageCalls } = createDeterministicMcpFixture();
    const harness = create(root, 'integration-test');
    const client = new Client(
      { name: 'theologai-integration-client', version: '1.0.0' },
      { capabilities: {} },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await harness.connect(serverTransport);
      await client.connect(clientTransport);

      expect(client.getServerVersion()).toEqual({
        name: 'theologai-bible-server',
        version: 'integration-test',
      });
      expect(client.getServerCapabilities()).toEqual({
        tools: {},
        resources: {},
        prompts: {},
        ...(logging ? { logging: {} } : {}),
      });

      const listed = await client.listTools();
      expect(listed.tools.map(tool => tool.name)).toEqual([
        'bible_lookup',
        'bible_cross_references',
        'parallel_passages',
        'commentary_lookup',
        'classic_text_lookup',
        'primary_source_search',
        'original_language_lookup',
        'bible_verse_morphology',
        'original_language_study',
        'donation_config',
        'verify_donation',
      ]);
      expect(listed.tools.filter(tool => tool.outputSchema).map(tool => tool.name)).toEqual([
        'bible_lookup',
        'bible_cross_references',
        'parallel_passages',
        'primary_source_search',
        'original_language_lookup',
        'bible_verse_morphology',
        'original_language_study',
        'donation_config',
        'verify_donation',
      ]);
      expect(listed.tools.find(tool => tool.name === 'bible_lookup')?.outputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
        properties: { schemaVersion: { const: '1' }, kind: { const: 'bible_lookup' } },
      });
      expect(listed.tools.find(tool => tool.name === 'original_language_lookup')?.outputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
        properties: { schemaVersion: { const: '1' }, kind: { const: 'original_language_lookup' } },
      });
      expect(listed.tools.find(tool => tool.name === 'bible_verse_morphology')?.outputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
        properties: {
          schemaVersion: { const: '1' },
          kind: { const: 'bible_verse_morphology' },
          words: { maxItems: 200 },
        },
      });
      expect(listed.tools.find(tool => tool.name === 'primary_source_search')?.outputSchema).toMatchObject({
        properties: { schemaVersion: { const: '3' } },
      });
      const primarySourceTool = listed.tools.find(tool => tool.name === 'primary_source_search')!;
      expect(JSON.stringify(primarySourceTool.inputSchema).toLowerCase()).not.toContain('ccel');
      expect(JSON.stringify(primarySourceTool.outputSchema).toLowerCase()).not.toContain('ccel');
      expect((primarySourceTool.outputSchema!.properties!.queries as any).items.properties.providers)
        .toMatchObject({ minItems: 1, maxItems: 1 });

      const primarySource = await client.callTool({
        name: 'primary_source_search',
        arguments: { queries: [{ id: 'local-only', text: 'faith', providers: ['local'] }] },
      });
      expect(primarySource.isError).not.toBe(true);
      expect(primarySource.structuredContent).toMatchObject({
        schemaVersion: '3', kind: 'primary_source_search',
        queries: [{ providers: [{ provider: 'local' }] }],
        coverage: { localAttempted: false, localHitCount: 0 },
      });
      expect(JSON.stringify(primarySource).toLowerCase()).not.toContain('ccel');
      expect((primarySource.structuredContent as any).coverage).not.toHaveProperty('ccelAttempted');
      expect(listed.tools.find(tool => tool.name === 'donation_config')?.outputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
        properties: { schemaVersion: { const: '1' }, kind: { const: 'donation_config' } },
      });
      expect(listed.tools.find(tool => tool.name === 'verify_donation')?.outputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
        properties: { schemaVersion: { const: '1' }, kind: { const: 'verify_donation' } },
      });
      const resources = await client.listResources();
      expect(resources.resources).toContainEqual(expect.objectContaining({
        uri: 'theologai://primary-sources/catalog', mimeType: 'application/json',
      }));
      const catalog = await client.readResource({ uri: 'theologai://primary-sources/catalog' });
      expect(JSON.parse(String(catalog.contents[0].text))).toMatchObject({
        schemaVersion: '1', kind: 'local_primary_source_catalog', workCount: 0,
        policies: { scope: 'hosted_collection_only', rightsStatus: 'not_established' },
      });
      expect(listed.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'bible_lookup',
          description: expect.stringContaining('Look up Bible verses'),
          annotations: expect.objectContaining({
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
          }),
        }),
      ]));

      const classicSchema = listed.tools.find(tool => tool.name === 'classic_text_lookup')?.inputSchema;
      const languageSchema = listed.tools.find(tool => tool.name === 'original_language_lookup')?.inputSchema;
      expect(classicSchema).not.toHaveProperty('oneOf');
      expect(classicSchema).toMatchObject({ minProperties: 1 });
      expect(classicSchema?.properties).toMatchObject({
        work: expect.objectContaining({ type: 'string' }),
        query: expect.objectContaining({ type: 'string' }),
        listWorks: expect.objectContaining({ const: true }),
      });
      expect(languageSchema).not.toHaveProperty('oneOf');
      expect(languageSchema).toMatchObject({ minProperties: 1 });
      expect(languageSchema?.properties).toMatchObject({
        strongs_number: expect.objectContaining({ type: 'string' }),
        query: expect.objectContaining({ type: 'string' }),
        usage_level: expect.objectContaining({ enum: ['overview', 'study', 'technical'] }),
        occurrence_limit: expect.objectContaining({ minimum: 1, maximum: 25 }),
        occurrence_cursor: expect.objectContaining({ maxLength: 512 }),
      });
      expect(languageSchema?.properties?.detail_level).not.toHaveProperty('default');
      expect(languageSchema?.properties?.include_extended).not.toHaveProperty('default');
      expect(languageSchema?.properties?.usage_level).not.toHaveProperty('default');
      expect(languageSchema?.properties?.occurrence_limit).not.toHaveProperty('default');
      expect(languageSchema?.properties?.occurrence_cursor).not.toHaveProperty('default');
      expect(languageSchema?.properties?.limit).not.toHaveProperty('default');

      const invalidClassic = await client.callTool({
        name: 'classic_text_lookup',
        arguments: { work: 'nicene-creed', query: 'trinity' },
      });
      expect(invalidClassic).toMatchObject({
        isError: true,
        content: [expect.objectContaining({ text: expect.stringContaining('query is the local-search mode') })],
      });

      const invalidLanguage = await client.callTool({
        name: 'original_language_lookup',
        arguments: { strongs_number: 'G26', limit: 5 },
      });
      expect(invalidLanguage).toMatchObject({
        isError: true,
        content: [expect.objectContaining({ text: expect.stringContaining('limit is only valid with query search') })],
      });

      const materializedSearch = await client.callTool({
        name: 'original_language_lookup',
        arguments: { query: 'love', limit: 10 },
      });
      expect(materializedSearch.isError).not.toBe(true);

      const primarySourceSearch = await client.callTool({
        name: 'primary_source_search',
        arguments: {
          queries: [{ id: 'local-discovery', text: 'Lord’s Supper', providers: ['local'] }],
        },
      });
      expect(primarySourceSearch).toMatchObject({
        content: [expect.objectContaining({
          text: expect.stringContaining('Plan status: **complete**'),
        })],
        structuredContent: {
          schemaVersion: '3',
          kind: 'primary_source_search',
          planStatus: 'complete',
          queries: [expect.objectContaining({
            normalizedSelection: 'relevance',
            providers: [expect.objectContaining({
              resultWindow: { returnedHitCount: 0, additionalMatchStatus: 'not_evaluated' },
            })],
          })],
          coverage: expect.any(Object),
          evidencePolicy: {
            snippetUse: 'discovery_only',
            selectedSectionAccess: 'mcp_resource_read',
            coverageScope: 'bounded_non_exhaustive',
            editionProvenance: 'incomplete',
            lookupAliasUse: 'exact_routing_only_not_metadata_evidence',
          },
        },
      });
      expect(primarySourceSearch.isError).not.toBe(true);

      const crossReferences = await client.callTool({
        name: 'bible_cross_references',
        arguments: { reference: 'Jn 3.16' },
      });
      expect(crossReferences).toMatchObject({
        content: [expect.objectContaining({
          text: expect.stringContaining('Cross-References for Jn 3.16'),
        })],
        structuredContent: {
          schemaVersion: '1',
          kind: 'bible_cross_references',
          requestedReference: 'Jn 3.16',
          resolvedReference: 'John 3:16',
          query: { maxResults: 5, minVotes: 0 },
          ranking: {
            method: 'openbible_votes_descending',
            tieBreak: 'source_reference_ascending',
          },
          semantics: {
            evidenceUse: 'discovery_lead',
            relationshipClassification: 'unspecified',
            directionality: 'unspecified',
          },
          references: [],
          resultWindow: { returnedCount: 0, qualifyingTotal: 0, hasMore: false },
          provenance: [expect.objectContaining({
            id: 'openbible-cross-references',
            version: '2025-10-13',
          })],
        },
      });
      expect(crossReferences.isError).not.toBe(true);

      const result = await client.callTool({
        name: 'bible_lookup',
        arguments: { reference: 'John 3:16', translation: 'ESV' },
      });

      expect(biblePassageCalls).toEqual([
        {
          reference: expect.objectContaining({
            book: expect.objectContaining({ name: 'John' }),
            chapter: 3,
            startVerse: 16,
          }),
          translation: 'ESV',
          options: { includeFootnotes: undefined },
        },
      ]);
      expect(result.content).toEqual([
        {
          type: 'text',
          text: '**John 3:16 (ESV)**\n\nFor God so loved the world.\n\n*Source: Deterministic test fixture*',
        },
      ]);
      expect(result.structuredContent).toMatchObject({
        schemaVersion: '1',
        kind: 'bible_lookup',
        passages: [{ translation: 'ESV', text: 'For God so loved the world.', provenanceIds: ['src-1'] }],
        failures: [],
      });
    } finally {
      await Promise.allSettled([client.close(), harness.server.close()]);
    }
  });
});
