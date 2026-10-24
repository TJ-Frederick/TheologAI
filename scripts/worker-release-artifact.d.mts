export type WorkerReleaseTarget = 'production' | 'preview' | 'coordinator';
export interface WorkerReleaseManifest {
  schemaVersion: string;
  target: WorkerReleaseTarget;
  sourceCommit: string;
  sourceTree: string;
  configSha256: string;
  lockSha256: string;
  files: Record<string, string>;
}
export function createManifest(root: string, directory: string, target: WorkerReleaseTarget): string;
export function verifyManifest(root: string, directory: string, target: WorkerReleaseTarget, expectedHash: string): WorkerReleaseManifest;
export function renderDeploymentConfig(root: string, directory: string, target: WorkerReleaseTarget, expectedHash: string, output: string): Promise<void>;
