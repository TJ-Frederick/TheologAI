interface ProductionReleaseContextInput {
  readonly eventName: string;
  readonly ref: string;
  readonly pushBefore: string;
  readonly firstParent: string;
}

interface ProductionReleaseContext {
  readonly before: string;
  readonly mode: 'push' | 'manual';
  readonly forceDeploy: boolean;
  readonly customDomainRequired: boolean;
  readonly reason: 'push-before' | 'manual-main-dispatch';
}

export function resolveProductionReleaseContext(input: ProductionReleaseContextInput): Readonly<ProductionReleaseContext>;
