import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { normalizeCcelSectionLocator } from '../src/adapters/commentary/CcelSearchAdapter.js';
import { CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT, type CcelCoordinatorSnapshot } from '../src/services/historical/CcelUpstreamCoordinator.js';
import { runOperatorRequest } from './ccel-coordinator-operator.js';

export const LIVE_AUDIT_CONFIRMATION = 'I AUTHORIZE TWO LIVE CCEL PREVIEW REQUESTS';
const PREVIEW_URL = 'https://preview-mcp.theologai.xyz/mcp';
const PRODUCTION_URL = 'https://mcp.theologai.xyz/mcp';
const PRODUCTION_OPERATOR_ENDPOINT = 'https://mcp.theologai.xyz/internal/ccel-coordinator';

export interface CcelAuditOptions {
  previewUrl: string;
  productionUrl: string;
  authorization: string;
  productionWorkerVersionId: string;
}

export function parseCcelAuditArgs(argv: string[]): CcelAuditOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined || values.has(key)) throw new Error('Invalid audit arguments.');
    values.set(key, value);
  }
  if ([...values.keys()].some(key => ![
    '--preview-url', '--production-url', '--authorize-live-ccel', '--production-worker-version-id',
  ].includes(key))) {
    throw new Error('Unknown audit argument.');
  }
  const options = {
    previewUrl: values.get('--preview-url') ?? '',
    productionUrl: values.get('--production-url') ?? '',
    authorization: values.get('--authorize-live-ccel') ?? '',
    productionWorkerVersionId: values.get('--production-worker-version-id') ?? '',
  };
  if (options.previewUrl !== PREVIEW_URL || options.productionUrl !== PRODUCTION_URL
    || options.authorization !== LIVE_AUDIT_CONFIRMATION || !isUuid(options.productionWorkerVersionId)) {
    throw new Error('Live audit remains inert without canonical URLs, the exact authorization phrase, and a valid production Worker UUID.');
  }
  return options;
}

type Provider = {
  provider?: string; status?: string; searched?: boolean; retryAfterSeconds?: number; hitCount?: number;
  scope?: { eligibleDocuments?: Array<{ editionReadiness?: EditionReadiness }> };
  hits?: Array<{
    snippet?: string; metadataStatus?: string; editionReadiness?: EditionReadiness;
    locator?: { kind?: string; url?: string; uri?: string };
  }>;
};
type EditionReadiness = {
  foundation?: string; editionIdentity?: string; provenance?: string; exactArtifactRights?: string;
};
type CoverageObservation = {
  queryId?: string; provider?: string; status?: string; returnedHitCount?: number;
};
type SearchOutput = {
  schemaVersion?: string; planStatus?: string;
  responseWindow?: { unit?: string; maximum?: number; truncated?: boolean };
  coverage?: {
    localAttempted?: boolean; localHitCount?: number; ccelAttempted?: boolean; ccelHitCount?: number;
    serverObserved?: { searched?: CoverageObservation[]; notSearched?: CoverageObservation[] };
  };
  evidencePolicy?: {
    snippetUse?: string; localSectionAccess?: string; externalSectionAccess?: string;
    coverageScope?: string; externalRightsStatus?: string; lookupAliasUse?: string;
    coverageLedger?: Record<string, string>;
  };
  queries?: Array<{ id?: string; providers?: Provider[] }>;
};

