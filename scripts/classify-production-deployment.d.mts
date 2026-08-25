interface ProductionClassificationInput {
  readonly before: string;
  readonly after: string;
  readonly head: string;
  readonly beforeExists: boolean;
  readonly afterExists: boolean;
  readonly beforeIsAncestor: boolean;
  readonly diff: { readonly ok: boolean; readonly output?: string; readonly error?: string };
}

interface ProductionClassificationResult {
  readonly classificationSucceeded: boolean;
  readonly deployRequired: boolean;
  readonly reason: string;
  readonly base: string;
  readonly head: string;
  readonly changedPaths: readonly string[];
  readonly changedPathEvidence: readonly { readonly status: string; readonly paths: readonly string[] }[];
}

interface ProductionGitRunner {
  readonly succeeds: (...args: readonly string[]) => boolean;
  readonly diff: (...args: readonly string[]) => { readonly ok: boolean; readonly output?: string; readonly error?: string };
}

export function parseNameStatusNul(output: string): readonly { readonly status: string; readonly paths: readonly string[] }[];
export function classifyProductionDeployment(input: ProductionClassificationInput): ProductionClassificationResult;
export function collectGitClassification(
  before: string,
  after: string,
  head: string,
  runner: ProductionGitRunner,
): ProductionClassificationResult;
export function main(): Promise<void>;
