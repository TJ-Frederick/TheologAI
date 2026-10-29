/** Fixed-account, single-attempt Cloudflare transport for a complete corpus proof. */
import { createHash } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { ACCOUNT, TARGETS } from './application-release-policy.mjs';
import { ALL_FTS, type ProofQuery, type ProofRow } from './corpus-source-proof.js';

type Role = keyof typeof TARGETS;
type ApiResult = { success?: boolean; errors?: unknown[]; result?: unknown; data?: unknown };
// Owner's October 29 preview-only waiver of the production traffic reserve.
export const PREVIEW_QUOTA_BUFFER_DAY = '2026-10-29';
function check(value: unknown, reason: string): asserts value { if (!value) throw Error(`Corpus transport refused: ${reason}`); }
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function errorCodes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).flatMap(error => error && typeof error === 'object' && 'code' in error && count(error.code) ? [error.code] : []);
}
function errorKinds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const kinds = new Set<string>();
  for (const error of value.slice(0, 16)) {
    if (!error || typeof error !== 'object' || !('message' in error) || typeof error.message !== 'string') continue;
    for (const match of error.message.matchAll(/\bSQLITE_(AUTH|READONLY|CORRUPT|NOTADB|IOERR|BUSY|LOCKED|ERROR|CONSTRAINT|TOOBIG|FULL)(?:_[A-Z0-9]+)?\b/g)) kinds.add(`SQLITE_${match[1]}`);
    if (/\b(?:not authorized|unauthorized|authorization|authentication|permissions?|read[- ]?only)\b/i.test(error.message)) kinds.add('authorization');
  }
  return [...kinds].sort();
}
function row(value: unknown): ProofRow { check(value !== null && typeof value === 'object' && !Array.isArray(value), 'object shape'); return value as ProofRow; }
function list(value: unknown): ProofRow[] { check(Array.isArray(value), 'list shape'); return value.map(row); }

export function assertProofQuery(query: ProofQuery): void {
  check(count(query.readCeiling) && query.readCeiling > 0 && query.readCeiling <= 2_000_000 && !query.sql.includes(';'), 'query bound');
  if (query.kind === 'select') check(query.sql.startsWith('SELECT ') && query.writeCeiling === 0, 'SELECT allowlist');
  else if (query.kind === 'quick-check') check(query.sql === 'PRAGMA quick_check' && query.writeCeiling === 0, 'physical check allowlist');
  else check(query.kind === 'fts-integrity' && query.writeCeiling === 1 && ALL_FTS.some(t => query.sql === `INSERT INTO "${t}"("${t}",rank) VALUES('integrity-check',1)`), 'integrity command allowlist');
}
export function admitCorpusBudget(usage: number, reserved: number, localKnownReads: number, next: number, accountCeiling = 4_000_000, liveAuditReserve = 0): void {
  check(accountCeiling === 4_000_000 && liveAuditReserve === 0 || accountCeiling === 5_000_000 && liveAuditReserve === 500_000, 'account budget policy');
  check([usage, reserved, localKnownReads, next].every(count) && Math.max(usage, localKnownReads) + 200_000 + reserved + next + liveAuditReserve <= accountCeiling, 'insufficient account headroom');
}

