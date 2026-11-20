/** Owner-side, one-shot handoff. Prepare the source and start waiting before protected approval. */
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, promisify } from 'node:util';
import {
  OPERATOR_PROOF, operatorApproval, requireOperatorChallenge,
  runOperatorProof, verifyOperatorLocalSource, type OperatorChallenge,
} from './operator-corpus-proof.js';

const exec = promisify(execFile);
const authority = createRequire(import.meta.url)('../.github/scripts/operator-authorization.cjs');
const CHALLENGE_FILE = 'operator-corpus-challenge.json';

function check(value: unknown, reason: string): asserts value {
  if (!value) throw new Error('Operator handoff refused: ' + reason);
}

function loadFile(path: string) {
  const file = lstatSync(path);
  check(file.isFile() && file.size <= 60_000, 'authorization file type or size');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requireFreshAdmission(challenge: OperatorChallenge, now: number) {
  const observations = [challenge.admission.observedAt, challenge.admission.inventoryObservedAt].map(time => Date.parse(time ?? ''));
  check(observations.every(time => time <= now && now - time < 50_000), 'integrity admission expired');
}

interface OperatorHandoff {
  get(path: string): Promise<any>;
  download(id: string): Promise<Buffer>;
  pause(): Promise<unknown>;
  now(): number;
  ready(): void;
  capture(challenge: OperatorChallenge): void;
  prove(challenge: OperatorChallenge): Promise<Buffer>;
  submit(branch: string, envelope: Buffer): void;
}

export async function operatorHandoff(ownerApproval: unknown, io: OperatorHandoff) {
  const authorization = authority.requireAuthorization(ownerApproval, {}, io.now());
  const role = authorization.role;
  const expectedRun = authorization.targetRunId;
  const artifactName = `operator-corpus-challenge-${expectedRun}-attempt-1`;
  const runPath = '/actions/runs/' + expectedRun;
  const until = Date.parse(authorization.expiresAt);
  const user = await io.get('/user');
  check(user?.id === OPERATOR_PROOF.ownerActorId, 'existing authenticated GitHub owner required');

  let nextRunCheck = 0;
  while (io.now() < until) {
    if (io.now() >= nextRunCheck) {
      const run = await io.get(runPath);
      check(String(run.id) === expectedRun && run.head_sha === authorization.sourceCommit
        && run.status !== 'completed' && run.run_attempt === 1
        && run.path === (role === 'preview' ? '.github/workflows/pr.yml' : '.github/workflows/deploy.yml')
        && run.event === (role === 'preview' ? 'pull_request' : 'workflow_dispatch'), 'protected run changed or stopped');
      if (!nextRunCheck) io.ready();
      nextRunCheck = io.now() + 15_000;
    }
    const page = await io.get(`${runPath}/artifacts?name=${artifactName}&per_page=100`);
    check(Array.isArray(page?.artifacts), 'invalid challenge artifact listing');
    const matches = page.artifacts.filter((artifact: any) => artifact?.name === artifactName);
    check(matches.length <= 1, 'duplicate challenge artifacts');
    if (!matches.length) {
      await io.pause();
      continue;
    }
    const artifact = matches[0];
    const id = String(artifact.id);
    check(/^[1-9][0-9]{0,15}$/.test(id) && artifact.expired === false
      && String(artifact.workflow_run?.id) === expectedRun && artifact.workflow_run.head_sha === authorization.sourceCommit
      && /^sha256:[a-f0-9]{64}$/.test(artifact.digest), 'challenge artifact identity or digest');
    const archive = await io.download(id);
    const raw = authority.readArchiveFile(archive, artifact.digest, CHALLENGE_FILE);
    const challenge = requireOperatorChallenge(JSON.parse(raw.toString('utf8')), io.now());
    check(isDeepStrictEqual(challenge.authorization.authorization, authorization), 'challenge disagrees with explicit owner scope');
    requireFreshAdmission(challenge, io.now());
    io.capture(challenge);
    const envelope = await io.prove(challenge);
    check(envelope.length <= 60_000 && io.now() < Date.parse(challenge.expiresAt), 'proof input size or expiry');
    io.submit(authorization.headBranch, envelope);
    return;
  }
  throw new Error('Operator handoff refused: owner window expired without a challenge');
}

function githubEnvironment() {
  const env: NodeJS.ProcessEnv = { ...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1' };
  delete env.CLOUDFLARE_API_TOKEN;
  return env;
}

async function ghApi(path: string) {
  const target = path === '/user' ? 'user' : `repos/${OPERATOR_PROOF.repository}${path}`;
  return (await exec('gh', ['api', '--hostname', 'github.com', target, '--method', 'GET'], {
    encoding: 'buffer', maxBuffer: 128 * 1024, timeout: 15_000, env: githubEnvironment(),
  })).stdout;
}

async function main() {
  const [approvalFile, directory, evidenceDirectory, ...rest] = process.argv.slice(2);
  check(approvalFile && directory && evidenceDirectory && !rest.length,
    'usage operator-proof-once.ts OWNER_AUTHORIZATION_JSON SOURCE_DIRECTORY EVIDENCE_DIRECTORY');
  const approval = authority.requireAuthorization(loadFile(approvalFile));
  check(process.env.THEOLOGAI_OPERATOR_AUTH_CONFIRMED === 'existing-wrangler-oauth'
    && process.env.CLOUDFLARE_API_TOKEN, 'existing operator credential must be supplied by the owner');
  const token = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  process.env.GH_HOST = 'github.com';
  const source = verifyOperatorLocalSource(directory, approval.sourcePlanSha256);
  check(source.classification.sourceCommit === approval.sourceCommit && source.classification.sourceTree === approval.sourceTree,
    'prepared checkout differs from explicit owner scope');
  const challengeFile = resolve(evidenceDirectory, CHALLENGE_FILE);
  const ledger = resolve(evidenceDirectory, approval.ledgerId + '.json');
  const output = resolve(evidenceDirectory, 'operator-proof-envelope.json');
  check(lstatSync(evidenceDirectory).isDirectory(), 'create a private evidence directory before starting');
  check([challengeFile, ledger, ledger + '.lock', ledger + '.pending', output, output + '.receipt.json.events.jsonl']
    .every(path => !existsSync(path)), 'retain prior attempt evidence');
  await operatorHandoff(approval, {
    get: async path => JSON.parse((await ghApi(path)).toString('utf8')),
    download: id => ghApi(`/actions/artifacts/${id}/zip`),
    pause: () => sleep(2_000),
    now: Date.now,
    ready: () => process.stderr.write('Waiting for the exact owner-authorized challenge. You can approve the protected job.\n'),
    capture: challenge => writeFileSync(challengeFile, JSON.stringify(challenge, null, 2) + '\n', { flag: 'wx', mode: 0o600 }),
    prove: async challenge => {
      const previous = process.env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON;
      process.env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON = JSON.stringify(operatorApproval(challenge));
      try {
        await runOperatorProof({ challenge, directory, planSha256: approval.sourcePlanSha256, output, ledger, token, initializeLedger: true });
      } finally {
        if (previous === undefined) delete process.env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON;
        else process.env.APPLICATION_CORPUS_PROOF_APPROVAL_JSON = previous;
      }
      return readFileSync(output);
    },
    submit: (branch, envelope) => {
      // No retry: an unknown dispatch outcome must be reconciled against GitHub.
      execFileSync('gh', ['workflow', 'run', 'pr.yml', '--repo', `github.com/${OPERATOR_PROOF.repository}`,
        '--ref', branch, '--json'], {
        input: JSON.stringify({ operator_proof_json: envelope.toString('utf8') }),
        stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 64 * 1024, env: githubEnvironment(),
      });
    },
  });
  process.stderr.write('Submitted the sanitized owner envelope once. Follow the waiting protected job.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error && /^Operator (?:handoff|corpus proof) refused: [a-zA-Z0-9 /_.-]+$/.test(error.message)
      ? error.message : 'Operator handoff stopped. Retain the ledger and evidence, and reconcile the one dispatch before any further action.';
    process.stderr.write(message + '\n');
    process.exitCode = 1;
  });
}
