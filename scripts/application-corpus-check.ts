#!/usr/bin/env tsx
/** Fresh complete verification for an application-only release; no historical custody shortcut. */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {selectReleaseProofPolicy,requireSameReleasePolicy} from '../.github/scripts/release-proof-policy.mjs';
import { buildCorpusProofSource, proveCompleteCorpus } from './corpus-source-proof.js';
import { CorpusProofTransport } from './corpus-proof-transport.js';
import { runRemoteD1ReadinessCheck } from './check-remote-d1-readiness.js';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const check = (value: unknown, message: string): void => { if (!value) throw Error('Application corpus check refused: ' + message); };
function bytes(path: string, maximum = 400 * 1024 * 1024): Buffer {
  const stat = lstatSync(path); check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum, 'input file type/size'); return readFileSync(path);
}
function options(argv: string[]): Map<string, string> {
  check(argv.length % 2 === 0, 'argument pairs'); const result = new Map<string, string>();
  const allowed = new Set(['--database', '--directory', '--role', '--plan-sha256', '--output']);
  for (let i = 0; i < argv.length; i += 2) { const key = argv[i]!, value = argv[i + 1]!; check(allowed.has(key) && !result.has(key) && !value.startsWith('--'), 'argument'); result.set(key, value); }
  return result;
}
const required = (args: Map<string, string>, name: string) => { const value = args.get(name); check(value, name + ' required'); return value!; };

function prepare(root: string, database: string, directory: string): void {
  const selected=selectReleaseProofPolicy(root),{classification}=selected,{CORPUS,SCHEMA}=selected.module; mkdirSync(directory, { recursive: false });
  const destination = join(directory, 'source.db'); copyFileSync(database, destination);
  const source = new Database(destination);
  try {
    // Execute every unchanged legacy semantic and historical-authority assertion
    // locally. This is never represented as remote verification.
    const legacy = runRemoteD1ReadinessCheck({ database: 'LOCAL_SOURCE_ONLY', cwd: root }, (_file, argv) => {
      const sql = argv[argv.indexOf('--command') + 1]!;
      let rows:Record<string,unknown>[];
      try{rows=source.prepare(sql).all() as Record<string,unknown>[];}catch(error){
        if(sql.includes('AS readiness'))check(false,'local complete semantic readiness failed');
        throw error;
      }
      if(sql.includes('AS readiness'))check(rows.length===1 && rows[0]?.readiness==='ready','local complete semantic readiness failed');
      return JSON.stringify([{ results: rows, success: true }]);
    });
    const expected = buildCorpusProofSource(root, source);
    const planningReads = Object.values(expected.digests).reduce((n, t) => n + t.rows, 0) + expected.quickCheckReadCeiling + 60_000;
    check(planningReads <= (selected.id==='norton-aquinas.v1'?selected.reservedReads:selected.hardReadCap), 'complete proof exceeds approved operating budget');
    const metadata = Object.fromEntries((source.prepare('SELECT key,value FROM theologai_metadata').all() as { key: string; value: string }[]).map(r => [r.key, r.value]));
    check(metadata.schema_version === SCHEMA && metadata.corpus_manifest_sha256 === CORPUS, 'source corpus');
    source.close();
    const plan = { schemaVersion: 'theologai-application-corpus-source-plan.v1', classification, sourceSha256: sha(bytes(destination)),
      expected, localLegacyValidationSha256: sha(JSON.stringify(legacy)), readBudget: selected.id==='norton-aquinas.v1'?selected.reservedReads:planningReads,...(selected.id==='norton-aquinas.v1'?{planningReadCeiling:planningReads,releasePolicy:selected.id}:{}), integrityCommands: 4,
      semantics: 'all local legacy assertions; all remote canonical cells, physical check, raw-migration FK equivalence, four complete rank-1 FTS checks' };
    const text = JSON.stringify(plan, null, 2) + '\n'; writeFileSync(join(directory, 'plan.json'), text, { flag: 'wx' });
    if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'release_policy='+selected.id+'\n');
    process.stdout.write(sha(text) + '\n');
  } finally { if (source.open) source.close(); }
}

