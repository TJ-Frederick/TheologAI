#!/usr/bin/env tsx
/** Complete operator proof, accepted only inside the unchanged protected gate. */
import { createHash, randomBytes } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, closeSync, existsSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACCOUNT } from './application-release-policy.mjs';
import {policyForIdentity,policyForClassification,selectReleaseProofPolicy,requireSameReleasePolicy} from '../.github/scripts/release-proof-policy.mjs';
import { runFreshApplicationCorpusCheck } from './application-corpus-check.js';
import { CorpusProofTransport, type ProtectedCorpusAdmission } from './corpus-proof-transport.js';

import { ALL_FTS, type ProofQuery } from './corpus-source-proof.js';

const authority = createRequire(import.meta.url)('../.github/scripts/operator-authorization.cjs');
const check = (v: unknown, reason: string): void => { if (!v) throw Error('Operator corpus proof refused: ' + reason); };
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const object = (v: unknown): Record<string, any> => { check(v && typeof v === 'object' && !Array.isArray(v), 'object'); return v as Record<string, any>; };
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const hex = (v: unknown, length: number) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(v);
export const OPERATOR_PROOF = Object.freeze({ repository: 'TJ-Frederick/TheologAI', ownerActorId: 40179660,
  // Dated evidence constants only. Successor v2 never reads this historical allowance.
  previewAuthorization: 'pr170-preview-checkout-review-20261030-01', reservedReads: 3510997, hardReadCap: 3800000, diagnosticCommands: 4,
  previewExtensionNotBefore: '2026-10-31T00:05:00Z', previewCumulativeReadCap: 4_583_687, previewCumulativeDiagnostics: 8,
  previewPriorReads: 1_072_690, previewPriorWrites: 4, previewPriorDiagnostics: 4 });
