/**
 * Bounded, metadata-only search against CCEL's public HTML search surface.
 *
 * This adapter is intentionally separate from CcelAdapter. It never fetches a
 * result link, never returns a work body, and is disabled unless explicitly
 * enabled by a caller that has passed the rollout gate.
 */

import { ValidationError } from '../../kernel/errors.js';
import {
  type PrimarySourceProviderResult,
  type PrimarySourceSearchHit,
  type PrimarySourceSearchMatch,
  type PrimarySourceSearchQuery,
} from '../../services/historical/primarySourceTypes.js';
import { decodeHtmlEntities, stripHtml } from '../shared/HtmlParser.js';
import type { PrimarySourceFeatureFlags } from '../../kernel/featureFlags.js';

export const CCEL_SEARCH_ATTRIBUTION = 'CCEL (Christian Classics Ethereal Library)' as const;
export const CCEL_SEARCH_URL = 'https://ccel.org/';

export const CCEL_SEARCH_LIMITS = Object.freeze({
  maxTextCharacters: 200,
  maxAuthorCharacters: 100,
  maxWorkCharacters: 160,
  maxTerms: 12,
  maxComposedQueryCharacters: 768,
  maxPage: 1,
  maxHitsPerResponse: 5,
  maxCandidateResults: 50,
  maxStructuralTokens: 20_000,
  maxStructuralDepth: 128,
  maxResponseBytes: 1024 * 1024,
  maxTitleCharacters: 300,
  maxAuthorResultCharacters: 200,
  maxSectionCharacters: 300,
  maxSnippetCharacters: 240,
  maxLocatorUrlCharacters: 1024,
  maxLocatorSegmentCharacters: 128,
  maxLocatorWorkCharacters: 256,
  maxLocatorSectionCharacters: 256,
  maxLocatorSegments: 4,
  maxAggregateResultCharacters: 12_000,
  timeoutMs: 8_000,
  totalRequestMs: 12_000,
  maxRetries: 0,
  maxRedirects: 0,
  cacheTtlMs: 10 * 60 * 1000,
  negativeCacheTtlMs: 60 * 1000,
  cacheMaxEntries: 100,
  cacheMaxBytes: 8 * 1024 * 1024,
  maxConcurrentRequests: 2,
  maxQueuedRequests: 4,
  networkFailureWindowMs: 5 * 60 * 1000,
  networkFailureThreshold: 3,
  networkOpenMs: 10 * 60 * 1000,
  policyOpenMs: 30 * 60 * 1000,
  maxCircuitOpenMs: 24 * 60 * 60 * 1000,
});

const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,11}$/;
const ALLOWED_QUERY_KEYS = new Set(['text', 'match', 'author', 'work', 'page', 'limit']);
const LUCENE_SPECIAL_CHARACTERS = new Set('+-!(){}[]^"~*?:\\&|'.split(''));
const USER_AGENT = 'TheologAI/primary-source-search (bounded user-requested discovery; contact project maintainers)';

type FetchImplementation = typeof fetch;
type Clock = () => number;

export interface CcelSearchAdapterOptions {
  /** Explicit rollout gate. Defaults to false. */
  enabled?: boolean;
  featureFlags?: Partial<PrimarySourceFeatureFlags>;
  fetchImpl?: FetchImplementation;
  now?: Clock;
  /** Only the verified CCEL origin and root search path are accepted. */
  baseUrl?: string;
  /** Lower test/deployment budgets are allowed; the locked maxima cannot be raised. */
  cacheMaxEntries?: number;
  cacheMaxBytes?: number;
}

export interface ComposedCcelSearchRequest {
  normalizedText: string;
  normalizedMatch: PrimarySourceSearchMatch;
  normalizedAuthor?: string;
  normalizedWork?: string;
  page: number;
  limit: number;
  luceneQuery: string;
  url: string;
  cacheKey: string;
}

type CircuitReason = 'network' | 'policy' | 'rate_limited' | 'interface_changed';
type CircuitStatus = 'closed' | 'open' | 'half_open';

export interface CcelCircuitSnapshot {
  status: CircuitStatus;
  reason?: CircuitReason;
  openUntil?: number;
  recentNetworkFailures: number;
  parserFailures: number;
  operatorReviewRequired: boolean;
}

type FailureKind = 'network' | 'timeout' | 'forbidden' | 'rate_limited' | 'policy' | 'parser' | 'upstream' | 'too_large';

const TIMEOUT_ABORT_REASON = 'ccel-search-timeout';

class CcelSearchFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly retryAfterMs?: number,
  ) {
    super(kind);
    this.name = 'CcelSearchFailure';
  }
}

interface CacheEntry {
  value: PrimarySourceProviderResult;
  expiresAt: number;
  bytes: number;
}

class MetadataCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
  ) {}

  get(key: string, now: number): PrimarySourceProviderResult | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now >= entry.expiresAt) {
      this.delete(key, entry);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return cloneResult(entry.value);
  }

  set(key: string, value: PrimarySourceProviderResult, expiresAt: number): void {
    const serialized = JSON.stringify(value);
    const bytes = new TextEncoder().encode(serialized).byteLength;
    if (bytes > this.maxBytes) return;

    const previous = this.entries.get(key);
    if (previous) this.delete(key, previous);
    while (this.entries.size >= this.maxEntries || this.totalBytes + bytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value as [string, CacheEntry] | undefined;
      if (!oldest) break;
      this.delete(oldest[0], oldest[1]);
    }
    this.entries.set(key, { value: cloneResult(value), expiresAt, bytes });
    this.totalBytes += bytes;
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }

  snapshot(): { entries: number; bytes: number } {
    return { entries: this.entries.size, bytes: this.totalBytes };
  }

  private delete(key: string, entry: CacheEntry): void {
    if (this.entries.delete(key)) this.totalBytes -= entry.bytes;
  }
}

interface QueuedRequest {
  task: () => Promise<PrimarySourceProviderResult>;
  resolve: (value: PrimarySourceProviderResult) => void;
}

interface CircuitClaim {
  generation: number;
  operatorEpoch: number;
}

