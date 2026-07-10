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
        'original_language_lookup',
        'bible_verse_morphology',
        'donation_config',
        'verify_donation',
      ]);
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
    } finally {
      await Promise.allSettled([client.close(), harness.server.close()]);
    }
  });
});
