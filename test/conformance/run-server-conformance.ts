import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createNodeHttpServer } from '../../src/http/nodeHttpServer.js';
import type { NodeHttpConfig } from '../../src/http/config.js';
import { createDeterministicMcpFixture } from '../fixtures/mcpCompositionRoot.js';

// The official runner's default server suite targets its fixture-only
// "everything" server. These are the protocol-generic scenarios that apply to
// TheologAI's advertised capabilities and anonymous, stateless HTTP transport.
const LEGACY_SCENARIOS = [
  'server-initialize',
  'ping',
  'tools-list',
  'resources-list',
  'prompts-list',
  'dns-rebinding-protection',
] as const;

const MODERN_SCENARIOS = [
  'server-stateless',
  'tools-list',
  'resources-list',
  'prompts-list',
  'sep-2164-resource-not-found',
  'dns-rebinding-protection',
  'caching',
  'http-header-validation',
] as const;

const legacyConformanceEntrypoint = fileURLToPath(new URL(
  '../../node_modules/@modelcontextprotocol/conformance/dist/index.js',
  import.meta.url,
));
const modernConformanceEntrypoint = fileURLToPath(new URL(
  '../../node_modules/@modelcontextprotocol/conformance-modern/dist/index.js',
  import.meta.url,
));
const legacyOutputDirectory = resolve('test-output/mcp-conformance/legacy');
const modernOutputDirectory = resolve('test-output/mcp-conformance/modern');
const modernExpectedFailures = resolve('test/conformance/modern-expected-failures.yml');

async function runScenario(
  entrypoint: string,
  url: string,
  scenario: string,
  outputDirectory: string,
  specVersion?: string,
  expectedFailures?: string,
): Promise<void> {
  const args = [
    entrypoint,
    'server',
    '--url',
    url,
    '--scenario',
    scenario,
    '--output-dir',
    outputDirectory,
  ];
  if (specVersion) args.push('--spec-version', specVersion);
  if (expectedFailures) args.push('--expected-failures', expectedFailures);
  if (scenario === 'http-header-validation') args.push('--force');

  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(
        `MCP conformance scenario "${scenario}" failed ${
          signal ? `with signal ${signal}` : `with exit code ${code ?? 'unknown'}`
        }`,
      ));
    });
  });
}

async function main(): Promise<void> {
  const { root, biblePassageCalls } = createDeterministicMcpFixture();
  if (root.tools.length !== 11) {
    throw new Error(`Expected the complete eleven-tool registry, received ${root.tools.length}`);
  }

  // Bind an ephemeral loopback port, then add its exact Origin before the first
  // request. The DNS-rebinding scenario requires the valid localhost Origin to
  // succeed while an attacker-controlled Host/Origin pair is rejected.
  const config: NodeHttpConfig = {
    host: '127.0.0.1',
    port: 0,
    allowedHosts: ['127.0.0.1', 'localhost', '::1'],
    allowedOrigins: [],
    maxBodyBytes: 1024 * 1024,
  };
  const runtime = createNodeHttpServer({
    root,
    config,
    telemetry: () => undefined,
  });

  try {
    const address = await runtime.listen();
    const origin = `http://127.0.0.1:${address.port}`;
    config.allowedOrigins.push(origin);
    const url = `${origin}/mcp`;

    for (const scenario of LEGACY_SCENARIOS) {
      await runScenario(
        legacyConformanceEntrypoint,
        url,
        scenario,
        legacyOutputDirectory,
      );
    }
    for (const scenario of MODERN_SCENARIOS) {
      await runScenario(
        modernConformanceEntrypoint,
        url,
        scenario,
        modernOutputDirectory,
        '2026-07-28',
        modernExpectedFailures,
      );
    }

    if (biblePassageCalls.length !== 0) {
      throw new Error('Protocol-generic conformance scenarios unexpectedly invoked a data tool');
    }
  } finally {
    await runtime.close();
  }
}

await main();