const LOCAL_EDITION_READINESS = {
  foundation: 'edition-provenance-foundation.v1',
  editionIdentity: 'not_established',
  provenance: 'incomplete',
  exactArtifactRights: 'not_established_by_this_contract',
};
const EXTERNAL_EDITION_READINESS = {
  editionIdentity: 'provider_unreviewed',
  provenance: 'provider_unreviewed',
  exactArtifactRights: 'not_determined',
};
const COVERAGE_LEDGER = {
  searched: 'server_observed_provider_execution',
  read: 'host_observed_successful_exact_resource_or_page_read',
  deferred: 'host_recorded_intentional_deferral',
  notSearched: 'server_observed_provider_non_execution',
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
  /** Existing protected operator route; never receives or returns provider content. */
  snapshotCoordinator?: () => Promise<CcelCoordinatorSnapshot>;
  now?: () => number;
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
  const snapshotCoordinator = dependencies.snapshotCoordinator
    ?? (() => readProtectedCoordinatorSnapshot(options.productionWorkerVersionId));
  const now = dependencies.now ?? Date.now;
  const production = await connectClient(options.productionUrl, 'theologai-ccel-production-control');
  const preview = await connectClient(options.previewUrl, 'theologai-ccel-preview-audit');
  const ccelBudget = new CcelCallBudget(2);
  try {
    const productionTools = await production.listTools();
    const previewTools = await preview.listTools();
    const productionSchema = toolSchema(productionTools.tools, 'primary_source_search');
    const previewSchema = toolSchema(previewTools.tools, 'primary_source_search');
    assert(schemaVersionIs(productionSchema, '4')
      && !schemaContainsConst(productionSchema, 'ccel_live')
      && !schemaContainsProperty(productionSchema, 'retryAfterSeconds'), 'production v4 local-only control');
    assert(schemaVersionIs(previewSchema, '5')
      && schemaContainsConst(previewSchema, 'ccel_live')
      && schemaContainsProperty(previewSchema, 'retryAfterSeconds'), 'preview v5 CCEL contract');

    // These are public-contract proofs before any tool call. The protected
    // snapshot adds only content-free coordinator evidence; it never reserves
    // an origin slot or changes the circuit.
    const preSnapshot = await readAuditSnapshot(snapshotCoordinator, 'pre');
    assertCanaryReady(preSnapshot, now());

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
    for (const output of contenders) assertValidV5Envelope(output);
    assertValidExternalDiscovery(provider(cold[0]!, 'ccel_live')!);
    assertValidRateLimited(provider(busy[0]!, 'ccel_live')!);
    const postSnapshot = await readAuditSnapshot(snapshotCoordinator, 'post');
    const coordinator = assertCanaryDelta(preSnapshot, postSnapshot);

    // Local search is deliberately separate and cannot consume an origin slot.
    const local = await search(preview, ccelBudget, 'audit-local-fallback', 'justification', ['local']);
    assert(['ok', 'no_results', 'catalog_miss'].includes(provider(local, 'local')?.status ?? ''), 'usable local fallback independent of CCEL');
    assertValidV5Envelope(local);
    assert(ccelBudget.snapshot() === 2, 'exactly two CCEL-bearing tool calls');

    return {
      schemaVersion: '1', audit: 'ccel-live-preview', passed: true,
      productionControl: {
        contractVersionObserved: '4', discoverySchemaObserved: 'local_only', toolsListCalls: 1,
        protectedSnapshotReads: 2, toolCallInvocations: 0,
      },
      preview: {
        contractVersionObserved: '5', discoverySchemaObserved: 'ccel_exposed', ccelBearingToolCallMaximum: 2,
        upstreamOriginAdmissionObserved: coordinator.delta.admissionCount,
        statuses: [...contenders, local].map(summarize),
      },
      coordinator,
      privacy: 'No query, title, snippet, content, URL, header, token, nonce, or client identity is retained.',
    };
  } finally {
    await production.close().catch(() => undefined);
    await preview.close().catch(() => undefined);
  }
}

async function readAuditSnapshot(
  snapshotCoordinator: () => Promise<CcelCoordinatorSnapshot>,
  phase: 'pre' | 'post',
): Promise<CcelCoordinatorSnapshot> {
  try {
    return await snapshotCoordinator();
  } catch {
    throw new Error(`Audit failed: protected coordinator ${phase}-snapshot unavailable.`);
  }
}

async function readProtectedCoordinatorSnapshot(workerVersionId: string): Promise<CcelCoordinatorSnapshot> {
  const secret = process.env.THEOLOGAI_CCEL_OPERATOR_TOKEN ?? '';
  const response = await runOperatorRequest({
    endpoint: PRODUCTION_OPERATOR_ENDPOINT,
    action: 'snapshot',
    workerVersionId,
  }, secret);
  const snapshot = (response as { snapshot?: unknown }).snapshot;
  if (!isCoordinatorSnapshot(snapshot)) throw new Error('Audit failed: protected coordinator snapshot was malformed.');
  return snapshot;
}