/** Compose a literal, bounded query for CCEL's documented search fields. */
export function composeCcelSearchRequest(input: PrimarySourceSearchQuery): ComposedCcelSearchRequest {
  validateQueryShape(input);

  const normalizedText = normalizeLiteral(input.text, 'text', CCEL_SEARCH_LIMITS.maxTextCharacters);
  const normalizedAuthor = input.author === undefined
    ? undefined
    : normalizeLiteral(input.author, 'author', CCEL_SEARCH_LIMITS.maxAuthorCharacters);
  const normalizedWork = input.work === undefined
    ? undefined
    : normalizeLiteral(input.work, 'work', CCEL_SEARCH_LIMITS.maxWorkCharacters);
  if (normalizedAuthor !== undefined && normalizeRestrictionPhrase(normalizedAuthor) === '') {
    throw new ValidationError('author', 'author must contain a semantic name or reviewed ID.');
  }
  if (normalizedWork !== undefined && normalizeRestrictionPhrase(normalizedWork) === '') {
    throw new ValidationError('work', 'work must contain a semantic title or reviewed ID.');
  }
  const normalizedMatch = input.match ?? 'all_terms';
  if (normalizedMatch !== 'all_terms' && normalizedMatch !== 'phrase') {
    throw new ValidationError('match', 'match must be all_terms or phrase.');
  }

  const textTerms = normalizedText.split(' ');
  if (normalizedMatch === 'all_terms' && textTerms.length > CCEL_SEARCH_LIMITS.maxTerms) {
    throw new ValidationError('text', `text may contain at most ${CCEL_SEARCH_LIMITS.maxTerms} terms.`);
  }
  const luceneText = normalizedMatch === 'phrase'
    ? `"${escapeLuceneLiteral(normalizedText)}"`
    : textTerms.map(escapeLuceneTerm).join(' AND ');
  const clauses = [luceneText];
  if (normalizedAuthor) clauses.push(composeFieldClause('author', normalizedAuthor));
  if (normalizedWork) clauses.push(composeFieldClause('title', normalizedWork));
  const luceneQuery = clauses.join(' AND ');
  if (countCharacters(luceneQuery) > CCEL_SEARCH_LIMITS.maxComposedQueryCharacters) {
    throw new ValidationError('text', 'The composed CCEL query exceeds the safe length limit.');
  }

  const page = input.page ?? 1;
  const limit = input.limit ?? 5;
  if (!Number.isSafeInteger(page) || page < 1 || page > CCEL_SEARCH_LIMITS.maxPage) {
    throw new ValidationError('page', `page must be an integer from 1 to ${CCEL_SEARCH_LIMITS.maxPage}.`);
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > CCEL_SEARCH_LIMITS.maxHitsPerResponse) {
    throw new ValidationError('limit', `limit must be an integer from 1 to ${CCEL_SEARCH_LIMITS.maxHitsPerResponse}.`);
  }

  const url = new URL(CCEL_SEARCH_URL);
  url.searchParams.set('page', String(page));
  url.searchParams.set('text', luceneQuery);

  return {
    normalizedText,
    normalizedMatch,
    normalizedAuthor,
    normalizedWork,
    page,
    limit,
    luceneQuery,
    url: url.toString(),
    cacheKey: JSON.stringify({ text: normalizedText, match: normalizedMatch, author: normalizedAuthor, work: normalizedWork, page }),
  };
}

function validateQueryShape(input: PrimarySourceSearchQuery): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('query', 'A search query object is required.');
  }
  for (const key of Object.keys(input as object)) {
    if (!ALLOWED_QUERY_KEYS.has(key)) throw new ValidationError(key, 'Unknown search query field.');
  }
  if (typeof input.text !== 'string') throw new ValidationError('text', 'text must be a string.');
  if (input.match !== undefined && typeof input.match !== 'string') throw new ValidationError('match', 'match must be a string.');
  const optionalFields: Array<['author' | 'work', number]> = [
    ['author', CCEL_SEARCH_LIMITS.maxAuthorCharacters],
    ['work', CCEL_SEARCH_LIMITS.maxWorkCharacters],
  ];
  for (const [field, max] of optionalFields) {
    const value = input[field];
    if (value !== undefined && typeof value !== 'string') throw new ValidationError(field, `${field} must be a string.`);
    if (typeof value === 'string' && countCharacters(value.normalize('NFC').trim()) > max) {
      throw new ValidationError(field, `${field} exceeds its safe length limit.`);
    }
  }
}

