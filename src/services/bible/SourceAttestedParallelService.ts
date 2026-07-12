/** Source-neutral application boundary for group-preserving parallel lookup. */

import type {
  ISourceAttestedParallelRepository,
  SourceAttestedParallelLookup,
} from '../../kernel/sourceAttestedParallels.js';
import { parseSourceAttestedLookupReference } from '../../kernel/sourceAttestedReference.js';

export interface SourceAttestedParallelLookupParams {
  reference: string;
  maxGroups?: number;
}

export class SourceAttestedParallelService {
  constructor(private readonly repository: ISourceAttestedParallelRepository) {}

  lookup(params: SourceAttestedParallelLookupParams): SourceAttestedParallelLookup {
    const reference = parseSourceAttestedLookupReference(params.reference).normalizedReference;
    const maxGroups = params.maxGroups ?? 5;
    if (!Number.isSafeInteger(maxGroups) || maxGroups < 1 || maxGroups > 10) {
      throw new Error('maxGroups must be an integer from 1 to 10');
    }
    return { reference, groups: this.repository.findGroups(reference, maxGroups) };
  }
}
