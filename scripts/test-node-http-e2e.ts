#!/usr/bin/env tsx
/** Deterministic process-boundary smoke test for the compiled Node HTTP server. */

import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  assertMcpTransportContract,
  captureMcpTransportSnapshot,
} from '../test/helpers/mcpTransportContract.js';
import {
  COMPILED_SERVER,
  SHUTDOWN_TIMEOUT_MS,
  spawnNodeE2eProcess,
  stopNodeE2eProcess,
  withCleanup,
  withIsolatedNodeE2eFixtures,
  withNodeE2eFixture,
  withTimeout,
  type NodeE2eWorkspace,
} from './node-e2e-fixture.js';

const STARTUP_TIMEOUT_MS = 15_000;
const MCP_TIMEOUT_MS = 10_000;
const TEST_ORIGIN = 'http://e2e.local';

async function findAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'Failed to reserve a loopback port');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function waitUntilReady(url: URL, server: ReturnType<typeof spawnNodeE2eProcess>): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { exitCode, signalCode } = server.child;
    if (server.error() || exitCode !== null || signalCode !== null) {
      throw new Error(`Node HTTP server exited during startup (${signalCode ?? exitCode})\n${server.logs()}`, {
        cause: server.error(),
      });
    }
    try {
      const response = await fetch(url, {
        headers: { Origin: TEST_ORIGIN },
        signal: AbortSignal.timeout(500),
      });
      await response.body?.cancel();
      if (response.status === 405) return;
    } catch {
      // The listener may not be ready yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Node HTTP server did not become ready\n${server.logs()}`);
}

function resultText(content: Array<{ type: string; text?: string }>): string {
  return content.filter(item => item.type === 'text').map(item => item.text ?? '').join('\n');
}

function resourceText(contents: Array<{ text?: string }>): string {
  return contents.map(item => item.text ?? '').join('\n');
}

function providerNeutralPrimarySourceArguments(inputSchema: object): Record<string, unknown> {
  const properties = (inputSchema as {
    properties?: { queries?: { items?: { properties?: Record<string, unknown> } } };
  }).properties?.queries?.items?.properties;
  assert(properties, 'primary_source_search must advertise query properties');
  const query = {
    id: 'node-e2e-topic',
    text: 'justification',
    match: 'all_terms',
    selection: 'work_diversity',
    limit: 2,
    ...(Object.hasOwn(properties, 'searchDepth')
      ? { searchDepth: 'standard' }
      : { providers: ['local'] }),
  };
  return { queries: [query] };
}