function normalizeLiteral(value: string, field: string, maxCharacters: number): string {
  if (value.includes('\u0000')) throw new ValidationError(field, `${field} may not contain NUL.`);
  const normalized = value
    .normalize('NFC')
    .replace(/[\u0001-\u001F\u007F-\u009F]/g, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
  if (!normalized) throw new ValidationError(field, `${field} must not be empty.`);
  if (countCharacters(normalized) > maxCharacters) throw new ValidationError(field, `${field} exceeds its safe length limit.`);
  return normalized;
}

function composeFieldClause(field: 'author' | 'title', value: string): string {
  const idField = field === 'author' ? 'authorID' : 'bookID';
  if (isReviewedCcelId(value)) return `${idField}:${escapeLuceneLiteral(value)}`;
  return `${field}:"${escapeLuceneLiteral(value)}"`;
}

function isReviewedCcelId(value: string): boolean {
  return SAFE_ID_PATTERN.test(value);
}

function escapeLuceneLiteral(value: string): string {
  return [...value].map(character => LUCENE_SPECIAL_CHARACTERS.has(character) ? `\\${character}` : character).join('');
}

function escapeLuceneTerm(value: string): string {
  const escaped = escapeLuceneLiteral(value);
  // A caller-supplied Boolean keyword must not become an operator when the
  // adapter inserts its own AND separators.
  return /^(?:AND|OR|NOT)$/i.test(value) ? `"${escaped}"` : escaped;
}

function countCharacters(value: string): number {
  return Array.from(value).length;
}

function cloneResult(result: PrimarySourceProviderResult): PrimarySourceProviderResult {
  return {
    ...result,
    hits: result.hits.map(cloneHit),
    notices: [...result.notices],
  };
}

function cloneHit(hit: PrimarySourceSearchHit): PrimarySourceSearchHit {
  if (hit.provider === 'local') return { ...hit, locator: { ...hit.locator } };
  return { ...hit, locator: { ...hit.locator } };
}

function resultFor(
  status: PrimarySourceProviderResult['status'],
  page: number,
  notices: string[] = [],
  hits: PrimarySourceSearchHit[] = [],
  searched = true,
): PrimarySourceProviderResult {
  return { provider: 'ccel_live', status, searched, page, hitCount: hits.length, hits, notices };
}

/**
 * Search adapter. The only network operation it performs is the one bounded
 * GET represented by a single caller-supplied query object.
 */
export class CcelSearchAdapter {
  private readonly enabled: boolean;
  private readonly fetchImpl: FetchImplementation;
  private readonly now: Clock;
  private readonly baseUrl: string;
  private readonly cache: MetadataCache;
  private readonly queue: QueuedRequest[] = [];
  private activeRequests = 0;
  private circuitStatus: CircuitStatus = 'closed';
  private circuitReason: CircuitReason | undefined;
  private circuitOpenUntil: number | undefined;
  private halfOpenProbeInFlight = false;
  private policyReviewRequired = false;
  private parserFailures = 0;
  private networkFailures: number[] = [];
  private circuitGeneration = 0;
  private operatorEpoch = 0;

  constructor(options: CcelSearchAdapterOptions = {}) {
    this.enabled = options.enabled ?? options.featureFlags?.ccelLiveSearch ?? false;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.baseUrl = validateSearchOrigin(options.baseUrl ?? CCEL_SEARCH_URL);
    const cacheMaxEntries = options.cacheMaxEntries ?? CCEL_SEARCH_LIMITS.cacheMaxEntries;
    const cacheMaxBytes = options.cacheMaxBytes ?? CCEL_SEARCH_LIMITS.cacheMaxBytes;
    if (!Number.isSafeInteger(cacheMaxEntries) || cacheMaxEntries < 1 || cacheMaxEntries > CCEL_SEARCH_LIMITS.cacheMaxEntries) {
      throw new Error(`cacheMaxEntries must be between 1 and ${CCEL_SEARCH_LIMITS.cacheMaxEntries}`);
    }
    if (!Number.isSafeInteger(cacheMaxBytes) || cacheMaxBytes < 1 || cacheMaxBytes > CCEL_SEARCH_LIMITS.cacheMaxBytes) {
      throw new Error(`cacheMaxBytes must be between 1 and ${CCEL_SEARCH_LIMITS.cacheMaxBytes}`);
    }
    this.cache = new MetadataCache(cacheMaxEntries, cacheMaxBytes);
  }

  async search(input: PrimarySourceSearchQuery): Promise<PrimarySourceProviderResult> {
    const request = composeCcelSearchRequest(input);
    if (!this.enabled) return resultFor('disabled', request.page, ['Live CCEL search is disabled.'], [], false);
    // Capture admission before this request can enter the queue. An operator
    // reset invalidates queued as well as active work from the reviewed epoch.
    const admissionEpoch = this.operatorEpoch;
    const deadline = this.now() + CCEL_SEARCH_LIMITS.totalRequestMs;

    const cached = this.cache.get(request.cacheKey, this.now());
    if (cached) return { ...cached, hits: cached.hits.slice(0, request.limit), hitCount: Math.min(cached.hitCount, request.limit) };

    if (this.activeRequests + this.queue.length >= CCEL_SEARCH_LIMITS.maxConcurrentRequests + CCEL_SEARCH_LIMITS.maxQueuedRequests) {
      return resultFor('unavailable', request.page, ['Live CCEL search is busy; try again later.'], [], false);
    }

    return this.enqueue(() => this.performSearch(request, deadline, admissionEpoch));
  }

  getCircuitState(): CcelCircuitSnapshot {
    this.refreshCircuitState();
    return {
      status: this.circuitStatus,
      ...(this.circuitReason ? { reason: this.circuitReason } : {}),
      ...(this.circuitOpenUntil ? { openUntil: this.circuitOpenUntil } : {}),
      recentNetworkFailures: this.recentNetworkFailureCount(),
      parserFailures: this.parserFailures,
      operatorReviewRequired: this.policyReviewRequired,
    };
  }

  /** Explicit operator action required after a CCEL policy/403 signal. */
  resetCircuitAfterReview(): void {
    // Invalidate every request admitted before the operator's decision. A late
    // completion from the old epoch must not recreate or otherwise mutate the
    // state that was explicitly reviewed and reset.
    this.operatorEpoch++;
    this.circuitGeneration++;
    this.policyReviewRequired = false;
    this.circuitStatus = 'closed';
    this.circuitReason = undefined;
    this.circuitOpenUntil = undefined;
    this.halfOpenProbeInFlight = false;
    this.parserFailures = 0;
    this.networkFailures = [];
    this.cache.clear();
  }

  getCacheStats(): { entries: number; bytes: number } {
    return this.cache.snapshot();
  }

  clearCache(): void {
    this.cache.clear();
  }

  private enqueue(task: () => Promise<PrimarySourceProviderResult>): Promise<PrimarySourceProviderResult> {
    if (this.activeRequests < CCEL_SEARCH_LIMITS.maxConcurrentRequests) return this.start(task);
    return new Promise(resolve => this.queue.push({ task, resolve }));
  }

  private start(task: () => Promise<PrimarySourceProviderResult>): Promise<PrimarySourceProviderResult> {
    this.activeRequests++;
    return task()
      .catch(() => resultFor('unavailable', 1, ['Live CCEL search is temporarily unavailable.']))
      .finally(() => {
        this.activeRequests--;
        const next = this.queue.shift();
        if (next) void this.start(next.task).then(next.resolve);
      });
  }

  private async performSearch(request: ComposedCcelSearchRequest, deadline: number, admissionEpoch: number): Promise<PrimarySourceProviderResult> {
    if (admissionEpoch !== this.operatorEpoch) {
      return resultFor('unavailable', request.page, ['Live CCEL search request was invalidated by operator review.'], [], false);
    }
    if (this.now() >= deadline) return resultFor('unavailable', request.page, ['Live CCEL search request budget expired before execution.'], [], false);
    const claim = this.claimCircuitSlot();
    if (!claim) return this.circuitUnavailable(request.page);

    try {
      const html = await this.fetchSearchHtml(request.url, deadline);
      const parsed = parseCcelSearchHtml(html, request.page);
      const filtered = applyCcelRestrictions(parsed.hits, request);
      // A policy signal from another in-flight request is monotonic until an
      // operator explicitly resets it. Do not publish or cache a success that
      // raced with that signal.
      if (!this.recordSuccess(claim)) return this.circuitUnavailable(request.page);
      const result = filtered.rejected > 0
        ? resultFor('unsupported_filter', request.page, ['CCEL search results did not satisfy the requested author/work restriction.'], filtered.hits.slice(0, request.limit))
        : filtered.hits.length === 0
        ? resultFor('no_results', request.page, parsed.notices, [])
        : resultFor('ok', request.page, parsed.notices, filtered.hits.slice(0, request.limit));
      // Cache only recognized successful/no-result metadata, never raw HTML or failures.
      if (filtered.rejected === 0) {
        const cacheable = { ...result, hits: filtered.hits, hitCount: filtered.hits.length };
        this.cache.set(request.cacheKey, cacheable, this.now() + (filtered.hits.length === 0 ? CCEL_SEARCH_LIMITS.negativeCacheTtlMs : CCEL_SEARCH_LIMITS.cacheTtlMs));
      }
      return result;
    } catch (error) {
      const failure = error instanceof CcelSearchFailure ? error : new CcelSearchFailure('network');
      this.recordFailure(failure, claim);
      return this.failureResult(request.page, failure);
    }
  }

  private async fetchSearchHtml(url: string, deadline: number): Promise<string> {
    if (this.now() >= deadline) throw new CcelSearchFailure('network');
    const validated = validateSearchUrl(url, this.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(TIMEOUT_ABORT_REASON), Math.min(CCEL_SEARCH_LIMITS.timeoutMs, Math.max(1, deadline - this.now())));
    let response: Response;
    try {
      // One admitted provider search is one upstream GET. Redirects remain
      // manual and are rejected; network and 5xx responses are never retried.
      response = await this.fetchImpl(validated, {
        method: 'GET',
        headers: { 'Accept': 'text/html, application/xhtml+xml', 'User-Agent': USER_AGENT },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      if (controller.signal.reason === TIMEOUT_ABORT_REASON) throw new CcelSearchFailure('timeout');
      throw new CcelSearchFailure('network');
    }

    if (response.status >= 300 && response.status <= 399 && response.status !== 304) {
      discardResponseBody(response);
      clearTimeout(timeout);
      throw new CcelSearchFailure('policy');
    }

    if (response.status === 403) {
      discardResponseBody(response);
      clearTimeout(timeout);
      throw new CcelSearchFailure('forbidden');
    }
    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('Retry-After'), this.now());
      discardResponseBody(response);
      clearTimeout(timeout);
      throw new CcelSearchFailure('rate_limited', retryAfter);
    }
    if (response.status >= 500) {
      discardResponseBody(response);
      clearTimeout(timeout);
      throw new CcelSearchFailure('network');
    }
    if (response.status < 200 || response.status >= 300) {
      discardResponseBody(response);
      clearTimeout(timeout);
      throw new CcelSearchFailure('upstream');
    }

    const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      discardResponseBody(response);
      clearTimeout(timeout);
      throw new CcelSearchFailure('parser');
    }
    try {
      return await readBoundedBody(response, controller.signal);
    } catch (error) {
      if (error instanceof CcelSearchFailure) throw error;
      throw new CcelSearchFailure('network');
    } finally {
      clearTimeout(timeout);
    }
  }

  private claimCircuitSlot(): CircuitClaim | undefined {
    this.refreshCircuitState();
    if (this.policyReviewRequired || this.circuitStatus === 'open') return undefined;
    if (this.circuitStatus === 'half_open') {
      if (this.halfOpenProbeInFlight) return undefined;
      this.halfOpenProbeInFlight = true;
    }
    return { generation: this.circuitGeneration, operatorEpoch: this.operatorEpoch };
  }

  private refreshCircuitState(): void {
    if (!this.policyReviewRequired && this.circuitStatus === 'open' && this.circuitOpenUntil !== undefined && this.now() >= this.circuitOpenUntil) {
      this.circuitStatus = 'half_open';
      this.circuitOpenUntil = undefined;
      this.halfOpenProbeInFlight = false;
      this.circuitGeneration++;
    }
  }

  private recordSuccess(claim: CircuitClaim): boolean {
    if (!this.isCurrentClaim(claim) || this.policyReviewRequired || this.circuitStatus === 'open') return false;
    const closedHalfOpenCircuit = this.circuitStatus === 'half_open';
    this.circuitStatus = 'closed';
    this.circuitReason = undefined;
    this.circuitOpenUntil = undefined;
    this.halfOpenProbeInFlight = false;
    this.parserFailures = 0;
    this.networkFailures = [];
    if (closedHalfOpenCircuit) this.circuitGeneration++;
    return true;
  }

  private recordFailure(failure: CcelSearchFailure, claim: CircuitClaim): void {
    // An operator reset is an epoch boundary. Nothing admitted before it may
    // mutate the reviewed state, even if that late completion is another 403.
    if (claim.operatorEpoch !== this.operatorEpoch) return;
    // A policy/403 signal is strongest and remains latched until explicit
    // operator reset. Same-epoch weaker completions cannot replace it.
    if (this.policyReviewRequired) return;
    const now = this.now();
    if (failure.kind === 'forbidden' || failure.kind === 'policy') {
      this.openCircuit('policy', CCEL_SEARCH_LIMITS.policyOpenMs, true);
      return;
    }
    // Rate-limit signals merge monotonically even when concurrent: a later
    // completion may extend Retry-After, but can never shorten it.
    if (failure.kind === 'rate_limited') {
      const duration = Math.min(CCEL_SEARCH_LIMITS.maxCircuitOpenMs, Math.max(CCEL_SEARCH_LIMITS.policyOpenMs, failure.retryAfterMs ?? 0));
      if (this.circuitStatus === 'open' && this.circuitReason === 'rate_limited') {
        this.circuitOpenUntil = Math.max(this.circuitOpenUntil ?? 0, now + duration);
      } else {
        this.openCircuit('rate_limited', duration);
      }
      return;
    }
    // All remaining outcomes are weaker than a state transition completed
    // after this request was admitted.
    if (!this.isCurrentClaim(claim)) return;
    if (this.circuitStatus === 'half_open' && (failure.kind === 'upstream' || failure.kind === 'too_large')) {
      // A probe must positively validate the interface before traffic resumes.
      // Unexpected 4xx responses and response-bound violations indicate that
      // the reviewed surface is not currently usable, so reopen with bounded
      // interface-change backoff instead of permitting an immediate new probe.
      this.openCircuit('interface_changed', CCEL_SEARCH_LIMITS.policyOpenMs);
      return;
    }
    if (failure.kind === 'parser') {
      this.parserFailures++;
      if (this.parserFailures >= 2 || this.circuitStatus === 'half_open') this.openCircuit('interface_changed', CCEL_SEARCH_LIMITS.policyOpenMs);
      else this.halfOpenProbeInFlight = false;
      return;
    }
    if (failure.kind === 'network' || failure.kind === 'timeout') {
      this.networkFailures = this.networkFailures.filter(timestamp => now - timestamp <= CCEL_SEARCH_LIMITS.networkFailureWindowMs);
      this.networkFailures.push(now);
      if (this.networkFailures.length >= CCEL_SEARCH_LIMITS.networkFailureThreshold || this.circuitStatus === 'half_open') {
        this.openCircuit('network', CCEL_SEARCH_LIMITS.networkOpenMs);
      }
      return;
    }
    this.halfOpenProbeInFlight = false;
  }

  private openCircuit(reason: CircuitReason, durationMs: number, operatorReviewRequired = false): void {
    this.circuitGeneration++;
    this.circuitStatus = 'open';
    this.circuitReason = reason;
    this.policyReviewRequired = operatorReviewRequired;
    this.circuitOpenUntil = operatorReviewRequired ? undefined : this.now() + Math.min(durationMs, CCEL_SEARCH_LIMITS.maxCircuitOpenMs);
    this.halfOpenProbeInFlight = false;
    if (operatorReviewRequired) this.cache.clear();
  }

  private isCurrentClaim(claim: CircuitClaim): boolean {
    return claim.operatorEpoch === this.operatorEpoch && claim.generation === this.circuitGeneration;
  }

  private recentNetworkFailureCount(): number {
    const cutoff = this.now() - CCEL_SEARCH_LIMITS.networkFailureWindowMs;
    this.networkFailures = this.networkFailures.filter(timestamp => timestamp >= cutoff);
    return this.networkFailures.length;
  }

  private circuitUnavailable(page: number): PrimarySourceProviderResult {
    const status = this.circuitReason === 'rate_limited' ? 'rate_limited' : this.circuitReason === 'interface_changed' ? 'interface_changed' : 'unavailable';
    return resultFor(status, page, ['Live CCEL search is temporarily unavailable.'], [], false);
  }

  private failureResult(page: number, failure: CcelSearchFailure): PrimarySourceProviderResult {
    const status = failure.kind === 'rate_limited' ? 'rate_limited' : failure.kind === 'parser' ? 'interface_changed' : 'unavailable';
    return resultFor(status, page, ['Live CCEL search is temporarily unavailable.']);
  }
}