export type OperatorChallenge = {
  schemaVersion: 'theologai-operator-corpus-challenge.v2'; releasePolicy?: string; liveControlReserve?: number;accountReadCeiling?:number;accountReadCeilingDay?:string; authorization: {authorization: Record<string,any>;provenance: Record<string,any>}; role: 'preview' | 'production'; authorizationId: string;
  repository: string; ownerActorId: number; sourceCommit: string; sourceTree: string; sourcePlanSha256: string;
  runId: string; runAttempt: 1; workflowPath: string; eventName: string; ref: string; baseCommit: string;
  nonce: string; createdAt: string; expiresAt: string; reservedReads: number; hardReadCap: number; diagnosticCommands: number; admission: ProtectedCorpusAdmission;
};
function cumulativeAllowance(c: OperatorChallenge) {
  authority.requirePackage(c.authorization, {role:c.role,sourceCommit:c.sourceCommit,sourceTree:c.sourceTree,
    baseCommit:c.baseCommit,sourcePlanSha256:c.sourcePlanSha256,targetRunId:c.runId,targetRunAttempt:1},Date.parse(c.createdAt));
  return {reads:c.hardReadCap,diagnostics:4,priorReads:0,priorWrites:0,priorDiagnostics:0};
}
function readJson(path: string, maximum = 60_000): any {
  const stat = lstatSync(path); check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum, 'file type/size');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function readPlan(directory: string, digest: string) {
  const path = resolve(directory, 'plan.json'); const stat = lstatSync(path);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 512 * 1024 && sha(readFileSync(path)) === digest, 'source plan digest');
  const plan = readJson(path, 512 * 1024), selected=selectReleaseProofPolicy(process.cwd()), actual=selected.classification;
  requireSameReleasePolicy(selected,plan.releasePolicy);
  check(plan.schemaVersion === 'theologai-application-corpus-source-plan.v1' && JSON.stringify(plan.classification) === JSON.stringify(actual), 'source plan identity');
  check(plan.integrityCommands === 4 && integer(plan.readBudget) && (selected.id==='norton-aquinas.v1'?plan.readBudget===selected.reservedReads:plan.readBudget<=selected.reservedReads), 'complete planned budget');
  return plan;
}
export function requireOperatorChallenge(input: unknown, now = Date.now()): OperatorChallenge {
  const c = object(input), selected=policyForIdentity(c.releasePolicy), corpus=selected.id==='norton-aquinas.v1'; const keys = [...(Object.hasOwn(c,'accountReadCeiling')||Object.hasOwn(c,'accountReadCeilingDay')?['accountReadCeiling','accountReadCeilingDay']:[]),...(corpus?['liveControlReserve','releasePolicy']:[]),'schemaVersion','authorization','role','authorizationId','repository','ownerActorId','sourceCommit','sourceTree','sourcePlanSha256','runId','runAttempt','workflowPath','eventName','ref','baseCommit','nonce','createdAt','expiresAt','reservedReads','hardReadCap','diagnosticCommands','admission'];
  check(Object.keys(c).sort().join(',') === keys.sort().join(','), 'challenge shape');
  check(c.schemaVersion === 'theologai-operator-corpus-challenge.v2' && ['preview','production'].includes(c.role), 'challenge version/role');
  const preview = c.role === 'preview';
  check(c.repository === OPERATOR_PROOF.repository && c.ownerActorId === OPERATOR_PROOF.ownerActorId, 'repository/owner');
  check(hex(c.sourceCommit,40) && hex(c.sourceTree,40) && hex(c.baseCommit,40) && hex(c.sourcePlanSha256,64) && hex(c.nonce,64), 'challenge hashes');
  check(typeof c.runId === 'string' && /^[1-9][0-9]{0,15}$/.test(c.runId) && c.runAttempt === 1, 'single run attempt');
  const authorization=authority.requirePackage(c.authorization,{role:c.role,sourceCommit:c.sourceCommit,sourceTree:c.sourceTree,baseCommit:c.baseCommit,sourcePlanSha256:c.sourcePlanSha256,targetRunId:c.runId,targetRunAttempt:1},now).authorization;
  requireSameReleasePolicy(selected,authorization.releasePolicy);
  check(c.accountReadCeiling===authorization.accountReadCeiling&&c.accountReadCeilingDay===authorization.accountReadCeilingDay,'owner-bound account ceiling');
  check(c.authorizationId === authorization.authorizationId, 'authorization identity');
  check(c.workflowPath === (preview ? '.github/workflows/pr.yml' : '.github/workflows/deploy.yml')
    && c.eventName === (preview ? 'pull_request' : 'workflow_dispatch')
    && c.ref === (preview ? `refs/pull/${authorization.pullRequestNumber}/merge` : 'refs/heads/main'), 'existing protected route');
  check((!corpus || c.liveControlReserve===authorization.liveControlReserve) && c.reservedReads===selected.reservedReads && c.hardReadCap===selected.hardReadCap && c.diagnosticCommands === 4, 'authorization budget');
  const start = Date.parse(c.createdAt), end = Date.parse(c.expiresAt);
  check(Number.isFinite(start) && Number.isFinite(end) && start <= now + 30_000 && end > now && end - start === 5_400_000
    && end < Date.parse(new Date(start).toISOString().slice(0,10) + 'T00:00:00Z') + 86_400_000, 'fresh single-UTC-day window');
  check(start>=Date.parse(authorization.notBefore) && end<=Date.parse(authorization.expiresAt),'authorized proof window');
  const a=object(c.admission);
  check(a.accountId===ACCOUNT && a.role===c.role && a.day===c.createdAt.slice(0,10) && a.sampleInterval===1
    && integer(a.rowsRead) && integer(a.rowsWritten) && a.readBudget===c.reservedReads && (!corpus || a.liveControlReserve===c.liveControlReserve)
    && a.accountReadCeiling===c.accountReadCeiling&&a.accountReadCeilingDay===c.accountReadCeilingDay
    && Number.isFinite(Date.parse(a.observedAt)) && Math.abs(Date.parse(a.observedAt)-start)<=50_000 && (!corpus || Math.abs(Date.parse(a.inventoryObservedAt)-start)<=50_000) && Array.isArray(a.controls), 'protected quota admission');
  return c as OperatorChallenge;
}
export function createOperatorChallenge(role: 'preview' | 'production', classification: {sourceCommit:string;sourceTree:string;releasePolicy?:string;applicationOnly?:boolean}, planSha256: string, env = process.env, now = Date.now(), admission?: ProtectedCorpusAdmission, authorization?: any): OperatorChallenge {
  check(env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY === OPERATOR_PROOF.repository && env.GITHUB_RUN_ATTEMPT === '1', 'protected CI context');
  const selected=policyForClassification(classification);
  requireSameReleasePolicy(selected,authorization?.authorization?.releasePolicy);
  const grant=authority.requirePackage(authorization,{},now).authorization;
  const c = { ...(grant.accountReadCeiling?{accountReadCeiling:grant.accountReadCeiling,accountReadCeilingDay:grant.accountReadCeilingDay}:{}),...(selected.id==='norton-aquinas.v1'?{liveControlReserve:grant.liveControlReserve,releasePolicy:selected.id}:{}), schemaVersion: 'theologai-operator-corpus-challenge.v2', authorization, role,
    authorizationId: authority.requirePackage(authorization,{},now).authorization.authorizationId,
    repository: OPERATOR_PROOF.repository, ownerActorId: OPERATOR_PROOF.ownerActorId, sourceCommit:classification.sourceCommit,sourceTree:classification.sourceTree,
    sourcePlanSha256: planSha256, runId: env.GITHUB_RUN_ID, runAttempt: 1,
    workflowPath: role === 'preview' ? '.github/workflows/pr.yml' : '.github/workflows/deploy.yml',
    eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, baseCommit: env.OPERATOR_BASE_COMMIT,
    nonce: randomBytes(32).toString('hex'), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 5_400_000).toISOString(),
    reservedReads: selected.reservedReads, hardReadCap: selected.hardReadCap, diagnosticCommands: 4, admission };
  return requireOperatorChallenge(c, now);
}
export function boundPreviewBudgetForChallenge(c:OperatorChallenge){requireOperatorChallenge(c);return c.authorization.authorization.boundPreview?{package:c.authorization,sourceCommit:c.sourceCommit,sourceTree:c.sourceTree,runId:c.runId}:undefined;}
export function productionBudgetForChallenge(c:OperatorChallenge){requireOperatorChallenge(c);return c.accountReadCeiling?{package:c.authorization,sourceCommit:c.sourceCommit,sourceTree:c.sourceTree,runId:c.runId}:undefined;}
export function operatorApproval(c: OperatorChallenge) {
  const selected=policyForIdentity(c.releasePolicy);
  return { ...(selected.id==='norton-aquinas.v1'?{liveControlReserve:c.liveControlReserve,expectedLedgerSha256:c.authorization.authorization.expectedLedgerSha256,releasePolicy:selected.id}:{}), schemaVersion: 'theologai-fresh-corpus-proof-approval.v1', role: c.role, accountId: ACCOUNT,
    databaseId: policyForIdentity(c.releasePolicy).module.TARGETS[c.role].databaseId, sourceCommit: c.sourceCommit, sourceTree: c.sourceTree,
    expiresAt: c.expiresAt, maxReads: c.hardReadCap, integrityCommands: 4, exclusiveDataWritesDuringProof: true };
}
export function verifyOperatorEnvelope(input: unknown, expectedChallenge: unknown, plan: any, now = Date.now()) {
  const c = requireOperatorChallenge(expectedChallenge, now); const e = object(input);
  check(plan.classification?.sourceCommit === c.sourceCommit && plan.classification?.sourceTree === c.sourceTree
    && integer(plan.readBudget) && plan.readBudget <= c.reservedReads && plan.integrityCommands === 4, 'complete source plan');
  check(Object.keys(e).sort().join(',') === ['schemaVersion','challenge','receipt','journalSha256','budget'].sort().join(',')
    && e.schemaVersion === 'theologai-operator-corpus-envelope.v1', 'envelope shape');
  check(JSON.stringify(e.challenge) === JSON.stringify(c) && hex(e.journalSha256,64), 'challenge/nonce binding');
  const receipt = object(e.receipt);
  const selected=policyForIdentity(c.releasePolicy);requireSameReleasePolicy(selected,plan.classification?.releasePolicy);requireSameReleasePolicy(selected,plan.releasePolicy);requireSameReleasePolicy(selected,receipt.releasePolicy);
  selected.module.verifyFreshCorpusReceipt(receipt, { role:c.role, sourceCommit:c.sourceCommit, sourceTree:c.sourceTree,
    sourcePlanSha256:c.sourcePlanSha256, tables:plan.expected.digests,foreignKeyWitnessSha256:plan.expected.foreignKeyWitnessSha256 }, now);
  if(c.releasePolicy==='norton-aquinas.v1')check(JSON.stringify(receipt.controls)===JSON.stringify(c.admission.controls),'complete proof controls differ from challenge');
  if(c.releasePolicy==='norton-aquinas.v1')check(receipt.proof?.ledgerSha256===c.authorization.authorization.expectedLedgerSha256,'approved original migration ledger witness');
  check(Date.parse(receipt.startedAt) >= Date.parse(c.createdAt) && Date.parse(receipt.completedAt) <= Date.parse(c.expiresAt)
    && receipt.approvalSha256 === sha(JSON.stringify(operatorApproval(c))) && receipt.readBudget === plan.readBudget, 'approval/window/plan');
  const b = object(e.budget);
  const cumulative = cumulativeAllowance(c);
  check(Object.keys(b).sort().join(',') === ['authorizationId','previousReadsSpentOrReserved','previousWritesSpentOrReserved','previousDiagnosticCommands','cumulativeReadsSpentOrReserved','cumulativeWritesSpentOrReserved','cumulativeDiagnosticCommands'].sort().join(',')
    && b.authorizationId === c.authorizationId, 'budget identity');
  check([b.previousReadsSpentOrReserved,b.previousWritesSpentOrReserved,b.previousDiagnosticCommands,b.cumulativeReadsSpentOrReserved,b.cumulativeWritesSpentOrReserved,b.cumulativeDiagnosticCommands].every(integer), 'budget counters');
  check(b.cumulativeReadsSpentOrReserved === b.previousReadsSpentOrReserved + receipt.metering.rowsRead
    && b.previousReadsSpentOrReserved === cumulative.priorReads && b.previousWritesSpentOrReserved === cumulative.priorWrites
    && b.previousDiagnosticCommands === cumulative.priorDiagnostics
    && b.previousReadsSpentOrReserved + plan.readBudget <= cumulative.reads
    && b.cumulativeReadsSpentOrReserved <= cumulative.reads
    && b.previousWritesSpentOrReserved + 4 <= cumulative.diagnostics
    && b.cumulativeWritesSpentOrReserved === b.previousWritesSpentOrReserved + receipt.metering.rowsWritten
    && b.cumulativeWritesSpentOrReserved <= cumulative.diagnostics
    && b.cumulativeDiagnosticCommands === b.previousDiagnosticCommands + receipt.metering.integrityCommands
    && b.cumulativeDiagnosticCommands <= cumulative.diagnostics, 'cumulative authorization');
  return e;
}

