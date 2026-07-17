import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { normalizeCcelSectionLocator } from '../src/adapters/commentary/CcelSearchAdapter.js';

export const LIVE_AUDIT_CONFIRMATION = 'I AUTHORIZE TWO LIVE CCEL PREVIEW REQUESTS';
const PREVIEW_URL = 'https://preview-mcp.theologai.xyz/mcp';
const PRODUCTION_URL = 'https://mcp.theologai.xyz/mcp';

export interface CcelAuditOptions {
  previewUrl: string;
  productionUrl: string;
  authorization: string;
}

export function parseCcelAuditArgs(argv: string[]): CcelAuditOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined || values.has(key)) throw new Error('Invalid audit arguments.');
    values.set(key, value);
  }
  if ([...values.keys()].some(key => !['--preview-url', '--production-url', '--authorize-live-ccel'].includes(key))) {
    throw new Error('Unknown audit argument.');
  }
  const options = {
    previewUrl: values.get('--preview-url') ?? '',
    productionUrl: values.get('--production-url') ?? '',
    authorization: values.get('--authorize-live-ccel') ?? '',
  };
  if (options.previewUrl !== PREVIEW_URL || options.productionUrl !== PRODUCTION_URL
    || options.authorization !== LIVE_AUDIT_CONFIRMATION) {
    throw new Error('Live audit remains inert without the exact canonical URLs and authorization phrase.');
  }
  return options;
}

type Provider = {
  provider?: string; status?: string; retryAfterSeconds?: number; hitCount?: number;
  hits?: Array<{ snippet?: string; locator?: { kind?: string; url?: string } }>;
};
type SearchOutput = {
  schemaVersion?: string; planStatus?: string;
  responseWindow?: { unit?: string; maximum?: number; truncated?: boolean };
  evidencePolicy?: { snippetUse?: string; externalSectionAccess?: string };
  queries?: Array<{ providers?: Provider[] }>;
};

type AuditToolResponse = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

export interface CcelAuditClient {
  listTools(): Promise<{ tools: Array<{ name: string; outputSchema?: object }> }>;
  callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<AuditToolResponse>;
  close(): Promise<void>;
}

export interface CcelAuditDependencies {
  connect?: (url: string, name: string) => Promise<CcelAuditClient>;
}

class CcelCallBudget {
  private used = 0;
  constructor(readonly maximum: number) {}

  authorize(providers: string[]): void {
    if (!providers.includes('ccel')) return;
    if (this.used >= this.maximum) {
      throw new Error(`Audit refused a CCEL-bearing call beyond its hard maximum of ${this.maximum}.`);
    }
    this.used++;
  }

  snapshot(): number { return this.used; }
}

export async function runCcelPreviewAudit(options: CcelAuditOptions, dependencies: CcelAuditDependencies = {}) {
  const connectClient = dependencies.connect ?? connect;
  const production = await connectClient(options.productionUrl, 'theologai-ccel-production-control');
  const preview = await connectClient(options.previewUrl, 'theologai-ccel-preview-audit');
  const ccelBudget = new CcelCallBudget(2);
  try {
    const productionTools = await production.listTools();
    const previewTools = await preview.listTools();
    const productionSchema = toolSchema(productionTools.tools, 'primary_source_search');
    const previewSchema = toolSchema(previewTools.tools, 'primary_source_search');
    assert(JSON.stringify(productionSchema).includes('"const":"3"') && !JSON.stringify(productionSchema).includes('"ccel"'), 'production 000 control');
    assert(JSON.stringify(previewSchema).includes('"const":"4"') && JSON.stringify(previewSchema).includes('retryAfterSeconds'), 'preview v4 contract');

    // Exactly two concurrent CCEL-only calls exercise the one global Durable
    // Object budget without relying on process-local cache affinity or elapsed
    // wall time. One may be admitted; the other must receive structured busy.
    const runId = crypto.randomUUID().replaceAll('-', '');
    const contenders = await Promise.all([
      search(preview, ccelBudget, 'audit-contender-a', `theologai audit ${runId} alpha`, ['ccel'], true),
      search(preview, ccelBudget, 'audit-contender-b', `theologai audit ${runId} beta`, ['ccel'], true),
    ]);
    const cold = contenders.filter(output => ['ok', 'no_results'].includes(provider(output, 'ccel_live')?.status ?? ''));
    const busy = contenders.filter(output => provider(output, 'ccel_live')?.status === 'rate_limited');
    assert(cold.length === 1 && busy.length === 1, 'one admitted discovery and one globally rate-limited contender');
    for (const output of contenders) assertValidV4Envelope(output);
    assertValidExternalDiscovery(provider(cold[0]!, 'ccel_live')!);
    assertValidRateLimited(provider(busy[0]!, 'ccel_live')!);

    // Local search is deliberately separate and cannot consume an origin slot.
    const local = await search(preview, ccelBudget, 'audit-local-fallback', 'justification', ['local']);
    assert(['ok', 'no_results', 'catalog_miss'].includes(provider(local, 'local')?.status ?? ''), 'usable local fallback independent of CCEL');
    assertValidV4Envelope(local);
    assert(ccelBudget.snapshot() === 2, 'exactly two CCEL-bearing tool calls');

    return {
      schemaVersion: '1', audit: 'ccel-live-preview', passed: true,
      productionControl: { contractVersion: '3', liveCallMade: false },
      preview: {
        contractVersion: '4', ccelBearingToolCallMaximum: 2, upstreamOriginAdmissionMaximum: 2,
        statuses: [...contenders, local].map(summarize),
      },
      privacy: 'No query, title, snippet, content, URL, header, or client identity is retained.',
    };
  } finally {
    await production.close().catch(() => undefined);
    await preview.close().catch(() => undefined);
  }
}