interface ParsedSearch {
  hits: PrimarySourceSearchHit[];
  notices: string[];
}

interface RestrictedHits {
  hits: PrimarySourceSearchHit[];
  rejected: number;
}

function applyCcelRestrictions(
  hits: PrimarySourceSearchHit[],
  request: ComposedCcelSearchRequest,
): RestrictedHits {
  if (!request.normalizedAuthor && !request.normalizedWork) return { hits, rejected: 0 };
  const accepted: PrimarySourceSearchHit[] = [];
  let rejected = 0;
  for (const hit of hits) {
    const authorMatches = !request.normalizedAuthor || matchesAuthorRestriction(hit, request.normalizedAuthor);
    const workMatches = !request.normalizedWork || matchesWorkRestriction(hit, request.normalizedWork);
    if (authorMatches && workMatches) accepted.push(hit);
    else rejected++;
  }
  return { hits: accepted, rejected };
}

function matchesAuthorRestriction(hit: PrimarySourceSearchHit, requested: string): boolean {
  const workSegments = hit.locator.kind === 'ccel_section' ? hit.locator.work.split('/') : [];
  if (isReviewedCcelId(requested)) return workSegments.length === 2 && workSegments[0] === requested;
  return Boolean(hit.author && containsNormalizedPhrase(hit.author, requested));
}

