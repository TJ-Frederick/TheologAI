/** Thin adapter for the existing protected PR/production workflows. No operation runs on import. */
import Database from 'better-sqlite3';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { z } from 'zod';
import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSourceProof, CorpusSession, createCorpusD1Executor, verifyCorpus, verifyReceipt, check, hash, sha, TARGETS, LIMITS, LEDGER_SQL, type SourceProof, type Control, type Usage } from './corpus-release.js';
import { captureUnboundCorpusControl, captureCorpusUsage } from './corpus-release-control.js';
import { createCorpusApi } from './corpus-release-api.js';
import { captureEnvironmentIsolationReceipt } from './preview-release-reconciliation.js';
import { auditCorpusRelease } from './audit-corpus-release.js';
import { createCorpusPreviewArtifact, verifyCorpusPreviewArtifact, type CorpusLiveAudit } from './corpus-release-artifact.js';
const digest = z.string().regex(/^[0-9a-f]{64}$/), count = z.number().int().nonnegative();
export const executionApprovalSchema = z.object({ schemaVersion: z.literal('norton-aquinas-execution-approval.v1'), status: z.literal('approved'), role: z.enum(['preview', 'production']), databaseId: z.string().uuid(),
    exclusiveCandidateSql: z.literal(true), candidateJobsPaused: z.literal(true), ownerCustodySha256: digest, windowStart: z.string().datetime(), expiresAt: z.string().datetime(), knownRowsRead: count, knownRowsWritten: count, expectedLedgerSha256: digest, previewCustodyUnbroken: z.boolean().optional(), previewCustodyEvidenceSha256: digest.optional() }).strict();
