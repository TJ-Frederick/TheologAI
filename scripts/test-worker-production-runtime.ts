import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { Log, LogLevel, Miniflare } from 'miniflare';
import {
  assertMcpTransportContract,
  captureMcpTransportSnapshot,
  type JsonRecord,
  type McpContractClient,
} from '../test/helpers/mcpTransportContract.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'test-output', 'worker-production-runtime');
const wranglerLogPath = path.join(projectRoot, 'test-output', 'wrangler', 'production-runtime.log');
const wranglerBin = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const wranglerConfig = await readFile(path.join(projectRoot, 'wrangler.toml'), 'utf8');
const compatibilityDate = wranglerConfig.match(/^compatibility_date = "([^"]+)"$/m)?.[1];
if (!compatibilityDate) {
  throw new Error('Unable to read compatibility_date from wrangler.toml');
}

function boundedWranglerEnvironment(): NodeJS.ProcessEnv {
  const allowed = new Set(process.platform === 'win32'
    ? ['APPDATA', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'PATH', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP', 'USERNAME', 'USERPROFILE']
    : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER']);
  const entries = Object.entries(process.env).filter(([name, value]) => (
    allowed.has(name)
    && value !== undefined
    && !/(API_KEY|TOKEN|SECRET|RPC_URL|PRIVATE_KEY|DOTENV_CONFIG_)/i.test(name)
  ));
  return {
    ...Object.fromEntries(entries),
    WRANGLER_LOG_PATH: wranglerLogPath,
    WRANGLER_SEND_METRICS: 'false',
  };
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
  '',
  '--var',
  'THEOLOGAI_EXPOSE_CCEL_DISCOVERY:false',
  '--var',
  'THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH:false',
  '--var',
  'THEOLOGAI_ENABLE_CCEL_COORDINATOR:false',
], {
  cwd: projectRoot,
  env: boundedWranglerEnvironment(),
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
    THEOLOGAI_VERSION: '4.0.0-production-runtime-test',
    THEOLOGAI_ALLOWED_ORIGINS: 'https://allowed.example',
    THEOLOGAI_MAX_REQUEST_BYTES: '1048576',
    THEOLOGAI_REQUEST_LOGS: 'false',
    THEOLOGAI_EXPOSE_CCEL_DISCOVERY: 'false',
    THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'false',
    THEOLOGAI_ENABLE_CCEL_COORDINATOR: 'false',
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

const productionLikeD1 = await miniflare.getD1Database('THEOLOGAI_DB');
for (const migration of await readD1Migrations(path.join(projectRoot, 'migrations'))) {
  if (migration.queries.length > 0) {
    await productionLikeD1.batch(migration.queries.map(query => productionLikeD1.prepare(query)));
  }
}

interface JsonRpcMessage {
  result?: JsonRecord;
  error?: { code: number; message: string };
}

function parseMessage(response: { status: number; headers: { get(name: string): string | null } }, body: string): JsonRpcMessage {
  const payload = response.headers.get('Content-Type')?.includes('text/event-stream')
    ? body.split('\n').find(line => line.startsWith('data: '))?.slice(6)
    : body;
  if (!payload) throw new Error(`Production-like Worker returned no MCP message (${response.status})`);
  return JSON.parse(payload) as JsonRpcMessage;
}

class WorkerRpcContractClient implements McpContractClient {
  private nextId = 1;
  private serverVersion: { name?: string; version?: string } | undefined;
  private capabilities: JsonRecord | undefined;

  constructor(
    private readonly worker: Miniflare,
    private readonly protocolVersion: '2025-11-25' | '2026-07-28',
  ) {}

  async initialize(): Promise<void> {
    if (this.protocolVersion === '2026-07-28') {
      const result = await this.request('server/discover');
      this.serverVersion = (result._meta as JsonRecord | undefined)?.['io.modelcontextprotocol/serverInfo'] as {
        name?: string; version?: string;
      };
      this.capabilities = result.capabilities as JsonRecord;
      return;
    }
    const result = await this.request('initialize', {
      protocolVersion: this.protocolVersion, capabilities: {},
      clientInfo: { name: `production-runtime-contract-${this.protocolVersion}`, version: '1.0.0' },
    });
    this.serverVersion = result.serverInfo as { name?: string; version?: string };
    this.capabilities = result.capabilities as JsonRecord;
  }

  getServerVersion() { return this.serverVersion; }
  getServerCapabilities() { return this.capabilities; }
  async listTools() { return await this.request('tools/list') as { tools: JsonRecord[] }; }
  async listPrompts() { return await this.request('prompts/list') as { prompts: JsonRecord[] }; }
  async listResourceTemplates() {
    return await this.request('resources/templates/list') as { resourceTemplates: JsonRecord[] };
  }
  async listResources() { return await this.request('resources/list') as { resources: JsonRecord[] }; }

  private async request(method: string, params?: JsonRecord): Promise<JsonRecord> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Origin: 'https://allowed.example',
      'MCP-Protocol-Version': this.protocolVersion,
    };
    if (this.protocolVersion === '2026-07-28') {
      headers['Mcp-Method'] = method;
      if (method === 'tools/call' && typeof params?.name === 'string') headers['Mcp-Name'] = params.name;
    }
    const requestParams = this.protocolVersion === '2026-07-28'
      ? {
          ...(params ?? {}),
          _meta: {
            'io.modelcontextprotocol/protocolVersion': this.protocolVersion,
            'io.modelcontextprotocol/clientInfo': {
              name: 'production-runtime-contract-modern', version: '1.0.0',
            },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        }
      : params;
    const response = await this.worker.dispatchFetch('https://worker.test/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, ...(requestParams ? { params: requestParams } : {}) }),
    });
    const message = parseMessage(response, await response.text());
    if (response.status !== 200 || message.error || !message.result) {
      throw new Error(`Production-like Worker ${method} failed with status ${response.status}`);
    }
    return message.result;
  }
}

try {
  for (const era of ['2025-11-25', '2026-07-28'] as const) {
    const client = new WorkerRpcContractClient(miniflare, era);
    await client.initialize();
    const contract = await captureMcpTransportSnapshot(client);
    await assertMcpTransportContract(contract, { contractVersion: '6', logging: false });
    console.log(`Production-like Worker bundle passed the full v6 MCP transport contract for ${era}.`);
  }
} finally {
  await miniflare.dispose();
}
