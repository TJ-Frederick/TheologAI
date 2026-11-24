/** Hosted corpus acceptance and one read-only recovery in the original protected operation. */
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { POLICY, TARGETS, classifyApplicationRelease } from './application-release-policy.mjs';
import { requireOperatorChallenge, requireLiveOperatorGate, transportAuthorization, verifyOperatorEnvelope } from './operator-corpus-proof.js';
import { CorpusProofTransport } from './corpus-proof-transport.js';
import { captureCorpusUsage } from './corpus-release-control.js';
import { createCorpusApi } from './corpus-release-api.js';
import { hostedCorpusProfile } from './hosted-corpus-profile.mjs';
import { runCorpusAcceptance } from './release-acceptance.js';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error('Corpus live refused: ' + message);
}

interface CorpusLiveInput {
  role: 'preview' | 'production';
  sourceDirectory: string;
  planSha256: string;
  challengeFile: string;
  receiptFile: string;
  cutoverFile: string;
  outputDirectory: string;
  token: string;
  fetch?: typeof fetch;
}

function readCutoverProof(input: CorpusLiveInput) {
  const classification = classifyApplicationRelease(process.cwd());
  const planBytes = readFileSync(join(input.sourceDirectory, 'plan.json'));
  const plan = JSON.parse(planBytes.toString());
  const source = join(input.sourceDirectory, 'source.db');
  check(sha(planBytes) === input.planSha256 && sha(readFileSync(source)) === plan.sourceSha256, 'source plan and database bytes');
  check(JSON.stringify(plan.classification) === JSON.stringify(classification), 'exact release source');
  const challenge = requireOperatorChallenge(json(input.challengeFile));
  check(challenge.role === input.role && challenge.sourcePlanSha256 === input.planSha256, 'original proof role and plan');
  check(process.env.GITHUB_RUN_ID === challenge.runId && process.env.GITHUB_RUN_ATTEMPT === '1'
    && process.env.GITHUB_EVENT_NAME === challenge.eventName && process.env.GITHUB_REF === challenge.ref, 'original protected operation');
  const envelope = verifyOperatorEnvelope(json(join(input.outputDirectory, 'operator-proof-envelope.json')), challenge, plan);
  const receiptBytes = readFileSync(input.receiptFile);
  const receipt = JSON.parse(receiptBytes.toString());
  const journal = readFileSync(input.receiptFile + '.events.jsonl');
  check(JSON.stringify(receipt) === JSON.stringify(envelope.receipt) && sha(journal) === envelope.journalSha256, 'retained proof and journal');
  const target = TARGETS[input.role];
  const closingInventory = journal.toString().trim().split('\n').reverse().map(line => JSON.parse(line)).find(event =>
    event.kind === 'complete-bound-preview-inventory' || event.kind === 'complete-unbound-inventory');
  const closingUsage = closingInventory?.capture?.exclusiveUsage;
  const candidateWrites = closingUsage?.candidate?.rowsWritten;
  check(closingUsage?.databaseId === target.databaseId && closingUsage?.completeDatabaseGroups === true
    && closingUsage.windowStart === challenge.accountReadCeilingDay + 'T00:00:00.000Z'
    && Number.isSafeInteger(candidateWrites) && candidateWrites >= receipt.metering.rowsWritten, 'complete proof closing custody witness');

  const cutover = json(input.cutoverFile);
  const expectedWorker = input.role === 'preview' ? 'theologai-preview' : 'theologai';
  check(cutover.worker === expectedWorker && cutover.candidateBindingMatches === true
    && cutover.candidateD1?.databaseId === target.databaseId && cutover.candidateD1.databaseName === target.databaseName
    && cutover.observedActiveD1?.databaseId === target.databaseId
    && POLICY.uuid.test(cutover.observedActiveDeploymentId) && POLICY.uuid.test(cutover.observedActiveVersionId), 'confirmed cutover assignment');

  return { challenge, receipt, source, cutover, candidateWrites,
    evidenceSha256: sha(JSON.stringify({ plan: input.planSha256, envelope, cutover, receipt: sha(receiptBytes) })) };
}

