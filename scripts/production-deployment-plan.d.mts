import type { Buffer } from 'node:buffer';

type ByteInput = Buffer | Uint8Array;

interface ChangedPathEvidence {
  readonly status: string;
  readonly paths: readonly string[];
}

interface ReleaseContext {
  readonly before: string;
  readonly mode: 'push' | 'manual';
  readonly forceDeploy: boolean;
  readonly customDomainRequired: boolean;
  readonly reason: 'push-before' | 'manual-main-dispatch';
}

interface RunIdentity {
  readonly id: string;
  readonly attempt: string;
  readonly eventName: 'push' | 'workflow_dispatch';
  readonly ref: 'refs/heads/main';
  readonly head: string;
}

interface Classification {
  readonly succeeded: boolean;
  readonly deployRequired: boolean;
  readonly decision: 'deploy' | 'skip';
  readonly reason: string;
  readonly base: string;
  readonly head: string;
  readonly changedPathEvidence: readonly ChangedPathEvidence[];
}

interface ProductionDeploymentPlan {
  readonly schemaVersion: 1;
  readonly artifactName: string;
  readonly run: RunIdentity;
  readonly releaseContext: ReleaseContext;
  readonly classification: Classification;
}

interface ProductionDeploymentVerificationInput {
  readonly planBytes: ByteInput;
  readonly sha256Bytes: ByteInput;
  /** Runtime validator boundary; exact keys and values are checked fail-closed. */
  readonly expected: unknown;
  /** Runtime validator boundary; exact keys and values are checked fail-closed. */
  readonly classification: unknown;
}

export function createProductionDeploymentPlan(value: unknown): ProductionDeploymentPlan;
export function serializeProductionDeploymentPlan(value: unknown): string;
export function productionDeploymentPlanSha256(value: unknown): string;
export function verifyProductionDeploymentPlan(input: ProductionDeploymentVerificationInput): {
  readonly artifactName: string;
  readonly planSha256: string;
  readonly classificationSucceeded: true;
  readonly deployRequired: boolean;
  readonly decision: 'deploy' | 'skip';
  readonly reason: string;
  readonly base: string;
  readonly head: string;
  readonly changedPathEvidenceCount: number;
};
