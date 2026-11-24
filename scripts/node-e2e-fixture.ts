import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSX_LOADER = import.meta.resolve('tsx');
const COMMAND_TIMEOUT_MS = 180_000;
export const SHUTDOWN_TIMEOUT_MS = 5_000;
export const MAX_LOG_CHARS = 64 * 1024;
export const COMPILED_SERVER = join(ROOT, 'dist', 'index.js');

export interface NodeE2eWorkspace {
  directory: string;
  databasePath: string;
  trackExit(exit: Promise<unknown>): void;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function withCleanup<T>(run: () => Promise<T>, cleanup: () => Promise<void>): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Node E2E execution and cleanup failed', { cause: error });
    }
    throw error;
  }
  await cleanup();
  return result;
}

function sanitizedEnvironment(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const entries = Object.entries(process.env).filter(([name]) =>
    !/(API_KEY|TOKEN|SECRET|RPC_URL|PRIVATE_KEY|DOTENV_CONFIG_)/i.test(name)
  );
  return { ...Object.fromEntries(entries), ...overrides };
}

export function spawnNodeE2eProcess(workspace: NodeE2eWorkspace, args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, args, {
    cwd: workspace.directory,
    env: sanitizedEnvironment(env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let processError: Error | undefined;
  const capture = (chunk: Buffer) => { output = `${output}${chunk}`.slice(-MAX_LOG_CHARS); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', error => { processError ??= error; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  workspace.trackExit(closed);
  return { child, closed, logs: () => output, error: () => processError };
}

export async function stopNodeE2eProcess(server: ReturnType<typeof spawnNodeE2eProcess>): Promise<void> {
  const { child, closed } = server;
  const signalIfRunning = (signal: NodeJS.Signals) => {
    if (child.pid && child.exitCode === null && child.signalCode === null) child.kill(signal);
  };
  signalIfRunning('SIGTERM');
  try {
    await withTimeout(closed, SHUTDOWN_TIMEOUT_MS, 'Node E2E child shutdown');
  } catch {
    signalIfRunning('SIGKILL');
    await withTimeout(closed, SHUTDOWN_TIMEOUT_MS, 'Node E2E child exit after SIGKILL');
  }
}

export async function runNodeE2eCommand(
  workspace: NodeE2eWorkspace, label: string, args: string[], timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<void> {
  const command = spawnNodeE2eProcess(workspace, args);
  await withCleanup(async () => {
    const { code, signal } = await withTimeout(command.closed, timeoutMs, label);
    const error = command.error();
    if (error) throw error;
    assert.equal(code, 0, `${label} failed (${signal ?? code})\n${command.logs()}`);
  }, () => stopNodeE2eProcess(command));
}

async function provisionDatabase(workspace: NodeE2eWorkspace): Promise<void> {
  // Load tsx into the child itself so shutdown owns the process writing the database.
  await runNodeE2eCommand(workspace, 'database build', [
    '--import', TSX_LOADER, join(ROOT, 'scripts', 'build-database.ts'), '--output', workspace.databasePath,
  ]);
  await runNodeE2eCommand(workspace, 'database verification', [
    '--import', TSX_LOADER, join(ROOT, 'scripts', 'verify-database.ts'), '--database', workspace.databasePath,
  ]);
}

export async function withNodeE2eFixture(
  run: (workspace: NodeE2eWorkspace) => Promise<void>,
  provision = provisionDatabase,
): Promise<void> {
  assert.equal(Number(process.versions.node.split('.')[0]), 22,
    `Node E2E requires Node 22; received ${process.version}. Run with .nvmrc.`);
  const directory = await mkdtemp(resolve(tmpdir(), 'theologai-node-e2e-'));
  const exits: Promise<unknown>[] = [];
  const workspace: NodeE2eWorkspace = {
    directory, databasePath: join(directory, 'theologai.db'),
    trackExit: exit => { exits.push(exit); },
  };
  await withCleanup(async () => {
    await provision(workspace);
    await run(workspace);
  }, async () => {
    await withTimeout(Promise.all(exits), SHUTDOWN_TIMEOUT_MS, `E2E child exit before removing ${directory}`);
    await rm(directory, { recursive: true, force: true });
  });
}

export async function withIsolatedNodeE2eFixtures(
  http: (workspace: NodeE2eWorkspace) => Promise<void>,
  stdio: (workspace: NodeE2eWorkspace) => Promise<void>,
  provision = provisionDatabase,
): Promise<void> {
  await withNodeE2eFixture(async fixture => {
    async function copyFor(transport: 'http' | 'stdio'): Promise<NodeE2eWorkspace> {
      const directory = join(fixture.directory, transport);
      const databasePath = join(directory, 'theologai.db');
      await mkdir(directory, { mode: 0o700 });
      // Prefer copy-on-write where supported, with an independent full copy as fallback.
      await copyFile(fixture.databasePath, databasePath, constants.COPYFILE_FICLONE);
      return { directory, databasePath, trackExit: fixture.trackExit };
    }

    const httpWorkspace = await copyFor('http');
    const stdioWorkspace = await copyFor('stdio');
    await http(httpWorkspace);
    await stdio(stdioWorkspace);
  }, provision);
}
