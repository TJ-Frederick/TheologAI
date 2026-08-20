#!/usr/bin/env tsx
/** Deterministic public-SDK process-boundary test for the compiled Node stdio server. */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  DEFAULT_INHERITED_ENV_VARS,
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  assertMcpTransportContract,
  captureMcpTransportSnapshot,
} from '../test/helpers/mcpTransportContract.js';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSX_CLI = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const MAX_STDERR_CHARS = 64 * 1024;
const OPERATION_TIMEOUT_MS = 180_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} exceeded ${OPERATION_TIMEOUT_MS}ms`)), OPERATION_TIMEOUT_MS);
      timer.unref();
    }),
  ]);
}

function assertSafeSdkEnvironment(): void {
  const expected = process.platform === 'win32'
    ? ['APPDATA', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'PATH', 'PROCESSOR_ARCHITECTURE', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP', 'USERNAME', 'USERPROFILE', 'PROGRAMFILES']
    : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'];
  assert.deepEqual(DEFAULT_INHERITED_ENV_VARS, expected);
  const inheritedNames = Object.keys(getDefaultEnvironment());
  assert(inheritedNames.every(name => expected.includes(name)), 'SDK default environment exposed an unapproved name');
  assert(inheritedNames.every(name => !/(API_KEY|TOKEN|SECRET|RPC_URL|PRIVATE_KEY|DOTENV_CONFIG_|PORT)/i.test(name)));
}

async function main(): Promise<void> {
  assert.equal(Number(process.versions.node.split('.')[0]), 22, `Node stdio E2E requires Node 22; received ${process.version}`);
  assertSafeSdkEnvironment();

  const workspace = await mkdtemp(join(tmpdir(), 'theologai-node-stdio-e2e-'));
  const databasePath = join(workspace, 'theologai.db');
  let client: Client | undefined;

  try {
    await withTimeout(execFileAsync(process.execPath, [
      TSX_CLI,
      join(ROOT, 'scripts', 'build-database.ts'),
      '--output',
      databasePath,
    ], { cwd: workspace, maxBuffer: 64 * 1024 }), 'database build');
    await withTimeout(execFileAsync(process.execPath, [
      TSX_CLI,
      join(ROOT, 'scripts', 'verify-database.ts'),
      '--database',
      databasePath,
    ], { cwd: workspace, maxBuffer: 64 * 1024 }), 'database verification');

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(ROOT, 'dist', 'index.js')],
      cwd: workspace,
      env: {
        NODE_ENV: 'test',
        THEOLOGAI_DATABASE_PATH: databasePath,
      },
      stderr: 'pipe',
    });
    assert(transport.stderr, 'public stderr stream must exist before client.connect');
    let stderr = '';
    transport.stderr.on('data', chunk => {
      stderr = `${stderr}${String(chunk)}`.slice(-MAX_STDERR_CHARS);
    });

    client = new Client({ name: 'theologai-node-stdio-e2e', version: '1.0.0' }, { capabilities: {} });
    await withTimeout(client.connect(transport), 'MCP initialize');
    await withTimeout(client.setLoggingLevel('warning'), 'logging/setLevel');
    const contract = await withTimeout(captureMcpTransportSnapshot(client), 'MCP transport contract');
    await assertMcpTransportContract(contract, { contractVersion: '6', logging: true });
    assert(stderr.length <= MAX_STDERR_CHARS, 'stdio stderr capture exceeded its bound');
    console.error('[node-stdio-e2e] Compiled Node stdio MCP server passed public transport checks.');
  } finally {
    if (client) await withTimeout(client.close(), 'MCP client close').catch(() => undefined);
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('[node-stdio-e2e] Failed:', error);
  process.exitCode = 1;
});