export async function runNodeHttpE2e(workspace: NodeE2eWorkspace, serverEntry = COMPILED_SERVER): Promise<void> {
  const port = await findAvailablePort();
  const endpoint = new URL(`http://127.0.0.1:${port}/mcp`);
  const server = spawnNodeE2eProcess(workspace, [serverEntry], {
    HOST: '127.0.0.1',
    PORT: String(port),
    MCP_ALLOWED_ORIGINS: TEST_ORIGIN,
    THEOLOGAI_DATABASE_PATH: workspace.databasePath,
  });
  let client: Client | undefined;
  let transport: StreamableHTTPClientTransport | undefined;

  await withCleanup(async () => {
    await waitUntilReady(endpoint, server);

    client = new Client(
      { name: 'theologai-node-e2e', version: '1.0.0' },
      { capabilities: {} },
    );
    transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { Origin: TEST_ORIGIN } },
    });
    await withTimeout(client.connect(transport), MCP_TIMEOUT_MS, 'MCP initialize');

    assert.equal(client.getServerVersion()?.name, 'theologai-bible-server');
    assert.deepEqual(Object.keys(client.getServerCapabilities() ?? {}).sort(), [
      'prompts', 'resources', 'tools',
    ]);

    const contract = await withTimeout(
      captureMcpTransportSnapshot(client),
      MCP_TIMEOUT_MS,
      'MCP transport contract',
    );
    await assertMcpTransportContract(contract, { contractVersion: '6', logging: false });
    const tools = { tools: contract.tools };
    assert(tools.tools.some(tool => tool.name === 'original_language_lookup'));
    const primarySourceSearch = tools.tools.find(tool => tool.name === 'primary_source_search');
    assert(primarySourceSearch, 'tools/list must include primary_source_search');
    assert(contract.staticResources.some(resource => resource.uri === 'theologai://translations'));
    assert(contract.prompts.some(prompt => prompt.name === 'word-study'));

    const strongsResource = await withTimeout(
      client.readResource({ uri: 'theologai://strongs/G25' }),
      MCP_TIMEOUT_MS,
      'resources/read',
    );
    const strongsText = resourceText(strongsResource.contents as Array<{ text?: string }>);
    assert.match(strongsText, /G25/);
    assert.match(strongsText, /agap/i);

    const lookup = await withTimeout(
      client.callTool({
        name: 'original_language_lookup',
        arguments: { strongs_number: 'G25' },
      }),
      MCP_TIMEOUT_MS,
      'tools/call',
    );
    assert.equal(lookup.isError, undefined);
    const lookupText = resultText(lookup.content as Array<{ type: string; text?: string }>);
    assert.match(lookupText, /G25/);
    assert.match(lookupText, /agap/i);

    const primarySources = await withTimeout(
      client.callTool({
        name: 'primary_source_search',
        arguments: providerNeutralPrimarySourceArguments(primarySourceSearch.inputSchema as object),
      }),
      MCP_TIMEOUT_MS,
      'provider-neutral primary_source_search',
    );
    assert.equal(primarySources.isError, undefined);
    const primaryStructured = primarySources.structuredContent as {
      schemaVersion?: string;
      queries?: Array<{ providers?: Array<{ provider?: string }> }>;
    } | undefined;
    assert.equal(primaryStructured?.schemaVersion, '6');
    assert.deepEqual(
      primaryStructured.queries?.flatMap(query => query.providers ?? []).map(provider => provider.provider),
      ['local'],
      'provider-neutral local search must retain one local provider group',
    );

    await withTimeout(client.close(), SHUTDOWN_TIMEOUT_MS, 'legacy MCP client close');
    client = undefined;
    transport = undefined;

    client = new Client(
      { name: 'theologai-node-e2e-modern', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { Origin: TEST_ORIGIN } },
    });
    await withTimeout(client.connect(transport), MCP_TIMEOUT_MS, 'modern MCP discovery');
    assert.equal(client.getProtocolEra(), 'modern');
    assert.equal(client.getNegotiatedProtocolVersion(), '2026-07-28');
    assert.deepEqual(client.getDiscoverResult(), expectModernDiscovery());
    const modernContract = await withTimeout(
      captureMcpTransportSnapshot(client),
      MCP_TIMEOUT_MS,
      'modern MCP transport contract',
    );
    await assertMcpTransportContract(modernContract, { contractVersion: '6', logging: false });
    const modernDonation = await withTimeout(
      client.callTool({ name: 'donation_config', arguments: {} }),
      MCP_TIMEOUT_MS,
      'modern tools/call',
    );
    assert.equal(modernDonation.isError, undefined);
    assert.equal((modernDonation.structuredContent as { kind?: string } | undefined)?.kind, 'donation_config');

    console.error('[node-http-e2e] Compiled Node HTTP MCP server passed legacy and modern process-boundary checks.');
  }, async () => withCleanup(async () => {
    if (transport) {
      const close = client?.transport === transport ? client.close() : transport.close();
      await withTimeout(close, SHUTDOWN_TIMEOUT_MS, 'MCP client close');
    }
  }, () => stopNodeE2eProcess(server))).catch(error => {
    const logs = server.logs();
    if (logs) console.error(logs);
    throw error;
  });
}

function expectModernDiscovery(): Record<string, unknown> {
  return {
    supportedVersions: ['2026-07-28'],
    capabilities: { tools: {}, resources: {}, prompts: {} },
    resultType: 'complete',
    ttlMs: 0,
    cacheScope: 'private',
    _meta: {
      'io.modelcontextprotocol/serverInfo': {
        name: 'theologai-bible-server',
        version: '3.6.0',
      },
    },
  };
}

async function main(): Promise<void> {
  if (process.argv[2] === '--with-stdio') {
    const { runNodeStdioE2e } = await import('./test-node-stdio-e2e.js');
    await withIsolatedNodeE2eFixtures(runNodeHttpE2e, runNodeStdioE2e);
  } else {
    await withNodeE2eFixture(runNodeHttpE2e);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('[node-http-e2e] Failed:', error);
    process.exitCode = 1;
  });
}
