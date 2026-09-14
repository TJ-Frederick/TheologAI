export interface CiSelection { mode: 'docs' | 'serving' | 'full'; data: boolean; serving: boolean; reason: string; }
export function classifyCiChanges(diff: string, forceFull?: boolean): CiSelection;
export function main(): void;
