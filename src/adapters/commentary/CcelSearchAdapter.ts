/**
 * Bounded, metadata-only search against CCEL's public HTML search surface.
 *
 * This adapter is intentionally separate from CcelAdapter. It never fetches a
 * result link, never returns a work body, and is disabled unless explicitly
 * enabled by a caller that has passed the rollout gate.
 */

import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import { ValidationError } from '../../kernel/errors.js';
import {
  type PrimarySourceProviderResult,
  type PrimarySourceSearchHit,
  type PrimarySourceSearchMatch,
  type PrimarySourceSearchQuery,
} from '../../services/historical/primarySourceTypes.js';
import type { PrimarySourceFeatureFlags } from '../../kernel/featureFlags.js';
import type {
  CcelAttemptOutcome,
  CcelCoordinatorEvent,
  CcelUpstreamCoordinator,
} from '../../services/historical/CcelUpstreamCoordinator.js';

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
  maxTreeNodes: 10_000,
  maxTreeAttributes: 10_000,
  maxAttributesPerElement: 64,
  maxTreeDepth: 64,
  maxTreeTextCharacters: 100_000,
  maxParseTraversalMs: 100,
  // parse5 is standards-compliant but parses synchronously, so an input cap
  // must bound work before tree traversal can enforce its finer budgets.
  maxResponseBytes: 256 * 1024,
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
});

