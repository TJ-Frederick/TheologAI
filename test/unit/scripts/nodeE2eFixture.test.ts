import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';
import {
  runNodeE2eCommand,
  withCleanup,
  withIsolatedNodeE2eFixtures,
  withNodeE2eFixture,
  type NodeE2eWorkspace,
} from '../../../scripts/node-e2e-fixture.js';
import { runNodeHttpE2e } from '../../../scripts/test-node-http-e2e.js';
import { runNodeStdioE2e, withStdioClient } from '../../../scripts/test-node-stdio-e2e.js';

async function withPidTrace(run: (trace: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'theologai-e2e-trace-'));
  try {
    const trace = join(directory, 'pid');
    await run(trace);
    const pid = Number(await readFile(trace, 'utf8'));
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it('gives concurrent invocations distinct, private workspace and database paths', async () => {
  const paths: string[] = [];
  const run = () => withNodeE2eFixture(async workspace => {
    paths.push(workspace.directory);
    expect(workspace.databasePath).toBe(join(workspace.directory, 'theologai.db'));
    expect(await readFile(workspace.databasePath, 'utf8')).toBe(workspace.directory);
    if (process.platform !== 'win32') expect((await stat(workspace.directory)).mode & 0o777).toBe(0o700);
  }, workspace => writeFile(workspace.databasePath, workspace.directory));

  await Promise.all([run(), run()]);
  expect(new Set(paths)).toHaveLength(2);
  expect(paths.some(path => existsSync(path))).toBe(false);
});

it('isolates HTTP database writes and dotenv from stdio after provisioning once', async () => {
  let httpWorkspace: NodeE2eWorkspace | undefined;
  const provision = vi.fn(async (workspace: NodeE2eWorkspace) => {
    const db = new Database(workspace.databasePath);
    try {
      db.exec("CREATE TABLE fixture (value TEXT); INSERT INTO fixture VALUES ('verified')");
    } finally {
      db.close();
    }
  });
  const dotenvLoader = import.meta.resolve('dotenv/config');
  await withIsolatedNodeE2eFixtures(async workspace => {
    httpWorkspace = workspace;
    const db = new Database(workspace.databasePath);
    try {
      db.exec("UPDATE fixture SET value = 'http changed this'");
    } finally {
      db.close();
    }
    await writeFile(join(workspace.directory, '.env'), 'THEOLOGAI_FIXTURE_HTTP_SENTINEL=http\n');
    await runNodeE2eCommand(workspace, 'HTTP dotenv positive control', [
      '--import', dotenvLoader, '-e', 'if (process.env.THEOLOGAI_FIXTURE_HTTP_SENTINEL !== "http") process.exit(42)',
    ]);
  }, async workspace => {
    expect(workspace.directory).not.toBe(httpWorkspace?.directory);
    expect(workspace.databasePath).not.toBe(httpWorkspace?.databasePath);
    const db = new Database(workspace.databasePath, { readonly: true });
    try {
      expect(db.prepare('SELECT value FROM fixture').get()).toEqual({ value: 'verified' });
    } finally {
      db.close();
    }
    await runNodeE2eCommand(workspace, 'stdio dotenv isolation', [
      '--import', dotenvLoader, '-e', 'if (process.env.THEOLOGAI_FIXTURE_HTTP_SENTINEL !== undefined) process.exit(42)',
    ]);
  }, provision);

  expect(provision).toHaveBeenCalledTimes(1);
  expect(existsSync(httpWorkspace!.directory)).toBe(false);
});

it('keeps the initial failure as the cause if teardown also fails', async () => {
  const initial = new Error('fixture build failed');
  const cleanup = new Error('child exit could not be confirmed');
  await expect(withCleanup(
    async () => { throw initial; },
    async () => { throw cleanup; },
  )).rejects.toMatchObject({ cause: initial, errors: [initial, cleanup] });
});

it('removes the verified-fixture workspace after verification fails and starts neither transport', async () => {
  let directory = '';
  const checks = vi.fn();
  await expect(withNodeE2eFixture(checks, async workspace => {
    directory = workspace.directory;
    await runNodeE2eCommand(workspace, 'database build', [
      '-e', 'require("node:fs").writeFileSync(process.argv[1], "fixture")', workspace.databasePath,
    ]);
    await runNodeE2eCommand(workspace, 'database verification', [
      '-e', 'console.error("fixture integrity error"); process.exit(23)',
    ]);
  })).rejects.toThrow(/database verification failed \(23\)\nfixture integrity error/);
  expect(checks).not.toHaveBeenCalled();
  expect(directory).not.toBe('');
  expect(existsSync(directory)).toBe(false);
});

it.skipIf(process.platform === 'win32')('kills and reaps a timed-out fixture builder that ignores SIGTERM', async () => {
  await withPidTrace(async trace => {
    let directory = '';
    const checks = vi.fn();
    await expect(withNodeE2eFixture(checks, async workspace => {
      directory = workspace.directory;
      await runNodeE2eCommand(workspace, 'database build', ['-e', `
        const { writeFileSync } = require('node:fs');
        process.on('SIGTERM', () => writeFileSync(process.argv[1] + '.term', 'received'));
        writeFileSync(process.argv[1], String(process.pid));
        writeFileSync(process.argv[2], 'partial fixture');
        setTimeout(() => process.exit(71), 12_000);
      `, trace, workspace.databasePath], 1_000);
    })).rejects.toThrow(/database build timed out/);
    expect(checks).not.toHaveBeenCalled();
    expect(await readFile(`${trace}.term`, 'utf8')).toBe('received');
    expect(existsSync(directory)).toBe(false);
  });
});

async function expectServerFailure(
  source: string,
  start: (workspace: NodeE2eWorkspace, serverEntry: string) => Promise<void>,
  failure: RegExp,
): Promise<void> {
  await withPidTrace(async trace => {
    let directory = '';
    const serverEntry = (workspace: NodeE2eWorkspace) => join(workspace.directory, 'test-server.cjs');
    await expect(withNodeE2eFixture(workspace => start(workspace, serverEntry(workspace)), async workspace => {
      directory = workspace.directory;
      await writeFile(serverEntry(workspace), `
        require('node:fs').writeFileSync(${JSON.stringify(trace)}, String(process.pid));
        ${source}
      `);
    })).rejects.toThrow(failure);
    expect(directory).not.toBe('');
    expect(existsSync(directory)).toBe(false);
  });
}

it.skipIf(process.platform === 'win32')('recognizes and reaps an already-signaled HTTP startup failure', async () => {
  await expectServerFailure("process.kill(process.pid, 'SIGTERM');", runNodeHttpE2e, /exited during startup \(SIGTERM\)/);
});

it('stops an HTTP server that becomes ready but refuses the MCP connection', async () => {
  await expectServerFailure(`
    require('node:http').createServer((request, response) => {
      response.writeHead(request.method === 'GET' ? 405 : 500);
      response.end('fixture HTTP failure');
    }).listen(Number(process.env.PORT), '127.0.0.1');
  `, runNodeHttpE2e, /500|fixture HTTP failure/);
});

const failingStdio = `
  process.on('SIGTERM', () => {});
  process.stdin.once('data', bytes => {
    const { id } = JSON.parse(String(bytes));
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'fixture stdio failure' } }) + '\\n');
  });
  setTimeout(() => process.exit(71), 12_000);
`;

it.skipIf(process.platform === 'win32')('reaps the SDK session child after initialize fails and graceful close is ignored', async () => {
  await expectServerFailure(failingStdio, runNodeStdioE2e, /fixture stdio failure/);
});

it.skipIf(process.platform === 'win32')('waits for the SDK probe sibling after modern discovery fails', async () => {
  await expectServerFailure(failingStdio, (workspace, entry) => withStdioClient(
    workspace, entry,
    new Client({ name: 'e2e-failure-fixture', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } }),
    'modern discovery', async () => { throw new Error('unexpected connected session'); },
  ), /fixture stdio failure|negotiation failed/i);
});
