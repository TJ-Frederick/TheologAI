/** One pinned native custody link for the expired original Norton source ZIPs. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const check = (v: unknown,
s: string): void => {
    if (!v)
        throw Error('Retained Norton inputs refused: ' + s);
};
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
export const RETAINED_INPUTS = Object.freeze({
    runId: 42114178613,
    sourceCommit: '2f1311647ab84b73c8fcfbec593b3f7f83b74f9e',
    sourceTree: '240bf376181e848ab0bb424ff68d84d644f5130b',
    sourceJobId: 127549290767,
    validationJobId: 127549797797,
    inputArtifact: {
        id: 13454129353,
        name: 'existing-preview-inputs-42114178613-attempt-1',
        digest: 'sha256:4b1705dc473da4f85174d71b4cf82f86244e463c7ab8bf9385505a9fb38e9683',
        bytes: 102843227,
        createdAt: '2026-11-05T21:37:26Z',
        expiresAt: '2026-11-06T21:37:14Z'
    },
    stopArtifact: {
        id: 13453494842,
        name: 'existing-preview-validation-42114178613-attempt-1',
        digest: 'sha256:c4e1106a298b49e20803cad33f9b289203ad33da557559b466d9beb86804d0fc',
        bytes: 21564,
        createdAt: '2026-11-05T21:39:32Z',
        expiresAt: '2026-11-12T21:39:31Z'
    },
    equivalenceSha256: '58003f59c8a84eeb0fba1130de201a70cd0ef172bbc02ce2bdae3bb4fe378729',
    stopEventsSha256: '65bb598fdabaf74766370f2458000f28063550de75fc4a661fa55c0616fe9b63'
});
const sourceName = 'Verify deployed Norton candidate and distinct auditor (no cloud credentials)', validationName = 'Validate already deployed Norton preview (read-only)';
type NativeArtifactPin = {
    id: number;
    name: string;
    digest: string;
    bytes: number;
    createdAt: string;
    expiresAt: string;
};
type NativeRunMetadata = {
    id: number;
    status: string;
    conclusion: string;
    head_sha: string;
    head_branch: string;
    run_attempt: number;
    event: string;
    path: string;
    actor: {
        id: number;
    };
    triggering_actor: {
        id: number;
    };
};
type NativeJobMetadata = {
    id: number;
    name: string;
    status: string;
    conclusion: string;
    completed_at: string;
    steps: {
        name: string;
        conclusion: string;
    }[];
};
type NativeJobRoster = {
    total_count: number;
    jobs: NativeJobMetadata[];
};
type NativeArtifactMetadata = {
    id: number;
    name: string;
    digest: string;
    size_in_bytes: number;
    created_at: string;
    expires_at: string;
    expired: boolean;
    workflow_run: {
        id: number;
        head_sha: string;
    };
};
export type RetainedCustody = {
    schemaVersion: string;
    runId: number;
    sourceCommit: string;
    sourceTree: string;
    sourceJobCompletedAt: string;
    inputArtifact: NativeArtifactPin;
    stopArtifact: NativeArtifactPin;
};
export function requireRetainedCustody(c: any,
at: number): RetainedCustody {
    check(c &&
        Object.keys(c).sort().join(',') === 'inputArtifact,runId,schemaVersion,sourceCommit,sourceJobCompletedAt,sourceTree,stopArtifact', 'closed native custody');
    check(c.schemaVersion === 'norton-retained-native-inputs.v1' &&
        c.runId === RETAINED_INPUTS.runId &&
        c.sourceCommit === RETAINED_INPUTS.sourceCommit &&
        c.sourceTree === RETAINED_INPUTS.sourceTree, 'pinned historical source/run');
    for (const k of [
        'inputArtifact', 'stopArtifact'
    ] as const)
        check(JSON.stringify(c[k]) === JSON.stringify(RETAINED_INPUTS[k]) &&
            Date.parse(c[k].expiresAt) > at + 60000, 'pinned native digest/retention');
    check(Date.parse(c.sourceJobCompletedAt) >= Date.parse(c.inputArtifact.createdAt) &&
        Date.parse(c.sourceJobCompletedAt) <= Date.parse(c.stopArtifact.createdAt), 'bounded successful source capture');
    return c;
}
export async function requireRetainedNativeMetadata(github: (route: string) => Promise<any>, now = Date.now()) {
    const p = RETAINED_INPUTS, run = await github('/actions/runs/' + p.runId) as NativeRunMetadata, jobs = await github('/actions/runs/' + p.runId + '/jobs?per_page=100') as NativeJobRoster;
    check(run.id === p.runId &&
        run.status === 'completed' &&
        run.conclusion === 'failure' &&
        run.head_sha === p.sourceCommit &&
        run.head_branch === 'codex/norton-aquinas-successor' &&
        run.run_attempt === 1 &&
        run.event === 'workflow_dispatch' &&
        run.path === '.github/workflows/pr.yml' &&
        run.actor?.id === 40179660 &&
        run.triggering_actor?.id === 40179660, 'authenticated prior owner/run');
    check(jobs.total_count === jobs.jobs?.length &&
        jobs.total_count <= 100, 'complete prior job roster');
    const source = jobs.jobs.filter(j => j.id === p.sourceJobId &&
        j.name === sourceName &&
        j.status === 'completed' &&
        j.conclusion === 'success'), validation = jobs.jobs.filter((j: any) => j.id === p.validationJobId &&
        j.name === validationName &&
        j.status === 'completed' &&
        j.conclusion === 'failure');
    check(source.length === 1 &&
        validation.length === 1 &&
        jobs.jobs.every((j: any) => [
            p.sourceJobId, p.validationJobId
        ].includes(j.id) || j.conclusion === 'skipped'), 'only known protected quota failure');
    const failedSteps = validation[0].steps.filter(s => s.conclusion === 'failure');
    check(failedSteps.length === 1 &&
        failedSteps[0].name === 'Complete the existing candidate validation without any deployment', 'known protected failure step');
    for (const expected of [
        p.inputArtifact, p.stopArtifact
    ]) {
        const a = await github('/actions/artifacts/' + expected.id) as NativeArtifactMetadata;
        check(a.id === expected.id &&
            a.name === expected.name &&
            a.digest === expected.digest &&
            a.size_in_bytes === expected.bytes &&
            a.created_at === expected.createdAt &&
            a.expires_at === expected.expiresAt &&
            !a.expired &&
            a.workflow_run?.id === p.runId &&
            a.workflow_run.head_sha === p.sourceCommit, 'exact prior native artifact');
    }
    return requireRetainedCustody({
        schemaVersion: 'norton-retained-native-inputs.v1',
        runId: p.runId,
        sourceCommit: p.sourceCommit,
        sourceTree: p.sourceTree,
        sourceJobCompletedAt: source[0].completed_at,
        inputArtifact: p.inputArtifact,
        stopArtifact: p.stopArtifact
    }, now);
}
const retainedRoster = [
    'auditor-bundle/README.md', 'auditor-bundle/worker.js', 'auditor-bundle/worker.js.map', 'equivalence.json', 'source/plan.json', 'source/source.db', 'worker/README.md', 'worker/release-manifest.json', 'worker/worker.js', 'worker/worker.js.map', 'cutover/preview-worker-candidate-cutover-observation.json', 'cutover/preview-worker-candidate-cutover.json', 'cutover/preview-worker-post-mutation-reconciliation.json', 'proof/operator-authorization.json', 'proof/operator-corpus-challenge.json', 'proof/operator-corpus-challenge.json.admission.jsonl', 'proof/operator-proof/operator-proof-envelope.json', 'proof/operator-proof-envelope.json', 'proof/preview-operator-readiness.json', 'proof/preview-operator-readiness.json.budget.json', 'proof/preview-operator-readiness.json.events.jsonl'
].sort();
function bytes(p: string,
max: number) {
    const s = lstatSync(p);
    check(s.isFile() &&
        !s.isSymbolicLink() &&
        s.size <= max, 'bounded regular retained file');
    return readFileSync(p);
}
function roster(directory: string, prefix = ''): string[] {
    const s = lstatSync(directory);
    check(s.isDirectory() &&
        !s.isSymbolicLink(), 'regular retained directory');
    return readdirSync(directory).flatMap(n => {
        const p = join(directory, n), s = lstatSync(p);
        check(!s.isSymbolicLink(), 'retained symlink');
        return s.isDirectory() ? roster(p, prefix + n + '/') : [
            prefix + n
        ];
    }).sort();
}
/** Called after the pinned download action's digest check; no local upload fallback. */
export function stageRetainedInputs(prior: string,
stop: string,
output: string) {
    check(JSON.stringify(roster(prior)) === JSON.stringify(retainedRoster), 'exact historical input roster');
    const eq = bytes(join(prior, 'equivalence.json'), 1024 * 1024), events = bytes(join(stop, 'continuation.events.jsonl'), 1024 * 1024);
    check(sha(eq) === RETAINED_INPUTS.equivalenceSha256 &&
        sha(events) === RETAINED_INPUTS.stopEventsSha256, 'pinned historical attestation/STOP bytes');
    mkdirSync(output, {
        mode: 0o700
    });
    for (const path of retainedRoster.filter(p => /^(source|worker|proof|cutover)\//.test(p))) {
        const to = join(output, path);
        mkdirSync(resolve(to, '..'), {
            recursive: true,
            mode: 0o700
        });
        writeFileSync(to, bytes(join(prior, path), 384 * 1024 * 1024), {
            flag: 'wx',
            mode: 0o600
        });
    }
    writeFileSync(join(output, 'retained-equivalence.json'), eq, {
        flag: 'wx',
        mode: 0o600
    });
    writeFileSync(join(output, 'retained-stop.events.jsonl'), events, {
        flag: 'wx',
        mode: 0o600
    });
}
/** The same local chain is rechecked by the new source job, protected job and production handoff. */
export function verifyRetainedInputEvidence(directory: string,
custody: RetainedCustody,
originals: readonly {
    id: number;
    name: string;
    digest: string;
}[],
originalRun: number,
originalCommit: string, at = Date.now()) {
    requireRetainedCustody(custody, at);
    const eqBytes = bytes(join(directory, 'retained-equivalence.json'), 1024 * 1024), stopBytes = bytes(join(directory, 'retained-stop.events.jsonl'), 1024 * 1024);
    check(sha(eqBytes) === RETAINED_INPUTS.equivalenceSha256 &&
        sha(stopBytes) === RETAINED_INPUTS.stopEventsSha256, 'original attestation/STOP hashes');
    const eq = JSON.parse(eqBytes.toString()), a = eq.admission;
    check(eq.auditorCommit === custody.sourceCommit &&
        eq.auditorTree === custody.sourceTree &&
        a.runId === String(custody.runId) &&
        a.auditorCommit === custody.sourceCommit &&
        a.auditorTree === custody.sourceTree &&
        a.ownerActorId === 40179660 &&
        a.triggeringActorId === 40179660 &&
        eq.freshProof === false, 'original source-job custody attestation');
    check(a.nativeArtifacts?.length === 4, 'four original native artifacts');
    for (const expected of originals) {
        const rows = a.nativeArtifacts.filter((x: any) => x.id === expected.id);
        check(rows.length === 1, 'unique original artifact');
        const v = rows[0];
        check(v.name === expected.name &&
            v.digest === expected.digest &&
            v.originalRunId === originalRun &&
            v.originalSourceCommit === originalCommit &&
            Date.parse(v.expiresAt) > Date.parse(custody.sourceJobCompletedAt), 'original metadata valid at authenticated capture');
    }
    const events = stopBytes.toString().trim().split('\n').map(line => JSON.parse(line)), last = events.at(-1);
    check(last?.kind === 'STOP' &&
        last.stage === 'quota_initial' &&
        last.reason === 'quota_read_reservation' &&
        last.retry === false &&
        last.retainWholeReadReservation === 100000, 'known quota-only STOP');
    check(events.filter(e => e.kind === 'STOP').length === 1 &&
        events.every(e => [
            'control-dispatch', 'corpus-control-http', 'usage-response-observation', 'usage-observation', 'STOP'
        ].includes(e.kind)), 'no candidate SQL or MCP intent/outcome');
    const dispatched = events.filter(e => e.kind === 'control-dispatch');
    check(dispatched.length === 8 &&
        dispatched.every(e => e.method === 'GET' &&
            !e.path.endsWith('/query') || e.method === 'POST' &&
            e.path === '/client/v4/graphql'), 'only known read-only control exchanges');
    return {
        custody,
        originalNativeArtifacts: a.nativeArtifacts,
        quotaStopSha256: sha(stopBytes),
        freshProof: false
    };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [prior, stop, output, ...extra] = process.argv.slice(2);
    check(prior &&
        stop &&
        output &&
        !extra.length, 'exact stage directories');
    stageRetainedInputs(prior!, stop!, output!);
}
