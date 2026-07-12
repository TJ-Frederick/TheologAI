/** Source-neutral application boundary for group-preserving parallel lookup. */

import type {
  ISourceAttestedParallelRepository,
  SourceAttestedParallelLookup,
} from '../../kernel/sourceAttestedParallels.js';
import { parseSourceAttestedLookupReference } from '../../kernel/sourceAttestedReference.js';
import { ValidationError } from '../../kernel/errors.js';

export interface SourceAttestedParallelLookupParams {
  reference: string;
  maxGroups?: number;
}

export class SourceAttestedParallelService {
  constructor(private readonly repository: ISourceAttestedParallelRepository) {}

  lookup(params: SourceAttestedParallelLookupParams): SourceAttestedParallelLookup {
    let reference: string;
    try {
      reference = parseSourceAttestedLookupReference(params.reference).normalizedReference;
    } catch {
      throw new ValidationError('reference', 'reference must identify one canonical or source-versification Bible passage.');
    }
    const maxGroups = params.maxGroups ?? 5;
    if (!Number.isSafeInteger(maxGroups) || maxGroups < 1 || maxGroups > 10) {
      throw new ValidationError('maxGroups', 'maxGroups must be an integer from 1 to 10.');
    }
    return { reference, groups: this.repository.findGroups(reference, maxGroups) };
  }
}
