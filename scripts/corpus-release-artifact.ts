/** Corpus adapter for the existing protected preview artifact producer/consumer. */
import { z } from 'zod';
import { check, hash, receiptSchema, verifyReceipt, TARGETS, type SourceProof, type Control } from './corpus-release.js';
import type { Row } from './corpus-release-data.js';
import type { auditCorpusRelease } from './audit-corpus-release.js';
const digest = z.string().regex(/^[0-9a-f]{64}$/), git = z.string().regex(/^[0-9a-f]{40}$/);
const assignment = z.object({ worker: z.literal('theologai-preview'), deploymentId: z.string().uuid(), versionId: z.string().uuid(), versionNumber: z.number().int().positive(), databaseId: z.literal(TARGETS.preview.id) }).strict();
const schema = z.object({ schemaVersion: z.literal('norton-aquinas-protected-preview.v1'), repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/), pullRequest: z.number().int().positive(), workflowRunId: z.number().int().positive(), sourceCommit: git, sourceTree: git,
    createdAt: z.string().datetime(), verification: receiptSchema, liveSha256: digest, sourceProofSha256: digest, assignment, ledger: z.array(z.record(z.string(), z.unknown())) }).strict();
export type CorpusPreviewArtifact = z.infer<typeof schema>;
export type CorpusLiveAudit = Awaited<ReturnType<typeof auditCorpusRelease>>;
function validateLive(live: CorpusLiveAudit, source: SourceProof) {
    check(live.schemaVersion === 'norton-aquinas-live.v1' && live.role === 'preview' && live.serverVersion === '3.6.0-preview' && live.endpoint === 'https://preview-mcp.theologai.xyz/mcp' && live.productProfile === '7' && live.broaderV9Features === false && live.sourceBodyOutput === false, 'wrong corpus live profile');
    check(hash(live.checks.map(c => c.era + '/' + c.id).sort()) === 'e7477b05d7f4ecfb9331eaf1189d0534617bd56e4db696574050efb5bcd316be', 'fixed live operation inventory differs');
    check(hash(live.protocols) === hash(['2025-11-25', '2026-07-28']) && live.checks.length === 370 && live.checks.every(c => c.passed === true), 'incomplete fixed corpus live audit');
    check(live.databaseSha256 === source.databaseSha256 && live.manifestSha256 === source.manifestSha256, 'live audit source differs');
    check(hash(live.fingerprints[0]) === hash(live.fingerprints[1]), 'live protocol contracts differ');
}
/** Call only inside the existing protected producer after authenticated assignment reconciliation. */
export function createCorpusPreviewArtifact(input: {
    repository: string;
    pullRequest: number;
    workflowRunId: number;
    sourceCommit: string;
    sourceTree: string;
    verification: unknown;
    live: CorpusLiveAudit;
    assignment: z.infer<typeof assignment>;
    control: Control;
    ledger: Row[];
}, source: SourceProof, now = Date.now()): CorpusPreviewArtifact {
    validateLive(input.live, source);
    const verification = verifyReceipt(input.verification, source, { role: 'preview', sourceCommit: input.sourceCommit, sourceTree: input.sourceTree, control: input.control, ledger: input.ledger }, now);
    return schema.parse({ schemaVersion: 'norton-aquinas-protected-preview.v1', repository: input.repository, pullRequest: input.pullRequest, workflowRunId: input.workflowRunId, sourceCommit: input.sourceCommit, sourceTree: input.sourceTree, createdAt: new Date(now).toISOString(), verification, liveSha256: hash(input.live), sourceProofSha256: hash(source), assignment: input.assignment, ledger: input.ledger });
}
/** GitHub run/artifact provenance and current assignment come from the existing trusted consumer, never this JSON. */
export function verifyCorpusPreviewArtifact(value: unknown, live: CorpusLiveAudit, source: SourceProof, expected: {
    repository: string;
    pullRequest: number;
    workflowRunId: number;
    sourceCommit: string;
    sourceTree: string;
    protectedProducerSucceeded: true;
    currentPreviewAssignment: z.infer<typeof assignment>;
    custodyStillHeld: true;
}, now = Date.now()): CorpusPreviewArtifact {
    const artifact = schema.parse(value);
    check(expected.protectedProducerSucceeded === true && expected.custodyStillHeld === true, 'protected producer or custody unavailable');
    for (const key of ['repository', 'pullRequest', 'workflowRunId', 'sourceCommit', 'sourceTree'] as const)
        check(artifact[key] === expected[key], `protected source/provenance differs: ${key}`);
    check(hash(artifact.assignment) === hash(expected.currentPreviewAssignment), 'preview assignment changed');
    check(hash(source) === artifact.sourceProofSha256 && hash(live) === artifact.liveSha256, 'protected artifact payload changed');
    validateLive(live, source);
    const created = Date.parse(artifact.createdAt);
    check(created <= now + 30000 && now - created <= 7 * 24 * 60 * 60000, 'protected preview artifact expired');
    // Readiness was consumed fresh at protected activation; promotion freshness is separate.
    verifyReceipt(artifact.verification, source, { role: 'preview', sourceCommit: artifact.sourceCommit, sourceTree: artifact.sourceTree, control: artifact.verification.observed.control, ledger: artifact.ledger }, created);
    return artifact;
}
