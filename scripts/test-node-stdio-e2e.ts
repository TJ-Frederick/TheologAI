#!/usr/bin/env tsx
/** Deterministic public-SDK process-boundary test for the compiled Node stdio server. */

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import {
  DEFAULT_INHERITED_ENV_VARS,
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/client/stdio';
import {
  assertMcpTransportContract,
  captureMcpTransportSnapshot,
} from '../test/helpers/mcpTransportContract.js';
import {
  COMPILED_SERVER,
  MAX_LOG_CHARS,
  SHUTDOWN_TIMEOUT_MS,
  withCleanup,
  withNodeE2eFixture,
  withTimeout,
  type NodeE2eWorkspace,
} from './node-e2e-fixture.js';

const OPERATION_TIMEOUT_MS = 180_000;

const withOperationTimeout = <T>(promise: Promise<T>, label: string) =>
  withTimeout(promise, OPERATION_TIMEOUT_MS, label);

function assertSafeSdkEnvironment(): void {
  const expected = process.platform === 'win32'
    ? ['APPDATA', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'PATH', 'PROCESSOR_ARCHITECTURE', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP', 'USERNAME', 'USERPROFILE', 'PROGRAMFILES']
    : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'];
  assert.deepEqual(DEFAULT_INHERITED_ENV_VARS, expected);
  const inheritedNames = Object.keys(getDefaultEnvironment());
  assert(inheritedNames.every(name => expected.includes(name)), 'SDK default environment exposed an unapproved name');
  assert(inheritedNames.every(name => !/(API_KEY|TOKEN|SECRET|RPC_URL|PRIVATE_KEY|DOTENV_CONFIG_|PORT)/i.test(name)));
}

export async function withStdioClient(
  workspace: NodeE2eWorkspace,
  serverEntry: string,
  client: Client,
  connectLabel: string,
  run: () => Promise<void>,
): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    cwd: workspace.directory,
    env: { NODE_ENV: 'test', THEOLOGAI_DATABASE_PATH: workspace.databasePath },
    stderr: 'pipe',
  });
  assert(transport.stderr, 'public stderr stream must exist before client.connect');
  let stderr = '';
  transport.stderr.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-MAX_LOG_CHARS); });

  const closed = new Promise<void>(resolve => { transport.onclose = resolve; });
  let spawned = false;
  // Keep the SDK's base transport so modern discovery still uses its own probe sibling.
  const start = transport.start.bind(transport);
  transport.start = () => {
    const starting = start();
    spawned = transport.pid !== null;
    return starting;
  };
  const connection = client.connect(transport);
  // The SDK reaps its modern probe before connect settles. Session close can
  // return after sending SIGKILL, so also wait for the actual child close event.
  const exited = connection.catch(() => undefined).then(() => spawned ? closed : undefined);
  workspace.trackExit(exited);

  await withCleanup(async () => {
    await withOperationTimeout(connection, connectLabel);
    await run();
    assert(stderr.length <= MAX_LOG_CHARS, 'stdio stderr capture exceeded its bound');
  }, async () => {
    const close = client.transport === transport ? client.close() : transport.close();
    await withTimeout(Promise.all([close, exited]), SHUTDOWN_TIMEOUT_MS, `${connectLabel} child shutdown`);
  }).catch(error => {
    if (stderr) console.error(stderr);
    throw error;
  });
}

export async function runNodeStdioE2e(workspace: NodeE2eWorkspace, serverEntry = COMPILED_SERVER): Promise<void> {
  assertSafeSdkEnvironment();

  const legacy = new Client({ name: 'theologai-node-stdio-e2e', version: '1.0.0' }, { capabilities: {} });
  await withStdioClient(workspace, serverEntry, legacy, 'MCP initialize', async () => {
    await withOperationTimeout(legacy.setLoggingLevel('warning'), 'logging/setLevel');
    const contract = await withOperationTimeout(captureMcpTransportSnapshot(legacy), 'MCP transport contract');
    await assertMcpTransportContract(contract, { contractVersion: '6', logging: true });
  });

  const client = new Client(
    { name: 'theologai-node-stdio-e2e-modern', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await withStdioClient(workspace, serverEntry, client, 'modern MCP discovery', async () => {
    assert.equal(client.getProtocolEra(), 'modern');
    assert.equal(client.getNegotiatedProtocolVersion(), '2026-07-28');
    assert.deepEqual(client.getDiscoverResult()?.capabilities, {
      tools: {}, resources: {}, prompts: {},
    });
    assert.equal(client.getDiscoverResult()?.ttlMs, 0);
    assert.equal(client.getDiscoverResult()?.cacheScope, 'private');
    const modernContract = await withOperationTimeout(
      captureMcpTransportSnapshot(client),
      'modern MCP transport contract',
    );
    await assertMcpTransportContract(modernContract, { contractVersion: '6', logging: false });
    const modernDonation = await withOperationTimeout(
      client.callTool({ name: 'donation_config', arguments: {} }),
      'modern tools/call',
    );
    assert.equal(modernDonation.isError, undefined);
    assert.equal((modernDonation.structuredContent as { kind?: string } | undefined)?.kind, 'donation_config');
    await assert.rejects(
      client.setLoggingLevel('warning'),
      /logging/i,
      'modern clients must not be offered deprecated MCP Logging',
    );
  });
  console.error('[node-stdio-e2e] Compiled Node stdio MCP server passed legacy and modern public transport checks.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  withNodeE2eFixture(runNodeStdioE2e).catch(error => {
    console.error('[node-stdio-e2e] Failed:', error);
    process.exitCode = 1;
  });
}
