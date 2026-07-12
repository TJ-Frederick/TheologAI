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

  async lookup(params: SourceAttestedParallelLookupParams): Promise<SourceAttestedParallelLookup> {
    if (typeof params.reference !== 'string' || Array.from(params.reference).length < 1 || Array.from(params.reference).length > 100) {
      throw new ValidationError('reference', 'reference must contain 1 to 100 characters.');
    }
    let reference: string;
    let segmentCount: number;
    try {
      const parsed = parseSourceAttestedLookupReference(params.reference);
      reference = parsed.normalizedReference;
      segmentCount = parsed.segments.length;
    } catch {
      throw new ValidationError('reference', 'reference must identify one canonical or source-versification Bible passage.');
    }
    if (segmentCount > 8) throw new ValidationError('reference', 'reference may contain at most 8 passage segments.');
    const maxGroups = params.maxGroups ?? 5;
    if (!Number.isSafeInteger(maxGroups) || maxGroups < 1 || maxGroups > 10) {
      throw new ValidationError('maxGroups', 'maxGroups must be an integer from 1 to 10.');
    }
    return { reference, groups: await this.repository.findGroups(reference, maxGroups) };
  }
}
