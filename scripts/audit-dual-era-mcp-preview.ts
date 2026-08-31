import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  assertMcpTransportContract,
  captureMcpTransportSnapshot,
  fingerprintMcpTransportSnapshot,
} from '../test/helpers/mcpTransportContract.js';

const PROTOCOLS = ['2025-11-25', '2026-07-28'] as const;
const DEFAULT_URL = 'https://preview-mcp.theologai.xyz/mcp';
type ProtocolVersion = typeof PROTOCOLS[number];

export interface DualEraMcpAudit {
  schemaVersion: 'theologai-dual-era-mcp-preview-audit.v1';
  capturedAt: string;
  endpoint: string;
  productProfile: '7';
  eras: Array<{
    protocolVersion: ProtocolVersion;
    serverName: 'theologai-bible-server';
    serverVersion: string;
    counts: { tools: 11; prompts: 6; resourceTemplates: 2; staticResources: 3 };
    fingerprints: {
      capabilities: string;
      tools: string;
      prompts: string;
      resourceTemplates: string;
      staticResources: string;
    };
  }>;
  crossEraContractSha256: string;
}

function fail(message: string): never {
  throw new Error(`Dual-era preview MCP audit refused: ${message}`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export async function auditDualEraMcpPreview(
  endpoint: string,
  expectedServerVersion: string,
  now: Date = new Date(),
): Promise<DualEraMcpAudit> {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    fail('endpoint must be a credential-free HTTPS URL without query or fragment');
  }
  const eras: DualEraMcpAudit['eras'] = [];
  for (const protocolVersion of PROTOCOLS) {
    const client = new Client(
      { name: `theologai-protected-preview-${protocolVersion}`, version: '1.0.0' },
      { versionNegotiation: { mode: { pin: protocolVersion } } },
    );
    try {
      await client.connect(new StreamableHTTPClientTransport(url));
      if (client.getNegotiatedProtocolVersion() !== protocolVersion) {
        fail(`${protocolVersion} negotiation drifted`);
      }
      const snapshot = await captureMcpTransportSnapshot(client);
      await assertMcpTransportContract(snapshot, { contractVersion: '7', logging: false });
      if (snapshot.server.version !== expectedServerVersion) {
        fail(`${protocolVersion} server version is ${snapshot.server.version}, expected ${expectedServerVersion}`);
      }
      eras.push({
        protocolVersion,
        serverName: 'theologai-bible-server',
        serverVersion: snapshot.server.version,
        counts: {
          tools: snapshot.tools.length as 11,
          prompts: snapshot.prompts.length as 6,
          resourceTemplates: snapshot.resourceTemplates.length as 2,
          staticResources: snapshot.staticResources.length as 3,
        },
        fingerprints: await fingerprintMcpTransportSnapshot(snapshot),
      });
    } finally {
      await client.close().catch(() => undefined);
    }
  }
  if (canonicalJson(eras[0]!.fingerprints) !== canonicalJson(eras[1]!.fingerprints)) {
    fail('legacy and modern public contracts differ');
  }
  return {
    schemaVersion: 'theologai-dual-era-mcp-preview-audit.v1',
    capturedAt: now.toISOString(),
    endpoint: url.href,
    productProfile: '7',
    eras,
    crossEraContractSha256: sha256(eras.map(era => era.fingerprints)),
  };
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as { version?: unknown };
  if (typeof packageJson.version !== 'string') fail('package version is invalid');
  const output = option('--output');
  if (!output) fail('--output is required');
  const audit = await auditDualEraMcpPreview(option('--url') ?? DEFAULT_URL, packageJson.version);
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), `${JSON.stringify(audit, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.error(`[dual-era-preview] ${audit.eras.length} eras, 11 tools, 6 prompts; ${audit.crossEraContractSha256}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
