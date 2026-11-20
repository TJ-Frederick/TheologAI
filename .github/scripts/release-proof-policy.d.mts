import * as corpus from '../../scripts/application-release-policy.mjs';
export interface SelectedProofPolicy {id: 'corpus.v1'; module: typeof corpus; hardReadCap: number;}
export function policyForIdentity(identity?: unknown): SelectedProofPolicy;
export function selectReleaseProofPolicy(root: string): SelectedProofPolicy & {classification: ReturnType<typeof corpus.classifyApplicationRelease>};
export function requireSameReleasePolicy(selected: SelectedProofPolicy, identity?: unknown): void;
export function verifySourcePlanPolicy(root: string, directory: string, digest: string): 'corpus.v1';
