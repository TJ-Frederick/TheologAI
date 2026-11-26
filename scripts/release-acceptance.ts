import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { versionNegotiationFor } from './audit-dual-era-mcp-preview.js';
import { releaseReadFetch, auditCorpusRelease, createCorpusRequestPacer, type CorpusRequestPacer } from './audit-corpus-release.js';

import { hasHostedCorpusChecks, hostedCorpusProfile } from './hosted-corpus-profile.mjs';

export const RELEASE_PROTOCOLS = ['2025-11-25', '2026-07-28'] as const;
const KEMPIS = { work: 'kempis-imitation-of-christ', text: 'imitation Christ contempt world' };
export const WESLEY = { work: 'wesley-standard-sermons', text: 'salvation by faith' };
const PASSAGE_TOOL = 'bible_verse_morphology';
const PASSAGE = 'John 3:16';
const RESPONSE_LIMIT = 256 * 1024;
const EXCHANGE_LIMIT = 16;

export interface AcceptanceOptions {
  mode: 'application' | 'corpus';
  role: 'preview' | 'production';
  endpoint: string;
  serverVersion: string;
  root?: string;
  databasePath?: string;
  fetch?: typeof fetch;
  guard?: () => void;
  pace?: CorpusRequestPacer;
  search?: boolean;
  profile?: typeof hostedCorpusProfile;
}

function releaseEndpoint(value: string): URL {
  const endpoint = new URL(value);
  if (endpoint.href !== value || endpoint.protocol !== 'https:' || endpoint.pathname !== '/mcp'
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('Unsafe MCP release endpoint');
  }
  return endpoint;
}

class SmokeFault extends Error {
  constructor(readonly category: string, readonly status?: number) {
    super(category);
  }
}

export function scopedSearchArguments(role: AcceptanceOptions['role'], query: typeof KEMPIS) {
  return { queries: [{
    id: 'scope', ...query, match: 'all_terms', limit: 8,
    ...(role === 'preview' ? { searchDepth: 'standard' } : { providers: ['local'] }),
  }] };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(record).filter(item => item !== undefined) : [];
}

export function workSectionUris(value: unknown, work: string): string[] {
  const result = record(value);
  if (result?.kind !== 'primary_source_search' || result.planStatus !== 'complete') return [];
  const query = records(result.queries).find(query => query.id === 'scope');
  const provider = records(query?.providers)
    .find(provider => provider.provider === 'local' && provider.status === 'ok' && provider.searched === true);
  const prefix = `theologai://documents/${work}#section-`;
  return records(provider?.hits).flatMap(hit => {
    const uri = record(hit.locator)?.uri;
    return typeof uri === 'string' && uri.startsWith(prefix) && uri.length > prefix.length ? [uri] : [];
  });
}

