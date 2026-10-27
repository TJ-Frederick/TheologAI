export const BASELINE: string;
export const ACCOUNT: string;
export const CORPUS: string;
export const SCHEMA: string;
export const TARGETS: Readonly<Record<'preview'|'production',{databaseName:string;databaseId:string}>>;
export function classifyEntries(before:Map<string,{mode:string;blob:string}>,after:Map<string,{mode:string;blob:string}>,securityFiles:Record<string,string>):{applicationOnly:boolean;unreviewedDataOrApplicationPaths:string[]};
export function classifyApplicationRelease(root:string):{schemaVersion:string;sourceCommit:string;sourceTree:string;baseline:string;corpusIdentity:string;schema:string;applicationOnly:true;declarationSha256:string};
export function requireProofApproval(value:unknown,expected:{role:'preview'|'production';sourceCommit:string;sourceTree:string},now?:number):{schemaVersion:string;role:'preview'|'production';accountId:string;databaseId:string;sourceCommit:string;sourceTree:string;expiresAt:string;maxReads:number;integrityCommands:4;exclusiveDataWritesDuringProof:true};
export function verifyFreshCorpusReceipt(value:unknown,expected:{role:'preview'|'production';sourceCommit:string;sourceTree:string;sourcePlanSha256?:string;tables?:unknown},now?:number):unknown;
