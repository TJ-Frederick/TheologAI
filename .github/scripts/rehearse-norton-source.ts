/** Source-only Ubuntu/local rehearsal: no credentials, provider calls or release acceptance. */
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { reconstructNortonSource, verifyRecoveredNortonInputs, SOURCE_RECOVERY } from './reconstruct-norton-source.js';
import { verifyHistoricalCandidate, requireRuntimeEquivalence, EXISTING, NATIVE_ARTIFACTS } from './validate-existing-norton-preview.js';
import { verifyRetainedInputEvidence } from './retained-norton-inputs.js';
export function rehearseOriginalNortonSource(root: string, directory: string, candidateRoot: string, bundle: string) {
    const reconstruction = reconstructNortonSource(root, directory, bundle), capture = verifyRecoveredNortonInputs(root, directory), historical = verifyHistoricalCandidate(directory, candidateRoot);
    const original = JSON.parse(readFileSync(join(directory, 'recovery-original-equivalence.json'), 'utf8'));
    verifyRetainedInputEvidence(directory, original.admission.retainedInputs, NATIVE_ARTIFACTS, EXISTING.run, EXISTING.sourceCommit, Date.parse(SOURCE_RECOVERY.capturedAt));
    const runtime = requireRuntimeEquivalence(root, bundle);
    return { schemaVersion: 'norton-original-source-rehearsal.v1', candidateSourceCommit: EXISTING.sourceCommit, auditorCommit: runtime.auditorCommit, auditorTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim(), originalDatabaseSha256: SOURCE_RECOVERY.databaseSha256, workerSha256: runtime.workerSha256, originalProofSha256: EXISTING.proofSha256, originalVerificationAt: historical.historicalVerificationAt, originalNativeRun: capture.runId, originalNativeArtifact: capture.artifact.id, originalNativeArchiveSha256: SOURCE_RECOVERY.originalArchiveSha256, allOriginalProofAndFourIntegrityReceiptsVerified: true, reconstruction, freshRemoteProof: false, releaseAcceptance: false, remoteOperations: 0 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [directory, candidateRoot, bundle, ...extra] = process.argv.slice(2);
    if (!directory || !candidateRoot || !bundle || extra.length)
        throw Error('Original source rehearsal requires exactly three directories');
    process.stdout.write(JSON.stringify(rehearseOriginalNortonSource(process.cwd(), directory, candidateRoot, bundle), null, 2) + '\n');
}