function integrityQueries(): ProofQuery[] {
  return ALL_FTS.map(table=>({kind:'fts-integrity',label:`fts:${table}`,sql:`INSERT INTO "${table}"("${table}",rank) VALUES('integrity-check',1)`,readCeiling:4096,writeCeiling:1}));
}
export function verifyOperatorIntegrity(input: unknown, c: OperatorChallenge, now=Date.now()) {
  requireOperatorChallenge(c,now); const e=object(input), r=object(e.receipt), m=object(r.metering), b=object(e.budget);
  const cumulative=cumulativeAllowance(c);
  check(e.schemaVersion==='theologai-operator-corpus-envelope.v1' && JSON.stringify(e.challenge)===JSON.stringify(c) && hex(e.journalSha256,64), 'integrity envelope binding');
  check(r.schemaVersion==='theologai-operator-fts-proof.v1' && r.role===c.role && r.accountId===ACCOUNT && r.databaseId===policyForIdentity(c.releasePolicy).module.TARGETS[c.role].databaseId
    && r.sourceCommit===c.sourceCommit && r.sourceTree===c.sourceTree && r.sourcePlanSha256===c.sourcePlanSha256, 'integrity source target');
  check(Date.parse(r.startedAt)>=Date.parse(c.createdAt) && Date.parse(r.completedAt)>=Date.parse(r.startedAt)
    && Date.parse(r.completedAt)<=now+30_000 && Date.parse(r.completedAt)<=(c.releasePolicy==='norton-aquinas.v1'?Math.min(Date.parse(c.admission.observedAt),Date.parse(c.admission.inventoryObservedAt ?? '')):Date.parse(c.admission.observedAt))+50_000
    && r.controlsUnchanged===true && JSON.stringify(r.controls)===JSON.stringify(c.admission.controls), 'integrity window controls');
  check(Array.isArray(r.results) && r.results.length===4, 'four integrity results');
  for(const [i,q] of integrityQueries().entries()) { const result=object(r.results[i]);
    check(result.label===q.label && result.sqlSha256===sha(q.sql) && integer(result.rowsRead) && result.rowsRead<=4096
      && integer(result.rowsWritten) && result.rowsWritten<=1, 'exact integrity command result'); }
  check(m.requests===4 && m.integrityCommands===4 && m.retries===0 && m.unknownAttempts===0
    && m.rowsRead===r.results.reduce((n:number,v:any)=>n+v.rowsRead,0) && m.rowsWritten===r.results.reduce((n:number,v:any)=>n+v.rowsWritten,0), 'integrity metering');
  check(b.authorizationId===c.authorizationId && [b.previousReadsSpentOrReserved,b.previousWritesSpentOrReserved,b.previousDiagnosticCommands].every(integer)
    && b.previousReadsSpentOrReserved===cumulative.priorReads && b.previousWritesSpentOrReserved===cumulative.priorWrites && b.previousDiagnosticCommands===cumulative.priorDiagnostics
    && b.previousReadsSpentOrReserved+c.reservedReads<=cumulative.reads
    && b.previousWritesSpentOrReserved+4<=cumulative.diagnostics && b.previousDiagnosticCommands+4<=cumulative.diagnostics
    && b.cumulativeReadsSpentOrReserved===b.previousReadsSpentOrReserved+m.rowsRead
    && b.cumulativeReadsSpentOrReserved<=cumulative.reads
    && b.cumulativeWritesSpentOrReserved===b.previousWritesSpentOrReserved+m.rowsWritten && b.cumulativeWritesSpentOrReserved<=cumulative.diagnostics
    && b.cumulativeDiagnosticCommands===b.previousDiagnosticCommands+4 && b.cumulativeDiagnosticCommands<=cumulative.diagnostics, 'integrity cumulative budget');
  return e;
}
/** Existing read token executes every read; only four owner-authenticated results replace writes. */
export function composeReadProof(reader: Pick<CorpusProofTransport,'start'|'execute'|'finish'|'metering'> & Partial<Pick<CorpusProofTransport,'protectedAdmission'>>, integrity: any, guard:()=>void, expectedControls?: unknown) {
  const meter={...integrity.receipt.metering}; let consumed=0;
  const update=()=>{for(const key of Object.keys(meter)) meter[key]=reader.metering[key as keyof typeof reader.metering]+integrity.receipt.metering[key];};
  return {metering:meter,start:async()=>{guard();await reader.start();if(expectedControls!==undefined)check(reader.protectedAdmission && JSON.stringify(reader.protectedAdmission().controls)===JSON.stringify(expectedControls),'controls changed before complete read SQL');},execute:async(q:ProofQuery)=>{
    guard();
    if(q.kind==='fts-integrity') { const expected=integrityQueries()[consumed++]; check(expected && JSON.stringify(q)===JSON.stringify(expected),'integrity consumption'); return []; }
    try {return await reader.execute(q);} finally {update();}
  },finish:async()=>{check(consumed===4,'complete integrity consumption'); const result=await reader.finish();
    check(JSON.stringify(result.controls)===JSON.stringify(integrity.receipt.controls),'integrity read controls changed');return result;}};
}