export type ExecutionApproval = z.infer<typeof executionApprovalSchema>;
export function parseExecutionApproval(value: unknown, role: 'preview' | 'production', now = Date.now()): ExecutionApproval {
    const a = executionApprovalSchema.parse(value);
    if (role === 'production')
        check(a.previewCustodyUnbroken === true && a.previewCustodyEvidenceSha256, 'production requires an unbroken sealed-preview custody witness');
    check(a.role === role && a.databaseId === TARGETS[role].id, 'approval target differs');
    check(a.windowStart === new Date(now).toISOString().slice(0, 10) + 'T00:00:00.000Z' && Date.parse(a.expiresAt) > now && Date.parse(a.expiresAt) <= now + 3 * 60 * 60000, 'approval window expired or unsupported');
    return a;
}
export function executionConfig(text: string, role: 'preview' | 'production', root: string): string {
    const config = parseToml(text) as any;
    check(config.name === 'theologai' && config.env?.preview?.name === 'theologai-preview', 'unexpected Worker config');
    check(config.vars.THEOLOGAI_EXPOSE_CCEL_DISCOVERY === 'false' && config.env.preview.vars.THEOLOGAI_EXPOSE_CCEL_DISCOVERY === 'true', 'corpus requires v6 production/v7 preview');
    for (const vars of [config.vars, config.env.preview.vars])
        check(vars.THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH === 'false' && vars.THEOLOGAI_ENABLE_CCEL_COORDINATOR === 'false' && !vars.THEOLOGAI_PRIMARY_SOURCE_SEARCH_VERSION, 'broader discovery is outside corpus release');
    const set = (target: any, value: typeof TARGETS.preview) => { check(target.d1_databases?.length === 1 && target.d1_databases[0].binding === 'THEOLOGAI_DB', 'noncanonical binding'); target.d1_databases[0] = { ...target.d1_databases[0], database_name: value.name, database_id: value.id, migrations_dir: join(root, 'migrations') }; };
    set(config.env.preview, TARGETS.preview);
    if (role === 'production')
        set(config, TARGETS.production);
    else
        check(config.d1_databases[0].database_id === TARGETS.rollback.id, 'preview must preserve production rollback');
    config.d1_databases[0].migrations_dir = join(root, 'migrations');
    config.main = resolve(root, config.main);
    return stringifyToml(config);
}
export interface ExecutionContext {
    sourceCommit: string;
    sourceTree: string;
    repository: string;
    pullRequest: number;
    workflowRunId: number;
}
function checkedContext(): ExecutionContext {
    execFileSync('git', ['ls-files', '--error-unmatch', 'scripts/corpus-release-operator.ts'], { stdio: 'pipe' });
    execFileSync('git', ['diff', '--quiet', 'HEAD'], { stdio: 'pipe' });
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
    check(sourceCommit === process.env.CORPUS_SOURCE_COMMIT && sourceTree === process.env.CORPUS_SOURCE_TREE, 'checked-out source differs from protected context');
    return { sourceCommit, sourceTree, repository: process.env.GITHUB_REPOSITORY ?? '', pullRequest: Number(process.env.CORPUS_PULL_REQUEST), workflowRunId: Number(process.env.GITHUB_RUN_ID) };
}
function read(path: string): any { return JSON.parse(readFileSync(path, 'utf8')); }
function write(path: string, value: unknown) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
function journal(path: string) { return async (entry: unknown) => { const fd = openSync(path, 'a', 0o600); try {
    appendFileSync(fd, JSON.stringify({ ...entry as object, at: new Date().toISOString() }) + '\n');
    fsyncSync(fd);
}
finally {
    closeSync(fd);
} }; }
export async function executeVerification(input: {
    role: 'preview' | 'production';
    approval: ExecutionApproval;
    context: ExecutionContext;
    root: string;
    databasePath: string;
    output: string;
    api: ReturnType<typeof createCorpusApi>;
    previewAssignment?: {
        deploymentId: string;
        versionId: string;
        databaseId: string;
    };
    now?: () => number;
}) {
    const now = input.now ?? Date.now, started = now();
    const { role, context, approval, api } = input;
    parseExecutionApproval(approval, role, now());
    check(Date.parse(approval.expiresAt) - started >= 120 * 60000 && Date.parse(new Date(started).toISOString().slice(0, 10) + 'T00:00:00.000Z') + 24 * 60 * 60000 - started >= 120 * 60000, 'insufficient single-window custody time');
    const source = buildSourceProof(input.root, input.databasePath), directory = dirname(input.output);
    mkdirSync(directory, { recursive: true });
    const before = await captureUnboundCorpusControl({ role, api, now });
    write(join(directory, 'corpus-control-before.json'), before);
    check(Math.max(before.accountUsage.rowsRead, approval.knownRowsRead) + 3660000 + LIMITS.productionReserve + LIMITS.lagReserve <= LIMITS.dailyReads, 'complete proof/live window not admitted');
    check(Math.max(before.accountUsage.rowsWritten, approval.knownRowsWritten) + LIMITS.proofWrites <= LIMITS.dailyWrites, 'complete proof write reservation not admitted');
    const activeProduction = before.inventory.workers.find(worker => worker.name === 'theologai');
    check(activeProduction && hash(activeProduction.configuredD1) === hash([TARGETS.rollback.id]) && activeProduction.versions.length === 1 && activeProduction.versions[0].percentage === 100 && hash(activeProduction.versions[0].databases) === hash([TARGETS.rollback.id]), 'production rollback assignment changed');
    if (role === 'production') {
        const preview = before.inventory.workers.find(worker => worker.name === 'theologai-preview');
        check(input.previewAssignment && preview && preview.deploymentId === input.previewAssignment.deploymentId && preview.versions.length === 1 && preview.versions[0].percentage === 100 && preview.versions[0].versionId === input.previewAssignment.versionId && hash(preview.configuredD1) === hash([TARGETS.preview.id]) && hash(preview.versions[0].databases) === hash([TARGETS.preview.id]), 'protected preview changed before production proof');
    }
    let usage: Usage = before.accountUsage;
    let knownReads = approval.knownRowsRead, knownWrites = approval.knownRowsWritten;
    const getUsage = async () => { if (now() - Date.parse(usage.observedAt) > 240000) {
        const u = await captureCorpusUsage({ role, api, now });
        usage = { windowStart: u.windowStart, observedAt: u.capturedAt, rowsRead: u.candidate.rowsRead + u.otherDatabases.rowsRead, rowsWritten: u.candidate.rowsWritten + u.otherDatabases.rowsWritten };
    } return { ...usage, rowsRead: Math.max(usage.rowsRead, knownReads), rowsWritten: Math.max(usage.rowsWritten, knownWrites) }; };
    const guard = async () => { parseExecutionApproval(approval, role, now()); check(Date.parse(approval.expiresAt) - now() > 30000, 'custody too near expiry for another operation'); check(now() - started <= LIMITS.durationMs, 'proof duration exceeded'); };
    const execute = createCorpusD1Executor(role, api.authorizedFetch);
    const preflight = new CorpusSession({ databaseId: TARGETS[role].id, execute, usage: getUsage, guard, append: journal(join(directory, 'corpus-preflight-journal.jsonl')) }, { reads: 10000, writes: 0 }, now);
    const ledger = (await preflight.query(LEDGER_SQL, 128)).rows;
    const original = ledger.slice(0, role === 'preview' ? 10 : 9);
    check(sha(JSON.stringify(original)) === approval.expectedLedgerSha256, 'reviewed provider ledger differs');
    knownReads += preflight.reads;
    const control = (capture: typeof before): Control => ({ databaseId: TARGETS[role].id, sourceCommit: context.sourceCommit, sourceTree: context.sourceTree, unbound: true, ownerCustodySha256: approval.ownerCustodySha256, bindingInventorySha256: capture.inventorySha256 });
    let captures = 0;
    const session = new CorpusSession({ databaseId: TARGETS[role].id, execute, usage: getUsage, guard, append: journal(join(directory, 'corpus-verification-journal.jsonl')) }, undefined, now);
    const db = new Database(input.databasePath, { readonly: true, fileMustExist: true });
    let receipt;
    try {
        receipt = await verifyCorpus(source, db, session, { role, sourceCommit: context.sourceCommit, sourceTree: context.sourceTree, expectedLedger: original, captureControl: async () => { if (captures++ === 0)
                return control(before); const after = await captureUnboundCorpusControl({ role, api, now }); await guard(); write(join(directory, 'corpus-control-after.json'), after); return control(after); } });
    }
    finally {
        db.close();
    }
    await guard();
    write(join(directory, 'corpus-source-proof.json'), source);
    write(join(directory, 'corpus-provider-ledger.json'), ledger);
    write(join(directory, 'corpus-approval.json'), approval);
    write(input.output, receipt);
    return receipt;
}
/** Consume the complete proof and current owner lease immediately before Worker activation. No network. */
export function admitActivation(input: {
    role: 'preview' | 'production';
    approval: ExecutionApproval;
    context: ExecutionContext;
    source: SourceProof;
    receipt: unknown;
    ledger: any[];
}, now = Date.now()) {
    const approval = parseExecutionApproval(input.approval, input.role, now);
    check(Date.parse(approval.expiresAt) - now >= 15 * 60000, 'insufficient custody for activation and live profile');
    const receipt = verifyReceipt(input.receipt, input.source, { role: input.role, sourceCommit: input.context.sourceCommit, sourceTree: input.context.sourceTree, control: (input.receipt as any).observed.control, ledger: input.ledger }, now);
    check(receipt.observed.control.ownerCustodySha256 === approval.ownerCustodySha256 && receipt.startedAt.slice(0, 10) === approval.windowStart.slice(0, 10), 'activation custody or allowance window changed');
    return { schemaVersion: 'norton-aquinas-activation-admission.v1', role: input.role, target: receipt.target, sourceCommit: receipt.sourceCommit, sourceTree: receipt.sourceTree, receiptSha256: hash(receipt), ownerCustodySha256: approval.ownerCustodySha256, admittedAt: new Date(now).toISOString() };
}
function options(argv: string[]) { check(argv.length % 2 === 0, 'expected --option value pairs'); const out = new Map<string, string>(); for (let i = 0; i < argv.length; i += 2) {
    check(argv[i].startsWith('--') && !out.has(argv[i]), 'invalid or duplicate option');
    out.set(argv[i], argv[i + 1]);
} return out; }
export async function runCorpusOperator(argv: string[], dependencies: {
    fetch?: typeof fetch;
    readToken?: () => Promise<string>;
} = {}) {
    const [command, ...args] = argv, o = options(args), role = o.get('--role') as 'preview' | 'production', root = process.cwd(), databasePath = join(root, 'data/theologai.db'), output = o.get('--output');
    check(output, '--output required');
    if (command === 'config') {
        check(role === 'preview' || role === 'production', 'role required');
        const config = executionConfig(readFileSync('wrangler.toml', 'utf8'), role, root);
        writeFileSync(output, config, { flag: 'wx', mode: 0o600 });
        return;
    }
    if (command === 'verify') {
        check(role === 'preview' || role === 'production', 'role required');
        const approval = parseExecutionApproval(JSON.parse(process.env.CORPUS_EXECUTION_APPROVAL ?? 'null'), role), context = checkedContext();
        const api = createCorpusApi(role, dependencies.readToken ?? (async () => { check(process.env.CLOUDFLARE_API_TOKEN, 'protected credential unavailable'); return process.env.CLOUDFLARE_API_TOKEN; }), dependencies.fetch);
        const previewArtifact = role === 'production' ? read(join(dirname(output), 'protected-dual-era-preview/corpus-preview-release.json')) : null;
        if (previewArtifact)
            check(previewArtifact.sourceTree === context.sourceTree, 'protected preview source tree differs');
        return executeVerification({ role, approval, context, root, databasePath, output, api, previewAssignment: previewArtifact?.assignment });
    }
    if (command === 'admit-activation') {
        check(role === 'preview' || role === 'production', 'role required');
        const directory = dirname(output), approval = parseExecutionApproval(JSON.parse(process.env.CORPUS_EXECUTION_APPROVAL ?? 'null'), role), context = checkedContext();
        return write(output, admitActivation({ role, approval, context, source: read(join(directory, 'corpus-source-proof.json')), receipt: read(join(directory, 'corpus-verification.json')), ledger: read(join(directory, 'corpus-provider-ledger.json')) }));
    }
    if (command === 'live') {
        check(role === 'preview' || role === 'production', 'role required');
        const directory = dirname(output), source = read(join(directory, 'corpus-source-proof.json')) as SourceProof, receipt = read(join(directory, 'corpus-verification.json')), ledger = read(join(directory, 'corpus-provider-ledger.json')), approval = parseExecutionApproval(JSON.parse(process.env.CORPUS_EXECUTION_APPROVAL ?? 'null'), role), context = checkedContext();
        verifyReceipt(receipt, source, { role, sourceCommit: context.sourceCommit, sourceTree: context.sourceTree, control: receipt.observed.control, ledger });
        const api = createCorpusApi(role, dependencies.readToken ?? (async () => { check(process.env.CLOUDFLARE_API_TOKEN, 'protected credential unavailable'); return process.env.CLOUDFLARE_API_TOKEN; }), dependencies.fetch);
        const usage = await captureCorpusUsage({ role, api });
        const effective = Math.max(usage.candidate.rowsRead + usage.otherDatabases.rowsRead, approval.knownRowsRead + receipt.metering.rowsRead + 128);
        check(effective + LIMITS.liveReads + LIMITS.productionReserve + LIMITS.lagReserve <= LIMITS.dailyReads, 'live profile read admission failed');
        const live = await auditCorpusRelease({ role, root, databasePath, endpoint: role === 'preview' ? 'https://preview-mcp.theologai.xyz/mcp' : 'https://mcp.theologai.xyz/mcp', serverVersion: role === 'preview' ? '3.6.0-preview' : '3.6.0', fetch: dependencies.fetch ?? fetch });
        parseExecutionApproval(approval, role);
        write(output, live);
        return live;
    }
    if (command === 'create-preview-artifact') {
        parseExecutionApproval(JSON.parse(process.env.CORPUS_EXECUTION_APPROVAL ?? 'null'), 'preview');
        const directory = dirname(output), context = checkedContext(), source = read(join(directory, 'corpus-source-proof.json')), verification = read(join(directory, 'corpus-verification.json')), live = read(join(directory, 'corpus-live.json')), ledger = read(join(directory, 'corpus-provider-ledger.json'));
        const identity = read(join(directory, 'preview-worker-deployment-identity.json')), cutover = read(join(directory, 'preview-worker-candidate-cutover.json'));
        check(cutover.candidateBindingMatches === true && cutover.observedActiveVersionId === identity.deployedVersionId && cutover.observedActiveDeploymentId === identity.deploymentId && cutover.observedActiveD1.databaseId === TARGETS.preview.id, 'preview cutover evidence differs');
        const artifact = createCorpusPreviewArtifact({ ...context, sourceCommit: context.sourceCommit, sourceTree: context.sourceTree, verification, live, ledger, control: verification.observed.control, assignment: { worker: 'theologai-preview', deploymentId: identity.deploymentId, versionId: identity.deployedVersionId, versionNumber: identity.deployedVersionNumber, databaseId: TARGETS.preview.id } }, source);
        write(output, artifact);
        return artifact;
    }
    if (command === 'isolation') {
        const dir = dirname(output);
        const text = (name: string) => readFileSync(join(dir, name), 'utf8');
        write(output, captureEnvironmentIsolationReceipt({ productionDeploymentsText: text('final-environment-production-deployments.json'), productionActiveVersionViewText: text('final-environment-production-version.json'), productionAuditedIdentityText: text('production-worker-deployment-identity.json'), previewDeploymentsText: text('final-environment-preview-deployments.json'), previewActiveVersionViewText: text('final-environment-preview-version.json'), wranglerConfigText: readFileSync(join(dir, 'corpus-wrangler.toml'), 'utf8'), d1InventoryText: text('final-environment-d1-inventory.json'), corpusRelease: true }));
        return;
    }
    if (command === 'verify-preview-current') {
        const directory = o.get('--directory'), controlPath = o.get('--control');
        check(directory && controlPath, 'artifact directory and fresh preview control required');
        parseExecutionApproval(JSON.parse(process.env.CORPUS_EXECUTION_APPROVAL ?? 'null'), 'production');
        const artifact = read(join(directory, 'corpus-preview-release.json')), control = read(controlPath);
        check(control.worker === 'theologai-preview' && control.d1?.databaseId === TARGETS.preview.id && control.configuredD1?.databaseId === TARGETS.preview.id && control.workerVersionId === artifact.assignment.versionId && control.deploymentId === artifact.assignment.deploymentId, 'preview assignment changed since protected audit');
        write(output, { schemaVersion: 'norton-aquinas-current-preview.v1', assignment: artifact.assignment, controlSha256: hash(control), artifactSha256: hash(artifact), currentAssignmentChecked: true });
        return;
    }
    if (command === 'consume-preview') {
        const directory = o.get('--directory');
        check(directory, 'artifact directory required');
        const source = buildSourceProof(root, databasePath), artifact = read(join(directory, 'corpus-preview-release.json')), live = read(join(directory, 'corpus-live.json')) as CorpusLiveAudit;
        const expected = { repository: process.env.GITHUB_REPOSITORY ?? '', pullRequest: Number(o.get('--pull-request')), workflowRunId: Number(o.get('--workflow-run-id')), sourceCommit: o.get('--source-commit') ?? '', sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(), protectedProducerSucceeded: true as const, currentPreviewAssignment: artifact.assignment, custodyStillHeld: true as const };
        verifyCorpusPreviewArtifact(artifact, live, source, expected);
        write(output, { schemaVersion: 'norton-aquinas-preview-provenance.v1', repository: expected.repository, sourceCommit: expected.sourceCommit, sourceTree: expected.sourceTree, workflowRunId: expected.workflowRunId, artifactSha256: hash(artifact), assignment: artifact.assignment, currentAssignmentChecked: false });
        return;
    }
    throw Error('Unsupported corpus operator command');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    runCorpusOperator(process.argv.slice(2)).catch(error => { console.error(error instanceof z.ZodError ? 'Corpus execution input is missing, pending or malformed; no candidate operation was authorized.' : error instanceof Error && /^(Corpus release refused:|Corpus control capture refused:)/.test(error.message) ? error.message : 'Corpus release stopped; no retry or raw credential/API/source diagnostics emitted. Inspect the durable local journal.'); process.exitCode = 1; });
