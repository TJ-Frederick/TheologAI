/** Fixed-account, single-attempt Cloudflare transport for a complete corpus proof. */
import {createRequire} from 'node:module';
const operatorAuthority=createRequire(import.meta.url)('../.github/scripts/operator-authorization.cjs');
export type ProductionBudgetAuthorization={package:unknown;sourceCommit:string;sourceTree:string;runId:string};
import { createHash } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import {TARGETS as APPLICATION_TARGETS} from './application-release-policy.mjs';
import { POLICY, ACCOUNT, TARGETS } from './norton-aquinas-release-policy.mjs';
import { type BoundPreview, captureUnboundCorpusControl } from './corpus-release-control.js';
import {identifyProtectedPreviewToken} from './corpus-token-identity.js';
import { createCorpusApi } from './corpus-release-api.js';
import { ALL_FTS, type ProofQuery, type ProofRow } from './corpus-source-proof.js';

type Role = keyof typeof TARGETS;
type ApiResult = { success?: boolean; errors?: unknown[]; result?: unknown; data?: unknown };
export type ProtectedCorpusAdmission = { accountId: string; role: Role; day: string; observedAt: string; rowsRead: number; rowsWritten: number; sampleInterval: 1; readBudget: number; liveControlReserve?:number; inventoryObservedAt?:string; controls: unknown;accountReadCeiling?:number;accountReadCeilingDay?:string };
// Owner's October 29 preview-only waiver of the production traffic reserve.
export const PREVIEW_QUOTA_BUFFER_DAY = '2026-10-29';
// Owner waived only the analytics uncertainty margin for today's preview.
export const PREVIEW_UNCERTAINTY_WAIVER_DAY = '2026-10-30';
type BudgetScope = { role: Role; day: string; historicalExceptions?: boolean;productionAuthorization?:ProductionBudgetAuthorization };
const uncertaintyReadMargin = (scope?: BudgetScope): number => scope?.historicalExceptions !== false && scope?.role === 'preview' && scope.day === PREVIEW_UNCERTAINTY_WAIVER_DAY ? 0 : 200_000;
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
export function admitCorpusBudget(usage: number, reserved: number, localKnownReads: number, next: number, accountCeiling = 4_000_000, liveAuditReserve = 0, scope?: BudgetScope): void {
  check(accountCeiling === 4_000_000 && (liveAuditReserve === 0 || liveAuditReserve === POLICY.liveReads + POLICY.controlReads) || accountCeiling === 5_000_000 && liveAuditReserve === 500_000 || accountCeiling===4400000&&scope?.role==='production'&&scope.productionAuthorization&&scope.day===new Date().toISOString().slice(0,10)&&operatorAuthority.productionAccountCeiling(scope.productionAuthorization.package,scope.productionAuthorization)===accountCeiling&&liveAuditReserve===100000, 'account budget policy');
  check([usage, reserved, localKnownReads, next].every(count) && Math.max(usage, localKnownReads) + uncertaintyReadMargin(scope) + reserved + next + liveAuditReserve <= accountCeiling, 'insufficient account headroom');
}

