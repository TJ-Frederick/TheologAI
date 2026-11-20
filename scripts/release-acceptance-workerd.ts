import { constants } from 'node:fs';
import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';
import { escapeFrozenEditionSectionContentForMarkdown } from '../src/kernel/editionProvenanceFoundation.js';
import { Log, LogLevel, Miniflare } from 'miniflare';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { versionNegotiationFor } from './audit-dual-era-mcp-preview.js';
import {
  runReleaseAcceptance, RELEASE_PROTOCOLS, WESLEY, workSectionUris, scopedSearchArguments, type AcceptanceOptions,
} from './release-acceptance.js';

const DATABASE = 'theologai-local-release-acceptance';
const LOCAL_ENDPOINT = 'https://worker.test/mcp';

async function withRuntime<T>(
  options: AcceptanceOptions, bundle: string, run: (dispatch: typeof fetch) => Promise<T>,
): Promise<T> {
  if (options.endpoint !== LOCAL_ENDPOINT || !options.databasePath) {
    throw new Error('Workerd acceptance requires the local endpoint and a source database');
  }
  const wranglerConfig = await readFile(join(options.root ?? process.cwd(), 'wrangler.toml'), 'utf8');
  const compatibilityDate = wranglerConfig.match(/^compatibility_date = "([^"]+)"$/m)?.[1];
  if (!compatibilityDate) throw new Error('Unable to determine Worker compatibility date');

  const state = await mkdtemp(join(tmpdir(), 'theologai-acceptance-'));
  const shared = { compatibilityDate, cf: false, modules: true as const, d1Persist: state,
    d1Databases: { THEOLOGAI_DB: DATABASE }, log: new Log(LogLevel.NONE) };
  try {
    // Let the pinned runtime allocate the D1 backing file for its configured binding.
    const initialize = new Miniflare({ ...shared, script: '' });
    try {
      const db = await initialize.getD1Database('THEOLOGAI_DB');
      await db.prepare('CREATE TABLE release_acceptance_placeholder (id INTEGER)').run();
    } finally {
      await initialize.dispose();
    }
    const sqliteFiles = (await readdir(state, { recursive: true })).filter(path => path.endsWith('.sqlite') && !path.endsWith('/metadata.sqlite'));
    if (sqliteFiles.length !== 1) throw new Error('Local D1 backing file could not be determined');
    // The source SQLite can be reused without import or writes to the original.
    const backingFile = join(state, sqliteFiles[0]);
    await rm(backingFile + '-wal', { force: true });
    await rm(backingFile + '-shm', { force: true });
    await copyFile(options.databasePath, backingFile, constants.COPYFILE_FICLONE);
    const worker = new Miniflare({
      ...shared, script: bundle, compatibilityFlags: ['nodejs_compat'],
      outboundService: () => new Response('Local acceptance blocked outbound HTTP', { status: 503 }),
      bindings: {
        THEOLOGAI_VERSION: options.serverVersion,
        THEOLOGAI_REQUEST_LOGS: 'false',
        THEOLOGAI_ALLOWED_ORIGINS: 'https://allowed.example',
        THEOLOGAI_MAX_REQUEST_BYTES: '1048576',
        THEOLOGAI_EXPOSE_CCEL_DISCOVERY: String(options.role === 'preview'),
        THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: 'false',
        THEOLOGAI_ENABLE_CCEL_COORDINATOR: 'false',
      },
      ratelimits: { THEOLOGAI_RATE_LIMITER: { namespace_id: '361299', simple: { limit: 120, period: 60 } } },
    });
    try {
      const dispatch: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
        if (url !== LOCAL_ENDPOINT) throw new Error('Workerd acceptance cannot dispatch outside the local endpoint');
        const response = await worker.dispatchFetch(url, {
          method: init?.method, headers: Object.fromEntries(new Headers(init?.headers)),
          body: typeof init?.body === 'string' ? init.body : undefined,
          signal: init?.signal ?? undefined, redirect: 'manual',
        });
        return new Response(response.body as ReadableStream<Uint8Array> | null, {
          status: response.status, headers: Object.fromEntries(response.headers),
        });
      };
      return await run(dispatch);
    } finally {
      await worker.dispose();
    }
  } finally {
    await rm(state, { recursive: true, force: true });
  }
}

function readWesleySourceSections(databasePath: string) {
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const sections = source.prepare(`
      SELECT identities.section_key, sections.content
      FROM historical_section_identities AS identities
      JOIN document_sections AS sections ON sections.id = identities.document_section_id
      WHERE identities.document_id = ?
    `).all(WESLEY.work) as { section_key: string; content: string }[];
    return new Map(sections.map(section => [
      `theologai://documents/${WESLEY.work}#section-${section.section_key}`, section.content,
    ]));
  } finally {
    source.close();
  }
}

async function wesleyDiagnostic(options: AcceptanceOptions, bundle: string) {
  if (!options.databasePath) throw new Error('Wesley diagnostics require a source database');
  const sourceSections = readWesleySourceSections(options.databasePath);
  const measurements = [];
  let expected: string[] | undefined;
  for (const era of RELEASE_PROTOCOLS) {
    const runs = await withRuntime(options, bundle, async dispatch => {
      const client = new Client({ name: 'theologai-local-wesley-acceptance', version: '1' }, versionNegotiationFor(era));
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(LOCAL_ENDPOINT), { fetch: dispatch }));
        if (client.getNegotiatedProtocolVersion() !== era) throw new Error('Wesley protocol negotiation mismatch');
        const measurements = [];
        for (const run of ['cold', 'repeat-1', 'repeat-2']) {
          const started = performance.now();
          const result = await client.callTool({
            name: 'primary_source_search', arguments: scopedSearchArguments(options.role, WESLEY),
          });
          const durationMs = Math.round(performance.now() - started);
          if (result.isError) throw new Error('Wesley search returned a tool error');
          const locators = [...new Set(workSectionUris(result.structuredContent, WESLEY.work))];
          if (locators[0] !== 'theologai://documents/wesley-standard-sermons#section-sermon-01') {
            throw new Error('Wesley search did not rank the known sermon first');
          }
          expected ??= locators;
          if (JSON.stringify(locators) !== JSON.stringify(expected)) throw new Error('Wesley search result order changed');
          measurements.push({ run, durationMs, locators });
        }
        for (const uri of expected ?? []) {
          const resource = await client.readResource({ uri });
          const body = sourceSections.get(uri);
          if (!body || !resource.contents.some(content => content.uri === uri && 'text' in content
            && (content.text.includes(body) || content.text.includes(escapeFrozenEditionSectionContentForMarkdown(body))))) {
            throw new Error('Wesley citation did not resolve to the exact local section');
          }
        }
        return measurements;
      } finally {
        await client.close();
      }
    });
    measurements.push({ era, runs });
  }
  return measurements;
}

export async function runWorkerdAcceptance(options: AcceptanceOptions, bundlePath: string, wesley = false) {
  const bytes = await readFile(bundlePath);
  const bundle = bytes.toString('utf8');
  const workerSha256 = createHash('sha256').update(bytes).digest('hex');
  const result = await withRuntime(options, bundle, dispatch =>
    runReleaseAcceptance({ ...options, fetch: dispatch, guard: () => {} }));
  const diagnostics = wesley && result.passed ? await wesleyDiagnostic(options, bundle) : undefined;
  return { ...result, workerSha256, ...(diagnostics ? { wesley: diagnostics } : {}) };
}
