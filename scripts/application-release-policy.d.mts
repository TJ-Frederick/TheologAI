export type Role = 'preview' | 'production';
export type Target = {databaseName: string; databaseId: string};
export const ACCOUNT: string;
export const TARGETS: Readonly<Record<Role, Target>>;
export const POLICY: {
  policy: 'corpus.v1'; account: string; hardReadCap: number; accountReadCeiling: number;
  uncertaintyMargin: number; controlReads: number; uuid: RegExp;
  serving(root?: string): {productionSource: string; targets: Record<Role, Target>; predecessors: Record<Role, Target & {deploymentId: string; versionId: string}>};
};
export function classifyApplicationRelease(root: string): {
  schemaVersion: string; releasePolicy: 'corpus.v1'; sourceCommit: string; sourceTree: string;
  schema: string; manifestSha256: string; targets: Record<Role, Target>;
};
export function requireProofApproval(value: unknown, expected: {role: Role; sourceCommit: string; sourceTree: string}, now?: number): {
  maxReads: number; reservedReads: number; expectedLedgerSha256: string; liveControlReserve: number;
};
export function verifyFreshCorpusReceipt(value: unknown, expected: {
  role: Role; sourceCommit: string; sourceTree: string; sourcePlanSha256: string; tables: unknown;
  foreignKeyWitnessSha256: string; ledgerSha256: string; corpusIdentity: string; schema: string; readBudget: number; liveControlReserve: number;
}, now?: number): unknown;
