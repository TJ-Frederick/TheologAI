import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { corpusGrant } from '../../helpers/corpusTransportFixture.js';
import { createOperatorChallenge } from '../../../scripts/operator-corpus-proof.js';
import { operatorHandoff } from '../../../scripts/operator-proof-once.js';
import { ACCOUNT } from '../../../scripts/application-release-policy.mjs';

const start = Date.UTC(2026, 10, 21, 1);

function mockHandoff() {
  const { package: grant } = corpusGrant({ role: 'preview', now: start });
  const approval = grant.authorization;
  const { targetRunId, repository, sourceCommit, sourceTree, baseCommit, sourcePlanSha256,
    accountReadCeiling, accountReadCeilingDay, liveControlReserve, reservedReads } = approval;
  const timestamp = new Date(start).toISOString();
  const challenge = createOperatorChallenge('preview', { releasePolicy: 'corpus.v1', sourceCommit, sourceTree }, sourcePlanSha256, {
    GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: repository, GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: targetRunId,
    GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: `refs/pull/${approval.pullRequestNumber}/merge`, OPERATOR_BASE_COMMIT: baseCommit,
  }, start, {
    role: 'preview', accountId: ACCOUNT, day: accountReadCeilingDay, accountReadCeiling, accountReadCeilingDay,
    liveControlReserve, observedAt: timestamp, inventoryObservedAt: timestamp, sampleInterval: 1,
    rowsRead: 0, rowsWritten: 0, readBudget: reservedReads, controls: [],
  }, grant);
  const directory = mkdtempSync(join(tmpdir(), 'operator-challenge-'));
  let archive: Buffer;
  try {
    writeFileSync(join(directory, 'operator-corpus-challenge.json'), JSON.stringify(challenge));
    execFileSync('zip', ['-q', 'challenge.zip', 'operator-corpus-challenge.json'], { cwd: directory });
    archive = readFileSync(join(directory, 'challenge.zip'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  const artifact = {
    id: 654, name: `operator-corpus-challenge-${targetRunId}-attempt-1`, expired: false,
    workflow_run: { id: Number(targetRunId), head_sha: sourceCommit },
    digest: 'sha256:' + createHash('sha256').update(archive).digest('hex'),
  };
  const proof = Buffer.from('{"fake":"sanitized integrity envelope"}');
  let remaining = 1;
  const io = {
    get: vi.fn(async (path: string) => {
      if (path === '/user') return { id: approval.ownerActorId };
      if (path.endsWith('/' + targetRunId)) return { id: Number(targetRunId), head_sha: sourceCommit,
        status: 'in_progress', run_attempt: 1, path: '.github/workflows/pr.yml', event: 'pull_request' };
      return { artifacts: remaining-- > 0 ? [] : [artifact] };
    }),
    download: vi.fn(async (_id: string) => archive),
    pause: vi.fn(async () => {}),
    now: vi.fn(() => start + 1000),
    ready: vi.fn(),
    capture: vi.fn(),
    prove: vi.fn(async () => proof),
    submit: vi.fn(),
  };
  return { approval, artifact, challenge, proof, io };
}

describe('one-shot operator handoff', () => {
  it('waits for the exact challenge, verifies its ZIP and submits the matching sanitized proof once', async () => {
    const { approval, challenge, proof, io } = mockHandoff();
    await operatorHandoff(approval, io);
    expect(io.ready).toHaveBeenCalledOnce();
    expect(io.pause).toHaveBeenCalledOnce();
    expect(io.download).toHaveBeenCalledExactlyOnceWith('654');
    expect(io.capture).toHaveBeenCalledExactlyOnceWith(challenge);
    expect(io.prove).toHaveBeenCalledExactlyOnceWith(challenge);
    expect(io.submit).toHaveBeenCalledExactlyOnceWith(approval.headBranch, proof);
  });

  it.each(['owner', 'run', 'ZIP', 'approval', 'freshness'])('stops before proof or submission on %s mismatch', async fault => {
    const { approval, artifact, io } = mockHandoff();
    if (fault === 'owner') io.get.mockResolvedValueOnce({ id: 1 });
    if (fault === 'run') artifact.workflow_run.head_sha = '9'.repeat(40);
    if (fault === 'ZIP') io.download.mockResolvedValueOnce(Buffer.from('wrong archive'));
    if (fault === 'approval') approval.accountReadsHeld++;
    if (fault === 'freshness') io.now.mockReturnValue(start + 50_000);
    await expect(operatorHandoff(approval, io)).rejects.toThrow();
    expect(io.prove).not.toHaveBeenCalled();
    expect(io.submit).not.toHaveBeenCalled();
  });

  it('leaves an ambiguous dispatch for reconciliation after the single attempted submission', async () => {
    const { approval, io } = mockHandoff();
    io.submit.mockImplementationOnce(() => { throw Error('unknown GitHub result'); });
    await expect(operatorHandoff(approval, io)).rejects.toThrow('unknown GitHub result');
    expect(io.prove).toHaveBeenCalledOnce();
    expect(io.submit).toHaveBeenCalledOnce();
  });
});
