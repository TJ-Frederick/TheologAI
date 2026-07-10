import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Log, LogLevel, Miniflare } from 'miniflare';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'test-output', 'worker-production-runtime');
const wranglerLogPath = path.join(projectRoot, 'test-output', 'wrangler', 'production-runtime.log');
const wranglerBin = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const wranglerConfig = await readFile(path.join(projectRoot, 'wrangler.toml'), 'utf8');
const compatibilityDate = wranglerConfig.match(/^compatibility_date = "([^"]+)"$/m)?.[1];
if (!compatibilityDate) {
  throw new Error('Unable to read compatibility_date from wrangler.toml');
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(path.dirname(wranglerLogPath), { recursive: true });

execFileSync(process.execPath, [
  wranglerBin,
  'deploy',
  '--dry-run',
  '--outdir',
  outputDir,
  '--env',
  'preview',
], {
  cwd: projectRoot,
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: wranglerLogPath,
  },
  stdio: 'inherit',
});

const bundlePath = path.join(outputDir, 'worker.js');
const bundle = (await readFile(bundlePath, 'utf8'))
  .replace(/\/\/# sourceMappingURL=.*$/m, '');

const miniflare = new Miniflare({
  script: bundle,
  modules: true,
  compatibilityDate,
  compatibilityFlags: ['nodejs_compat'],
  bindings: {
    THEOLOGAI_VERSION: '3.6.0-production-runtime-test',
    THEOLOGAI_ALLOWED_ORIGINS: 'https://allowed.example',
    THEOLOGAI_MAX_REQUEST_BYTES: '1048576',
    THEOLOGAI_REQUEST_LOGS: 'false',
  },
  d1Databases: { THEOLOGAI_DB: 'theologai-production-runtime-test' },
  ratelimits: {
    THEOLOGAI_RATE_LIMITER: {
      namespace_id: '361299',
      simple: { limit: 120, period: 60 },
    },
  },
  log: new Log(LogLevel.NONE),
});

try {
  const response = await miniflare.dispatchFetch('https://worker.test/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Origin: 'https://allowed.example',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'production-runtime-smoke', version: '1.0.0' },
      },
    }),
  });
  const body = await response.text();

  if (response.status !== 200) {
    throw new Error(`Production-like Worker initialize returned ${response.status}: ${body}`);
  }

  const payload = response.headers.get('Content-Type')?.includes('text/event-stream')
    ? body.split('\n').find(line => line.startsWith('data: '))?.slice(6)
    : body;
  if (!payload) {
    throw new Error(`Production-like Worker initialize returned no MCP message: ${body}`);
  }

  const message = JSON.parse(payload) as {
    error?: unknown;
    result?: { serverInfo?: { name?: string } };
  };
  if (message.error || message.result?.serverInfo?.name !== 'theologai-bible-server') {
    throw new Error(`Production-like Worker initialize returned an unexpected MCP response: ${body}`);
  }

  console.log('Production-like Worker bundle initialized without unsafe-eval privileges.');
} finally {
  await miniflare.dispose();
}
