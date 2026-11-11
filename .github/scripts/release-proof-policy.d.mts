export interface SelectedProofPolicy {id:'application-only'|'norton-aquinas.v1';module:any;reservedReads:number;hardReadCap:number;classification?:any;}
export function policyForIdentity(identity?:unknown):SelectedProofPolicy;
export function policyForClassification(classification:unknown):SelectedProofPolicy;
export function selectReleaseProofPolicy(root:string):SelectedProofPolicy & {classification:any};
export function requireSameReleasePolicy(selected:SelectedProofPolicy,identity?:unknown):void;
export function verifySourcePlanPolicy(root:string,directory:string,digest:string):'application-only'|'norton-aquinas.v1';
