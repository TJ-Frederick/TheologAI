export const POLICY: {policy:'norton-aquinas.v1';baseline:string;productionReleasePR:number;productMerge:string;account:string;corpus:string;schema:string;reservedReads:number;hardReadCap:number;liveReads:number;controlReads:number;liveControlReserve(role:'preview'|'production'):number;predecessors:Readonly<Record<'preview'|'production',{deploymentId:string;versionId:string}>>;targets:Readonly<Record<'preview'|'production',{databaseName:string;databaseId:string}>>;rollback:{databaseName:string;databaseId:string}};
export const BASELINE: string;
export const ACCOUNT: string;
export const CORPUS: string;
export const SCHEMA: string;
export const TARGETS: Readonly<Record<'preview'|'production',{databaseName:string;databaseId:string}>>;
export function classifyApplicationRelease(root:string):{schemaVersion:string;sourceCommit:string;sourceTree:string;baseline:string;corpusIdentity:string;schema:string;applicationOnly:false;releasePolicy:string;declarationSha256:string};
export function requireProofApproval(value:unknown,expected:{role:'preview'|'production';sourceCommit:string;sourceTree:string},now?:number): {liveControlReserve:number;expectedLedgerSha256:string;releasePolicy:string;schemaVersion:string;role:'preview'|'production';accountId:string;databaseId:string;sourceCommit:string;sourceTree:string;expiresAt:string;maxReads:number;integrityCommands:4;exclusiveDataWritesDuringProof:true};
export function verifyFreshCorpusReceipt(value:unknown,expected:{role:'preview'|'production';sourceCommit:string;sourceTree:string;sourcePlanSha256?:string;tables?:unknown;foreignKeyWitnessSha256?:unknown},now?:number):unknown;

export function assertReviewedActivationEntries(declaration:unknown,before:Map<string,{mode:string;blob:string}>,after:Map<string,{mode:string;blob:string}>):void;