/** Only the read-only metadata tail may be retried, once; never a SQL command. */
export async function finishOperatorMetadata<T>(finish: () => Promise<T>, onRetry: () => Promise<void>): Promise<T> {
  try { return await finish(); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'Corpus transport refused: analytics errors') throw error;
    await onRetry(); return finish();
  }
}

export function admitOperatorBudget(ledger: any, c: OperatorChallenge, plannedReads: number): void {
  const cumulative=cumulativeAllowance(c);
  if(c.authorization.authorization.boundPreview)check(JSON.stringify(ledger.cumulativeTask)===JSON.stringify(c.authorization.authorization.cumulativeTask),'retained cumulative task reservations');
  check(ledger.schemaVersion === 'theologai-operator-proof-budget.v1' && ledger.authorizationId === c.authorizationId
    && integer(ledger.readsSpentOrReserved) && integer(ledger.writesSpentOrReserved) && integer(ledger.diagnosticCommands) && Array.isArray(ledger.attempts)
    && ledger.ledgerId === c.authorization.authorization.ledgerId && ledger.authorizationSha256 === sha(JSON.stringify(c.authorization))
    && ledger.attempts.length === 0 && ledger.consumed === false, 'ledger identity/replay/incomplete attempt');
  check(integer(plannedReads) && (c.releasePolicy==='norton-aquinas.v1'?plannedReads===c.reservedReads:plannedReads<=c.reservedReads) && plannedReads<=c.hardReadCap
    && ledger.readsSpentOrReserved===cumulative.priorReads && ledger.writesSpentOrReserved===cumulative.priorWrites && ledger.diagnosticCommands===cumulative.priorDiagnostics
    && ledger.readsSpentOrReserved + plannedReads <= cumulative.reads && ledger.diagnosticCommands + 4 <= cumulative.diagnostics
    && ledger.writesSpentOrReserved + 4 <= cumulative.diagnostics, 'remaining cumulative budget');
}
export function spentOperatorBudget(metering: CorpusProofTransport['metering'], events: Record<string,any>[]) {
  const results=events.filter(e=>e.kind==='result'); const intents=events.filter(e=>e.kind==='intent');
  const unmatched=intents.slice(results.length);
  return {readsSpentOrReserved:Math.max(metering.rowsRead,results.reduce((n,e)=>n+e.rowsRead,0)+unmatched.reduce((n,e)=>n+e.readCeiling,0)),
    writesSpentOrReserved:Math.max(metering.rowsWritten,results.reduce((n,e)=>n+e.rowsWritten,0)+unmatched.reduce((n,e)=>n+e.writeCeiling,0)),
    diagnosticCommands:metering.integrityCommands};
}