export function boundedAuditSleepMs(retryAfterSeconds: number): number {
  if (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds < 1 || retryAfterSeconds > 10) {
    throw new Error(`Audit failed: immediate coordinator retry interval was ${String(retryAfterSeconds)} seconds; expected 1-10, refusing to wait.`);
  }
  return (retryAfterSeconds + 1) * 1_000;
}

function assertValidRateLimited(external: Provider): void {
  assert(external.status === 'rate_limited'
    && external.hitCount === 0
    && (external.hits?.length ?? 0) === 0
    && Number.isSafeInteger(external.retryAfterSeconds), 'structured CCEL rate limit');
  void boundedAuditSleepMs(external.retryAfterSeconds!);
}

function assertValidV4Envelope(output: SearchOutput): void {
  assert(output.schemaVersion === '4'
    && output.responseWindow?.unit === 'utf8_bytes'
    && output.responseWindow.maximum === 32_768
    && typeof output.responseWindow.truncated === 'boolean'
    && output.evidencePolicy?.snippetUse === 'discovery_only'
    && output.evidencePolicy.externalSectionAccess === 'direct_url_only'
    && !JSON.stringify(output).includes('resource_link'), 'compact v4 discovery semantics');
}

function assertValidExternalDiscovery(external: Provider): void {
  const hits = external.hits ?? [];
  assert(Number.isSafeInteger(external.hitCount) && external.hitCount === hits.length && hits.length <= 5, 'bounded external hits');
  for (const hit of hits) {
    const url = hit.locator?.url;
    let parsed: URL;
    try { parsed = new URL(url ?? ''); } catch { throw new Error('Audit failed: invalid external locator.'); }
    assert(typeof hit.snippet === 'string' && Array.from(hit.snippet).length <= 240
      && hit.locator?.kind === 'external_url'
      && typeof url === 'string'
      && parsed.protocol === 'https:' && parsed.hostname === 'ccel.org' && parsed.port === ''
      && parsed.search === '' && parsed.hash === ''
      && normalizeCcelSectionLocator(url!)?.url === url,
    'clean bounded external discovery hit');
  }
}

async function connect(url: string, name: string): Promise<CcelAuditClient> {
  const client = new Client({ name, version: '1.0.0' }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

async function search(
  client: CcelAuditClient,
  budget: CcelCallBudget,
  id: string,
  text: string,
  providers: string[],
  allowRateLimitedError = false,
): Promise<SearchOutput> {
  budget.authorize(providers);
  const response = await client.callTool({ name: 'primary_source_search', arguments: {
    queries: [{ id, text, providers, match: 'all_terms', selection: 'relevance', limit: 2 }],
  } });
  const output = (response.structuredContent ?? {}) as SearchOutput;
  const providersReturned = output.queries?.flatMap(query => query.providers ?? []) ?? [];
  const ccelOnlyRateLimited = output.planStatus === 'unavailable'
    && providersReturned.length === 1
    && providersReturned[0]?.provider === 'ccel_live'
    && providersReturned[0].status === 'rate_limited';
  if (!response.isError) {
    if (allowRateLimitedError && ccelOnlyRateLimited) {
      throw new Error('Primary-source CCEL-only rate limit was not marked as a tool error.');
    }
    return output;
  }
  const expectedRateLimit = allowRateLimitedError
    && ccelOnlyRateLimited;
  if (!expectedRateLimit) throw new Error('Primary-source call returned an unexpected tool error form.');
  return output;
}

function provider(output: SearchOutput, name: string): Provider | undefined {
  return output.queries?.flatMap(query => query.providers ?? []).find(item => item.provider === name);
}

function summarize(output: SearchOutput) {
  return {
    schemaVersion: output.schemaVersion, planStatus: output.planStatus,
    providers: output.queries?.flatMap(query => query.providers ?? []).map(item => ({
      provider: item.provider, status: item.status, hitCount: item.hitCount,
      ...(item.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: item.retryAfterSeconds }),
    })),
  };
}

function toolSchema(tools: Array<{ name: string; outputSchema?: object }>, name: string): object {
  const schema = tools.find(tool => tool.name === name)?.outputSchema;
  if (!schema) throw new Error(`Missing ${name} output schema.`);
  return schema;
}

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(`Audit failed: ${label}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runCcelPreviewAudit(parseCcelAuditArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
