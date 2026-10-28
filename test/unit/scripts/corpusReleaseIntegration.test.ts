import { createCorpusPreviewArtifact } from '../../../scripts/corpus-release-artifact.js';
import { it, expect, describe } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { parse } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { executionConfig, parseExecutionApproval, runCorpusOperator, executeVerification, admitActivation } from '../../../scripts/corpus-release-operator.js';
import { captureUnboundCorpusControl } from '../../../scripts/corpus-release-control.js';
import { createCorpusApi } from '../../../scripts/corpus-release-api.js';
import { TARGETS, PROVIDER_CATALOG, sha } from '../../../scripts/corpus-release.js';
import { trustedCorpusPreviewRun } from '../../../scripts/corpus-release-provenance.mjs';
import { corpusControlFixture, corpusPagesControlFixture } from '../../helpers/corpusControlFixture.js';
import { Native } from '../../helpers/corpusNative.js';
const NOW = Date.parse('2026-10-28T12:00:00Z');
it('covers every post-database Pages deployment with an unambiguous D1-free version witness', async () => {
    const fixture = corpusPagesControlFixture();
    const result = await captureUnboundCorpusControl({ role: 'preview', api: fixture.api, now: () => NOW });
    const histories = result.inventory.pages[0]!.functionAuthority!.histories;
    expect(histories).toHaveLength(2);
    for (const history of histories) {
        expect(history.coverage).toHaveLength(2);
        expect(new Set(history.coverage.map(item => item.versionId)).size).toBe(2);
    }
    expect(fixture.requests.filter(path => path.includes('/corpus-pages-') && path.includes('/versions/'))).toHaveLength(8);
});
it.each(['old-version-d1', 'settings-d1', 'missing-interval-witness', 'overlap', 'unfinished', 'history-gap', 'second-scan-drift'])('refuses Pages authority defect %s before SQL', async (defect) => {
    const fixture = corpusPagesControlFixture((value, path, scan) => {
        if (defect === 'old-version-d1' && /corpus-pages-production\/versions\/33333330/.test(path))
            value.result.resources.bindings.push({ type: 'd1', database_id: TARGETS.preview.id });
        if (defect === 'settings-d1' && path.includes('corpus-pages-') && path.endsWith('/settings'))
            value.result.bindings.push({ type: 'd1', database_id: TARGETS.rollback.id });
        if (defect === 'history-gap' && path.includes('corpus-pages-') && path.includes('/versions?'))
            value.result.items[0].number = 3;
        if (path.startsWith('/pages/projects/corpus-site/deployments?')) {
            if (defect === 'missing-interval-witness') {
                value.result[0].stages[0].started_on = value.result[0].latest_stage.started_on = '2026-10-25T12:00:01Z';
            }
            if (defect === 'overlap') {
                value.result[1].stages[0].started_on = value.result[1].latest_stage.started_on = '2026-10-25T12:00:00Z';
            }
            if (defect === 'unfinished')
                value.result[0].latest_stage.status = 'active';
            if (defect === 'second-scan-drift' && scan === 2)
                value.result[0].modified_on = '2026-10-25T12:03:00Z';
        }
    });
    await expect(captureUnboundCorpusControl({ role: 'preview', api: fixture.api, now: () => NOW })).rejects.toThrow('Corpus control capture refused:');
});
const approval = { schemaVersion: 'norton-aquinas-execution-approval.v1', status: 'approved', role: 'preview', databaseId: TARGETS.preview.id, exclusiveCandidateSql: true, candidateJobsPaused: true, ownerCustodySha256: 'c'.repeat(64), windowStart: '2026-10-28T00:00:00.000Z', expiresAt: '2026-10-28T14:30:00.000Z', knownRowsRead: 0, knownRowsWritten: 0, expectedLedgerSha256: 'd'.repeat(64) };
it('defaults closed before credentials or network when approval is missing or pending', async () => {
    const prior = process.env.CORPUS_EXECUTION_APPROVAL;
    process.env.CORPUS_EXECUTION_APPROVAL = JSON.stringify({ ...approval, status: 'pending' });
    let tokenCalls = 0;
    try {
        await expect(runCorpusOperator(['verify', '--role', 'preview', '--output', '/unused'], { readToken: async () => { tokenCalls++; return 'sentinel'; } })).rejects.toThrow();
        expect(tokenCalls).toBe(0);
    }
    finally {
        if (prior === undefined)
            delete process.env.CORPUS_EXECUTION_APPROVAL;
        else
            process.env.CORPUS_EXECUTION_APPROVAL = prior;
    }
});
it('rejects expired, other-target and next-day custody', () => {
    expect(parseExecutionApproval(approval, 'preview', NOW).databaseId).toBe(TARGETS.preview.id);
    for (const change of [{ expiresAt: '2026-10-28T11:59:00.000Z' }, { databaseId: TARGETS.production.id }, { windowStart: '2026-10-27T00:00:00.000Z' }])
        expect(() => parseExecutionApproval({ ...approval, ...change }, 'preview', NOW)).toThrow();
});
it('generates only the selected execution bindings and keeps both public profiles and secrets untouched', () => {
    const original = readFileSync('wrangler.toml', 'utf8'), preview = parse(executionConfig(original, 'preview', '/release')) as any, production = parse(executionConfig(original, 'production', '/release')) as any;
    expect(preview.d1_databases[0].database_id).toBe(TARGETS.rollback.id);
    expect(preview.env.preview.d1_databases[0].database_id).toBe(TARGETS.preview.id);
    expect(production.d1_databases[0].database_id).toBe(TARGETS.production.id);
    expect(preview.vars.THEOLOGAI_EXPOSE_CCEL_DISCOVERY).toBe('false');
    expect(preview.env.preview.vars.THEOLOGAI_EXPOSE_CCEL_DISCOVERY).toBe('true');
    expect(readFileSync('wrangler.toml', 'utf8')).toBe(original);
    expect(preview.main).toBe('/release/src/worker.ts');
});
it('captures a complete stable unbound inventory and refuses a bound target', async () => {
    const fixture = corpusControlFixture();
    const control = await captureUnboundCorpusControl({ role: 'preview', api: fixture.api, now: () => NOW });
    expect(control.databaseId).toBe(TARGETS.preview.id);
    expect(control.httpExchanges).toBeLessThan(256);
    fixture.setBound(true);
    await expect(captureUnboundCorpusControl({ role: 'preview', api: fixture.api, now: () => NOW })).rejects.toThrow('candidate_database_is_bound');
});
it('does not obtain credentials for an unapproved API route', async () => {
    let calls = 0;
    const api = createCorpusApi('preview', async () => { calls++; return 'sentinel'; });
    await expect(api.authorizedFetch('https://example.com/', { method: 'POST' })).rejects.toThrow();
    expect(calls).toBe(0);
});
it('requires the actual protected PR workflow and successful preview deployment job', () => {
    const pull = { number: 1, base: { ref: 'main' }, head: { sha: 'a'.repeat(40), repo: { full_name: 'owner/repo' } } }, artifact = { name: 'preview-release-audit-1-' + pull.head.sha, expired: false, workflow_run: { id: 2, head_sha: pull.head.sha }, created_at: '2026-10-28T11:00:00Z' }, run = { id: 2, event: 'pull_request', status: 'completed', conclusion: 'success', head_sha: pull.head.sha, head_repository: { full_name: 'owner/repo' }, path: '.github/workflows/pr.yml', pull_requests: [{ number: 1 }], run_started_at: '2026-10-28T10:00:00Z' }, jobs = [{ name: 'Deploy Preview', conclusion: 'success' }];
    expect(trustedCorpusPreviewRun(artifact, run, jobs, pull, 'owner/repo', NOW)).toBe(true);
    for (const bad of [{ ...run, path: '.github/workflows/other.yml' }, { ...run, event: 'workflow_dispatch' }, { ...run, head_sha: 'b'.repeat(40) }, { ...run, run_started_at: '2026-10-28T11:30:00Z' }])
        expect(trustedCorpusPreviewRun(artifact, bad, jobs, pull, 'owner/repo', NOW)).toBe(false);
    expect(trustedCorpusPreviewRun(artifact, run, [], pull, 'owner/repo', NOW)).toBe(false);
});
it('wires the existing protected jobs to the actual operator and retains separate production approval and revocation', () => {
    const pr = parseYaml(readFileSync('.github/workflows/pr.yml', 'utf8')), prod = parseYaml(readFileSync('.github/workflows/deploy.yml', 'utf8'));
    const steps = pr.jobs['preview-deploy'].steps, verify = steps.findIndex((s: any) => s.run?.includes('operator.ts verify ')), deploy = steps.findIndex((s: any) => s.id === 'preview-worker-deploy'), live = steps.findIndex((s: any) => s.id === 'preview-corpus-live');
    expect(verify).toBeGreaterThan(-1);
    expect(verify).toBeLessThan(deploy);
    expect(live).toBeGreaterThan(deploy);
    for (const job of [pr.jobs['preview-deploy'], prod.jobs.deploy]) {
        const admission = job.steps.findIndex((s: any) => s.id === 'corpus-activation-admission'), activation = job.steps.findIndex((s: any) => s.id?.endsWith('worker-deploy'));
        expect(admission).toBe(activation - 1);
    }
    expect(pr.jobs['preview-deploy'].environment.name).toBe('preview');
    expect(prod.jobs.deploy.environment.name).toBe('production');
    expect(pr.jobs['preview-deploy'].concurrency['cancel-in-progress']).toBe(false);
    for (const job of [pr.jobs['preview-deploy'], prod.jobs.deploy]) {
        expect(JSON.stringify(job)).not.toMatch(/npm run audit:(historical|original-language|primary-source-edge)/);
        const ids = new Set(job.steps.map((s: any) => s.id).filter(Boolean));
        for (const m of JSON.stringify(job).matchAll(/steps\.([\w-]+)\.(?:outcome|outputs)/g))
            expect(ids.has(m[1]), m[1]).toBe(true);
    }
    expect(JSON.stringify(prod.jobs['verify-dual-era-preview'])).toContain('trustedCorpusPreviewRun');
    expect(JSON.stringify(prod.jobs.deploy)).toContain('verify-preview-current');
    expect(JSON.stringify(pr.jobs['preview-deploy'])).not.toContain('wrangler secret put');
});
it.skipIf(!existsSync('data/theologai.db'))('runs the protected verification driver against native source data, including exact preflight ledger pinning', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'corpus-integrated-')), path = join(directory, 'target.db');
    copyFileSync('data/theologai.db', path);
    const manifest = JSON.parse(readFileSync('data/data-manifest.json', 'utf8')), ledger = manifest.materializations.d1.migrations.map((m: any, i: number) => ({ id: i + 1, name: m.path.split('/').at(-1), applied_at: '2026-10-28 10:00:00' }));
    const db = new Database(path);
    for (const object of PROVIDER_CATALOG)
        db.exec(String(object.sql));
    for (const row of ledger)
        db.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(?,?,?)').run(row.id, row.name, row.applied_at);
    db.close();
    const native = new Native(join(directory, 'native')), fixture = corpusControlFixture();
    let calls = 0;
    try {
        await native.load(path);
        const api = { ...fixture.api, authorizedFetch: (async (url: any, init: any) => { expect(String(url)).toContain(TARGETS.preview.id); const sql = JSON.parse(init.body).sql; const measured = await native.exec(sql); calls++; return Response.json({ success: true, result: [{ success: true, results: measured.rows, meta: { rows_read: measured.rowsRead, rows_written: measured.rowsWritten } }] }); }) as typeof fetch };
        const receipt = await executeVerification({ role: 'preview', approval: parseExecutionApproval({ ...approval, expectedLedgerSha256: sha(JSON.stringify(ledger)) }, 'preview', NOW), context: { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), repository: 'owner/repo', pullRequest: 1, workflowRunId: 2 }, root: process.cwd(), databasePath: 'data/theologai.db', output: join(directory, 'corpus-verification.json'), api, now: () => NOW });
        const inputs = { role: 'preview' as const, approval: parseExecutionApproval({ ...approval, expectedLedgerSha256: sha(JSON.stringify(ledger)) }, 'preview', NOW), context: { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), repository: 'owner/repo', pullRequest: 1, workflowRunId: 2 }, source: JSON.parse(readFileSync(join(directory, 'corpus-source-proof.json'), 'utf8')), receipt, ledger };
        expect(admitActivation(inputs, NOW).target.id).toBe(TARGETS.preview.id);
        expect(() => admitActivation({ ...inputs, approval: { ...inputs.approval, ownerCustodySha256: 'f'.repeat(64) } }, NOW)).toThrow('custody');
        expect(() => admitActivation(inputs, NOW + 140 * 60000)).toThrow('custody');
        expect(receipt.metering.requests).toBe(3336);
        expect(calls).toBe(3337);
        expect(receipt.metering.rowsRead).toBe(3346717);
        expect(receipt.metering.rowsWritten).toBe(4);
        writeFileSync('../integrated-driver-proof.json', JSON.stringify({ result: 'PASS', localOnly: true, sqlRequests: calls, proof: receipt.metering, preflightExtraRowsRead: 10, remoteMutations: 0 }, null, 2));
    }
    finally {
        await native.close();
        rmSync(directory, { recursive: true, force: true });
    }
}, 120000);
it('rejects the old production server version in a preview artifact', () => {
    const live = { schemaVersion: 'norton-aquinas-live.v1', role: 'preview', endpoint: 'https://preview-mcp.theologai.xyz/mcp', productProfile: '7', broaderV9Features: false, sourceBodyOutput: false, serverVersion: '3.6.0' };
    expect(() => createCorpusPreviewArtifact({ live } as any, {} as any, NOW)).toThrow('wrong corpus live profile');
});
it('requires an explicit sealed-preview continuity witness for production', () => {
    const value = { ...approval, role: 'production', databaseId: TARGETS.production.id };
    expect(() => parseExecutionApproval(value, 'production', NOW)).toThrow('custody witness');
    expect(parseExecutionApproval({ ...value, previewCustodyUnbroken: true, previewCustodyEvidenceSha256: 'e'.repeat(64) }, 'production', NOW).role).toBe('production');
});
it('does not begin a proof in an insufficient custody window', async () => {
    const fixture = corpusControlFixture();
    await expect(executeVerification({ role: 'preview', approval: parseExecutionApproval({ ...approval, expiresAt: '2026-10-28T13:00:00.000Z' }, 'preview', NOW), context: { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), repository: 'owner/repo', pullRequest: 1, workflowRunId: 2 }, root: process.cwd(), databasePath: '/does-not-exist', output: '/unused', api: { ...fixture.api, authorizedFetch: fetch }, now: () => NOW })).rejects.toThrow('single-window custody');
});