async function boundedResponse(response: Response): Promise<Response> {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > RESPONSE_LIMIT) throw new SmokeFault('response_size', response.status);
      chunks.push(part.value);
    }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function applicationSmoke(options: AcceptanceOptions, endpoint: URL) {
  const checks: { era: string; probeId: string; passed: true }[] = [];
  const pace = options.pace ?? createCorpusRequestPacer();
  const fetchImpl = releaseReadFetch(endpoint.href, 'application', options.fetch ?? fetch);
  const deadline = Date.now() + 45_000;
  let exchanges = 0;
  for (const era of RELEASE_PROTOCOLS) {
    let probeId = era === '2026-07-28' ? 'server/discover' : 'initialize';
    let firstFailure: SmokeFault | undefined;
    function guard() {
      if (firstFailure) throw firstFailure;
      if (exchanges >= EXCHANGE_LIMIT || Date.now() >= deadline) throw new SmokeFault('transport_budget');
      try {
        options.guard?.();
      } catch {
        throw new SmokeFault('guard');
      }
    }
    const boundedFetch: typeof fetch = async (input, init) => {
      // Stateless GET notification streams and best-effort cancellation carry no acceptance evidence.
      if (init?.method === 'GET') return new Response(null, { status: 405 });
      if (init?.method === 'DELETE') return new Response(null, { status: 405 });
      const scope = AbortSignal.timeout(Math.max(1, Math.min(8000, deadline - Date.now())));
      const signal = init?.signal ? AbortSignal.any([scope, init.signal]) : scope;
      try {
        const url = input instanceof Request ? input.url : String(input);
        if (url !== endpoint.href) throw new SmokeFault('unexpected_endpoint');
        const response = await pace(signal, guard, () => {
          guard();
          exchanges++;
          return fetchImpl(input, { ...init, signal, redirect: 'error' });
        });
        if (response.redirected || !response.ok) {
          void response.body?.cancel().catch(() => {});
          throw new SmokeFault('http_status', response.status);
        }
        if (response.headers.has('mcp-session-id')) {
          void response.body?.cancel().catch(() => {});
          throw new SmokeFault('unexpected_session', response.status);
        }
        return await boundedResponse(response);
      } catch (error) {
        firstFailure ??= error instanceof SmokeFault ? error : new SmokeFault(scope.aborted ? 'timeout' : 'transport');
        throw firstFailure;
      }
    };
    const client = new Client({ name: 'theologai-release-smoke', version: '1' }, versionNegotiationFor(era));
    try {
      await client.connect(new StreamableHTTPClientTransport(endpoint, { fetch: boundedFetch }));
      const server = client.getServerVersion();
      if (client.getNegotiatedProtocolVersion() !== era || server?.name !== 'theologai-bible-server'
          || server.version !== options.serverVersion) throw new SmokeFault('initialize_contract');
      checks.push({ era, probeId, passed: true });
      probeId = 'tools-list';
      const { tools } = await client.listTools();
      for (const expected of ['bible_lookup', PASSAGE_TOOL, 'primary_source_search']) {
        if (!tools.some(tool => tool.name === expected)) throw new SmokeFault('tool_missing');
      }
      const study = tools.find(tool => tool.name === 'original_language_study');
      const studyInputs = record(study?.inputSchema.properties);
      const depths = ['beginner', 'intermediate', 'technical'];
      const outputs = records(record(study?.outputSchema)?.oneOf);
      if (!studyInputs || Object.hasOwn(studyInputs, 'detail')
          || JSON.stringify(record(studyInputs.depth)?.enum) !== JSON.stringify(depths)
          || outputs.length !== depths.length
          || !depths.every(depth => outputs.some(output => {
            const fields = record(output.properties);
            return record(fields?.schemaVersion)?.const === '3' && record(fields?.depth)?.const === depth;
          }))) throw new SmokeFault('language_study_contract');
      checks.push({ era, probeId, passed: true });
      probeId = 'local-passage';
      const result = await client.callTool({ name: PASSAGE_TOOL, arguments: { reference: PASSAGE } });
      const passage = record(result.structuredContent);
      if (result.isError || passage?.kind !== PASSAGE_TOOL || passage.language !== 'Greek'
          || passage.book !== 'John' || passage.chapter !== 3 || passage.verse !== 16
          || !records(passage.words).some(word => word.strongsNumber === 'G0025')) {
        throw new SmokeFault('passage_mismatch');
      }
      checks.push({ era, probeId, passed: true });
      if (options.search) {
        probeId = 'search:kempis-imitation-of-christ';
        const search = await client.callTool({ name: 'primary_source_search', arguments: scopedSearchArguments(options.role, KEMPIS) });
        const uri = workSectionUris(search.structuredContent, KEMPIS.work)[0];
        if (search.isError || !uri) {
          throw new SmokeFault('search_locator_missing');
        }
        const resource = await client.readResource({ uri });
        if (!resource.contents.some(content => content.uri === uri && 'text' in content && content.text.length > 100)) {
          throw new SmokeFault('search_citation_mismatch');
        }
        checks.push({ era, probeId, passed: true });
      }
    } catch (error) {
      const failure = firstFailure ?? (error instanceof SmokeFault ? error : new SmokeFault('protocol'));
      return { checks, exchanges, failure: { era, probeId, category: failure.category, status: failure.status ?? null } };
    } finally {
      await client.close().catch(() => {});
    }
  }
  return { checks, exchanges };
}