function matchesWorkRestriction(hit: PrimarySourceSearchHit, requested: string): boolean {
  const workSegments = hit.locator.kind === 'ccel_section' ? hit.locator.work.split('/') : [];
  if (isReviewedCcelId(requested)) return workSegments.length === 2 && workSegments[1] === requested;
  return containsNormalizedPhrase(hit.title, requested);
}

function containsNormalizedPhrase(actual: string, requested: string): boolean {
  const normalizedActual = normalizeRestrictionPhrase(actual);
  const normalizedRequested = normalizeRestrictionPhrase(requested);
  return normalizedRequested.length > 0 && normalizedActual.includes(normalizedRequested);
}

function normalizeRestrictionPhrase(value: string): string {
  return tokenizeWords(value.toLocaleLowerCase('en-US')).join(' ');
}

function tokenizeWords(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Parse only known result metadata; selector drift is an error, not no-results. */
export function parseCcelSearchHtml(html: string, page: number): ParsedSearch {
  if (html.length === 0) throw new CcelSearchFailure('parser');
  const sanitizedHtml = removeUnsafeMarkup(html);
  if (/<!--|-->|<\/?(?:script|style|form|nav|header|footer)\b/iu.test(sanitizedHtml)) {
    throw new CcelSearchFailure('parser');
  }
  if (hasReviewedPolicyMarker(sanitizedHtml)) throw new CcelSearchFailure('policy');
  const document = tokenizeReviewedStructure(sanitizedHtml);
  const searchState = identifySearchState(sanitizedHtml, document);
  if (searchState.kind === 'empty') return { hits: [], notices: [] };

  const hits: PrimarySourceSearchHit[] = [];
  const seen = new Set<string>();
  let aggregateCharacters = 0;
  for (const element of searchState.cards) {
    const card = parseResultCard(sanitizedHtml, element);
    if (seen.has(card.locator.url)) continue;
    const { locator, title, author, snippet } = card;
    const hitCharacters = title.length + author.length + snippet.length
      + locator.url.length + locator.work.length + locator.section.length;
    if (aggregateCharacters + hitCharacters > CCEL_SEARCH_LIMITS.maxAggregateResultCharacters) {
      throw new CcelSearchFailure('too_large');
    }
    aggregateCharacters += hitCharacters;
    seen.add(locator.url);
    hits.push({
      provider: 'ccel_live',
      title,
      author,
      snippet,
      locator,
      rankWithinProvider: hits.length + 1,
      page,
      snippetOnly: true,
      attribution: CCEL_SEARCH_ATTRIBUTION,
    });
    if (hits.length >= CCEL_SEARCH_LIMITS.maxHitsPerResponse) break;
  }
  if (hits.length === 0) throw new CcelSearchFailure('parser');
  return { hits, notices: [] };
}

function hasReviewedPolicyMarker(html: string): boolean {
  return /<h1\b[^>]*>\s*Access denied\s*<\/h1>\s*<p\b[^>]*>\s*Please complete the CAPTCHA to continue\.\s*<\/p>/i.test(html);
}

type ReviewedTagName = 'div' | 'h2' | 'h5' | 'p' | 'a' | 'span';

interface ReviewedElement {
  name: ReviewedTagName;
  attributes: ReadonlyMap<string, string>;
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
  parent?: ReviewedElement;
  children: ReviewedElement[];
}

interface ReviewedDocument {
  elements: ReviewedElement[];
}

type ReviewedSearchState =
  | { kind: 'empty' }
  | { kind: 'results'; cards: ReviewedElement[] };

const REVIEWED_TAGS = new Set<ReviewedTagName>(['div', 'h2', 'h5', 'p', 'a', 'span']);

/**
 * Tokenize only the reviewed search-structure tags. This deliberately avoids
 * DOMParser/HTMLRewriter so the same fail-closed parser runs in Node and a
 * Worker. Quoted `>` characters are respected and every tracked element must
 * be balanced within bounded token/depth budgets.
 */
function tokenizeReviewedStructure(html: string): ReviewedDocument {
  const elements: ReviewedElement[] = [];
  const stack: ReviewedElement[] = [];
  let cursor = 0;
  let tokenCount = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start < 0) break;
    const end = scanTagEnd(html, start);
    if (end < 0) throw new CcelSearchFailure('parser');
    tokenCount++;
    if (tokenCount > CCEL_SEARCH_LIMITS.maxStructuralTokens) throw new CcelSearchFailure('too_large');
    const raw = html.slice(start + 1, end);
    cursor = end + 1;
    if (/^\s*[!?]/u.test(raw)) continue;

    const closing = /^\s*\/\s*([A-Za-z][A-Za-z0-9:-]*)\s*$/u.exec(raw);
    if (closing) {
      const name = closing[1].toLocaleLowerCase('en-US');
      if (!isReviewedTag(name)) continue;
      const open = stack.at(-1);
      if (!open || open.name !== name) throw new CcelSearchFailure('parser');
      open.contentEnd = start;
      open.end = end + 1;
      stack.pop();
      continue;
    }

    const opening = /^\s*([A-Za-z][A-Za-z0-9:-]*)([\s\S]*?)\s*(\/)?\s*$/u.exec(raw);
    if (!opening) throw new CcelSearchFailure('parser');
    const name = opening[1].toLocaleLowerCase('en-US');
    if (!isReviewedTag(name)) continue;
    const attributes = parseReviewedAttributes(opening[2]);
    const parent = stack.at(-1);
    const element: ReviewedElement = {
      name,
      attributes,
      start,
      contentStart: end + 1,
      contentEnd: end + 1,
      end: end + 1,
      ...(parent ? { parent } : {}),
      children: [],
    };
    parent?.children.push(element);
    elements.push(element);
    if (opening[3]) continue;
    stack.push(element);
    if (stack.length > CCEL_SEARCH_LIMITS.maxStructuralDepth) throw new CcelSearchFailure('too_large');
  }
  if (stack.length !== 0) throw new CcelSearchFailure('parser');
  return { elements };
}

function scanTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let index = start + 1; index < html.length; index++) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  return -1;
}

function parseReviewedAttributes(source: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/u.test(source[cursor] ?? '')) cursor++;
    if (cursor >= source.length) break;
    const nameMatch = /^[^\s=/>]+/u.exec(source.slice(cursor));
    if (!nameMatch) throw new CcelSearchFailure('parser');
    const name = nameMatch[0].toLocaleLowerCase('en-US');
    cursor += nameMatch[0].length;
    while (/\s/u.test(source[cursor] ?? '')) cursor++;
    let value = '';
    if (source[cursor] === '=') {
      cursor++;
      while (/\s/u.test(source[cursor] ?? '')) cursor++;
      const quote = source[cursor];
      if (quote === '"' || quote === "'") {
        cursor++;
        const valueEnd = source.indexOf(quote, cursor);
        if (valueEnd < 0) throw new CcelSearchFailure('parser');
        value = source.slice(cursor, valueEnd);
        cursor = valueEnd + 1;
      } else {
        const valueMatch = /^[^\s>]+/u.exec(source.slice(cursor));
        if (!valueMatch) throw new CcelSearchFailure('parser');
        value = valueMatch[0];
        cursor += value.length;
      }
    }
    if (attributes.has(name)) throw new CcelSearchFailure('parser');
    attributes.set(name, decodeHtmlEntities(value));
  }
  return attributes;
}

