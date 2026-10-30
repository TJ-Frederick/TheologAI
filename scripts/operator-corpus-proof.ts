#!/usr/bin/env tsx
/** Complete operator proof, accepted only inside the unchanged protected gate. */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACCOUNT, TARGETS, classifyApplicationRelease, verifyFreshCorpusReceipt } from './application-release-policy.mjs';
import { runFreshApplicationCorpusCheck } from './application-corpus-check.js';
import { CorpusProofTransport, PREVIEW_QUOTA_BUFFER_DAY, type ProtectedCorpusAdmission } from './corpus-proof-transport.js';

import { ALL_FTS, type ProofQuery } from './corpus-source-proof.js';

const check = (v: unknown, reason: string): void => { if (!v) throw Error('Operator corpus proof refused: ' + reason); };
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const object = (v: unknown): Record<string, any> => { check(v && typeof v === 'object' && !Array.isArray(v), 'object'); return v as Record<string, any>; };
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const hex = (v: unknown, length: number) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(v);
export const OPERATOR_PROOF = Object.freeze({ repository: 'TJ-Frederick/TheologAI', ownerActorId: 40179660,
  previewAuthorization: 'pr170-preview-checkout-review-20261030-01', reservedReads: 3_510_997, hardReadCap: 3_800_000, diagnosticCommands: 4 });
