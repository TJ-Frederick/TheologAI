#!/usr/bin/env tsx
/** Fresh complete verification for an application-only release; no historical custody shortcut. */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {selectReleaseProofPolicy,requireSameReleasePolicy} from '../.github/scripts/release-proof-policy.mjs';
import { buildCorpusProofSource, proveCompleteCorpus } from './corpus-source-proof.js';
import type { CorpusProofTransport } from './corpus-proof-transport.js';
import { computeD1CorpusIdentity, parseDataManifest } from './d1-corpus-identity.js';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const check = (value: unknown, message: string): void => { if (!value) throw Error('Application corpus check refused: ' + message); };
function bytes(path: string, maximum = 400 * 1024 * 1024): Buffer {
  const stat = lstatSync(path); check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum, 'input file type/size'); return readFileSync(path);
}
function options(argv: string[]): Map<string, string> {
  check(argv.length % 2 === 0, 'argument pairs'); const result = new Map<string, string>();
  const allowed = new Set(['--database', '--directory', '--plan-sha256']);
  for (let i = 0; i < argv.length; i += 2) { const key = argv[i]!, value = argv[i + 1]!; check(allowed.has(key) && !result.has(key) && !value.startsWith('--'), 'argument'); result.set(key, value); }
  return result;
}
const required = (args: Map<string, string>, name: string) => { const value = args.get(name); check(value, name + ' required'); return value!; };

async function prepare(root: string, database: string, directory: string) {
  const selected=selectReleaseProofPolicy(root),{classification}=selected; mkdirSync(directory, { recursive: false });
  const destination = join(directory, 'source.db'); copyFileSync(database, destination);
  const source = new Database(destination);
  try {
    // Execute every unchanged legacy semantic and historical-authority assertion
    // locally. This is never represented as remote verification.
    const { runRemoteD1ReadinessCheck } = await import('./check-remote-d1-readiness.js');
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
    const planningReadCeiling = Object.values(expected.digests).reduce((n, t) => n + t.rows, 0) + expected.quickCheckReadCeiling + 68_192;
    const readBudget = Math.ceil(planningReadCeiling / 10_000) * 10_000;
    check(readBudget <= selected.hardReadCap, 'complete proof exceeds approved operating budget');
    const metadata = Object.fromEntries((source.prepare('SELECT key,value FROM theologai_metadata').all() as { key: string; value: string }[]).map(r => [r.key, r.value]));
    const corpusIdentity = computeD1CorpusIdentity(parseDataManifest(readFileSync(join(root, 'data/data-manifest.json'))));
    check(metadata.schema_version === classification.schema && metadata.corpus_manifest_sha256 === corpusIdentity, 'source corpus');
    source.close();
    const plan = { schemaVersion: 'theologai-application-corpus-source-plan.v1', classification, sourceSha256: sha(bytes(destination)),
      expected, corpusIdentity, localLegacyValidationSha256: sha(JSON.stringify(legacy)), readBudget, planningReadCeiling, integrityCommands: 4, releasePolicy: selected.id,
      semantics: 'all local legacy assertions; all remote canonical cells, physical check, raw-migration FK equivalence, four complete rank-1 FTS checks' };
    writePlan(directory, plan, 'wx');
  } finally { if (source.open) source.close(); }
}

function writePlan(directory: string, plan: {readBudget:number}, flag: 'wx' | 'w') {
  const text = JSON.stringify(plan, null, 2) + '\n';
  writeFileSync(join(directory, 'plan.json'), text, {flag});
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'read_budget=' + plan.readBudget + '\n');
  process.stdout.write(sha(text) + '\n');
}

export function rebindCorpusPlan(root: string, directory: string, digest: string) {
  const {classification} = selectReleaseProofPolicy(root);
  const planBytes = bytes(join(directory, 'plan.json'), 512 * 1024);
  check(sha(planBytes) === digest, 'prior source plan digest');
  const plan = JSON.parse(planBytes.toString());
  const prior = plan.classification;
  check(prior && /^[0-9a-f]{40}$/.test(prior.sourceCommit)
    && JSON.stringify({...prior, sourceCommit:classification.sourceCommit}) === JSON.stringify(classification), 'same reviewed source tree and target');
  check(sha(bytes(join(directory, 'source.db'))) === plan.sourceSha256, 'source database digest');
  writePlan(directory, {...plan, classification}, 'w');
}