function isReviewedTag(value: string): value is ReviewedTagName {
  return REVIEWED_TAGS.has(value as ReviewedTagName);
}

function identifySearchState(html: string, document: ReviewedDocument): ReviewedSearchState {
  const resultHeadings = document.elements.filter(element => element.name === 'h2' && (
    element.attributes.get('id') === 'CCEL_Search_results'
    || elementText(html, element, CCEL_SEARCH_LIMITS.maxTitleCharacters) === 'CCEL Search results'
  ));
  if (resultHeadings.length !== 1) throw new CcelSearchFailure('parser');
  const heading = resultHeadings[0];
  if (heading.attributes.get('id') !== 'CCEL_Search_results'
    || elementText(html, heading, CCEL_SEARCH_LIMITS.maxTitleCharacters) !== 'CCEL Search results') {
    throw new CcelSearchFailure('parser');
  }

  const emptyMarkers = document.elements.filter(element => element.name === 'p'
    && elementText(html, element, 64) === 'No results found.');
  const cards = document.elements.filter(element => element.name === 'div'
    && element.start >= heading.end
    && hasElementClass(element, 'card'));
  if (cards.length > CCEL_SEARCH_LIMITS.maxCandidateResults) throw new CcelSearchFailure('too_large');
  for (const card of cards) {
    if (card.end - card.start > CCEL_SEARCH_LIMITS.maxAggregateResultCharacters) throw new CcelSearchFailure('too_large');
    if (ancestorWithClass(card.parent, 'card')) throw new CcelSearchFailure('parser');
  }

  const resultLikeOutsideCard = document.elements.some(element => element.start > heading.end
    && isResultMetadataElement(html, element)
    && !ancestorWithClass(element.parent, 'card'));
  if (resultLikeOutsideCard) throw new CcelSearchFailure('parser');

  if (emptyMarkers.length > 0) {
    const marker = emptyMarkers.length === 1 ? emptyMarkers[0] : undefined;
    const immediate = marker !== undefined
      && marker.parent === heading.parent
      && /^\s*$/u.test(html.slice(heading.end, marker.start));
    if (!immediate || cards.length > 0 || hasAnyResultMetadata(html, document, heading.end)) {
      throw new CcelSearchFailure('parser');
    }
    return { kind: 'empty' };
  }
  if (cards.length === 0) throw new CcelSearchFailure('parser');
  return { kind: 'results', cards };
}

function hasAnyResultMetadata(html: string, document: ReviewedDocument, after: number): boolean {
  return document.elements.some(element => element.start > after && isResultMetadataElement(html, element));
}

function isResultMetadataElement(html: string, element: ReviewedElement): boolean {
  return (element.name === 'h5' && hasElementClass(element, 'card-title'))
    || (element.name === 'p' && hasElementClass(element, 'card-text'))
    || (element.name === 'a' && elementText(html, element, 32).toLocaleLowerCase('en-US') === 'read online');
}

function parseResultCard(html: string, card: ReviewedElement): {
  title: string;
  author: string;
  snippet: string;
  locator: NonNullable<ReturnType<typeof normalizeCcelSectionLocator>>;
} {
  const descendants = descendantElements(card);
  const nestedCards = descendants.filter(element => element.name === 'div' && hasElementClass(element, 'card'));
  if (nestedCards.length > 0) throw new CcelSearchFailure('parser');
  const bodies = card.children.filter(element => element.name === 'div' && hasElementClass(element, 'card-body'));
  if (bodies.length !== 1) throw new CcelSearchFailure('parser');
  const body = bodies[0];
  const bodyDescendants = descendantElements(body);

  const headings = bodyDescendants.filter(element => element.name === 'h5' && hasElementClass(element, 'card-title'));
  if (headings.length !== 1) throw new CcelSearchFailure('parser');
  const spans = descendantElements(headings[0]).filter(element => element.name === 'span');
  if (spans.length !== 2) throw new CcelSearchFailure('parser');
  const titleSpans = spans.filter(element => hasElementClass(element, 'title'));
  const authorSpans = spans.filter(element => hasElementClass(element, 'author'));
  if (titleSpans.length !== 1 || authorSpans.length !== 1
    || spans.some(element => Number(hasElementClass(element, 'title')) + Number(hasElementClass(element, 'author')) !== 1)) {
    throw new CcelSearchFailure('parser');
  }
  const title = elementText(html, titleSpans[0], CCEL_SEARCH_LIMITS.maxTitleCharacters);
  const authorMarker = elementText(html, authorSpans[0], CCEL_SEARCH_LIMITS.maxAuthorResultCharacters + 3);
  if (!title || /^by\s+/iu.test(title) || !/^by\s+\S/iu.test(authorMarker)) throw new CcelSearchFailure('parser');
  const author = sanitizePlainText(authorMarker.replace(/^by\s+/iu, ''), CCEL_SEARCH_LIMITS.maxAuthorResultCharacters);
  if (!author) throw new CcelSearchFailure('parser');

  const paragraphs = bodyDescendants.filter(element => element.name === 'p');
  if (paragraphs.length !== 1 || !hasElementClass(paragraphs[0], 'card-text')) throw new CcelSearchFailure('parser');
  const snippet = elementText(html, paragraphs[0], CCEL_SEARCH_LIMITS.maxSnippetCharacters);

  const readLinks = bodyDescendants.filter(element => element.name === 'a'
    && elementText(html, element, 32).toLocaleLowerCase('en-US') === 'read online');
  if (readLinks.length !== 1) throw new CcelSearchFailure('parser');
  const href = readLinks[0].attributes.get('href');
  const locator = href === undefined ? undefined : normalizeCcelSectionLocator(href);
  if (!locator) throw new CcelSearchFailure('parser');
  return { title, author, snippet, locator };
}

function descendantElements(element: ReviewedElement): ReviewedElement[] {
  const descendants: ReviewedElement[] = [];
  const pending = [...element.children].reverse();
  while (pending.length > 0) {
    const child = pending.pop();
    if (!child) break;
    descendants.push(child);
    for (let index = child.children.length - 1; index >= 0; index--) pending.push(child.children[index]);
  }
  return descendants;
}