export async function runCorpusLive(input: CorpusLiveInput) {
  const original = readCutoverProof(input);
  const { challenge, receipt, cutover } = original;
  const output = join(input.outputDirectory, 'corpus-live.json');
  const events = output + '.events.jsonl';
  const event = (value: unknown) => appendFileSync(events, JSON.stringify(value) + '\n', { flush: true });
  const summary = (value: string) => {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + value + '\n');
  };
  // The transport opens the journal exclusively, preventing a second invocation.
  const observer = new CorpusProofTransport({ role: input.role, token: input.token, readBudget: 0,
    eventFile: events, activated: true, fetch: input.fetch, authorization: transportAuthorization(challenge) });
  const api = createCorpusApi(input.role, async () => input.token, input.fetch, event);
  const observe = async () => {
    const controls = await observer.observeControls() as { role: string; deploymentId: string; versionId: string; databaseId: string }[];
    const active = controls.find(value => value.role === input.role);
    check(active && active.deploymentId === cutover.observedActiveDeploymentId && active.versionId === cutover.observedActiveVersionId
      && active.databaseId === cutover.candidateD1.databaseId, 'confirmed serving assignment changed');
    const usage = await captureCorpusUsage({ role: input.role, api });
    // The owner grants continuous exclusive custody. Analytics corroborate it,
    // but have no ingestion watermark and cannot alone attest to custody.
    check(usage.windowStart === challenge.accountReadCeilingDay + 'T00:00:00.000Z'
      && usage.candidate.rowsWritten === original.candidateWrites, 'candidate write custody changed or is unconfirmed');
    check(Math.max(usage.candidate.rowsWritten + usage.otherDatabases.rowsWritten,
      challenge.admission.rowsWritten + receipt.metering.rowsWritten) <= 80_000, 'live write headroom');
    return { controls, usage, accountReads: usage.candidate.rowsRead + usage.otherDatabases.rowsRead };
  };

  const initial = Math.floor(challenge.liveControlReserve / 2);
  const reservations = initial > POLICY.controlReads
    ? [initial, challenge.liveControlReserve - initial]
    : [challenge.liveControlReserve];
  let charged = 0;
  let accountFloor: number | undefined;
  let originalControls: string | undefined;
  for (const [index, reservation] of reservations.entries()) {
    const attempt = index + 1;
    if (index !== 0) {
      check(readCutoverProof(input).evidenceSha256 === original.evidenceSha256, 'proof or cutover changed before verification-only recovery');
    }
    requireLiveOperatorGate(challenge);
    const before = await observe();
    const controls = JSON.stringify(before.controls);
    originalControls ??= controls;
    check(controls === originalControls, 'serving controls changed before verification-only recovery');
    accountFloor ??= Math.max(before.accountReads, challenge.admission.rowsRead + receipt.metering.rowsRead);
    check(before.accountReads <= accountFloor + charged, 'prior live/control allowance exceeded');
    check(accountFloor + challenge.liveControlReserve + POLICY.uncertaintyMargin <= challenge.accountReadCeiling,
      'original live/control reservation and uncertainty margin');
    charged += reservation;
    event({ kind: 'live-intent', attempt, reservedReads: reservation, cumulativeReservedReads: charged,
      liveControlReserve: challenge.liveControlReserve, accountReadFloor: accountFloor, evidenceSha256: original.evidenceSha256 });
    let lastAuthorityCheck = Date.now();
    const live = await runCorpusAcceptance({
      role: input.role, root: process.cwd(), databasePath: original.source, profile: hostedCorpusProfile,
      endpoint: input.role === 'preview' ? 'https://preview-mcp.theologai.xyz/mcp' : 'https://mcp.theologai.xyz/mcp',
      serverVersion: json('package.json').version + (input.role === 'preview' ? '-preview' : ''),
      fetch: input.fetch ?? fetch,
      guard: () => {
        requireOperatorChallenge(challenge);
        if (Date.now() - lastAuthorityCheck >= 30_000) {
          requireLiveOperatorGate(challenge);
          lastAuthorityCheck = Date.now();
        }
      },
    });
    if (live.failure) {
      const text = JSON.stringify(live, null, 2) + '\n';
      check(Buffer.byteLength(text) <= 512 * 1024, 'bounded sanitized failure report');
      writeFileSync(join(input.outputDirectory, 'corpus-live-attempt-' + attempt + '-failure.json'), text,
        { flag: 'wx', mode: 0o600 });
      event({ kind: 'live-failed', attempt, reportSha256: sha(text), reservedReadsRetained: reservation });
      summary('### Serving, verification pending\nHosted corpus checks stopped on attempt ' + attempt + '.');
      check(index + 1 < reservations.length && live.failure.category === 'http_status'
        && [502, 503, 504].includes(live.failure.lastHttpStatus ?? 0) && !live.failure.cleanupFailed,
        'hosted corpus acceptance stopped');
    }
    const after = await observe();
    check(JSON.stringify(after.controls) === originalControls, 'serving controls changed during hosted verification');
    check(after.accountReads <= accountFloor + charged, 'observed live/control allowance exceeded');
    requireLiveOperatorGate(challenge);
    if (live.failure) {
      event({ kind: 'verification-only-recovery', fromAttempt: attempt, retainedReservedReads: charged,
        evidenceSha256: original.evidenceSha256 });
      continue;
    }

    const report = { ...live, recovered: index !== 0, attempts: attempt, cumulativeReservedReads: charged };
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    event({ kind: 'live-complete', attempt, sha256: sha(JSON.stringify(report)), cumulativeReservedReads: charged,
      usage: after.usage, ingestionWatermarkUnavailable: true });
    if (report.recovered) summary('### Verification-only recovery passed\nThe same serving assignment passed both protocol versions.');
    return report;
  }
  throw new Error('Corpus live stopped before acceptance');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [role, sourceDirectory, planSha256, challengeFile, receiptFile, cutoverFile, outputDirectory, ...extra] = process.argv.slice(2);
  check((role === 'preview' || role === 'production') && sourceDirectory && planSha256 && challengeFile
    && receiptFile && cutoverFile && outputDirectory && !extra.length, 'exact CLI arguments');
  check(process.env.CLOUDFLARE_API_TOKEN, 'existing protected credential missing');
  runCorpusLive({ role, sourceDirectory, planSha256, challengeFile, receiptFile, cutoverFile, outputDirectory,
    token: process.env.CLOUDFLARE_API_TOKEN }).catch(error => {
    const message = error instanceof Error ? error.message : '';
    const reason = /^(?:Corpus (?:live|transport|control capture|API)|Operator (?:corpus proof|authorization)|Application release) refused: [A-Za-z0-9 /_.-]+$/.test(message)
      ? message + '\n' : '';
    process.stderr.write(reason + 'Corpus live stopped. Preserve the original reservation and evidence.\n');
    process.exitCode = 1;
  });
}