export async function runReleaseAcceptance(options: AcceptanceOptions) {
  const endpoint = releaseEndpoint(options.endpoint);
  if (options.mode === 'application') {
    const result = await applicationSmoke(options, endpoint);
    return { passed: !result.failure, schemaVersion: 'theologai-application-smoke.v1', mode: 'application' as const,
      role: options.role, serverVersion: options.serverVersion, endpoint: endpoint.href,
      ...result };
  }
  return runCorpusAcceptance(options);
}

export async function runCorpusAcceptance(options: Omit<AcceptanceOptions, 'mode'>) {
  releaseEndpoint(options.endpoint);
  if (!options.databasePath || !options.guard) throw new Error('Corpus acceptance requires a database and a live dispatch guard');
  const result = await auditCorpusRelease({
    ...options, databasePath: options.databasePath, root: options.root ?? process.cwd(),
    fetch: releaseReadFetch(options.endpoint, 'corpus', options.fetch ?? fetch),
  });
  if (!result.failure && options.profile === hostedCorpusProfile) {
    if (!hasHostedCorpusChecks({ ...result, passed: true })) throw new Error('Focused corpus acceptance incomplete');
  } else if (!result.failure) {
    for (const era of RELEASE_PROTOCOLS) {
      const checks = result.checks.filter(check => check.era === era);
      if (checks.length !== 185 || checks.some(check => !check.passed)) {
        throw new Error('Corpus acceptance did not finish 185 checks in each protocol version');
      }
    }
  }
  return { mode: 'corpus' as const, passed: !result.failure, ...result };
}

async function main() {
  const { values } = parseArgs({ options: {
    mode: { type: 'string' }, role: { type: 'string' }, endpoint: { type: 'string' },
    version: { type: 'string' }, database: { type: 'string' }, bundle: { type: 'string' }, output: { type: 'string' },
    search: { type: 'boolean' }, wesley: { type: 'boolean' }, focused: { type: 'boolean' },
  } });
  if ((values.mode !== 'application' && values.mode !== 'corpus') ||
      (values.role !== 'preview' && values.role !== 'production') || !values.endpoint || !values.version) {
    throw new Error('Required arguments are --mode application|corpus --role preview|production --endpoint and --version');
  }
  if (values.focused && (!values.bundle || values.mode !== 'corpus')) {
    throw new Error('Focused diagnostics require a local corpus Worker bundle');
  }
  const options = { mode: values.mode, role: values.role, endpoint: releaseEndpoint(values.endpoint).href,
    serverVersion: values.version, databasePath: values.database, search: values.search,
    profile: values.focused ? hostedCorpusProfile : undefined } satisfies AcceptanceOptions;
  if (values.wesley && !values.bundle) throw new Error('Wesley diagnostics require a local Worker bundle');
  if (values.bundle && options.endpoint !== 'https://worker.test/mcp') {
    throw new Error('Local acceptance requires the worker.test endpoint');
  }
  const result = values.bundle
    ? await (await import('./release-acceptance-workerd.js')).runWorkerdAcceptance(options, values.bundle, values.wesley)
    : await runReleaseAcceptance(options);
  const receipt = JSON.stringify(result, null, 2) + '\n';
  if (values.output) await writeFile(values.output, receipt, { flag: 'wx' });
  else process.stdout.write(receipt);
  if (result.failure) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'MCP acceptance failed');
    process.exitCode = 1;
  });
}