export type OperatorChallenge = {
  schemaVersion: 'theologai-operator-corpus-challenge.v1'; role: 'preview' | 'production'; authorizationId: string;
  repository: string; ownerActorId: number; sourceCommit: string; sourceTree: string; sourcePlanSha256: string;
  runId: string; runAttempt: 1; workflowPath: string; eventName: string; ref: string; baseCommit: string;
  nonce: string; createdAt: string; expiresAt: string; reservedReads: number; hardReadCap: number; diagnosticCommands: number; admission: ProtectedCorpusAdmission;
};
function readJson(path: string, maximum = 60_000): any {
  const stat = lstatSync(path); check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum, 'file type/size');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function readPlan(directory: string, digest: string) {
  const path = resolve(directory, 'plan.json'); const stat = lstatSync(path);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 512 * 1024 && sha(readFileSync(path)) === digest, 'source plan digest');
  const plan = readJson(path, 512 * 1024); const actual = classifyApplicationRelease(process.cwd());
  check(plan.schemaVersion === 'theologai-application-corpus-source-plan.v1' && JSON.stringify(plan.classification) === JSON.stringify(actual), 'source plan identity');
  check(plan.integrityCommands === 4 && integer(plan.readBudget) && plan.readBudget <= OPERATOR_PROOF.reservedReads, 'complete planned budget');
  return plan;
}
export function requireOperatorChallenge(input: unknown, now = Date.now()): OperatorChallenge {
  const c = object(input); const keys = ['schemaVersion','role','authorizationId','repository','ownerActorId','sourceCommit','sourceTree','sourcePlanSha256','runId','runAttempt','workflowPath','eventName','ref','baseCommit','nonce','createdAt','expiresAt','reservedReads','hardReadCap','diagnosticCommands','admission'];
  check(Object.keys(c).sort().join(',') === keys.sort().join(','), 'challenge shape');
  check(c.schemaVersion === 'theologai-operator-corpus-challenge.v1' && ['preview','production'].includes(c.role), 'challenge version/role');
  const preview = c.role === 'preview';
  check(c.repository === OPERATOR_PROOF.repository && c.ownerActorId === OPERATOR_PROOF.ownerActorId, 'repository/owner');
  check(hex(c.sourceCommit,40) && hex(c.sourceTree,40) && hex(c.baseCommit,40) && hex(c.sourcePlanSha256,64) && hex(c.nonce,64), 'challenge hashes');
  check(typeof c.runId === 'string' && /^[1-9][0-9]{0,15}$/.test(c.runId) && c.runAttempt === 1, 'single run attempt');
  check(c.authorizationId === (preview ? OPERATOR_PROOF.previewAuthorization : 'production-operator-' + c.sourceCommit), 'authorization identity');
  check(c.workflowPath === (preview ? '.github/workflows/pr.yml' : '.github/workflows/deploy.yml')
    && c.eventName === (preview ? 'pull_request' : 'workflow_dispatch')
    && c.ref === (preview ? 'refs/pull/170/merge' : 'refs/heads/main'), 'existing protected route');
  check(c.reservedReads === OPERATOR_PROOF.reservedReads && c.hardReadCap === OPERATOR_PROOF.hardReadCap && c.diagnosticCommands === 4, 'authorization budget');
  const start = Date.parse(c.createdAt), end = Date.parse(c.expiresAt);
  check(Number.isFinite(start) && Number.isFinite(end) && start <= now + 30_000 && end > now && end - start === 5_400_000
    && end < Date.parse(new Date(start).toISOString().slice(0,10) + 'T00:00:00Z') + 86_400_000, 'fresh single-UTC-day window');
  const a=object(c.admission);
  check(a.accountId===ACCOUNT && a.role===c.role && a.day===c.createdAt.slice(0,10) && a.sampleInterval===1
    && integer(a.rowsRead) && integer(a.rowsWritten) && a.readBudget===c.reservedReads
    && Number.isFinite(Date.parse(a.observedAt)) && Math.abs(Date.parse(a.observedAt)-start)<=50_000 && Array.isArray(a.controls), 'protected quota admission');
  return c as OperatorChallenge;
}
export function createOperatorChallenge(role: 'preview' | 'production', classification: {sourceCommit:string;sourceTree:string}, planSha256: string, env = process.env, now = Date.now(), admission?: ProtectedCorpusAdmission): OperatorChallenge {
  check(env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY === OPERATOR_PROOF.repository && env.GITHUB_RUN_ATTEMPT === '1', 'protected CI context');
  const c = { schemaVersion: 'theologai-operator-corpus-challenge.v1', role,
    authorizationId: role === 'preview' ? OPERATOR_PROOF.previewAuthorization : 'production-operator-' + classification.sourceCommit,
    repository: OPERATOR_PROOF.repository, ownerActorId: OPERATOR_PROOF.ownerActorId, ...classification,
    sourcePlanSha256: planSha256, runId: env.GITHUB_RUN_ID, runAttempt: 1,
    workflowPath: role === 'preview' ? '.github/workflows/pr.yml' : '.github/workflows/deploy.yml',
    eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, baseCommit: env.OPERATOR_BASE_COMMIT,
    nonce: randomBytes(32).toString('hex'), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 5_400_000).toISOString(),
    reservedReads: OPERATOR_PROOF.reservedReads, hardReadCap: OPERATOR_PROOF.hardReadCap, diagnosticCommands: 4, admission };
  return requireOperatorChallenge(c, now);
}
export function operatorApproval(c: OperatorChallenge) {
  return { schemaVersion: 'theologai-fresh-corpus-proof-approval.v1', role: c.role, accountId: ACCOUNT,
    databaseId: TARGETS[c.role].databaseId, sourceCommit: c.sourceCommit, sourceTree: c.sourceTree,
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
  verifyFreshCorpusReceipt(receipt, { role:c.role, sourceCommit:c.sourceCommit, sourceTree:c.sourceTree,
    sourcePlanSha256:c.sourcePlanSha256, tables:plan.expected.digests }, now);
  check(Date.parse(receipt.startedAt) >= Date.parse(c.createdAt) && Date.parse(receipt.completedAt) <= Date.parse(c.expiresAt)
    && receipt.approvalSha256 === sha(JSON.stringify(operatorApproval(c))) && receipt.readBudget === plan.readBudget, 'approval/window/plan');
  const b = object(e.budget);
  check(Object.keys(b).sort().join(',') === ['authorizationId','previousReadsSpentOrReserved','previousWritesSpentOrReserved','previousDiagnosticCommands','cumulativeReadsSpentOrReserved','cumulativeWritesSpentOrReserved','cumulativeDiagnosticCommands'].sort().join(',')
    && b.authorizationId === c.authorizationId, 'budget identity');
  check([b.previousReadsSpentOrReserved,b.previousWritesSpentOrReserved,b.previousDiagnosticCommands,b.cumulativeReadsSpentOrReserved,b.cumulativeWritesSpentOrReserved,b.cumulativeDiagnosticCommands].every(integer), 'budget counters');
  check(b.cumulativeReadsSpentOrReserved === b.previousReadsSpentOrReserved + receipt.metering.rowsRead
    && b.previousReadsSpentOrReserved + plan.readBudget <= c.hardReadCap
    && b.cumulativeReadsSpentOrReserved <= c.hardReadCap
    && b.previousWritesSpentOrReserved + 4 <= c.diagnosticCommands
    && b.cumulativeWritesSpentOrReserved === b.previousWritesSpentOrReserved + receipt.metering.rowsWritten
    && b.cumulativeWritesSpentOrReserved <= c.diagnosticCommands
    && b.cumulativeDiagnosticCommands === b.previousDiagnosticCommands + receipt.metering.integrityCommands
    && b.cumulativeDiagnosticCommands <= c.diagnosticCommands, 'cumulative authorization');
  return e;
}

function integrityQueries(): ProofQuery[] {
  return ALL_FTS.map(table=>({kind:'fts-integrity',label:`fts:${table}`,sql:`INSERT INTO "${table}"("${table}",rank) VALUES('integrity-check',1)`,readCeiling:4096,writeCeiling:1}));
}
export function verifyOperatorIntegrity(input: unknown, c: OperatorChallenge, now=Date.now()) {
  requireOperatorChallenge(c,now); const e=object(input), r=object(e.receipt), m=object(r.metering), b=object(e.budget);
  check(e.schemaVersion==='theologai-operator-corpus-envelope.v1' && JSON.stringify(e.challenge)===JSON.stringify(c) && hex(e.journalSha256,64), 'integrity envelope binding');
  check(r.schemaVersion==='theologai-operator-fts-proof.v1' && r.role===c.role && r.accountId===ACCOUNT && r.databaseId===TARGETS[c.role].databaseId
    && r.sourceCommit===c.sourceCommit && r.sourceTree===c.sourceTree && r.sourcePlanSha256===c.sourcePlanSha256, 'integrity source target');
  check(Date.parse(r.startedAt)>=Date.parse(c.createdAt) && Date.parse(r.completedAt)>=Date.parse(r.startedAt)
    && Date.parse(r.completedAt)<=now+30_000 && Date.parse(r.completedAt)<=Date.parse(c.admission.observedAt)+50_000
    && r.controlsUnchanged===true && JSON.stringify(r.controls)===JSON.stringify(c.admission.controls), 'integrity window controls');
  check(Array.isArray(r.results) && r.results.length===4, 'four integrity results');
  for(const [i,q] of integrityQueries().entries()) { const result=object(r.results[i]);
    check(result.label===q.label && result.sqlSha256===sha(q.sql) && integer(result.rowsRead) && result.rowsRead<=4096
      && integer(result.rowsWritten) && result.rowsWritten<=1, 'exact integrity command result'); }
  check(m.requests===4 && m.integrityCommands===4 && m.retries===0 && m.unknownAttempts===0
    && m.rowsRead===r.results.reduce((n:number,v:any)=>n+v.rowsRead,0) && m.rowsWritten===r.results.reduce((n:number,v:any)=>n+v.rowsWritten,0), 'integrity metering');
  check(b.authorizationId===c.authorizationId && [b.previousReadsSpentOrReserved,b.previousWritesSpentOrReserved,b.previousDiagnosticCommands].every(integer)
    && b.previousReadsSpentOrReserved+c.reservedReads<=c.hardReadCap && b.previousWritesSpentOrReserved===0 && b.previousDiagnosticCommands===0
    && b.cumulativeReadsSpentOrReserved===b.previousReadsSpentOrReserved+m.rowsRead
    && b.cumulativeWritesSpentOrReserved===m.rowsWritten && b.cumulativeDiagnosticCommands===4, 'integrity cumulative budget');
  return e;
}
/** Existing read token executes every read; only four owner-authenticated results replace writes. */
export function composeReadProof(reader: Pick<CorpusProofTransport,'start'|'execute'|'finish'|'metering'>, integrity: any, guard:()=>void) {
  const meter={...integrity.receipt.metering}; let consumed=0;
  const update=()=>{for(const key of Object.keys(meter)) meter[key]=reader.metering[key as keyof typeof reader.metering]+integrity.receipt.metering[key];};
  return {metering:meter,start:async()=>{guard();await reader.start();},execute:async(q:ProofQuery)=>{
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
  check(ledger.schemaVersion === 'theologai-operator-proof-budget.v1' && ledger.authorizationId === c.authorizationId
    && integer(ledger.readsSpentOrReserved) && integer(ledger.writesSpentOrReserved) && integer(ledger.diagnosticCommands) && Array.isArray(ledger.attempts)
    && !ledger.attempts.some((a:any) => a.status === 'RUNNING' || a.status === 'PASSED'), 'ledger identity/replay/incomplete attempt');
  check(ledger.readsSpentOrReserved + plannedReads <= c.hardReadCap && ledger.diagnosticCommands + 4 <= c.diagnosticCommands
    && ledger.writesSpentOrReserved + 4 <= c.diagnosticCommands, 'remaining cumulative budget');
}
export function spentOperatorBudget(metering: CorpusProofTransport['metering'], events: Record<string,any>[]) {
  const results=events.filter(e=>e.kind==='result'); const intents=events.filter(e=>e.kind==='intent');
  const unmatched=intents.slice(results.length);
  return {readsSpentOrReserved:Math.max(metering.rowsRead,results.reduce((n,e)=>n+e.rowsRead,0)+unmatched.reduce((n,e)=>n+e.readCeiling,0)),
    writesSpentOrReserved:Math.max(metering.rowsWritten,results.reduce((n,e)=>n+e.rowsWritten,0)+unmatched.reduce((n,e)=>n+e.writeCeiling,0)),
    diagnosticCommands:metering.integrityCommands};
}

/** This checks server-authored GitHub state, not a local assertion of approval. */
export function requireLiveOperatorGate(c: OperatorChallenge): void {
  const get = (path: string) => JSON.parse(execFileSync('gh', ['api', `repos/${c.repository}${path}`], { encoding:'utf8', maxBuffer:2*1024*1024 }));
  const run = get('/actions/runs/' + c.runId);
  check(run.head_sha === c.sourceCommit && run.run_attempt === 1 && run.path === c.workflowPath && run.event === c.eventName
    && run.status !== 'completed', 'live protected run');
  const name = c.role === 'preview' ? 'Preview operator corpus verification' : 'Test, Build & Deploy';
  const jobs = get('/actions/runs/' + c.runId + '/jobs?per_page=100').jobs.filter((j: any) => j.name === name);
  check(jobs.length === 1 && jobs[0].status === 'in_progress', 'live approved protected job');
  if (c.role === 'preview') {
    const pr = get('/pulls/170');
    check(pr.state === 'open' && !pr.draft && pr.head.sha === c.sourceCommit && pr.base.sha === c.baseCommit
      && pr.head.repo.full_name === c.repository && pr.labels.some((l:any) => l.name === 'deploy-preview'), 'live PR authorization');
  } else check(get('/git/ref/heads/main').object.sha === c.sourceCommit, 'live production main');
}

export async function runOperatorProof(input: { challenge:OperatorChallenge; directory:string; planSha256:string; output:string; ledger:string; token:string }) {
  const c = requireOperatorChallenge(input.challenge); const plan = readPlan(input.directory,input.planSha256);
  check(plan.classification.sourceCommit === c.sourceCommit && plan.classification.sourceTree === c.sourceTree && input.planSha256 === c.sourcePlanSha256, 'operator source');
  // A local approval file is required in addition to the live protected gate.
  check(process.env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON && JSON.stringify(JSON.parse(process.env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON)) === JSON.stringify(operatorApproval(c)), 'explicit operator approval');
  for (const path of [input.output,input.output+'.receipt.json',input.output+'.receipt.json.events.jsonl']) {
    check(!existsSync(path), 'fresh output paths required');
  }
  requireLiveOperatorGate(c);
  const lock = openSync(input.ledger + '.lock','wx',0o600);
  let ledger:any;
  const save = () => { const temp = input.ledger + '.pending'; writeFileSync(temp,JSON.stringify(ledger,null,2)+'\n',{mode:0o600}); renameSync(temp,input.ledger); };
  let transport: CorpusProofTransport | undefined;
  try {
    ledger = existsSync(input.ledger) ? readJson(input.ledger,1024*1024) : {schemaVersion:'theologai-operator-proof-budget.v1',authorizationId:c.authorizationId,readsSpentOrReserved:0,writesSpentOrReserved:0,diagnosticCommands:0,attempts:[]};
    admitOperatorBudget(ledger,c,plan.readBudget);
    const previousReads = ledger.readsSpentOrReserved, previousWrites=ledger.writesSpentOrReserved, previousCommands = ledger.diagnosticCommands;
    const attempt = {nonce:c.nonce,sourceCommit:c.sourceCommit,runId:c.runId,startedAt:new Date().toISOString(),status:'RUNNING',readsSpentOrReserved:0,writesSpentOrReserved:0,diagnosticCommands:0};
    ledger.attempts.push(attempt); save();
    try {
      transport = new CorpusProofTransport({role:c.role,token:input.token,readBudget:16_384,eventFile:input.output+'.receipt.json.events.jsonl',
        previewQuotaBuffer:c.role==='preview' && c.createdAt.startsWith(PREVIEW_QUOTA_BUFFER_DAY+'T')});
      const startedAt=new Date().toISOString(); await transport.startIntegrity(c.admission);
      const results=[];
      for(const q of integrityQueries()) {
        requireOperatorChallenge(c); requireLiveOperatorGate(c);
        const before={...transport.metering}; const rows=await transport.execute(q);check(rows.length===0,'integrity response');
        results.push({label:q.label,sqlSha256:sha(q.sql),rowsRead:transport.metering.rowsRead-before.rowsRead,rowsWritten:transport.metering.rowsWritten-before.rowsWritten});
      }
      const controls=await transport.finish(); requireLiveOperatorGate(c);
      const receipt={schemaVersion:'theologai-operator-fts-proof.v1',role:c.role,accountId:ACCOUNT,databaseId:TARGETS[c.role].databaseId,
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
  if (command==='challenge') {
    check(args.length===4 && ['preview','production'].includes(args[0]!), 'challenge arguments');
    const [role,directory,digest,output]=args; const p=readPlan(directory!,digest!);
    check(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT && process.env.CLOUDFLARE_API_TOKEN,'existing read-only deployment credential');
    const transport=new CorpusProofTransport({role:role as 'preview'|'production',token:process.env.CLOUDFLARE_API_TOKEN!,readBudget:p.readBudget,eventFile:output!+'.admission.jsonl',
      previewQuotaBuffer:role==='preview' && new Date().toISOString().startsWith(PREVIEW_QUOTA_BUFFER_DAY+'T')});
    await transport.start();
    const c=createOperatorChallenge(role as 'preview'|'production',{sourceCommit:p.classification.sourceCommit,sourceTree:p.classification.sourceTree},digest!,process.env,Date.now(),transport.protectedAdmission());
    writeFileSync(output!,JSON.stringify(c,null,2)+'\n',{flag:'wx',mode:0o600}); return;
  }
  if(command==='complete') {
    check(args.length===5,'complete arguments'); const [challengeFile,integrityFile,directory,digest,output]=args;
    const c=requireOperatorChallenge(readJson(challengeFile!)); const p=readPlan(directory!,digest!);
    check(p.classification.sourceCommit===c.sourceCommit && p.classification.sourceTree===c.sourceTree && digest===c.sourcePlanSha256
      && process.env.GITHUB_ACTIONS==='true' && process.env.GITHUB_RUN_ID===c.runId && process.env.GITHUB_RUN_ATTEMPT==='1','complete protected source');
    const integrity=verifyOperatorIntegrity(readJson(integrityFile!),c);
    check(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT && process.env.CLOUDFLARE_API_TOKEN,'existing read-only deployment credential');
    const reader=new CorpusProofTransport({role:c.role,token:process.env.CLOUDFLARE_API_TOKEN!,readBudget:p.readBudget-integrity.receipt.metering.rowsRead,eventFile:output!+'.events.jsonl',
      previewQuotaBuffer:c.role==='preview' && c.createdAt.startsWith(PREVIEW_QUOTA_BUFFER_DAY+'T')});
    let lastGuard=0; const transport=composeReadProof(reader,integrity,()=>{requireOperatorChallenge(c);if(Date.now()-lastGuard>30_000){requireLiveOperatorGate(c);lastGuard=Date.now();}});
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
    check(c.sourceCommit===p.classification.sourceCommit && c.sourceTree===p.classification.sourceTree && c.sourcePlanSha256===digest, 'gate source');
    const envelope=verifyOperatorEnvelope(readJson(envelopeFile!),c,p);
    check(process.env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT && process.env.CLOUDFLARE_API_TOKEN, 'existing read-only deployment credential');
    const observer=new CorpusProofTransport({role:c.role,token:process.env.CLOUDFLARE_API_TOKEN!,readBudget:0,eventFile:output!+'.controls.jsonl'});
    const controls=await observer.observeControls();
    check(JSON.stringify(controls)===JSON.stringify(envelope.receipt.controls), 'operator/gate controls changed');
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