export async function runFreshApplicationCorpusCheck(input: { root: string; role: 'preview' | 'production'; directory: string; planSha256: string; approval: unknown; transport: Pick<CorpusProofTransport, 'start' | 'execute' | 'finish' | 'metering'> }) {
  const selected=selectReleaseProofPolicy(input.root),{classification}=selected,{ACCOUNT,requireProofApproval,verifyFreshCorpusReceipt}=selected.module;
  const expectedIdentity = { role: input.role, sourceCommit: classification.sourceCommit, sourceTree: classification.sourceTree };
  const approval = requireProofApproval(input.approval, expectedIdentity);
  const planBytes = bytes(join(input.directory, 'plan.json'), 512 * 1024); check(sha(planBytes) === input.planSha256, 'source plan digest');
  const plan = JSON.parse(planBytes.toString()) as { schemaVersion: string; releasePolicy: string; classification: unknown; sourceSha256: string; corpusIdentity: string; expected: ReturnType<typeof buildCorpusProofSource>; readBudget: number; integrityCommands: number };
  requireSameReleasePolicy(selected,plan.releasePolicy);
  check(plan.schemaVersion === 'theologai-application-corpus-source-plan.v1' && JSON.stringify(plan.classification) === JSON.stringify(classification), 'source plan identity');
  check(plan.integrityCommands === 4 && Number.isSafeInteger(plan.readBudget) && approval.reservedReads <= plan.readBudget && plan.readBudget <= selected.hardReadCap, 'approved read/integrity budget');
  const sourcePath = join(input.directory, 'source.db'); check(sha(bytes(sourcePath)) === plan.sourceSha256, 'source database digest');
  check(/^[0-9a-f]{64}$/.test(input.planSha256) && Object.hasOwn(classification.targets, input.role), 'source plan or role');
  const source = new Database(sourcePath, { readonly: true });
  const transport = input.transport;
  const startedAt = new Date().toISOString();
  try {
    await transport.start();
    const proof = await proveCompleteCorpus(source, plan.expected, query => transport.execute(query), approval.expectedLedgerSha256);
    const controls = await transport.finish();
    const receipt = { liveControlReserve: approval.liveControlReserve, releasePolicy: selected.id, schemaVersion: 'theologai-fresh-complete-corpus-proof.v1',
      role: input.role, accountId: ACCOUNT, ...classification.targets[input.role],
      sourceCommit: classification.sourceCommit, sourceTree: classification.sourceTree, corpusIdentity: plan.corpusIdentity, schema: classification.schema,
      startedAt, completedAt: new Date().toISOString(), sourcePlanSha256: input.planSha256, approvalSha256: sha(JSON.stringify(approval)),
      operationalAssumption: 'owner_reserves_target_data_writes_during_proof_not_an_enforced_provider_lease',
      proof, ...controls, readBudget: approval.reservedReads, metering: { ...transport.metering } };
    verifyFreshCorpusReceipt(receipt, { ...expectedIdentity, sourcePlanSha256: input.planSha256, tables: plan.expected.digests,
      foreignKeyWitnessSha256: plan.expected.foreignKeyWitnessSha256, ledgerSha256: approval.expectedLedgerSha256,
      corpusIdentity: plan.corpusIdentity, schema: classification.schema, readBudget: approval.reservedReads, liveControlReserve: approval.liveControlReserve });
    return receipt;
  } finally { source.close(); }
}

async function main(): Promise<void> {
  const command = process.argv[2]; const args = options(process.argv.slice(3)); const root = process.cwd();
  if (command === 'prepare') { check(args.size === 2, 'prepare arguments'); await prepare(root, resolve(required(args, '--database')), resolve(required(args, '--directory'))); return; }
  if (command === 'rebind') { check(args.size === 2, 'rebind arguments'); rebindCorpusPlan(root, resolve(required(args, '--directory')), required(args, '--plan-sha256')); return; }
  throw Error('Usage: application-corpus-check.ts prepare|rebind --option value');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Application corpus check failed'}\n`); process.exitCode = 1; });
}