export class CorpusProofTransport {
  private readonly started = Date.now();
  private readonly day = new Date(this.started).toISOString().slice(0, 10);
  private lastDispatch = 0;
  private lastUsageAt = 0;
  private latestUsage = 0;
  private baselineUsage = 0;
  private controls: unknown;
  private halted = false;
  private current: ProofQuery | null = null;
  private bytes = 0;
  private readonly accountCeiling: number;
  private readonly liveAuditReserve: number;
  readonly metering = { rowsRead: 0, rowsWritten: 0, requests: 0, retries: 0, unknownAttempts: 0, integrityCommands: 0 };
  constructor(private readonly options: { role: Role; token: string; readBudget: number; eventFile: string; fetch?: typeof fetch; previewQuotaBuffer?: boolean }) {
    check(Object.hasOwn(TARGETS, options.role) && options.token.length > 0 && options.token.length <= 8192 && !/[\r\n]/.test(options.token), 'target or credential');
    check(count(options.readBudget) && options.readBudget <= 3_800_000, 'whole-run budget');
    check(!options.previewQuotaBuffer || options.role === 'preview' && this.day === PREVIEW_QUOTA_BUFFER_DAY, 'preview quota buffer date/role');
    this.accountCeiling = options.previewQuotaBuffer ? 5_000_000 : 4_000_000;
    this.liveAuditReserve = options.previewQuotaBuffer ? 500_000 : 0;
    check(this.started + 5_400_000 < Date.parse(this.day + 'T00:00:00Z') + 86_400_000, 'insufficient UTC window');
    writeFileSync(options.eventFile, '', { flag: 'wx', mode: 0o600 });
  }
  private event(value: unknown): void { appendFileSync(this.options.eventFile, JSON.stringify({ at: new Date().toISOString(), ...row(value) }) + '\n', { mode: 0o600 }); }
  private async request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<ApiResult> {
    check(!this.halted && Date.now() - this.started < 5_400_000 && new Date().toISOString().slice(0, 10) === this.day, 'halted, expired or UTC crossing');
    const prefix = `/accounts/${ACCOUNT}`;
    const databasePath = `${prefix}/d1/database/${TARGETS[this.options.role].databaseId}`;
    check(path === '/graphql' && method === 'POST' || path === databasePath + '/query' && method === 'POST'
      || method === 'GET' && new RegExp(`^${prefix}/workers/scripts/(?:theologai|theologai-preview)/(?:settings|deployments\\?page=1&per_page=1|versions/[0-9a-f-]{36})$`).test(path), 'network route');
    const remaining = Math.max(0, this.lastDispatch + 300 - Date.now()); if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
    this.lastDispatch = Date.now();
    const response = await (this.options.fetch ?? fetch)(`https://api.cloudflare.com/client/v4${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { authorization: `Bearer ${this.options.token}`, accept: 'application/json', 'content-type': 'application/json',
        ...(path === '/graphql' && this.options.previewQuotaBuffer ? { 'X-Rate-Limit-Type': 'account-based' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const jsonContentType = /^application\/json/.test(response.headers.get('content-type') ?? '');
    const accepted = response.status === 200 && !response.redirected && jsonContentType;
    if (!accepted || !response.body) this.event({ kind: 'rejected-response', method, path, httpStatus: response.status, redirected: response.redirected, jsonContentType, emptyBody: !response.body });
    check(response.body, 'empty response'); const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; this.bytes += part.value.byteLength;
      check(size <= 1_250_000 && this.bytes <= 512 * 1024 * 1024, 'response bytes'); chunks.push(part.value); } }
    finally { await reader.cancel().catch(() => undefined); }
    const text = Buffer.concat(chunks).toString('utf8'); let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch {
      this.event({ kind: 'invalid-json', method, path, httpStatus: response.status, responseSha256: sha(text), bytes: size });
      throw Error('Corpus transport refused: invalid JSON response');
    }
    const value = row(parsed);
    if (!accepted || value.success === false || Array.isArray(value.errors) && value.errors.length) {
      this.event({ kind: 'provider-error', method, path, httpStatus: response.status, errorCodes: errorCodes(value.errors), errorKinds: errorKinds(value.errors), responseSha256: sha(text), bytes: size });
    }
    check(accepted, 'HTTP/redirect/content type');
    this.event({ kind: 'API', method, path, responseSha256: sha(text), bytes: size }); return value as ApiResult;
  }
  private async rest(path: string): Promise<unknown> {
    const value = await this.request(path, 'GET');
    check(value.success === true && (Array.isArray(value.errors) && value.errors.length === 0 || path.includes('/versions/') && value.errors === null), 'metadata envelope'); return value.result;
  }
  private async usage(): Promise<void> {
    const query = 'query CorpusProofUsage($account: string!, $day: Date!) { viewer { accounts(filter:{accountTag:$account}) { accountTag d1AnalyticsAdaptiveGroups(limit:2,filter:{date_geq:$day,date_leq:$day}) { sum {rowsRead rowsWritten} avg {sampleInterval} } } } }';
    const response = await this.request('/graphql', 'POST', { query, variables: { account: ACCOUNT, day: this.day } });
    check(!response.errors?.length, 'analytics errors'); const accounts = list(row(row(response.data).viewer).accounts);
    check(accounts.length === 1 && accounts[0]!.accountTag === ACCOUNT, 'analytics scope');
    const groups = list(accounts[0]!.d1AnalyticsAdaptiveGroups); check(groups.length === 1 && row(groups[0]!.avg).sampleInterval === 1, 'analytics incomplete or sampled');
    const sum = row(groups[0]!.sum); check(count(sum.rowsRead) && count(sum.rowsWritten), 'analytics counters');
    check(sum.rowsWritten + 4 <= 80_000, 'insufficient account write headroom');
    this.latestUsage = Math.max(this.latestUsage, sum.rowsRead); this.lastUsageAt = Date.now();
    this.event({ kind: 'usage', rowsRead: sum.rowsRead, rowsWritten: sum.rowsWritten, ingestionWatermarkUnavailable: true });
  }
  private async snapshot(): Promise<unknown> {
    const result = [];
    for (const role of ['production', 'preview'] as const) {
      const name = role === 'preview' ? 'theologai-preview' : 'theologai'; const path = `/accounts/${ACCOUNT}/workers/scripts/${name}`;
      const settings = row(await this.rest(path + '/settings')); const bindings = list(settings.bindings).filter(b => b.type === 'd1');
      check(bindings.length === 1 && bindings[0]!.name === 'THEOLOGAI_DB' && (bindings[0]!.id ?? bindings[0]!.database_id) === TARGETS[role].databaseId, 'configured D1 binding');
      const deployment = list(row(await this.rest(path + '/deployments?page=1&per_page=1')).deployments)[0]; check(deployment, 'active deployment missing');
      const versions = list(deployment.versions); check(versions.length === 1 && versions[0]!.percentage === 100 && typeof versions[0]!.version_id === 'string' && /^[0-9a-f-]{36}$/.test(versions[0]!.version_id), 'traffic assignment');
      const version = row(await this.rest(path + '/versions/' + versions[0]!.version_id)); check(version.id === versions[0]!.version_id, 'version identity');
      const active = list(row(version.resources).bindings).filter(b => b.type === 'd1');
      check(active.length === 1 && (active[0]!.id ?? active[0]!.database_id) === TARGETS[role].databaseId && active[0]!.name === 'THEOLOGAI_DB', 'active D1 binding');
      result.push({ role, deploymentId: deployment.id, versionId: version.id, databaseId: TARGETS[role].databaseId });
    }
    return result;
  }
  async start(): Promise<void> {
    this.controls = await this.snapshot(); await this.usage(); this.baselineUsage = this.latestUsage;
    admitCorpusBudget(this.latestUsage, this.options.readBudget, this.baselineUsage, 0, this.accountCeiling, this.liveAuditReserve);
    this.event({ kind: 'admitted', readBudget: this.options.readBudget, maxIntegrityCommands: 4, accountReadCeiling: this.accountCeiling, liveAuditReadReserve: this.liveAuditReserve,
      ...(this.options.previewQuotaBuffer ? {previewQuotaBufferDay:PREVIEW_QUOTA_BUFFER_DAY} : {}), controls: this.controls });
  }
  async execute(query: ProofQuery): Promise<ProofRow[]> {
    check(!this.halted && this.current === null, 'concurrent or halted execution'); assertProofQuery(query);
    if (Date.now() - this.lastUsageAt > 50_000) await this.usage();
    admitCorpusBudget(this.latestUsage, 0, this.baselineUsage + this.metering.rowsRead, query.readCeiling, this.accountCeiling, this.liveAuditReserve);
    check(this.metering.requests < 5000 && this.metering.rowsRead + query.readCeiling <= this.options.readBudget && this.metering.rowsWritten + query.writeCeiling <= 4, 'run budget');
    this.current = query; this.event({ kind: 'intent', label: query.label, sqlSha256: sha(query.sql), readCeiling: query.readCeiling, writeCeiling: query.writeCeiling });
    this.metering.requests++;
    if (query.kind === 'fts-integrity') this.metering.integrityCommands++;
    try {
      const value = await this.request(`/accounts/${ACCOUNT}/d1/database/${TARGETS[this.options.role].databaseId}/query`, 'POST', { sql: query.sql });
      check(value.success === true && Array.isArray(value.errors) && !value.errors.length, 'D1 envelope'); const results = list(value.result); check(results.length === 1 && results[0]!.success === true, 'D1 result count');
      const result = results[0]!; const meta = row(result.meta);
      check(count(meta.rows_read) && count(meta.rows_written) && count(meta.changes) && meta.total_attempts === 1 && meta.served_by_primary === true, 'single primary attempt metadata');
      this.metering.rowsRead += meta.rows_read; this.metering.rowsWritten += meta.rows_written;
      check(meta.rows_read <= query.readCeiling && meta.rows_written <= query.writeCeiling && meta.changes <= query.writeCeiling, 'measured query budget');
      const rows = list(result.results); this.event({ kind: 'result', label: query.label, sqlSha256: sha(query.sql), rowsRead: meta.rows_read, rowsWritten: meta.rows_written, changes: meta.changes, rowCount: rows.length });
      this.current = null; return rows;
    } catch (error) {
      this.halted = true; this.metering.unknownAttempts++;
      const failureKind = error instanceof Error && ['Error', 'AbortError', 'TimeoutError', 'TypeError', 'SyntaxError'].includes(error.name) ? error.name : 'unknown';
      this.event({ kind: 'halted', label: query.label, failureKind, reservedUnknownReads: query.readCeiling, reservedUnknownWrites: query.writeCeiling });
      throw Error('Corpus transport refused: failed or ambiguous single attempt; no retry or cleanup');
    }
  }
  async finish(): Promise<{ controls: unknown; controlsUnchanged: true }> {
    check(!this.halted && this.current === null, 'incomplete session'); const after = await this.snapshot();
    check(JSON.stringify(after) === JSON.stringify(this.controls), 'controls changed'); await this.usage();
    return { controls: this.controls, controlsUnchanged: true };
  }
  async observeControls(): Promise<unknown> {
    check(this.options.readBudget === 0 && this.metering.requests === 0, 'metadata-only observer');
    const controls = await this.snapshot(); this.event({ kind: 'controls-observation', controls }); return controls;
  }
}