function elementText(html: string, element: ReviewedElement, maxCharacters: number): string {
  return sanitizePlainText(html.slice(element.contentStart, element.contentEnd), maxCharacters);
}

function hasElementClass(element: ReviewedElement, token: string): boolean {
  return hasClassToken(element.attributes.get('class') ?? '', token);
}

function ancestorWithClass(element: ReviewedElement | undefined, token: string): ReviewedElement | undefined {
  let current = element;
  while (current) {
    if (hasElementClass(current, token)) return current;
    current = current.parent;
  }
  return undefined;
}

function hasClassToken(classValue: string, token: string): boolean {
  return classValue.split(/\s+/u).includes(token);
}

function removeUnsafeMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|form|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*\b(?:hidden|aria-hidden\s*=\s*["']true["'])[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
}

function sanitizePlainText(html: string, maxCharacters: number): string {
  const stripped = stripHtml(html);
  const decoded = decodeHtmlEntities(stripped)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const safe = decoded.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Array.from(safe).slice(0, maxCharacters).join('');
}

/** Normalize only exact CCEL section paths; this never follows the link. */
export function normalizeCcelSectionLocator(input: string): { kind: 'ccel_section'; url: string; work: string; section: string } | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > CCEL_SEARCH_LIMITS.maxLocatorUrlCharacters) return undefined;
  const untrustedPath = input.split(/[?#]/u, 1)[0];
  if (/%/i.test(untrustedPath) || /(?:^|\/)\.\.?(?:\/|$)/.test(untrustedPath)) return undefined;
  let url: URL;
  try {
    url = new URL(input, CCEL_SEARCH_URL);
  } catch {
    return undefined;
  }
  // The search UI adds opaque tracking query/hash values to its Read online
  // link. Only the reviewed path becomes a locator; the entire query and hash
  // are discarded and never copied into a result, cache entry, or log.
  if (url.protocol !== 'https:' || !['ccel.org', 'www.ccel.org'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) return undefined;
  if (!url.pathname.startsWith('/') || url.pathname.includes('//')) return undefined;
  const segments = url.pathname.slice(1).split('/');
  if (segments.length !== CCEL_SEARCH_LIMITS.maxLocatorSegments || segments[0] !== 'ccel' || segments.slice(0, -1).some(segment => segment.length > CCEL_SEARCH_LIMITS.maxLocatorSegmentCharacters || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) || segment === '.' || segment === '..')) return undefined;
  const last = segments.at(-1);
  if (!last?.endsWith('.html') || last === '.html' || last.length > CCEL_SEARCH_LIMITS.maxLocatorSectionCharacters + '.html'.length || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(last)) return undefined;
  const section = last.slice(0, -'.html'.length);
  if (!section || section.length > CCEL_SEARCH_LIMITS.maxLocatorSectionCharacters || section.includes('..')) return undefined;
  const work = segments.slice(1, -1).join('/');
  if (work.length > CCEL_SEARCH_LIMITS.maxLocatorWorkCharacters) return undefined;
  const canonicalUrl = `https://ccel.org/ccel/${segments.slice(1).join('/')}`;
  return { kind: 'ccel_section', url: canonicalUrl, work, section };
}

function validateSearchOrigin(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('CCEL search origin is invalid');
  }
  if (url.protocol !== 'https:' || !['ccel.org', 'www.ccel.org'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CCEL search origin is not an approved HTTPS origin');
  }
  return CCEL_SEARCH_URL;
}

function validateSearchUrl(input: string, baseUrl: string): string {
  const url = new URL(input);
  // Redirects may normalize between the two documented CCEL hostnames, but
  // may not leave the approved origin family or search path.
  void baseUrl;
  if (url.protocol !== 'https:' || !['ccel.org', 'www.ccel.org'].includes(url.hostname.toLowerCase()) || url.port || url.username || url.password || url.pathname !== '/') throw new CcelSearchFailure('policy');
  return url.toString();
}

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<string> {
  const declared = response.headers.get('Content-Length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > CCEL_SEARCH_LIMITS.maxResponseBytes) {
    await discardResponseBody(response);
    throw new CcelSearchFailure('too_large');
  }
  if (!response.body) {
    const body = await awaitWithAbort(response.text(), signal);
    if (new TextEncoder().encode(body).byteLength > CCEL_SEARCH_LIMITS.maxResponseBytes) throw new CcelSearchFailure('too_large');
    return body;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await awaitWithAbort(reader.read(), signal);
      if (done) break;
      total += value.byteLength;
      if (total > CCEL_SEARCH_LIMITS.maxResponseBytes) {
        throw new CcelSearchFailure('too_large');
      }
      chunks.push(value);
    }
  } catch (error) {
    // Cancel first so an abort/error settles the pending read before the lock
    // is released. Cleanup is deliberately best-effort and never replaces the
    // classification that caused this read to stop.
    cancelReaderBestEffort(reader, 'CCEL search response discarded');
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A hostile/injected stream must not turn a bounded provider outcome
      // into an asynchronous ERR_INVALID_STATE failure.
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  const abortFailure = () => new CcelSearchFailure(signal.reason === TIMEOUT_ABORT_REASON ? 'timeout' : 'network');
  if (signal.aborted) return Promise.reject(abortFailure());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortFailure());
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); },
    );
  });
}

function cancelReaderBestEffort(reader: ReadableStreamDefaultReader<Uint8Array>, reason: string): void {
  try {
    detachCleanup(reader.cancel(reason));
  } catch {
    // Preserve the original timeout/overflow/read failure.
  }
}

function discardResponseBody(response: Response): void {
  try {
    const cancellation = response.body?.cancel('CCEL search response discarded');
    if (cancellation) detachCleanup(cancellation);
  } catch {
    // The response is already being rejected; cleanup must never expose an
    // upstream cancellation error or replace the sanitized provider outcome.
  }
}

function detachCleanup(cleanup: Promise<unknown>): void {
  void cleanup.catch(() => undefined);
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - now);
}