/** Retry only transient read-only GitHub responses; never repeat SQL or a mutation. */
function liveMetadataArguments(repository:string,path:string):string[] {
  check(repository===OPERATOR_PROOF.repository && /^\/(?:actions\/runs\/[1-9][0-9]{0,15}(?:\/jobs\?per_page=100)?|pulls\/[1-9][0-9]{0,15}|actions\/artifacts(?:\/[1-9][0-9]{0,15}|\?name=operator-ledger-operation-[a-z0-9-]{8,80}&per_page=100)|git\/ref\/heads\/main)$/.test(path),'live metadata GET route');
  return ['api',`repos/${repository}${path}`,'--method','GET'];
}
function metadataStatus(error:unknown):number {
  const stderr=error && typeof error==='object' && 'stderr' in error ? String(error.stderr) : '';
  return Number(stderr.match(/\(HTTP ([0-9]{3})\)/)?.[1]);
}
export function readLiveOperatorMetadata(repository: string, path: string,
  invoke: (args: string[]) => string = args => execFileSync('gh',args,{encoding:'utf8',maxBuffer:2*1024*1024,timeout:15_000,stdio:['ignore','pipe','pipe']}),
  pause: (milliseconds: number) => void = milliseconds => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,milliseconds); }) {
  const args=liveMetadataArguments(repository,path);
  for(let attempt=0;attempt<2;attempt++) {
    let text: string;
    try { text=invoke(args); }
    catch(error) {
      const status=metadataStatus(error);
      if(attempt===0 && [502,503,504].includes(status)) { process.stderr.write(`Operator metadata GET transient HTTP ${status}; retrying once before SQL.\n`);pause(250);continue; }
      if(Number.isInteger(status)&&status>=100&&status<=599)throw Error('Operator corpus proof refused: live GitHub metadata HTTP '+status);
      throw error;
    }
    return JSON.parse(text);
  }
  throw Error('Operator corpus proof refused: live GitHub metadata unavailable');
}

const execFileAsync=promisify(execFile);
export async function readLiveOperatorMetadataAsync(repository:string,path:string,
  invoke:(args:string[])=>Promise<string>=async args=>(await execFileAsync('gh',args,{encoding:'utf8',maxBuffer:2*1024*1024,timeout:15_000})).stdout,
  pause:(milliseconds:number)=>Promise<void>=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds))) {
  const args=liveMetadataArguments(repository,path);
  for(let attempt=0;attempt<2;attempt++) {
    let text:string;
    try{text=await invoke(args);}catch(error){
      const status=metadataStatus(error);
      if(attempt===0 && [502,503,504].includes(status)){
        process.stderr.write(`Operator metadata GET transient HTTP ${status}; retrying once before SQL.\n`);await pause(250);continue;
      }
      if(Number.isInteger(status)&&status>=100&&status<=599)throw Error('Operator corpus proof refused: live GitHub metadata HTTP '+status);
      throw error;
    }
    return JSON.parse(text);
  }
  throw Error('Operator corpus proof refused: live GitHub metadata unavailable');
}

function requireAuthenticatedLedgerMarker(p:OperatorChallenge['authorization'],markers:any) {
  check(Array.isArray(markers) && markers.length===1,'unique authenticated ledger marker');
  const marker=markers[0],v=p.provenance;
  check(!marker.expired && Date.parse(marker.expires_at)>Date.now()+60000 && marker.workflow_run?.id===Number(v.runId)
    && marker.workflow_run.head_sha===p.authorization.sourceCommit && /^[1-9][0-9]{0,15}$/.test(String(marker.id))
    && /^sha256:[0-9a-f]{64}$/.test(marker.digest),'authenticated ledger marker provenance');
  return marker;
}

/** Bind supplied authorization to native archive bytes BEFORE any local diagnostic. */
export function authenticateLiveOperatorPackage(p: OperatorChallenge['authorization'],
  get: (path:string)=>any = path=>readLiveOperatorMetadata(p.authorization.repository,path),
  archive: (artifactId:string)=>Buffer = artifactId=>execFileSync('gh',['api',`repos/${p.authorization.repository}/actions/artifacts/${artifactId}/zip`,'--method','GET'],
    {maxBuffer:128*1024,timeout:15_000,stdio:['ignore','pipe','pipe']})) {
  authority.requirePackage(p);
  const v=p.provenance;
  authority.requireProvenance(p,get('/actions/runs/'+v.runId),get('/actions/artifacts/'+v.artifactId));
  check(JSON.stringify(authority.readArchive(archive(v.artifactId),v.digest))===JSON.stringify(p.authorization),'authenticated authorization archive content');
  const markers=get('/actions/artifacts?name=operator-ledger-'+p.authorization.ledgerId+'&per_page=100').artifacts;
  const marker=requireAuthenticatedLedgerMarker(p,markers);
  check(JSON.stringify(authority.readArchive(archive(String(marker.id)),marker.digest))===JSON.stringify(p.authorization),'authenticated ledger marker content');
  authority.requirePackage(p);
}
export function authenticateLiveOperatorAuthorization(c: OperatorChallenge,get?: (path:string)=>any,archive?: (artifactId:string)=>Buffer) {
  requireOperatorChallenge(c);authenticateLiveOperatorPackage(c.authorization,get,archive);requireOperatorChallenge(c);
}

/** This checks fresh server-authored GitHub state, including after a transient GET retry. */
export function requireLiveOperatorGate(c: OperatorChallenge,
  get:(path:string)=>any=path=>readLiveOperatorMetadata(c.repository,path),
  archive?:(artifactId:string)=>Buffer): void {
  requireOperatorChallenge(c);
  authenticateLiveOperatorAuthorization(c,get,archive);
  const run = get('/actions/runs/' + c.runId);
  check(run.head_sha === c.sourceCommit && run.run_attempt === 1 && run.path === c.workflowPath && run.event === c.eventName
    && run.status !== 'completed', 'live protected run');
  const name = c.role === 'preview' ? 'Preview operator corpus verification' : 'Test, Build & Deploy';
  const jobs = get('/actions/runs/' + c.runId + '/jobs?per_page=100').jobs.filter((j: any) => j.name === name);
  check(jobs.length === 1 && jobs[0].status === 'in_progress', 'live approved protected job');
  if (c.role === 'preview') {
    const pr = get('/pulls/'+c.authorization.authorization.pullRequestNumber);
    check(pr.state === 'open' && !pr.draft && pr.head.sha === c.sourceCommit && pr.base.sha === c.baseCommit
      && pr.base.ref === 'main' && pr.head.ref === c.authorization.authorization.headBranch && get('/git/ref/heads/main').object.sha === c.baseCommit
      && pr.head.repo.full_name === c.repository && pr.labels.some((l:any) => l.name === 'deploy-preview'), 'live PR authorization');
  } else check(get('/git/ref/heads/main').object.sha === c.sourceCommit, 'live production main');
  requireOperatorChallenge(c);
}