function assertCanaryReady(snapshot: CcelCoordinatorSnapshot, observedAtMs: number): void {
  assert(isCoordinatorSnapshot(snapshot), 'protected coordinator pre-snapshot shape');
  assert(Number.isSafeInteger(observedAtMs) && observedAtMs >= 0, 'safe audit clock');
  assert(snapshot.state === 'closed'
    && snapshot.transientFailures === 0
    && snapshot.backoffUntilMs === 0
    && snapshot.probeInFlight === false
    && snapshot.probeLeaseUntilMs === 0
    && snapshot.nextAllowedAtMs <= observedAtMs
    && snapshot.terminalAttemptCount <= CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT
    && snapshot.terminalRetiredThroughAttemptId === snapshot.attemptSequence,
  'clean coordinator precondition');
}

function assertCanaryDelta(pre: CcelCoordinatorSnapshot, post: CcelCoordinatorSnapshot) {
  assert(isCoordinatorSnapshot(post), 'protected coordinator post-snapshot shape');
  const admissionCount = post.attemptSequence - pre.attemptSequence;
  const terminalOutcomeCount = post.terminalAttemptCount - pre.terminalAttemptCount;
  const terminalRetirementCount = post.terminalRetiredThroughAttemptId - pre.terminalRetiredThroughAttemptId;
  const expectedTerminalOutcomeCount = pre.terminalAttemptCount === CCEL_UPSTREAM_TERMINAL_ATTEMPT_LIMIT ? 0 : 1;
  assert(post.operatorEpoch === pre.operatorEpoch
    && admissionCount === 1
    && terminalOutcomeCount === expectedTerminalOutcomeCount
    && terminalRetirementCount === 1
    && post.state === 'closed'
    && post.transientFailures === 0
    && post.backoffUntilMs === 0
    && post.probeInFlight === false
    && post.probeLeaseUntilMs === 0,
  'one admitted and finalized contender with a closed terminal circuit');
  return {
    pre: summarizeCoordinatorSnapshot(pre),
    post: summarizeCoordinatorSnapshot(post),
    delta: {
      admissionCount,
      terminalOutcomeCount,
      terminalRetirementCount,
      operatorEpochChanged: false,
    },
    terminalCircuitState: 'closed',
  };
}

function summarizeCoordinatorSnapshot(snapshot: CcelCoordinatorSnapshot) {
  return {
    state: snapshot.state,
    attemptSequence: snapshot.attemptSequence,
    terminalAttemptCount: snapshot.terminalAttemptCount,
    terminalRetiredThroughAttemptId: snapshot.terminalRetiredThroughAttemptId,
    probeInFlight: snapshot.probeInFlight,
    transientFailures: snapshot.transientFailures,
    backoffActive: snapshot.backoffUntilMs > 0,
  };
}

function isCoordinatorSnapshot(value: unknown): value is CcelCoordinatorSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!['closed', 'transient_backoff', 'rate_limited', 'latched_policy', 'latched_interface'].includes(String(record.state))
    || typeof record.probeInFlight !== 'boolean') return false;
  return [
    record.nextAllowedAtMs, record.backoffUntilMs, record.lastObservedAtMs, record.attemptSequence,
    record.operatorEpoch, record.transientFailures, record.probeLeaseUntilMs,
    record.terminalAttemptCount, record.terminalRetiredThroughAttemptId,
  ].every(item => Number.isSafeInteger(item) && (item as number) >= 0);
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

