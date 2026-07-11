#!/usr/bin/env tsx
/** Deterministic process-boundary smoke test for the compiled Node HTTP server. */

import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSX_CLI = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const MAX_LOG_CHARS = 64 * 1024;
const COMMAND_TIMEOUT_MS = 180_000;
const STARTUP_TIMEOUT_MS = 15_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const MCP_TIMEOUT_MS = 10_000;
const TEST_ORIGIN = 'http://e2e.local';

interface CapturedProcess {
  child: ChildProcessWithoutNullStreams;
  logs(): string;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function appendBounded(current: string, chunk: Buffer | string): string {
  const combined = current + chunk.toString();
  return combined.length <= MAX_LOG_CHARS ? combined : combined.slice(-MAX_LOG_CHARS);
}

function sanitizedEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const entries = Object.entries(process.env).filter(([name]) =>
    !/(API_KEY|TOKEN|SECRET|RPC_URL|PRIVATE_KEY)/i.test(name)
  );
  return { ...Object.fromEntries(entries), ...overrides };
}

function spawnCaptured(
  command: string,
  args: string[],
  env = process.env,
  cwd = ROOT,
): CapturedProcess {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output = appendBounded(output, chunk); });
  child.stderr.on('data', chunk => { output = appendBounded(output, chunk); });
  return { child, logs: () => output };
}

async function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<number | null> {
  if (child.exitCode !== null) return child.exitCode;
  return await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Process did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    const onExit = (code: number | null) => { cleanup(); resolve(code); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function runCommand(label: string, command: string, args: string[]): Promise<void> {
  const processHandle = spawnCaptured(command, args, sanitizedEnvironment());
  let timer: NodeJS.Timeout | undefined;
  try {
    const exitCode = await Promise.race([
      waitForExit(processHandle.child, COMMAND_TIMEOUT_MS),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), COMMAND_TIMEOUT_MS);
      }),
    ]);
    assert.equal(exitCode, 0, `${label} failed with exit code ${exitCode}\n${processHandle.logs()}`);
  } catch (error) {
    if (processHandle.child.exitCode === null) processHandle.child.kill('SIGKILL');
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

async function waitUntilReady(url: URL, server: CapturedProcess): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`Node HTTP server exited during startup (${server.child.exitCode})\n${server.logs()}`);
    }
    try {
      const response = await fetch(url, {
        headers: { Origin: TEST_ORIGIN },
        signal: AbortSignal.timeout(500),
      });
      if (response.status === 405) return;
    } catch {
      // The listener may not be ready yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Node HTTP server did not become ready\n${server.logs()}`);
}

async function stopServer(server: CapturedProcess | undefined): Promise<void> {
  if (!server || server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  try {
    await waitForExit(server.child, SHUTDOWN_TIMEOUT_MS);
  } catch {
    server.child.kill('SIGKILL');
    await waitForExit(server.child, SHUTDOWN_TIMEOUT_MS);
  }
}

function resultText(content: Array<{ type: string; text?: string }>): string {
  return content.filter(item => item.type === 'text').map(item => item.text ?? '').join('\n');
}

function resourceText(contents: Array<{ text?: string }>): string {
  return contents.map(item => item.text ?? '').join('\n');
}

async function main(): Promise<void> {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  assert.equal(nodeMajor, 22, `Node HTTP E2E requires Node 22; received ${process.version}. Run with .nvmrc.`);

  const workspace = await mkdtemp(join(tmpdir(), 'theologai-node-e2e-'));
  const databasePath = join(workspace, 'theologai.db');
  let server: CapturedProcess | undefined;
  let client: Client | undefined;

  try {
    await runCommand('database build', process.execPath, [
      TSX_CLI,
      join(ROOT, 'scripts', 'build-database.ts'),
      '--output',
      databasePath,
    ]);
    await runCommand('database verification', process.execPath, [
      TSX_CLI,
      join(ROOT, 'scripts', 'verify-database.ts'),
      '--database',
      databasePath,
    ]);

    const port = await findAvailablePort();
    const endpoint = new URL(`http://127.0.0.1:${port}/mcp`);
    server = spawnCaptured(
      process.execPath,
      [join(ROOT, 'dist', 'index.js')],
      sanitizedEnvironment({
        HOST: '127.0.0.1',
        PORT: String(port),
        MCP_ALLOWED_ORIGINS: TEST_ORIGIN,
        THEOLOGAI_DATABASE_PATH: databasePath,
      }),
      // Keep dotenv/config from discovering the repository's developer .env.
      workspace,
    );
    await waitUntilReady(endpoint, server);

    client = new Client(
      { name: 'theologai-node-e2e', version: '1.0.0' },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { Origin: TEST_ORIGIN } },
    });
    await withTimeout(client.connect(transport), MCP_TIMEOUT_MS, 'MCP initialize');

    assert.equal(client.getServerVersion()?.name, 'theologai-bible-server');
    assert.deepEqual(Object.keys(client.getServerCapabilities() ?? {}).sort(), [
      'prompts', 'resources', 'tools',
    ]);

    const tools = await withTimeout(client.listTools(), MCP_TIMEOUT_MS, 'tools/list');
    assert(tools.tools.some(tool => tool.name === 'original_language_lookup'));
    const resources = await withTimeout(client.listResources(), MCP_TIMEOUT_MS, 'resources/list');
    assert(resources.resources.some(resource => resource.uri === 'theologai://translations'));
    const prompts = await withTimeout(client.listPrompts(), MCP_TIMEOUT_MS, 'prompts/list');
    assert(prompts.prompts.some(prompt => prompt.name === 'word-study'));

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

    console.error('[node-http-e2e] Compiled Node HTTP MCP server passed process-boundary checks.');
  } catch (error) {
    if (server) console.error(server.logs());
    throw error;
  } finally {
    if (client) {
      await withTimeout(client.close(), SHUTDOWN_TIMEOUT_MS, 'MCP client close').catch(() => undefined);
    }
    await stopServer(server);
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('[node-http-e2e] Failed:', error);
  process.exitCode = 1;
});