const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,11}$/;
const ALLOWED_QUERY_KEYS = new Set(['text', 'match', 'author', 'work', 'page', 'limit']);
const LUCENE_SPECIAL_CHARACTERS = new Set('+-!(){}[]^"~*?:\\&|'.split(''));
const USER_AGENT = 'TheologAI/primary-source-search (bounded user-requested discovery; https://theologai.xyz)';

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
  /** Content-free observational events only. Sink failures are ignored. */
  telemetry?: (event: CcelCoordinatorEvent) => void | Promise<void>;
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
  retryAfterSeconds?: number,
): PrimarySourceProviderResult {
  const boundedRetryAfter = status === 'rate_limited'
    && Number.isSafeInteger(retryAfterSeconds)
    && retryAfterSeconds! >= 1
    && retryAfterSeconds! <= 86_400
    ? retryAfterSeconds
    : undefined;
  return {
    provider: 'ccel_live', status, searched, page, hitCount: hits.length, hits, notices,
    ...(boundedRetryAfter === undefined ? {} : { retryAfterSeconds: boundedRetryAfter }),
  };
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
  private readonly telemetry: (event: CcelCoordinatorEvent) => void | Promise<void>;
  private activeRequests = 0;

  constructor(options: CcelSearchAdapterOptions = {}) {
    this.enabled = options.enabled ?? options.featureFlags?.ccelLiveSearch ?? false;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.baseUrl = validateSearchOrigin(options.baseUrl ?? CCEL_SEARCH_URL);
    this.telemetry = options.telemetry ?? (() => undefined);
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

  async search(
    input: PrimarySourceSearchQuery,
    coordinator: CcelUpstreamCoordinator,
  ): Promise<PrimarySourceProviderResult> {
    const request = composeCcelSearchRequest(input);
    if (!this.enabled) return resultFor('disabled', request.page, ['Live CCEL search is disabled.'], [], false);
    const cached = this.cache.get(request.cacheKey, this.now());
    if (cached) {
      return {
        ...cached,
        hits: cached.hits.slice(0, request.limit),
        hitCount: Math.min(cached.hitCount, request.limit),
      };
    }

    // Coordinated traffic never queues locally: admission must occur
    // immediately before the one origin fetch, not while waiting in a queue.
    if (this.activeRequests >= CCEL_SEARCH_LIMITS.maxConcurrentRequests) {
      return resultFor('unavailable', request.page, ['Live CCEL search is busy; try again later.'], [], false);
    }

    this.activeRequests++;
    try {
      const admission = await coordinator.admit();
      this.emitTelemetry({
        event: 'theologai.ccel.coordinator.admission',
        decision: admission.kind,
        ...(admission.kind === 'admitted' ? { probe: admission.probe } : {}),
        ...(admission.kind === 'busy' ? { retryAfterSeconds: admission.retryAfterSeconds } : {}),
        ...(admission.kind === 'latched'
          ? { state: admission.reason === 'policy' ? 'latched_policy' as const : 'latched_interface' as const }
          : admission.kind === 'disabled' ? { state: 'closed' as const } : {}),
      });
      if (admission.kind === 'disabled') {
        return resultFor('disabled', request.page, ['Live CCEL search is disabled. No remote request was made.'], [], false);
      }
      if (admission.kind === 'busy') {
        return resultFor(
          'rate_limited',
          request.page,
          ['Live CCEL search is temporarily busy; retry after the reported interval.'],
          [],
          false,
          admission.retryAfterSeconds,
        );
      }
      if (admission.kind === 'latched') {
        return resultFor(
          admission.reason === 'interface' ? 'interface_changed' : 'unavailable',
          request.page,
          ['Live CCEL search is temporarily unavailable pending operator review.'],
          [],
          false,
        );
      }

      const deadline = this.now() + CCEL_SEARCH_LIMITS.totalRequestMs;
      let result: PrimarySourceProviderResult;
      let cacheable: PrimarySourceProviderResult | undefined;
      let outcome: CcelAttemptOutcome;
      try {
        const html = await this.fetchSearchHtml(request.url, deadline);
        const parsed = parseCcelSearchHtml(html, request.page);
        const filtered = applyCcelRestrictions(parsed.hits, request);
        result = filtered.rejected > 0
          ? resultFor('unsupported_filter', request.page, ['CCEL search results did not satisfy the requested author/work restriction.'], filtered.hits.slice(0, request.limit))
          : filtered.hits.length === 0
            ? resultFor('no_results', request.page, parsed.notices, [])
            : resultFor('ok', request.page, parsed.notices, filtered.hits.slice(0, request.limit));
        outcome = { kind: 'success' };
        if (filtered.rejected === 0) {
          cacheable = { ...result, hits: filtered.hits, hitCount: filtered.hits.length };
        }
      } catch (error) {
        const failure = error instanceof CcelSearchFailure ? error : new CcelSearchFailure('network');
        outcome = outcomeForFailure(failure);
        result = outcome.kind === 'interface_failure'
          ? resultFor('interface_changed', request.page, ['Live CCEL search is temporarily unavailable.'])
          : this.failureResult(request.page, failure);
      }

      // Exactly one terminal RPC follows every admitted origin attempt. A
      // transport ambiguity may mean the coordinator applied it even when the
      // response is lost, so never attempt a second record.
      let recorded;
      try {
        recorded = await coordinator.recordOutcome(admission.token, outcome);
      } catch {
        return resultFor('unavailable', request.page, ['Live CCEL search outcome could not be safely finalized.'], [], false);
      }
      this.emitTelemetry({
        event: 'theologai.ccel.coordinator.outcome',
        outcome: outcome.kind,
        applied: recorded.applied,
        state: recorded.state,
      });
      if (!recorded.applied || recorded.disposition !== 'applied') {
        return resultFor('unavailable', request.page, ['Live CCEL search outcome could not be safely finalized.'], [], false);
      }
      if (outcome.kind === 'success' && recorded.state !== 'closed') {
        return resultFor('unavailable', request.page, ['Live CCEL search became unavailable while the attempt was being finalized.'], [], false);
      }
      if (outcome.kind === 'success' && cacheable) {
        this.cache.set(
          request.cacheKey,
          cacheable,
          this.now() + (cacheable.hits.length === 0
            ? CCEL_SEARCH_LIMITS.negativeCacheTtlMs
            : CCEL_SEARCH_LIMITS.cacheTtlMs),
        );
      }
      return result;
    } catch {
      return resultFor('unavailable', request.page, ['Live CCEL search is temporarily unavailable.'], [], false);
    } finally {
      this.activeRequests--;
    }
  }

  getCacheStats(): { entries: number; bytes: number } {
    return this.cache.snapshot();
  }

  clearCache(): void {
    this.cache.clear();
  }

  private emitTelemetry(event: CcelCoordinatorEvent): void {
    try {
      const pending = this.telemetry(event);
      if (pending) {
        // A telemetry sink is observational. Explicitly consume an asynchronous
        // rejection without putting logging latency or failure on the request
        // path; synchronous sinks remain the normal Worker implementation.
        void pending.catch(() => undefined);
      }
    } catch {
      // Telemetry is strictly observational and can never change execution.
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

  private failureResult(page: number, failure: CcelSearchFailure): PrimarySourceProviderResult {
    const status = failure.kind === 'rate_limited' ? 'rate_limited' : failure.kind === 'parser' ? 'interface_changed' : 'unavailable';
    const retryAfterSeconds = failure.kind === 'rate_limited'
      ? Math.min(86_400, Math.max(1, Math.ceil((failure.retryAfterMs ?? 0) / 1_000)))
      : undefined;
    return resultFor(status, page, ['Live CCEL search is temporarily unavailable.'], [], true, retryAfterSeconds);
  }
}

function outcomeForFailure(failure: CcelSearchFailure): CcelAttemptOutcome {
  if (failure.kind === 'rate_limited') {
    return {
      kind: 'rate_limited',
      retryAfterSeconds: Math.min(86_400, Math.max(1, Math.ceil((failure.retryAfterMs ?? 0) / 1000))),
    };
  }
  if (failure.kind === 'forbidden' || failure.kind === 'policy') return { kind: 'policy_failure' };
  if (failure.kind === 'parser' || failure.kind === 'too_large' || failure.kind === 'upstream') {
    return { kind: 'interface_failure' };
  }
  return { kind: 'transient_failure' };
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
  if (new TextEncoder().encode(html).byteLength > CCEL_SEARCH_LIMITS.maxResponseBytes) {
    throw new CcelSearchFailure('too_large');
  }
  const document = parseReviewedDocument(html);
  if (hasReviewedPolicyMarker(document)) throw new CcelSearchFailure('policy');
  const searchState = identifySearchState(html, document);
  ensureParseDeadline(document);
  if (searchState.kind === 'empty') return { hits: [], notices: [] };

  const hits: PrimarySourceSearchHit[] = [];
  const seen = new Set<string>();
  let aggregateCharacters = 0;
  for (const element of searchState.cards) {
    ensureParseDeadline(document);
    const card = parseResultCard(html, document, element);
    ensureParseDeadline(document);
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

type TreeNode = DefaultTreeAdapterTypes.Node;
type TreeElement = DefaultTreeAdapterTypes.Element;

interface ReviewedElement {
  name: string;
  attributes: ReadonlyMap<string, string>;
  order: number;
  explicitlyClosed: boolean;
  sourceStart: number;
  sourceEnd: number;
  sourceContentStart: number;
  sourceContentEnd: number;
  parent?: ReviewedElement;
  children: ReviewedElement[];
  content: Array<string | ReviewedElement>;
  text: string;
}

interface ReviewedDocument {
  elements: ReviewedElement[];
  deadline: number;
}

type ReviewedSearchState =
  | { kind: 'empty' }
  | { kind: 'results'; cards: ReviewedElement[] };

const INERT_OR_NON_TEXT_ELEMENTS = new Set([
  'canvas', 'embed', 'iframe', 'math', 'noscript', 'object', 'script', 'style',
  'svg', 'template', 'textarea',
]);
const STRICTLY_CLOSED_RESULT_ELEMENTS = new Set(['a', 'div', 'h2', 'h5', 'p', 'span']);
const TABLE_CONTEXT_ELEMENTS = new Set(['caption', 'col', 'colgroup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr']);
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const TABLE_SOURCE_PATTERN = /<\/?[\t\n\f\r ]*(?:caption|col|colgroup|table|tbody|td|tfoot|th|thead|tr)\b/iu;
const ADOPTION_FORMATTING_SOURCE_PATTERN = /<\/?[\t\n\f\r ]*(?:b|big|code|em|font|i|nobr|s|small|strike|strong|tt|u)\b/iu;
const REJECTED_PARSE_ERRORS = new Set([
  'duplicate-attribute',
  'eof-in-element-that-can-contain-only-text',
  'unexpected-null-character',
]);

/**
 * Build one standards-compliant HTML5 tree in both Node and Workers. The
 * synchronous parse is protected by the byte cap; this traversal adds node,
 * attribute, depth, text, and elapsed-time budgets and creates a much smaller
 * view containing only visible HTML elements.
 */
function parseReviewedDocument(html: string): ReviewedDocument {
  const startedAt = monotonicNow();
  const deadline = startedAt + CCEL_SEARCH_LIMITS.maxParseTraversalMs;
  let rejectedParseError = false;
  let tree: DefaultTreeAdapterTypes.Document;
  try {
    tree = parse(html, {
      sourceCodeLocationInfo: true,
      onParseError: error => {
        if (REJECTED_PARSE_ERRORS.has(error.code)) rejectedParseError = true;
      },
    });
  } catch {
    throw new CcelSearchFailure('parser');
  }
  if (monotonicNow() > deadline) throw new CcelSearchFailure('too_large');
  if (rejectedParseError) throw new CcelSearchFailure('parser');

  const elements: ReviewedElement[] = [];
  const pending: Array<{
    node: TreeNode;
    depth: number;
    excluded: boolean;
    parent?: ReviewedElement;
  }> = [...tree.childNodes].reverse().map(node => ({ node, depth: 1, excluded: false }));
  let nodeCount = 0;
  let attributeCount = 0;
  let textCharacters = 0;

  while (pending.length > 0) {
    const frame = pending.pop();
    if (!frame) break;
    nodeCount++;
    if (nodeCount > CCEL_SEARCH_LIMITS.maxTreeNodes) throw new CcelSearchFailure('too_large');
    if (frame.depth > CCEL_SEARCH_LIMITS.maxTreeDepth) throw new CcelSearchFailure('too_large');
    if ((nodeCount & 127) === 0 && monotonicNow() > deadline) throw new CcelSearchFailure('too_large');

    if (isTextNode(frame.node)) {
      textCharacters += frame.node.value.length;
      if (textCharacters > CCEL_SEARCH_LIMITS.maxTreeTextCharacters) throw new CcelSearchFailure('too_large');
      if (!frame.excluded && frame.parent) frame.parent.content.push(frame.node.value);
      continue;
    }
    if (!isTreeElement(frame.node)) continue;

    const node = frame.node;
    attributeCount += node.attrs.length;
    if (node.attrs.length > CCEL_SEARCH_LIMITS.maxAttributesPerElement
      || attributeCount > CCEL_SEARCH_LIMITS.maxTreeAttributes) {
      throw new CcelSearchFailure('too_large');
    }
    const attributes = new Map(node.attrs.map(attribute => [attribute.name, attribute.value]));
    const excluded = frame.excluded
      || node.namespaceURI !== HTML_NAMESPACE
      || INERT_OR_NON_TEXT_ELEMENTS.has(node.tagName)
      || attributes.has('hidden')
      || attributes.has('inert')
      || trimAsciiWhitespace(attributes.get('aria-hidden') ?? '').toLocaleLowerCase('en-US') === 'true';
    let reviewedParent = frame.parent;
    if (!excluded) {
      const location = node.sourceCodeLocation;
      const reviewed: ReviewedElement = {
        name: node.tagName,
        attributes,
        order: elements.length,
        explicitlyClosed: location?.startTag !== undefined && location.endTag !== undefined,
        sourceStart: location?.startOffset ?? -1,
        sourceEnd: location?.endOffset ?? -1,
        sourceContentStart: location?.startTag?.endOffset ?? -1,
        sourceContentEnd: location?.endTag?.startOffset ?? -1,
        ...(frame.parent ? { parent: frame.parent } : {}),
        children: [],
        content: [],
        text: '',
      };
      frame.parent?.children.push(reviewed);
      frame.parent?.content.push(reviewed);
      elements.push(reviewed);
      reviewedParent = reviewed;
    }

    const childNodes = node.tagName === 'template' && 'content' in node
      ? node.content.childNodes
      : node.childNodes;
    for (let index = childNodes.length - 1; index >= 0; index--) {
      pending.push({
        node: childNodes[index],
        depth: frame.depth + 1,
        excluded,
        ...(reviewedParent ? { parent: reviewedParent } : {}),
      });
    }
  }
  if (monotonicNow() > deadline) throw new CcelSearchFailure('too_large');
  for (let index = elements.length - 1; index >= 0; index--) {
    elements[index].text = elements[index].content
      .map(part => typeof part === 'string' ? part : part.text)
      .join('');
  }
  return { elements, deadline };
}

function monotonicNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function trimAsciiWhitespace(value: string): string {
  return value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/gu, '');
}

function ensureParseDeadline(document: ReviewedDocument): void {
  if (monotonicNow() > document.deadline) throw new CcelSearchFailure('too_large');
}

function isTextNode(node: TreeNode): node is DefaultTreeAdapterTypes.TextNode {
  return node.nodeName === '#text';
}

function isTreeElement(node: TreeNode): node is TreeElement {
  return 'tagName' in node && Array.isArray(node.attrs);
}

function hasReviewedPolicyMarker(document: ReviewedDocument): boolean {
  return document.elements.some(element => element.name === 'h1'
    && elementText(element, 64).toLocaleLowerCase('en-US') === 'access denied'
    && element.parent?.children.some(sibling => sibling.order > element.order
      && sibling.name === 'p'
      && elementText(sibling, 128) === 'Please complete the CAPTCHA to continue.'
      && areAdjacentInContent(element, sibling)) === true);
}

function identifySearchState(html: string, document: ReviewedDocument): ReviewedSearchState {
  const resultHeadings = document.elements.filter(element => element.name === 'h2' && (
    element.attributes.get('id') === 'CCEL_Search_results'
    || elementText(element, CCEL_SEARCH_LIMITS.maxTitleCharacters) === 'CCEL Search results'
  ));
  if (resultHeadings.length !== 1) throw new CcelSearchFailure('parser');
  const heading = resultHeadings[0];
  if (heading.attributes.get('id') !== 'CCEL_Search_results'
    || elementText(heading, CCEL_SEARCH_LIMITS.maxTitleCharacters) !== 'CCEL Search results'
    || !isExplicitlyClosed(heading)
    || !hasValidSourceBounds(heading)
    || !hasDirectSourceContainment(heading.parent, heading)) {
    throw new CcelSearchFailure('parser');
  }
  const resultsRegionEnd = heading.parent!.sourceContentEnd;
  const resultsSource = html.slice(heading.sourceEnd, resultsRegionEnd);
  if (TABLE_SOURCE_PATTERN.test(resultsSource)
    || document.elements.some(element => TABLE_CONTEXT_ELEMENTS.has(element.name)
      && element.sourceStart >= heading.sourceEnd
      && element.sourceStart < resultsRegionEnd)) {
    throw new CcelSearchFailure('parser');
  }
  assertNoNonAncestorSourceWrapper(document, heading);

  const emptyMarkers = document.elements.filter(element => element.name === 'p'
    && elementText(element, 64) === 'No results found.');
  const allCards = document.elements.filter(element => element.name === 'div' && hasElementClass(element, 'card'));
  const cards = allCards.filter(element => element.order > heading.order);
  if (cards.length > CCEL_SEARCH_LIMITS.maxCandidateResults) throw new CcelSearchFailure('too_large');
  for (const card of cards) {
    if (card.parent !== heading.parent
      || card.sourceStart < heading.sourceEnd
      || ancestorWithClass(card.parent, 'card')
      || !isExplicitlyClosed(card)
      || !hasDirectSourceContainment(card.parent, card)) {
      throw new CcelSearchFailure('parser');
    }
    assertNoNonAncestorSourceWrapper(document, card);
  }
  if (allCards.length !== cards.length) throw new CcelSearchFailure('parser');

  const resultLikeOutsideCard = document.elements.some(element => element.order > heading.order
    && isResultMetadataElement(element)
    && !ancestorWithClass(element.parent, 'card'));
  if (resultLikeOutsideCard) throw new CcelSearchFailure('parser');

  if (emptyMarkers.length > 0) {
    const marker = emptyMarkers.length === 1 ? emptyMarkers[0] : undefined;
    const immediate = marker !== undefined
      && marker.parent === heading.parent
      && isExplicitlyClosed(marker)
      && hasDirectSourceContainment(marker.parent, marker)
      && !sourceGapMatches(html, heading.sourceEnd, marker.sourceStart, ADOPTION_FORMATTING_SOURCE_PATTERN)
      && areAdjacentInContent(heading, marker);
    if (!immediate || cards.length > 0 || hasAnyResultMetadata(document, heading.order)) {
      throw new CcelSearchFailure('parser');
    }
    return { kind: 'empty' };
  }
  if (cards.length === 0) throw new CcelSearchFailure('parser');
  const sourceOrderedCards = [...cards].sort((left, right) => left.sourceStart - right.sourceStart);
  if (sourceOrderedCards.some((card, index) => card !== cards[index])) throw new CcelSearchFailure('parser');
  const resultGaps: Array<[number, number]> = [
    [heading.sourceEnd, sourceOrderedCards[0].sourceStart],
    ...sourceOrderedCards.slice(1).map((card, index): [number, number] => [sourceOrderedCards[index].sourceEnd, card.sourceStart]),
  ];
  const parentContentEnd = heading.parent?.sourceContentEnd ?? -1;
  if (parentContentEnd >= sourceOrderedCards.at(-1)!.sourceEnd) {
    resultGaps.push([sourceOrderedCards.at(-1)!.sourceEnd, parentContentEnd]);
  }
  if (resultGaps.some(([start, end]) => sourceGapMatches(html, start, end, ADOPTION_FORMATTING_SOURCE_PATTERN))) {
    throw new CcelSearchFailure('parser');
  }
  return { kind: 'results', cards };
}

function areAdjacentInContent(first: ReviewedElement, second: ReviewedElement): boolean {
  if (!first.parent || first.parent !== second.parent) return false;
  const firstIndex = first.parent.content.indexOf(first);
  const secondIndex = first.parent.content.indexOf(second);
  if (firstIndex < 0 || secondIndex <= firstIndex) return false;
  return first.parent.content.slice(firstIndex + 1, secondIndex)
    .every(part => typeof part === 'string' && /^[\t\n\f\r ]*$/u.test(part));
}

function hasAnyResultMetadata(document: ReviewedDocument, after: number): boolean {
  return document.elements.some(element => element.order > after && isResultMetadataElement(element));
}

function isResultMetadataElement(element: ReviewedElement): boolean {
  return (element.name === 'h5' && hasElementClass(element, 'card-title'))
    || (element.name === 'p' && hasElementClass(element, 'card-text'))
    || (element.name === 'a' && elementText(element, 32).toLocaleLowerCase('en-US') === 'read online');
}

function hasValidSourceBounds(element: ReviewedElement): boolean {
  return element.sourceStart >= 0
    && element.sourceContentStart >= element.sourceStart
    && element.sourceContentEnd >= element.sourceContentStart
    && element.sourceEnd >= element.sourceContentEnd;
}

function hasDirectSourceContainment(parent: ReviewedElement | undefined, child: ReviewedElement): boolean {
  return parent !== undefined
    && hasValidSourceBounds(parent)
    && hasValidSourceBounds(child)
    && child.sourceStart >= parent.sourceContentStart
    && child.sourceEnd <= parent.sourceContentEnd;
}

function assertNoNonAncestorSourceWrapper(document: ReviewedDocument, element: ReviewedElement): void {
  const hasWrapper = document.elements.some(candidate => candidate !== element
    && hasValidSourceBounds(candidate)
    && candidate.sourceStart <= element.sourceStart
    && candidate.sourceEnd >= element.sourceEnd
    && !isAncestor(candidate, element));
  if (hasWrapper) throw new CcelSearchFailure('parser');
}

function isAncestor(candidate: ReviewedElement, element: ReviewedElement): boolean {
  let current = element.parent;
  while (current) {
    if (current === candidate) return true;
    current = current.parent;
  }
  return false;
}

function sourceGapMatches(html: string, start: number, end: number, pattern: RegExp): boolean {
  return start < 0 || end < start || end > html.length || pattern.test(html.slice(start, end));
}

function parseResultCard(html: string, document: ReviewedDocument, card: ReviewedElement): {
  title: string;
  author: string;
  snippet: string;
  locator: NonNullable<ReturnType<typeof normalizeCcelSectionLocator>>;
} {
  const descendants = descendantElements(card);
  const nestedCards = descendants.filter(element => element.name === 'div' && hasElementClass(element, 'card'));
  if (nestedCards.length > 0) throw new CcelSearchFailure('parser');
  const bodies = descendants.filter(element => element.name === 'div' && hasElementClass(element, 'card-body'));
  if (bodies.length !== 1
    || bodies[0].parent !== card
    || !isExplicitlyClosed(bodies[0])
    || !hasDirectSourceContainment(card, bodies[0])) {
    throw new CcelSearchFailure('parser');
  }
  const body = bodies[0];
  assertNoNonAncestorSourceWrapper(document, body);
  const bodyDescendants = descendantElements(body);

  const headings = body.children.filter(element => element.name === 'h5' && hasElementClass(element, 'card-title'));
  if (headings.length !== 1
    || !isExplicitlyClosed(headings[0])
    || !hasDirectSourceContainment(body, headings[0])) {
    throw new CcelSearchFailure('parser');
  }
  assertNoNonAncestorSourceWrapper(document, headings[0]);
  const spans = descendantElements(headings[0]).filter(element => element.name === 'span');
  if (spans.length !== 2 || spans.some(element => element.parent !== headings[0]
    || !isExplicitlyClosed(element)
    || !hasDirectSourceContainment(headings[0], element))) {
    throw new CcelSearchFailure('parser');
  }
  spans.forEach(element => assertNoNonAncestorSourceWrapper(document, element));
  const titleSpans = spans.filter(element => hasElementClass(element, 'title'));
  const authorSpans = spans.filter(element => hasElementClass(element, 'author'));
  if (titleSpans.length !== 1 || authorSpans.length !== 1
    || spans.some(element => Number(hasElementClass(element, 'title')) + Number(hasElementClass(element, 'author')) !== 1)) {
    throw new CcelSearchFailure('parser');
  }
  const title = elementText(titleSpans[0], CCEL_SEARCH_LIMITS.maxTitleCharacters);
  const authorMarker = elementText(authorSpans[0], CCEL_SEARCH_LIMITS.maxAuthorResultCharacters + 3);
  if (!title || /^by\s+/iu.test(title) || !/^by\s+\S/iu.test(authorMarker)) throw new CcelSearchFailure('parser');
  const author = sanitizePlainText(authorMarker.replace(/^by\s+/iu, ''), CCEL_SEARCH_LIMITS.maxAuthorResultCharacters);
  if (!author) throw new CcelSearchFailure('parser');

  const paragraphs = body.children.filter(element => element.name === 'p');
  if (paragraphs.length !== 1
    || !hasElementClass(paragraphs[0], 'card-text')
    || !isExplicitlyClosed(paragraphs[0])
    || !hasDirectSourceContainment(body, paragraphs[0])) {
    throw new CcelSearchFailure('parser');
  }
  assertNoNonAncestorSourceWrapper(document, paragraphs[0]);
  const snippet = elementText(paragraphs[0], CCEL_SEARCH_LIMITS.maxSnippetCharacters);

  const readLinks = body.children.filter(element => element.name === 'a'
    && elementText(element, 32).toLocaleLowerCase('en-US') === 'read online');
  if (readLinks.length !== 1
    || !isExplicitlyClosed(readLinks[0])
    || !hasDirectSourceContainment(body, readLinks[0])) {
    throw new CcelSearchFailure('parser');
  }
  assertNoNonAncestorSourceWrapper(document, readLinks[0]);
  if (bodyDescendants.some(element => isResultMetadataElement(element)
    && element !== headings[0]
    && element !== paragraphs[0]
    && element !== readLinks[0])) {
    throw new CcelSearchFailure('parser');
  }
  const href = readLinks[0].attributes.get('href');
  const locator = href === undefined ? undefined : normalizeCcelSectionLocator(href);
  if (!locator) throw new CcelSearchFailure('parser');
  const orderedSpans = [...spans].sort((left, right) => left.sourceStart - right.sourceStart);
  const structuralGaps: Array<[number, number]> = [
    [card.sourceContentStart, body.sourceStart],
    [body.sourceEnd, card.sourceContentEnd],
    [body.sourceContentStart, headings[0].sourceStart],
    [headings[0].sourceEnd, paragraphs[0].sourceStart],
    [paragraphs[0].sourceEnd, readLinks[0].sourceStart],
    [readLinks[0].sourceEnd, body.sourceContentEnd],
    [headings[0].sourceContentStart, orderedSpans[0].sourceStart],
    [orderedSpans[0].sourceEnd, orderedSpans[1].sourceStart],
    [orderedSpans[1].sourceEnd, headings[0].sourceContentEnd],
  ];
  if (structuralGaps.some(([start, end]) => sourceGapMatches(html, start, end, ADOPTION_FORMATTING_SOURCE_PATTERN))) {
    throw new CcelSearchFailure('parser');
  }
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

function elementText(element: ReviewedElement, maxCharacters: number): string {
  return sanitizePlainText(element.text, maxCharacters);
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
  return classValue.split(/[\t\n\f\r ]+/u).includes(token);
}

function isExplicitlyClosed(element: ReviewedElement): boolean {
  return !STRICTLY_CLOSED_RESULT_ELEMENTS.has(element.name) || element.explicitlyClosed;
}

function sanitizePlainText(text: string, maxCharacters: number): string {
  const decoded = text
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