export class CorpusProofTransport {
  private readonly targets:typeof TARGETS;
  private readonly corpus:boolean;
  private readonly started = Date.now();
  private readonly day = new Date(this.started).toISOString().slice(0, 10);
  private lastDispatch = 0;
  private lastUsageAt = 0;
  private inventoryObservedAt = 0;
  private latestUsage = 0;
  private baselineUsage = 0;
  private latestWrites = 0;
  private integrityOnly = false;
  private controls: unknown;
  private candidateWitness: {kind:'unbound-corpus'|'bound-preview-corpus';databaseId:string;inventorySha256:string} | undefined;
  private readonly boundPreview: BoundPreview | undefined;
  private halted = false;
  private current: ProofQuery | null = null;
  private bytes = 0;
  private readonly accountCeiling: number;
  private readonly liveAuditReserve: number;
  private readonly budgetScope: BudgetScope;
  readonly metering = { rowsRead: 0, rowsWritten: 0, requests: 0, retries: 0, unknownAttempts: 0, integrityCommands: 0 };
  constructor(private readonly options: { role: Role; token: string; readBudget: number; eventFile: string; fetch?: typeof fetch; previewQuotaBuffer?: boolean; historicalExceptions?: boolean; activated?: boolean; policy?: 'application-only'|'norton-aquinas.v1'; knownRowsRead?:number;boundPreviewAuthorization?:ProductionBudgetAuthorization;productionAuthorization?:ProductionBudgetAuthorization }) {
    check(options.knownRowsRead===undefined || count(options.knownRowsRead),'known read floor');
    this.corpus=options.policy===POLICY.policy; this.targets=this.corpus?TARGETS:APPLICATION_TARGETS;
    check(!options.policy || options.policy==='application-only' || this.corpus,'closed transport policy');
    check(Object.hasOwn(this.targets, options.role) && options.token.length > 0 && options.token.length <= 8192 && !/[\r\n]/.test(options.token), 'target or credential');
    check(count(options.readBudget) && options.readBudget <= (this.corpus?POLICY.hardReadCap:3_800_000), 'whole-run budget');
    if(this.corpus)check(!options.previewQuotaBuffer && options.historicalExceptions !== true,'corpus policy forbids historical quota exceptions');
    else check(!options.previewQuotaBuffer || options.role==='preview' && this.day===PREVIEW_QUOTA_BUFFER_DAY,'preview quota buffer date/role');
    check(!options.activated || this.corpus && options.readBudget===0,'activated observer is metadata only');
    if(options.boundPreviewAuthorization){
      check(this.corpus && options.role==='preview' && !options.activated && !options.productionAuthorization,'bound preview mode');
      const context=options.boundPreviewAuthorization;
      this.boundPreview=operatorAuthority.boundPreviewForPackage(context.package,context);
    }
    if(options.productionAuthorization)check(this.corpus&&options.role==='production','production-only account authority');
    this.accountCeiling = options.productionAuthorization?operatorAuthority.productionAccountCeiling(options.productionAuthorization.package,options.productionAuthorization):options.previewQuotaBuffer ? 5_000_000 : 4_000_000;
    this.liveAuditReserve = options.previewQuotaBuffer ? 500_000 : this.corpus ? POLICY.liveReads + POLICY.controlReads : 0;
    this.budgetScope = { role: options.role, day: this.day, historicalExceptions: this.corpus ? false : options.historicalExceptions,productionAuthorization:options.productionAuthorization };
    check(this.started + 5_400_000 < Date.parse(this.day + 'T00:00:00Z') + 86_400_000, 'insufficient UTC window');
    writeFileSync(options.eventFile, '', { flag: 'wx', mode: 0o600 });
  }
  private event(value: unknown): void { appendFileSync(this.options.eventFile, JSON.stringify({ at: new Date().toISOString(), ...row(value) }) + '\n', { mode: 0o600, flush: true }); }
  private async request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<ApiResult> {
    check(!this.halted && Date.now() - this.started < 5_400_000 && new Date().toISOString().slice(0, 10) === this.day, 'halted, expired or UTC crossing');
    if(this.options.boundPreviewAuthorization){const context=this.options.boundPreviewAuthorization;operatorAuthority.boundPreviewForPackage(context.package,context);}
    const prefix = `/accounts/${ACCOUNT}`;
    const databasePath = `${prefix}/d1/database/${this.targets[this.options.role].databaseId}`;
    check(path === '/graphql' && method === 'POST' || path === databasePath + '/query' && method === 'POST'
      || method === 'GET' && new RegExp(`^${prefix}/workers/scripts/(?:theologai|theologai-preview)/(?:settings|deployments\\?page=1&per_page=1|versions/[0-9a-f-]{36})$`).test(path), 'network route');
    const remaining = Math.max(0, this.lastDispatch + (this.corpus ? 500 : 300) - Date.now()); if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
    this.lastDispatch = Date.now();
    const response = await (this.options.fetch ?? fetch)(`https://api.cloudflare.com/client/v4${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { authorization: `Bearer ${this.options.token}`, accept: 'application/json', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
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
    this.latestUsage = Math.max(this.latestUsage, sum.rowsRead); this.latestWrites = Math.max(this.latestWrites, sum.rowsWritten); this.lastUsageAt = Date.now();
    this.event({ kind: 'usage', rowsRead: sum.rowsRead, rowsWritten: sum.rowsWritten, ingestionWatermarkUnavailable: true });
  }
  private expectedBinding(role:Role):string {
    if(!this.corpus)return this.targets[role].databaseId;
    if(role==='production')return this.options.role==='production'&&this.options.activated?TARGETS.production.databaseId:POLICY.rollback.databaseId;
    return this.options.role==='preview'&&!this.options.activated&&!this.boundPreview?TARGETS.production.databaseId:TARGETS.preview.databaseId;
  }
  private async snapshot(): Promise<unknown> {
    const result = [];
    for (const role of ['production', 'preview'] as const) {
      const databaseId=this.expectedBinding(role);
      const name = role === 'preview' ? 'theologai-preview' : 'theologai'; const path = `/accounts/${ACCOUNT}/workers/scripts/${name}`;
      const settings = row(await this.rest(path + '/settings')); const bindings = list(settings.bindings).filter(b => b.type === 'd1');
      check(bindings.length === 1 && bindings[0]!.name === 'THEOLOGAI_DB' && (bindings[0]!.id ?? bindings[0]!.database_id) === databaseId, 'configured D1 binding');
      const deployment = list(row(await this.rest(path + '/deployments?page=1&per_page=1')).deployments)[0]; check(deployment, 'active deployment missing');
      const versions = list(deployment.versions); check(versions.length === 1 && versions[0]!.percentage === 100 && typeof versions[0]!.version_id === 'string' && /^[0-9a-f-]{36}$/.test(versions[0]!.version_id), 'traffic assignment');
      const version = row(await this.rest(path + '/versions/' + versions[0]!.version_id)); check(version.id === versions[0]!.version_id, 'version identity');
      const active = list(row(version.resources).bindings).filter(b => b.type === 'd1');
      check(active.length === 1 && (active[0]!.id ?? active[0]!.database_id) === databaseId && active[0]!.name === 'THEOLOGAI_DB', 'active D1 binding');
      if(this.boundPreview)check(deployment.id===(role==='preview'?this.boundPreview.previewDeploymentId:this.boundPreview.productionDeploymentId) && version.id===(role==='preview'?this.boundPreview.previewVersionId:this.boundPreview.productionVersionId),'owner-pinned bound assignment changed');
      result.push({role,deploymentId:deployment.id,versionId:version.id,databaseId});
    }
    if (this.candidateWitness) result.push(this.candidateWitness as any);
    return result;
  }
  private async captureCandidate(): Promise<void> {
    if(!this.corpus)return;
    const started=Date.now();let failedAccess=false;
    const api=createCorpusApi(this.options.role,async()=>this.options.token,this.options.fetch??fetch,event=>{this.event(event);const e=event as any;if(e.kind==='corpus-control-http'&&(e.httpStatus===401||e.httpStatus===403))failedAccess=true;});
    let capture:Awaited<ReturnType<typeof captureUnboundCorpusControl>>;
    try{capture=await captureUnboundCorpusControl({role:this.options.role,api,boundPreview:this.boundPreview});}
    catch(error){
      if(this.options.role==='preview'&&failedAccess){try{this.event({kind:'preview-token-identity',...await identifyProtectedPreviewToken(this.options.token,this.options.fetch??fetch,Math.min(started+120000,Date.now()+30000))});}catch{this.event({kind:'preview-token-identity-unavailable',sqlCalls:0,writes:0});}}
      throw error;
    }
    check(Date.now()-Date.parse(capture.capturedAt)<=50_000,'stale complete candidate inventory');
    const witness={kind:this.boundPreview?'bound-preview-corpus' as const:'unbound-corpus' as const,databaseId:capture.databaseId,inventorySha256:capture.inventorySha256};
    if(this.candidateWitness) check(JSON.stringify(witness)===JSON.stringify(this.candidateWitness),'candidate inventory changed');
    this.candidateWitness=witness; this.inventoryObservedAt=Date.parse(capture.capturedAt);
    this.event({kind:this.boundPreview?'complete-bound-preview-inventory':'complete-unbound-inventory',capture});
  }
  async start(): Promise<void> {
    await this.captureCandidate(); this.controls = await this.snapshot(); await this.usage(); this.baselineUsage = Math.max(this.latestUsage,this.options.knownRowsRead??0);
    admitCorpusBudget(this.latestUsage, this.options.readBudget, this.baselineUsage, 0, this.accountCeiling, this.liveAuditReserve, this.budgetScope);
    this.event({ kind: 'admitted', readBudget: this.options.readBudget, maxIntegrityCommands: 4, accountReadCeiling: this.accountCeiling, liveAuditReadReserve: this.liveAuditReserve,
      ...(this.options.previewQuotaBuffer ? {previewQuotaBufferDay:PREVIEW_QUOTA_BUFFER_DAY} : {}),
      uncertaintyReadMargin: uncertaintyReadMargin(this.budgetScope),
      ...(uncertaintyReadMargin(this.budgetScope) === 0 ? {previewUncertaintyWaiverDay:PREVIEW_UNCERTAINTY_WAIVER_DAY} : {}), controls: this.controls });
  }
  protectedAdmission(): ProtectedCorpusAdmission {
    check(this.controls && this.lastUsageAt > 0 && Date.now()-this.lastUsageAt <= 50_000 && this.metering.requests===0, 'fresh admission before SQL');
    return {...(this.options.productionAuthorization?{accountReadCeiling:this.accountCeiling,accountReadCeilingDay:this.day}:{}),accountId:ACCOUNT,role:this.options.role,day:this.day,observedAt:new Date(this.lastUsageAt).toISOString(),rowsRead:this.latestUsage,rowsWritten:this.latestWrites,sampleInterval:1,readBudget:this.options.readBudget,liveControlReserve:this.liveAuditReserve,inventoryObservedAt:new Date(this.inventoryObservedAt || this.lastUsageAt).toISOString(),controls:this.controls};
  }
  async startIntegrity(admission: ProtectedCorpusAdmission): Promise<void> {
    check(this.options.readBudget===16_384 && admission.accountId===ACCOUNT && admission.role===this.options.role && admission.day===this.day
      && admission.sampleInterval===1 && count(admission.rowsRead) && count(admission.rowsWritten) && count(admission.readBudget)
      && admission.readBudget<=(this.corpus?POLICY.hardReadCap:3_800_000) && Date.parse(admission.observedAt)<=Date.now() && Date.now()-Date.parse(admission.observedAt)<=50_000, 'protected integrity admission');
    check((admission.accountReadCeiling??4000000)===this.accountCeiling&&(admission.accountReadCeilingDay??this.day)===this.day,'matching protected account ceiling');
    if(this.corpus)check(admission.liveControlReserve===POLICY.liveReads+POLICY.controlReads && Date.now()-Date.parse(admission.inventoryObservedAt ?? '')<=50_000 && Date.parse(admission.inventoryObservedAt ?? '')<=Date.now(),'fresh complete inventory and live/control reserve');
    check(admission.rowsWritten+4<=80_000,'insufficient account write headroom');
    admitCorpusBudget(admission.rowsRead,admission.readBudget,admission.rowsRead,0,this.accountCeiling,this.liveAuditReserve,this.budgetScope);
    if(this.corpus){
    check(Array.isArray(admission.controls),'complete inventory witness missing');
    const witness=admission.controls.at(-1) as any;
    check(witness?.kind===(this.boundPreview?'bound-preview-corpus':'unbound-corpus') && witness.databaseId===this.targets[this.options.role].databaseId && /^[a-f0-9]{64}$/.test(witness.inventorySha256),'complete inventory witness target');
    this.candidateWitness=witness; this.inventoryObservedAt=Date.parse(admission.inventoryObservedAt ?? '');
    }
    this.controls=await this.snapshot();check(JSON.stringify(this.controls)===JSON.stringify(admission.controls),'protected admission controls changed');
    this.latestUsage=this.baselineUsage=admission.rowsRead;this.latestWrites=admission.rowsWritten;this.lastUsageAt=Date.parse(admission.observedAt);this.integrityOnly=true;
    this.event({kind:'integrity-admitted',admission,uncertaintyReadMargin:uncertaintyReadMargin(this.budgetScope)});
  }
  async execute(query: ProofQuery): Promise<ProofRow[]> {
    check(!this.halted && this.current === null, 'concurrent or halted execution'); assertProofQuery(query);
    if(this.integrityOnly) check(query.kind==='fts-integrity' && Date.now()-this.lastUsageAt<=50_000 && (!this.corpus || Date.now()-this.inventoryObservedAt<=50_000),'fresh integrity-only execution');
    else if (Date.now() - this.lastUsageAt > 50_000) await this.usage();
    admitCorpusBudget(this.latestUsage, 0, this.baselineUsage + this.metering.rowsRead, query.readCeiling, this.accountCeiling, this.liveAuditReserve, this.budgetScope);
    check(this.metering.requests < 5000 && this.metering.rowsRead + query.readCeiling <= this.options.readBudget && this.metering.rowsWritten + query.writeCeiling <= 4, 'run budget');
    this.current = query; this.event({ kind: 'intent', label: query.label, sqlSha256: sha(query.sql), readCeiling: query.readCeiling, writeCeiling: query.writeCeiling });
    this.metering.requests++;
    if (query.kind === 'fts-integrity') this.metering.integrityCommands++;
    try {
      const value = await this.request(`/accounts/${ACCOUNT}/d1/database/${this.targets[this.options.role].databaseId}/query`, 'POST', { sql: query.sql });
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
    check(!this.halted && this.current === null, 'incomplete session'); if(!this.integrityOnly) await this.captureCandidate(); const after = await this.snapshot();
    check(JSON.stringify(after) === JSON.stringify(this.controls), 'controls changed'); if(!this.integrityOnly) await this.usage();
    return { controls: this.controls, controlsUnchanged: true };
  }
  async observeControls(): Promise<unknown> {
    check(this.options.readBudget === 0 && this.metering.requests === 0, 'metadata-only observer');
    if(this.corpus&&!this.options.activated)await this.captureCandidate();
    const controls = await this.snapshot(); this.event({ kind: 'controls-observation', controls }); return controls;
  }
}