/** Fresh evidence for this gate only: independent metadata, then validated archive IDs. */
export async function requireLiveOperatorGateParallel(c:OperatorChallenge,
  get:(path:string)=>Promise<any>=path=>readLiveOperatorMetadataAsync(c.repository,path),
  archive:(id:string)=>Promise<Buffer>=async id=>(await execFileAsync('gh',['api',`repos/${c.repository}/actions/artifacts/${id}/zip`,'--method','GET'],
    {encoding:'buffer',maxBuffer:128*1024,timeout:15_000})).stdout) {
  requireOperatorChallenge(c);
  const p=c.authorization,v=p.provenance;
  const markerPath='/actions/artifacts?name=operator-ledger-'+p.authorization.ledgerId+'&per_page=100';
  const paths=['/actions/runs/'+v.runId,'/actions/artifacts/'+v.artifactId,markerPath,
    '/actions/runs/'+c.runId,'/actions/runs/'+c.runId+'/jobs?per_page=100',
    ...(c.role==='preview'?['/pulls/'+p.authorization.pullRequestNumber]:[]),'/git/ref/heads/main'];
  const settled=await Promise.allSettled(paths.map(path=>get(path)));
  for(const result of settled)if(result.status==='rejected')throw result.reason;
  const metadata=new Map(paths.map((path,index)=>[path,(settled[index] as PromiseFulfilledResult<any>).value]));
  authority.requireProvenance(p,metadata.get(paths[0]!),metadata.get(paths[1]!));
  const marker=requireAuthenticatedLedgerMarker(p,metadata.get(markerPath)?.artifacts);
  // Neither archive is fetched until its server-authored identity/provenance is checked.
  const ids=[v.artifactId,String(marker.id)];
  const archives=await Promise.allSettled(ids.map(id=>archive(id)));
  for(const result of archives)if(result.status==='rejected')throw result.reason;
  const bytes=new Map(ids.map((id,index)=>[id,(archives[index] as PromiseFulfilledResult<Buffer>).value]));
  requireLiveOperatorGate(c,path=>{check(metadata.has(path),'complete live gate metadata');return metadata.get(path);},
    id=>{check(bytes.has(id),'complete live gate archives');return bytes.get(id)!;});
}

