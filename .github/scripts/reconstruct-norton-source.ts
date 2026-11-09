/** Release-specific recovery of the original cc14 bytes; never a fresh remote proof. */
import { createHash, randomUUID } from 'node:crypto';
import { constants, copyFileSync, lstatSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, readdirSync, openSync, closeSync, fsyncSync, writeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
export const SOURCE_RECOVERY = Object.freeze({ directory: 'release/norton-aquinas-recovery', statisticsBytes: 307777, statisticsSha256: '379d676e70f30f94fc87e9e462bbb06c2b92a895aa3022b0f2345165dbb1d496', metadataBytes: 1526086, metadataSha256: 'c04fd2ba6e98ce14d48a8114527f372716f5a2a897f600eb4ce23c476742f4ee', manifestSha256: 'c54cc9443a10d0d4ed6c0b182831518e7a800752e12c1752fce448c071782f97', databaseBytes: 348463104, databaseSha256: '3f8a53c37a585b5c42b2410d7f3167645f738bbf90b51d43b2c0378efb4f898c', workerSha256: '9d9cff3b7d252a9c47a5316d643e4a91e3309989909f648041dcbcc7a70e659b', originalRun: 42226589902, originalSource: '91a458ba77abd05191f855b3cb80fc811dd2552b', originalJob: 127921535696, capturedAt: '2026-11-06T13:35:14Z', originalArtifact: 13505817745, originalArchiveBytes: 102846532, originalArchiveSha256: '5e7694da3a0d7bc6d656e8d19a84637bffe536f58b3a6948a400e5cc89542600', sqlite: '3.51.2', node: 'v22.23.4' });
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const check = (v: unknown, s: string): void => {
    if (!v)
        throw Error('Original Norton source recovery refused: ' + s);
};
function bytes(p: string, max: number) { const s = lstatSync(p); check(s.isFile() && !s.isSymbolicLink() && s.size > 0 && s.size <= max, 'bounded regular file'); return readFileSync(p); }
function pinned(root: string, name: string, hash: string, size?: number) { const b = bytes(join(root, SOURCE_RECOVERY.directory, name), 16 * 1024 * 1024); check(sha(b) === hash && (!size || b.length === size), 'pinned recovery payload'); return b; }
function manifest(root: string): Record<string, {
    bytes: number;
    sha256: string;
}> { return JSON.parse(pinned(root, 'original-metadata-files.json', SOURCE_RECOVERY.manifestSha256).toString()); }
function ownedDirectory(p: string) { const s = lstatSync(p); check(s.isDirectory() && !s.isSymbolicLink(), 'regular recovery directory'); }
function freelist(b: Buffer) {
    let page = b.readUInt32BE(32);
    const found = new Set<number>(), trunks = new Set<number>(), limit = b.length / 4096;
    while (page) {
        check(page > 1 && page <= limit && !trunks.has(page), 'freelist trunk bounds');
        trunks.add(page);
        check(!found.has(page), 'disjoint freelist trunk');
        found.add(page);
        const offset = (page - 1) * 4096, count = b.readUInt32BE(offset + 4);
        check(count <= 1022, 'freelist leaf count');
        for (let i = 0; i < count; i++) {
            const leaf = b.readUInt32BE(offset + 8 + 4 * i);
            check(leaf > 1 && leaf <= limit && !found.has(leaf), 'disjoint bounded freelist leaf');
            found.add(leaf);
        }
        page = b.readUInt32BE(offset);
    }
    check(found.size === b.readUInt32BE(36), 'complete freelist');
    return found;
}
/** Only the owned fresh build is replaced, after the complete original byte hash matches. */
export function reconstructNortonSource(root: string, directory: string, bundle: string) {
    ownedDirectory(directory);
    ownedDirectory(join(directory, 'source'));
    const payload = JSON.parse(pinned(root, 'statistics-pages.json', SOURCE_RECOVERY.statisticsSha256, SOURCE_RECOVERY.statisticsBytes).toString());
    const source = join(directory, 'source/source.db'), before = bytes(source, SOURCE_RECOVERY.databaseBytes);
    check(before.length === SOURCE_RECOVERY.databaseBytes, 'exact fresh build size');
    check(process.version === SOURCE_RECOVERY.node, 'pinned Node runtime');
    check(payload.schemaVersion === 'norton-exact-source-statistics-pages.v1' && payload.databaseSha256 === SOURCE_RECOVERY.databaseSha256 && payload.databaseBytes === before.length && payload.pageSize === 4096 && payload.pages.length === 55, 'closed original recovery target');
    check(before.subarray(0, 16).toString() === 'SQLite format 3\0' && before.readUInt16BE(16) === 4096, 'SQLite page format');
    const free = freelist(before), seen = new Set<number>(), db = new Database(source, { readonly: true, fileMustExist: true });
    let sqlite: string;
    try {
        sqlite = (db.prepare('SELECT sqlite_version() version').get() as {
            version: string;
        }).version;
        check(sqlite === SOURCE_RECOVERY.sqlite && db.pragma('page_size', { simple: true }) === 4096, 'pinned SQLite build');
        const owners = new Map((db.prepare("SELECT pageno,name FROM dbstat WHERE name IN ('sqlite_stat1','sqlite_stat4')").all() as {
            pageno: number;
            name: string;
        }[]).map(r => [r.pageno, r.name]));
        for (const p of payload.pages) {
            check(Object.keys(p).sort().join(',') === 'base64,kind,page,sha256' && Number.isSafeInteger(p.page) && p.page > 1 && p.page <= before.length / 4096 && !seen.has(p.page), 'exact disjoint bounded pages');
            seen.add(p.page);
            const owner = owners.get(p.page);
            check(['sqlite_stat1', 'sqlite_stat4', 'freelist'].includes(p.kind) && ((free.has(p.page) && owner === undefined) || (!free.has(p.page) && owner !== undefined)), 'statistics/freelist pages only');
            const b = Buffer.from(p.base64, 'base64');
            check(b.length === 4096 && b.toString('base64') === p.base64 && sha(b) === p.sha256, 'exact original page bytes');
        }
        check(payload.pages.filter((p: any) => p.kind === 'sqlite_stat1').length === 3 && payload.pages.filter((p: any) => p.kind === 'sqlite_stat4').length === 50 && payload.pages.filter((p: any) => p.kind === 'freelist').length === 2, 'exact page-kind inventory');
    }
    finally {
        db.close();
    }
    const temporary = join(directory, 'source', '.original-' + randomUUID() + '.db');
    let tempOwned = false;
    try {
        copyFileSync(source, temporary, constants.COPYFILE_EXCL);
        tempOwned = true;
        const fd = openSync(temporary, 'r+');
        try {
            for (const p of payload.pages) {
                const b = Buffer.from(p.base64, 'base64');
                check(writeSync(fd, b, 0, b.length, (p.page - 1) * 4096) === 4096, 'complete original page write');
            }
            fsyncSync(fd);
        }
        finally {
            closeSync(fd);
        }
        const restored = bytes(temporary, SOURCE_RECOVERY.databaseBytes), restoredFree = freelist(restored), original = new Database(temporary, { readonly: true, fileMustExist: true });
        try {
            const owners = new Map((original.prepare("SELECT pageno,name FROM dbstat WHERE name IN ('sqlite_stat1','sqlite_stat4')").all() as {
                pageno: number;
                name: string;
            }[]).map(r => [r.pageno, r.name]));
            for (const p of payload.pages) {
                const owner = owners.get(p.page);
                check(p.kind === 'freelist' ? restoredFree.has(p.page) && owner === undefined : !restoredFree.has(p.page) && owner === p.kind, 'exact original output page inventory');
            }
        }
        finally {
            original.close();
        }
        check(sha(bytes(temporary, SOURCE_RECOVERY.databaseBytes)) === SOURCE_RECOVERY.databaseSha256, 'whole original database bytes');
        renameSync(temporary, source);
        tempOwned = false;
    }
    finally {
        if (tempOwned)
            rmSync(temporary);
    }
    const entries = manifest(root), archive = pinned(root, 'original-metadata.zip', SOURCE_RECOVERY.metadataSha256, SOURCE_RECOVERY.metadataBytes), stage = mkdtempSync(join(directory, '.original-metadata-'));
    try {
        const zip = join(stage, 'input.zip');
        writeFileSync(zip, archive, { flag: 'wx', mode: 0o600 });
        const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 60000 }).trim().split('\n');
        check(JSON.stringify(names.sort()) === JSON.stringify(Object.keys(entries).sort()) && names.every(n => !n.startsWith('/') && !n.split('/').includes('..')), 'exact immutable metadata roster');
        const unpack = join(stage, 'unpack');
        mkdirSync(unpack, { mode: 0o700 });
        execFileSync('unzip', ['-q', zip, '-d', unpack]);
        for (const [name, pin] of Object.entries(entries)) {
            const b = bytes(join(unpack, name), 16 * 1024 * 1024);
            check(b.length === pin.bytes && sha(b) === pin.sha256, 'exact immutable metadata bytes');
            const target = join(directory, name);
            mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
            writeFileSync(target, b, { flag: 'wx', mode: 0o600 });
        }
        const worker = bytes(join(bundle, 'worker.js'), 16 * 1024 * 1024);
        check(sha(worker) === SOURCE_RECOVERY.workerSha256, 'unchanged compiled Worker');
        writeFileSync(join(directory, 'worker/worker.js'), worker, { flag: 'wx', mode: 0o600 });
    }
    finally {
        rmSync(stage, { recursive: true });
    }
    const record = { schemaVersion: 'norton-reconstructed-original-source.v1', inputBuildSha256: sha(before), originalDatabaseSha256: SOURCE_RECOVERY.databaseSha256, statisticsSha256: SOURCE_RECOVERY.statisticsSha256, metadataSha256: SOURCE_RECOVERY.metadataSha256, patchedPages: 55, node: process.version, sqlite: SOURCE_RECOVERY.sqlite, freshRemoteProof: false };
    writeFileSync(join(directory, 'source-recovery.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return record;
}
export function verifyRecoveredNortonInputs(root: string, directory: string) {
    for (const [name, pin] of Object.entries(manifest(root))) {
        const b = bytes(join(directory, name), 16 * 1024 * 1024);
        check(b.length === pin.bytes && sha(b) === pin.sha256, 'original metadata still exact');
    }
    check(sha(bytes(join(directory, 'source/source.db'), SOURCE_RECOVERY.databaseBytes)) === SOURCE_RECOVERY.databaseSha256, 'whole original source remains exact');
    const r = JSON.parse(bytes(join(directory, 'source-recovery.json'), 60000).toString());
    check(Object.keys(r).sort().join(',') === 'freshRemoteProof,inputBuildSha256,metadataSha256,node,originalDatabaseSha256,patchedPages,schemaVersion,sqlite,statisticsSha256' && r.schemaVersion === 'norton-reconstructed-original-source.v1' && /^[a-f0-9]{64}$/.test(r.inputBuildSha256) && r.originalDatabaseSha256 === SOURCE_RECOVERY.databaseSha256 && r.statisticsSha256 === SOURCE_RECOVERY.statisticsSha256 && r.metadataSha256 === SOURCE_RECOVERY.metadataSha256 && r.patchedPages === 55 && r.node === SOURCE_RECOVERY.node && r.sqlite === SOURCE_RECOVERY.sqlite && r.freshRemoteProof === false, 'exact recovery record, never fresh remote proof');
    const c = JSON.parse(bytes(join(directory, 'recovery-native-capture.json'), 60000).toString()), a = c.artifact;
    check(c.schemaVersion === 'norton-original-source-capture.v1' && c.runId === SOURCE_RECOVERY.originalRun && c.sourceCommit === SOURCE_RECOVERY.originalSource && c.sourceTree === '7c581c248f52529fd2c03577a88b3edb8ae6695d' && c.ownerActorId === 40179660 && c.triggeringActorId === 40179660 && c.runAttempt === 1 && c.event === 'workflow_dispatch' && c.path === '.github/workflows/pr.yml' && c.sourceJobId === SOURCE_RECOVERY.originalJob && c.sourceJobCompletedAt === SOURCE_RECOVERY.capturedAt && c.sourceJobConclusion === 'success' && a.id === SOURCE_RECOVERY.originalArtifact && a.size_in_bytes === SOURCE_RECOVERY.originalArchiveBytes && a.digest === 'sha256:' + SOURCE_RECOVERY.originalArchiveSha256 && a.workflow_run.id === c.runId && a.workflow_run.head_sha === c.sourceCommit && Date.parse(a.created_at) <= Date.parse(c.sourceJobCompletedAt) && Date.parse(a.expires_at) > Date.parse(c.sourceJobCompletedAt) && a.expired === false, 'original captured native provenance at its historical timestamp');
    return c;
}
export async function requireRecoveredNativeMetadata(github: (route: string) => Promise<any>) {
    const p = SOURCE_RECOVERY, run = await github('/actions/runs/' + p.originalRun), jobs = await github('/actions/runs/' + p.originalRun + '/jobs?per_page=100');
    check(run.id === p.originalRun && run.head_sha === p.originalSource && run.run_attempt === 1 && run.event === 'workflow_dispatch' && run.path === '.github/workflows/pr.yml' && run.status === 'completed' && run.conclusion === 'failure' && run.actor?.id === 40179660 && run.triggering_actor?.id === 40179660, 'original native owner/source run');
    check(jobs.total_count === jobs.jobs.length && jobs.total_count <= 100, 'complete original source jobs');
    const source = jobs.jobs.filter((j: any) => j.id === p.originalJob && j.name === 'Verify deployed Norton candidate and distinct auditor (no cloud credentials)' && j.status === 'completed' && j.conclusion === 'success' && j.completed_at === p.capturedAt);
    check(source.length === 1, 'authenticated original source capture');
    return { runId: p.originalRun, sourceCommit: p.originalSource, sourceJobId: p.originalJob, capturedAt: p.capturedAt, originalNativeArtifactId: p.originalArtifact, originalArchiveSha256: p.originalArchiveSha256, freshRemoteProof: false };
}
/** Bind the already verified Ubuntu bytes; never repeat a stochastic source build after approval. */
export async function requireRehearsalNativeInputs(github: (route: string) => Promise<any>, pin: {
    rehearsalRunId: number;
    rehearsalArtifactId: number;
    rehearsalArtifactDigest: string;
}, source: {
    commit: string;
    tree: string;
}, now = Date.now()) {
    const run = await github('/actions/runs/' + pin.rehearsalRunId), jobs = await github('/actions/runs/' + pin.rehearsalRunId + '/jobs?per_page=100'), a = await github('/actions/artifacts/' + pin.rehearsalArtifactId);
    check(run.id === pin.rehearsalRunId && run.path === '.github/workflows/pr.yml' && run.event === 'pull_request' && Array.isArray(run.pull_requests) && run.pull_requests.some((p: any) => p.number === 176) && run.head_sha === source.commit && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0 && run.status === 'completed' && run.conclusion === 'success', 'successful exact-head Ubuntu CI rehearsal');
    check(jobs.total_count === jobs.jobs.length && jobs.total_count <= 100, 'complete rehearsal job roster');
    const data = jobs.jobs.filter((j: any) => j.name === 'Fresh Checkout & Data' && j.status === 'completed' && j.conclusion === 'success');
    check(data.length === 1 && Number.isSafeInteger(data[0].id) && data[0].id > 0 && ['Rehearse complete original Norton source recovery without cloud credentials', 'Retain original source recovery rehearsal result', 'Retain original source recovery rehearsal inputs'].every(name => data[0].steps.filter((s: any) => s.name === name && s.conclusion === 'success').length === 1), 'actual Ubuntu reconstruction and native retention passed');
    check(a.id === pin.rehearsalArtifactId && a.name === 'norton-original-source-inputs-' + pin.rehearsalRunId + '-attempt-' + run.run_attempt && a.digest === pin.rehearsalArtifactDigest && /^sha256:[a-f0-9]{64}$/.test(a.digest) && a.expired === false && Number.isSafeInteger(a.size_in_bytes) && a.size_in_bytes > 0 && a.size_in_bytes <= 128 * 1024 * 1024 && Number.isFinite(Date.parse(a.created_at)) && Date.parse(a.created_at) <= now && Date.parse(a.expires_at) > now + 60000 && a.workflow_run?.id === run.id && a.workflow_run.head_sha === source.commit, 'owner-pinned unexpired CI input artifact');
    return { runId: run.id, runAttempt: run.run_attempt, sourceCommit: source.commit, sourceTree: source.tree, jobId: data[0].id, artifact: { id: a.id, name: a.name, digest: a.digest, bytes: a.size_in_bytes, createdAt: a.created_at, expiresAt: a.expires_at }, freshRemoteProof: false };
}
export function verifyRehearsalInputWitness(directory: string, source: {
    commit: string;
    tree: string;
}) {
    const r = JSON.parse(bytes(join(directory, 'original-source-rehearsal.json'), 60000).toString()), record = JSON.parse(bytes(join(directory, 'source-recovery.json'), 60000).toString());
    check(Object.keys(r).sort().join(',') === 'allOriginalProofAndFourIntegrityReceiptsVerified,auditorCommit,auditorTree,candidateSourceCommit,freshRemoteProof,originalDatabaseSha256,originalNativeArchiveSha256,originalNativeArtifact,originalNativeRun,originalProofSha256,originalVerificationAt,reconstruction,releaseAcceptance,remoteOperations,schemaVersion,workerSha256' && r.schemaVersion === 'norton-original-source-rehearsal.v1' && /^[a-f0-9]{40}$/.test(r.auditorCommit) && r.auditorTree === source.tree && r.candidateSourceCommit === 'cc14e062d772e957a24a64bfc15a679ebaca8109' && r.originalDatabaseSha256 === SOURCE_RECOVERY.databaseSha256 && r.workerSha256 === SOURCE_RECOVERY.workerSha256 && r.originalProofSha256 === '74842d254f0c6312f02d3b9908d3dcf8a5b24752f2eb6a93e4490856cb78f724' && r.originalVerificationAt === '2026-11-05T02:45:14.748Z' && r.originalNativeRun === SOURCE_RECOVERY.originalRun && r.originalNativeArtifact === SOURCE_RECOVERY.originalArtifact && r.originalNativeArchiveSha256 === SOURCE_RECOVERY.originalArchiveSha256 && r.allOriginalProofAndFourIntegrityReceiptsVerified === true && r.freshRemoteProof === false && r.releaseAcceptance === false && r.remoteOperations === 0 && JSON.stringify(r.reconstruction) === JSON.stringify(record), 'same-tree complete Ubuntu source rehearsal, never release acceptance');
    return r;
}
