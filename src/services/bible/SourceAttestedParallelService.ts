/** Source-neutral application boundary for group-preserving parallel lookup. */

import type {
  ISourceAttestedParallelRepository,
  ParallelSourceProvenance,
  SourceAttestedParallelLookup,
} from '../../kernel/sourceAttestedParallels.js';
import { parseSourceAttestedLookupReference } from '../../kernel/sourceAttestedReference.js';
import { ValidationError } from '../../kernel/errors.js';
import { decodeParallelGroupCursor, encodeParallelGroupCursor } from '../../kernel/parallelGroupCursor.js';

export interface SourceAttestedParallelLookupParams {
  reference: string;
  maxGroups?: number;
  groupCursor?: string;
}

export class SourceAttestedParallelService {
  constructor(private readonly repository: ISourceAttestedParallelRepository) {}

  async lookup(params: SourceAttestedParallelLookupParams): Promise<SourceAttestedParallelLookup> {
    if (typeof params.reference !== 'string' || Array.from(params.reference).length < 1 || Array.from(params.reference).length > 100) {
      throw new ValidationError('reference', 'reference must contain 1 to 100 characters.');
    }
    let reference: string;
    let segments: ReturnType<typeof parseSourceAttestedLookupReference>['segments'];
    try {
      const parsed = parseSourceAttestedLookupReference(params.reference);
      reference = parsed.normalizedReference;
      segments = parsed.segments;
    } catch {
      throw new ValidationError('reference', 'reference must identify one canonical or source-versification Bible passage.');
    }
    if (segments.length > 8) throw new ValidationError('reference', 'reference may contain at most 8 passage segments.');
    const maxGroups = params.maxGroups ?? 5;
    if (!Number.isSafeInteger(maxGroups) || maxGroups < 1 || maxGroups > 10) {
      throw new ValidationError('maxGroups', 'maxGroups must be an integer from 1 to 10.');
    }
    let cursorBoundary: ReturnType<typeof decodeParallelGroupCursor> | undefined;
    if (params.groupCursor !== undefined) {
      if (typeof params.groupCursor !== 'string') throw new ValidationError('groupCursor', 'groupCursor must be an opaque string.');
      try {
        cursorBoundary = decodeParallelGroupCursor(params.groupCursor, segments, maxGroups);
      } catch (error) {
        throw new ValidationError('groupCursor', error instanceof Error ? error.message : 'groupCursor is invalid.');
      }
      const hasValidBoundary = await this.repository.hasValidGroupCursorBoundary(reference, cursorBoundary);
      if (!hasValidBoundary) {
        throw new ValidationError('groupCursor', 'groupCursor is not a valid page boundary for the current UBS result set.');
      }
    }
    const afterSourceOrdinal = cursorBoundary?.afterSourceOrdinal ?? 0;
    const result = await this.repository.findGroups(reference, maxGroups, afterSourceOrdinal);
    const ordinals = result.groups.map(group => group.sourceOrdinal);
    if (result.groups.length > maxGroups
      || (result.additionalMatchObserved && result.groups.length !== maxGroups)
      || ordinals.some((ordinal, index) => !Number.isSafeInteger(ordinal)
        || ordinal <= afterSourceOrdinal || (index > 0 && ordinal <= ordinals[index - 1]))) {
      throw new Error('source-attested repository returned an invalid keyset window');
    }
    const lastGroup = result.groups.at(-1);
    return {
      reference,
      groups: result.groups,
      requestedLimit: maxGroups,
      additionalMatchObserved: result.additionalMatchObserved,
      ...(result.additionalMatchObserved && lastGroup
        ? {
          nextCursor: encodeParallelGroupCursor(segments, {
            pageSize: maxGroups,
            afterSourceOrdinal: lastGroup.sourceOrdinal,
            cumulativeGroupCount: (cursorBoundary?.cumulativeGroupCount ?? 0) + result.groups.length,
          }),
        }
        : {}),
    };
  }

  async getProvenance(): Promise<Readonly<ParallelSourceProvenance>> {
    return this.repository.getProvenance();
  }
}