function assertValidV5Envelope(output: SearchOutput): void {
  assert(output.schemaVersion === '5'
    && output.responseWindow?.unit === 'utf8_bytes'
    && output.responseWindow.maximum === 32_768
    && typeof output.responseWindow.truncated === 'boolean'
    && output.evidencePolicy?.snippetUse === 'discovery_only'
    && output.evidencePolicy.localSectionAccess === 'mcp_resource_read'
    && output.evidencePolicy.externalSectionAccess === 'direct_url_only'
    && output.evidencePolicy.coverageScope === 'bounded_non_exhaustive'
    && output.evidencePolicy.externalRightsStatus === 'not_determined'
    && output.evidencePolicy.lookupAliasUse === 'exact_routing_only_not_metadata_evidence'
    && matchesExactRecord(output.evidencePolicy.coverageLedger, COVERAGE_LEDGER)
    && !JSON.stringify(output).includes('resource_link'), 'compact v5 discovery semantics');

  const searched = output.coverage?.serverObserved?.searched;
  const notSearched = output.coverage?.serverObserved?.notSearched;
  assert(Array.isArray(searched) && Array.isArray(notSearched), 'v5 server-observed coverage ledger');
  const providers = output.queries?.flatMap(query => (query.providers ?? []).map(item => ({ queryId: query.id, item }))) ?? [];
  const providerKeys = providers.map(({ queryId, item }) => `${String(queryId)}\u0000${String(item.provider)}`);
  assert(providerKeys.length > 0
    && new Set(providerKeys).size === providerKeys.length
    && searched.length + notSearched.length === providers.length, 'one-to-one provider coverage');
  for (const { queryId, item } of providers) {
    assert(typeof queryId === 'string' && queryId.length > 0
      && (item.provider === 'local' || item.provider === 'ccel_live')
      && typeof item.searched === 'boolean'
      && Number.isSafeInteger(item.hitCount)
      && item.hitCount === (item.hits?.length ?? 0), 'explicit bounded provider execution state');
    const searchedMatches = searched.filter(observation => observation.queryId === queryId && observation.provider === item.provider);
    const notSearchedMatches = notSearched.filter(observation => observation.queryId === queryId && observation.provider === item.provider);
    if (item.searched) {
      assert(searchedMatches.length === 1 && notSearchedMatches.length === 0
        && searchedMatches[0]?.status === item.status
        && searchedMatches[0]?.returnedHitCount === item.hitCount, 'truthful searched-provider coverage');
    } else {
      assert(searchedMatches.length === 0 && notSearchedMatches.length === 1
        && notSearchedMatches[0]?.status === item.status, 'truthful non-executed-provider coverage');
    }
    if (item.provider === 'local') assertValidLocalEditionReadiness(item);
    if (item.provider === 'ccel_live') assertValidExternalEditionReadiness(item);
  }

  const local = providers.filter(({ item }) => item.provider === 'local').map(({ item }) => item);
  const external = providers.filter(({ item }) => item.provider === 'ccel_live').map(({ item }) => item);
  assert(output.coverage?.localAttempted === local.some(item => item.searched === true)
    && output.coverage.localHitCount === local.reduce((count, item) => count + (item.hitCount ?? 0), 0)
    && output.coverage.ccelAttempted === external.some(item => item.searched === true)
    && output.coverage.ccelHitCount === external.reduce((count, item) => count + (item.hitCount ?? 0), 0),
  'v5 aggregate coverage');
}

function assertValidLocalEditionReadiness(local: Provider): void {
  for (const hit of local.hits ?? []) {
    assert(matchesExactRecord(hit.editionReadiness, LOCAL_EDITION_READINESS)
      && hit.locator?.kind === 'mcp_resource'
      && typeof hit.locator.uri === 'string', 'local edition readiness and resource access');
  }
  for (const document of local.scope?.eligibleDocuments ?? []) {
    assert(matchesExactRecord(document.editionReadiness, LOCAL_EDITION_READINESS), 'local scope edition readiness');
  }
}

function assertValidExternalEditionReadiness(external: Provider): void {
  for (const hit of external.hits ?? []) {
    assert(matchesExactRecord(hit.editionReadiness, EXTERNAL_EDITION_READINESS)
      && hit.metadataStatus === 'provider_search_result_unreviewed', 'external edition readiness');
  }
}

function matchesExactRecord(actual: Record<string, unknown> | undefined, expected: Record<string, string>): boolean {
  if (!actual) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
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

function schemaVersionIs(schema: object, expected: string): boolean {
  const properties = (schema as { properties?: Record<string, unknown> }).properties;
  const schemaVersion = properties?.schemaVersion as { const?: unknown } | undefined;
  return schemaVersion?.const === expected;
}

function schemaContainsConst(value: unknown, expected: string): boolean {
  if (!value || typeof value !== 'object') return false;
  if ('const' in value && (value as { const?: unknown }).const === expected) return true;
  return Object.values(value).some(item => schemaContainsConst(item, expected));
}

function schemaContainsProperty(value: unknown, expected: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const properties = (value as { properties?: unknown }).properties;
  if (properties && typeof properties === 'object' && expected in properties) return true;
  return Object.values(value).some(item => schemaContainsProperty(item, expected));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function assert(condition: boolean, label: string): asserts condition {
  if (!condition) throw new Error(`Audit failed: ${label}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runCcelPreviewAudit(parseCcelAuditArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