export async function runFreshApplicationCorpusCheck(input: { root: string; role: 'preview' | 'production'; directory: string; planSha256: string; output: string; approval: unknown; token: string; transport?: Pick<CorpusProofTransport, 'start' | 'execute' | 'finish' | 'metering'> }) {
  const selected=selectReleaseProofPolicy(input.root),{classification}=selected,{ACCOUNT,CORPUS,SCHEMA,TARGETS,requireProofApproval,verifyFreshCorpusReceipt}=selected.module;
  requireSameReleasePolicy(selected,(input.approval as any)?.releasePolicy);
  const expectedIdentity = { role: input.role, sourceCommit: classification.sourceCommit, sourceTree: classification.sourceTree };
  const approval = requireProofApproval(input.approval, expectedIdentity);
  const planBytes = bytes(join(input.directory, 'plan.json'), 512 * 1024); check(sha(planBytes) === input.planSha256, 'source plan digest');
  const plan = JSON.parse(planBytes.toString()) as { schemaVersion: string; releasePolicy?:string; classification: unknown; sourceSha256: string; expected: ReturnType<typeof buildCorpusProofSource>; readBudget: number; integrityCommands: number };
  requireSameReleasePolicy(selected,plan.releasePolicy);
  check(plan.schemaVersion === 'theologai-application-corpus-source-plan.v1' && JSON.stringify(plan.classification) === JSON.stringify(classification), 'source plan identity');
  check(plan.integrityCommands === 4 && Number.isSafeInteger(plan.readBudget) && (selected.id==='norton-aquinas.v1'?plan.readBudget===selected.reservedReads && plan.readBudget===approval.maxReads:plan.readBudget>0&&plan.readBudget<=approval.maxReads), 'approved read/integrity budget');
  const sourcePath = join(input.directory, 'source.db'); check(sha(bytes(sourcePath)) === plan.sourceSha256, 'source database digest');
  check(/^[0-9a-f]{64}$/.test(input.planSha256) && Object.hasOwn(TARGETS, input.role), 'source plan or role');
  // Open only the hash-verified source produced by the unprivileged job.
  const source = new Database(sourcePath, { readonly: true });
  const transport = input.transport ?? new CorpusProofTransport({policy:selected.id, role: input.role, token: input.token, readBudget: plan.readBudget, eventFile: input.output + '.events.jsonl' });
  const startedAt = new Date().toISOString();
  try {
    await transport.start();
    const proof = await proveCompleteCorpus(source, plan.expected, query => transport.execute(query), approval.expectedLedgerSha256);
    const controls = await transport.finish();
    const receipt = { ...(selected.id==='norton-aquinas.v1'?{liveControlReserve:(input.approval as {liveControlReserve:number}).liveControlReserve,releasePolicy:selected.id}:{}), schemaVersion: 'theologai-fresh-complete-corpus-proof.v1', role: input.role, accountId: ACCOUNT, ...TARGETS[input.role],
      sourceCommit: classification.sourceCommit, sourceTree: classification.sourceTree, corpusIdentity: CORPUS, schema: SCHEMA,
      startedAt, completedAt: new Date().toISOString(), sourcePlanSha256: input.planSha256, approvalSha256: sha(JSON.stringify(approval)),
      operationalAssumption: 'owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease',
      proof, ...controls, readBudget: plan.readBudget, metering: { ...transport.metering } };
    verifyFreshCorpusReceipt(receipt, { ...expectedIdentity, sourcePlanSha256: input.planSha256, tables: plan.expected.digests,foreignKeyWitnessSha256:plan.expected.foreignKeyWitnessSha256 });
    writeFileSync(input.output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); return receipt;
  } finally { source.close(); }
}

async function main(): Promise<void> {
  const command = process.argv[2]; const args = options(process.argv.slice(3)); const root = process.cwd();
  if (command === 'prepare') { check(args.size === 2, 'prepare arguments'); prepare(root, resolve(required(args, '--database')), resolve(required(args, '--directory'))); return; }
  if (command !== 'verify') throw Error('Usage: application-corpus-check.ts prepare|verify --option value');
  check(args.size === 4, 'verify arguments'); const role = required(args, '--role'); check(role === 'preview' || role === 'production', 'role');
  const approvalText = process.env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON; check(approvalText && Buffer.byteLength(approvalText) <= 4096, 'explicit protected proof approval missing');
  const token = process.env.CLOUDFLARE_API_TOKEN; check(token && process.env.CLOUDFLARE_ACCOUNT_ID === '0594ed1e4c9fe35ab7d9f47991e99f3e', 'existing credential/account missing');
  await runFreshApplicationCorpusCheck({ root, role: role as 'preview' | 'production', directory: resolve(required(args, '--directory')), planSha256: required(args, '--plan-sha256'),
    output: resolve(required(args, '--output')), approval: JSON.parse(approvalText!), token: token! });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Application corpus check failed'}\n`); process.exitCode = 1; });
}