export async function runOperatorProof(input: { challenge:OperatorChallenge; directory:string; planSha256:string; output:string; ledger:string; token:string }) {
  const c = requireOperatorChallenge(input.challenge); const plan = readPlan(input.directory,input.planSha256);requireSameReleasePolicy(policyForClassification(plan.classification),c.releasePolicy);
  check(plan.classification.sourceCommit === c.sourceCommit && plan.classification.sourceTree === c.sourceTree && input.planSha256 === c.sourcePlanSha256, 'operator source');
  // A local approval file is required in addition to the live protected gate.
  check(process.env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON && JSON.stringify(JSON.parse(process.env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON)) === JSON.stringify(operatorApproval(c)), 'explicit operator approval');
  for (const path of [input.output,input.output+'.receipt.json',input.output+'.receipt.json.events.jsonl']) {
    check(!existsSync(path), 'fresh output paths required');
  }
  await requireLiveOperatorGateParallel(c);
  const lock = openSync(input.ledger + '.lock','wx',0o600);
  let ledger:any;
  const save = () => { const temp = input.ledger + '.pending'; writeFileSync(temp,JSON.stringify(ledger,null,2)+'\n',{mode:0o600,flush:true}); renameSync(temp,input.ledger); };
  let transport: CorpusProofTransport | undefined;
  try {
    check(existsSync(input.ledger),'persistent ledger required');
    ledger = readJson(input.ledger,1024*1024);
    admitOperatorBudget(ledger,c,plan.readBudget);
    const previousReads = ledger.readsSpentOrReserved, previousWrites=ledger.writesSpentOrReserved, previousCommands = ledger.diagnosticCommands;
    const attempt = {nonce:c.nonce,sourceCommit:c.sourceCommit,runId:c.runId,startedAt:new Date().toISOString(),status:'RUNNING',readsSpentOrReserved:0,writesSpentOrReserved:0,diagnosticCommands:0};
    ledger.consumed=true; ledger.outstandingReservation={reads:c.reservedReads,liveControlReads:c.liveControlReserve,writes:4,diagnosticCommands:4,includesProtectedReader:true};
    ledger.attempts.push(attempt); save();
    try {
      transport = new CorpusProofTransport({policy:policyForIdentity(c.releasePolicy).id,role:c.role,token:input.token,readBudget:16_384,eventFile:input.output+'.receipt.json.events.jsonl',
        previewQuotaBuffer:false,historicalExceptions:false,boundPreviewAuthorization:boundPreviewBudgetForChallenge(c),productionAuthorization:productionBudgetForChallenge(c)});
      const startedAt=new Date().toISOString(); await transport.startIntegrity(c.admission);
      const results=[];
      for(const q of integrityQueries()) {
        requireOperatorChallenge(c); await requireLiveOperatorGateParallel(c);
        const before={...transport.metering}; const rows=await transport.execute(q);check(rows.length===0,'integrity response');
        results.push({label:q.label,sqlSha256:sha(q.sql),rowsRead:transport.metering.rowsRead-before.rowsRead,rowsWritten:transport.metering.rowsWritten-before.rowsWritten});
      }
      const controls=await transport.finish(); await requireLiveOperatorGateParallel(c);
      const receipt={schemaVersion:'theologai-operator-fts-proof.v1',role:c.role,accountId:ACCOUNT,databaseId:policyForIdentity(c.releasePolicy).module.TARGETS[c.role].databaseId,
        sourceCommit:c.sourceCommit,sourceTree:c.sourceTree,sourcePlanSha256:c.sourcePlanSha256,startedAt,completedAt:new Date().toISOString(),...controls,results,metering:{...transport.metering}};
      const envelope={schemaVersion:'theologai-operator-corpus-envelope.v1',challenge:c,receipt,
        journalSha256:sha(readFileSync(input.output+'.receipt.json.events.jsonl')),budget:{authorizationId:c.authorizationId,
          previousReadsSpentOrReserved:previousReads,previousWritesSpentOrReserved:previousWrites,previousDiagnosticCommands:previousCommands,
          cumulativeReadsSpentOrReserved:previousReads+receipt.metering.rowsRead,cumulativeWritesSpentOrReserved:previousWrites+receipt.metering.rowsWritten,cumulativeDiagnosticCommands:previousCommands+receipt.metering.integrityCommands}};
      verifyOperatorIntegrity(envelope,c);
      writeFileSync(input.output,JSON.stringify(envelope,null,2)+'\n',{flag:'wx',mode:0o600}); attempt.status='INTEGRITY_PASSED_AWAITING_CI';
      return envelope;
    } finally {
      if (transport) {
        const events = readFileSync(input.output+'.receipt.json.events.jsonl','utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
        Object.assign(attempt,spentOperatorBudget(transport.metering,events));
      }
      if (attempt.status==='RUNNING') attempt.status='FAILED_OR_AMBIGUOUS';
      ledger.readsSpentOrReserved=previousReads+attempt.readsSpentOrReserved; ledger.writesSpentOrReserved=previousWrites+attempt.writesSpentOrReserved; ledger.diagnosticCommands=previousCommands+attempt.diagnosticCommands; save();
    }
  } finally { closeSync(lock); unlinkSync(input.ledger+'.lock'); }
}

async function main() {
  const [command,...args] = process.argv.slice(2);
  if(command==='init-ledger') {
    check(args.length===2,'ledger initialization arguments');
    const c=requireOperatorChallenge(readJson(args[0]!));await requireLiveOperatorGateParallel(c);
    writeFileSync(args[1]!,JSON.stringify({schemaVersion:'theologai-operator-proof-budget.v1',authorizationId:c.authorizationId,
      ...(c.authorization.authorization.boundPreview?{cumulativeTask:c.authorization.authorization.cumulativeTask}:{}),ledgerId:c.authorization.authorization.ledgerId,authorizationSha256:sha(JSON.stringify(c.authorization)),consumed:false,
      readsSpentOrReserved:0,writesSpentOrReserved:0,diagnosticCommands:0,attempts:[]},null,2)+'\n',{flag:'wx',mode:0o600});return;
  }
  if (command==='challenge') {
    check(args.length===4 && ['preview','production'].includes(args[0]!), 'challenge arguments');
    const [role,directory,digest,output]=args; const p=readPlan(directory!,digest!);
    const authorization=authority.requirePackage(readJson(resolve(process.env.RUNNER_TEMP!,'operator-authorization.json')),
      {role,sourceCommit:p.classification.sourceCommit,sourceTree:p.classification.sourceTree,sourcePlanSha256:digest,targetRunId:process.env.GITHUB_RUN_ID,targetRunAttempt:1});
    check(Date.parse(authorization.authorization.expiresAt)>=Date.now()+5_400_000,'whole authorized window');
    const auth=authorization.authorization;requireSameReleasePolicy(policyForClassification(p.classification),auth.releasePolicy);
    check(process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_REPOSITORY===OPERATOR_PROOF.repository
      && process.env.GITHUB_RUN_ATTEMPT==='1' && process.env.OPERATOR_BASE_COMMIT===auth.baseCommit
      && process.env.GITHUB_EVENT_NAME===(role==='preview'?'pull_request':'workflow_dispatch')
      && process.env.GITHUB_REF===(role==='preview'?`refs/pull/${auth.pullRequestNumber}/merge`:'refs/heads/main'),'protected challenge source');
    authenticateLiveOperatorPackage(authorization);
    check(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT && process.env.CLOUDFLARE_API_TOKEN,'existing read-only deployment credential');
    const transport=new CorpusProofTransport({policy:policyForClassification(p.classification).id,role:role as 'preview'|'production',token:process.env.CLOUDFLARE_API_TOKEN!,readBudget:p.readBudget,eventFile:output!+'.admission.jsonl',
      previewQuotaBuffer:false,historicalExceptions:false,boundPreviewAuthorization:auth.boundPreview?{package:authorization,sourceCommit:p.classification.sourceCommit,sourceTree:p.classification.sourceTree,runId:process.env.GITHUB_RUN_ID!}:undefined,productionAuthorization:auth.accountReadCeiling?{package:authorization,sourceCommit:p.classification.sourceCommit,sourceTree:p.classification.sourceTree,runId:process.env.GITHUB_RUN_ID!}:undefined});
    await transport.start();
    const c=createOperatorChallenge(role as 'preview'|'production',{sourceCommit:p.classification.sourceCommit,sourceTree:p.classification.sourceTree,...(p.classification.releasePolicy?{releasePolicy:p.classification.releasePolicy,applicationOnly:false}:{})},digest!,process.env,Date.now(),transport.protectedAdmission(),authorization);
    writeFileSync(output!,JSON.stringify(c,null,2)+'\n',{flag:'wx',mode:0o600}); return;
  }
  if(command==='complete') {
    check(args.length===5,'complete arguments'); const [challengeFile,integrityFile,directory,digest,output]=args;
    const c=requireOperatorChallenge(readJson(challengeFile!)); const p=readPlan(directory!,digest!);requireSameReleasePolicy(policyForClassification(p.classification),c.releasePolicy);
    const admitted=authority.requirePackage(readJson(resolve(process.env.RUNNER_TEMP!,'operator-authorization.json')));
    check(JSON.stringify(admitted)===JSON.stringify(c.authorization),'independently admitted authorization');
    check(p.classification.sourceCommit===c.sourceCommit && p.classification.sourceTree===c.sourceTree && digest===c.sourcePlanSha256
      && process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_RUN_ID===c.runId && process.env.GITHUB_RUN_ATTEMPT==='1','complete protected source');
    const integrity=verifyOperatorIntegrity(readJson(integrityFile!),c);
    check(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT && process.env.CLOUDFLARE_API_TOKEN,'existing read-only deployment credential');
    const reader=new CorpusProofTransport({policy:policyForIdentity(c.releasePolicy).id,role:c.role,token:process.env.CLOUDFLARE_API_TOKEN!,readBudget:p.readBudget-integrity.receipt.metering.rowsRead,knownRowsRead:c.admission.rowsRead+integrity.receipt.metering.rowsRead,eventFile:output!+'.events.jsonl',
      previewQuotaBuffer:false,historicalExceptions:false,boundPreviewAuthorization:boundPreviewBudgetForChallenge(c),productionAuthorization:productionBudgetForChallenge(c)});
    let lastGuard=0; const transport=composeReadProof(reader,integrity,()=>{requireOperatorChallenge(c);if(Date.now()-lastGuard>30_000){requireLiveOperatorGate(c);lastGuard=Date.now();}},c.admission.controls);
    try {
      const receipt=await runFreshApplicationCorpusCheck({root:process.cwd(),role:c.role,directory:directory!,planSha256:digest!,output:output!,approval:operatorApproval(c),token:process.env.CLOUDFLARE_API_TOKEN!,transport});
      Object.assign(receipt,{startedAt:integrity.receipt.startedAt,operatorIntegritySha256:sha(readFileSync(integrityFile!))});
      const b=integrity.budget;
      const envelope={schemaVersion:'theologai-operator-corpus-envelope.v1',challenge:c,receipt,journalSha256:sha(readFileSync(output!+'.events.jsonl')),
        budget:{...b,cumulativeReadsSpentOrReserved:b.previousReadsSpentOrReserved+receipt.metering.rowsRead,cumulativeWritesSpentOrReserved:b.previousWritesSpentOrReserved+receipt.metering.rowsWritten,cumulativeDiagnosticCommands:b.previousDiagnosticCommands+receipt.metering.integrityCommands}};
      verifyOperatorEnvelope(envelope,c,p);requireLiveOperatorGate(c);
      writeFileSync(output!,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
      const envelopeFile=resolve(output!,'../operator-proof-envelope.json');
      writeFileSync(envelopeFile,JSON.stringify(envelope,null,2)+'\n',{flag:'wx',mode:0o600});
      if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`envelope_sha256=${sha(readFileSync(envelopeFile))}\n`);
    } finally {
      const events=readFileSync(output!+'.events.jsonl','utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
      writeFileSync(output!+'.budget.json',JSON.stringify({operatorIntegritySha256:sha(readFileSync(integrityFile!)),reader:spentOperatorBudget(reader.metering,events),integrity:integrity.budget},null,2)+'\n',{mode:0o600});
    }
    return;
  }
  if (command==='accept') {
    check(args.length===5, 'accept arguments'); const [challengeFile,envelopeFile,directory,digest,output]=args;
    const c=requireOperatorChallenge(readJson(challengeFile!)); const p=readPlan(directory!,digest!);
    const admitted=authority.requirePackage(readJson(resolve(process.env.RUNNER_TEMP!,'operator-authorization.json')));
    check(JSON.stringify(admitted)===JSON.stringify(c.authorization),'independently admitted authorization');
    check(c.sourceCommit===p.classification.sourceCommit && c.sourceTree===p.classification.sourceTree && c.sourcePlanSha256===digest, 'gate source');
    const envelope=verifyOperatorEnvelope(readJson(envelopeFile!),c,p);
    check(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT && process.env.CLOUDFLARE_API_TOKEN, 'existing read-only deployment credential');
    const observer=new CorpusProofTransport({policy:policyForIdentity(c.releasePolicy).id,role:c.role,token:process.env.CLOUDFLARE_API_TOKEN!,readBudget:0,eventFile:output!+'.controls.jsonl',boundPreviewAuthorization:boundPreviewBudgetForChallenge(c),productionAuthorization:productionBudgetForChallenge(c)});
    const controls=await observer.observeControls();
    check(JSON.stringify(controls)===JSON.stringify(envelope.receipt.controls), 'operator/gate controls changed');
    check(Date.parse(c.expiresAt)-Date.now()>=15*60000,'activation needs full live/control time reserve');
    writeFileSync(output!,JSON.stringify(envelope.receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    if(process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT,`envelope_sha256=${sha(readFileSync(envelopeFile!))}\n`,{flag:'a'});
    return;
  }
  if(command==='run') {
    check(args.length===5 && process.env.THEOLOGAI_OPERATOR_AUTH_CONFIRMED==='existing-wrangler-oauth' && process.env.CLOUDFLARE_API_TOKEN, 'existing local operator authentication');
    const [challengeFile,directory,digest,output,ledger]=args;
    await runOperatorProof({challenge:requireOperatorChallenge(readJson(challengeFile!)),directory:directory!,planSha256:digest!,output:output!,ledger:ledger!,token:process.env.CLOUDFLARE_API_TOKEN!}); return;
  }
  throw Error('Operator corpus proof requires challenge, accept or run');
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{
  // Only our constant admission reasons are printable; provider errors stay private.
  const reason=error instanceof Error && error.message.length<=180 && /^(?:Operator corpus proof|Corpus transport|Application corpus check|Application release) refused: [a-zA-Z0-9 /_-]+$/.test(error.message) ? error.message : 'Operator corpus proof stopped; inspect sanitized evidence and cumulative ledger.';
  process.stderr.write(reason+'\n');process.exitCode=1;
});
