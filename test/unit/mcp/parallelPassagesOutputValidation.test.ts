import { describe, expect, it } from 'vitest';
import { parallelPassagesOutputSchema } from '../../../src/mcp/schemas/parallelPassages.js';
import { validateParallelPassagesOutputSemantics } from '../../../src/mcp/parallelPassagesOutputValidation.js';
import { validatorFor } from '../../../src/mcp/validation.js';
import { encodeParallelGroupCursor } from '../../../src/kernel/parallelGroupCursor.js';

const validateSchema = validatorFor(parallelPassagesOutputSchema);

function output(textEnrichment: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '4', kind: 'parallel_passages', requestedReference: 'Matthew 1:1',
    corpora: ['ubs_source_attested'], sourceAttestedGroups: [],
    sourceAttestedResultWindow: {
      requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'no_additional_match_observed',
    },
    legacyParallels: [], openBibleCrossReferences: [], provenance: [], textEnrichment,
    ...overrides,
  };
}

const budget = { unit: 'unique_canonical_passage_lookups', maximum: 12 };

describe('parallel-passage structured semantic validation', () => {
  it('accepts the requested and not-requested status algebra', () => {
    const notRequested = output({
      requested: false, translation: null, budget, uniqueTargetCount: 0,
      scheduledLookupCount: 0, succeededLookupCount: 0, failedLookupCount: 0,
      omittedLookupCount: 0, completionStatus: 'not_requested',
    });
    const requested = output({
      requested: true, translation: 'WEB', budget, uniqueTargetCount: 0,
      scheduledLookupCount: 0, succeededLookupCount: 0, failedLookupCount: 0,
      omittedLookupCount: 0, completionStatus: 'complete',
    });
    expect(validateSchema(notRequested).valid).toBe(true);
    expect(validateParallelPassagesOutputSemantics(notRequested)).toBe(true);
    expect(validateSchema(requested).valid).toBe(true);
    expect(validateParallelPassagesOutputSemantics(requested)).toBe(true);
  });

  it('rejects the contradictory count specimen even though base JSON types are valid', () => {
    const contradictory = output({
      requested: true, translation: 'WEB', budget, uniqueTargetCount: 13,
      scheduledLookupCount: 12, succeededLookupCount: 12, failedLookupCount: 1,
      omittedLookupCount: 1, completionStatus: 'incomplete',
    });
    expect(validateSchema(contradictory).valid).toBe(true);
    expect(validateParallelPassagesOutputSemantics(contradictory)).toBe(false);
  });

  it('reconciles unique-target counts against the emitted canonical target metadata', () => {
    const completeMember = {
      sourceOrder: 1, sourceReference: 'MAT 1:1', normalizedReference: 'Matthew 1:1',
      segments: [{ bookNumber: 40, chapter: 1, startVerse: 1, endVerse: 1 }],
      languageMarker: 'GRK', matched: true, textEnrichmentStatus: 'complete',
      text: 'text', translation: 'WEB', provenanceIds: ['ubs', 'web'],
      excerpts: [{ segmentOrder: 1, reference: 'Matthew 1:1', text: 'text', translation: 'WEB', provenanceIds: ['web'] }],
    };
    const inflated = output({
      requested: true, translation: 'WEB', budget, uniqueTargetCount: 2,
      scheduledLookupCount: 2, succeededLookupCount: 2, failedLookupCount: 0,
      omittedLookupCount: 0, completionStatus: 'complete',
    }, {
      sourceAttestedGroups: [{
        groupId: 'group', sourceOrdinal: 1, label: 'source_attested_parallel', directionality: 'unspecified',
        members: [completeMember, { ...completeMember, sourceOrder: 2 }], provenanceIds: ['ubs'],
      }],
    });
    expect(validateSchema(inflated).valid).toBe(true);
    expect(validateParallelPassagesOutputSemantics(inflated)).toBe(false);
  });

  it('rejects aggregate success claims that are contradicted by each ordered target state', () => {
    const members = Array.from({ length: 14 }, (_, index) => {
      const verse = index + 1;
      const reference = `Matthew 1:${verse}`;
      const base = {
        sourceOrder: verse, sourceReference: `MAT 1:${verse}`, normalizedReference: reference,
        segments: [{ bookNumber: 40, chapter: 1, startVerse: verse, endVerse: verse }],
        languageMarker: 'GRK', matched: index === 0,
        textEnrichmentStatus: index === 0 ? 'complete' : 'budget_omitted',
        provenanceIds: index === 0 ? ['ubs', 'web'] : ['ubs'],
      };
      return index === 0 ? {
        ...base, text: 'text', translation: 'WEB',
        excerpts: [{ segmentOrder: 1, reference, text: 'text', translation: 'WEB', provenanceIds: ['web'] }],
      } : base;
    });
    const adversarial = output({
      requested: true, translation: 'WEB', budget, uniqueTargetCount: 14,
      scheduledLookupCount: 12, succeededLookupCount: 12, failedLookupCount: 0,
      omittedLookupCount: 2, completionStatus: 'incomplete',
    }, {
      sourceAttestedGroups: [{
        groupId: 'group', sourceOrdinal: 1, label: 'source_attested_parallel', directionality: 'unspecified',
        members, provenanceIds: ['ubs'],
      }],
      sourceAttestedResultWindow: {
        requestedLimit: 1, returnedGroupCount: 1, additionalMatchStatus: 'no_additional_match_observed',
      },
    });
    expect(validateSchema(adversarial).valid).toBe(true);
    expect(validateParallelPassagesOutputSemantics(adversarial)).toBe(false);
  });

  it('accepts uniform duplicate fan-out and rejects split duplicate target consumers', () => {
    const segment = { bookNumber: 40, chapter: 1, startVerse: 1, endVerse: 1 };
    const complete = {
      sourceOrder: 1, sourceReference: 'MAT 1:1', normalizedReference: 'Matthew 1:1',
      segments: [segment], languageMarker: 'GRK', matched: true,
      textEnrichmentStatus: 'complete', text: 'text', translation: 'WEB', provenanceIds: ['ubs', 'web'],
      excerpts: [{ segmentOrder: 1, reference: 'Matthew 1:1', text: 'text', translation: 'WEB', provenanceIds: ['web'] }],
    };
    const unavailableDuplicate = {
      sourceOrder: 2, sourceReference: 'MAT 1:1', normalizedReference: 'Matthew 1:1',
      segments: [segment], languageMarker: 'GRK', matched: false,
      textEnrichmentStatus: 'unavailable', provenanceIds: ['ubs'],
    };
    const uniformFanout = output({
      requested: true, translation: 'WEB', budget, uniqueTargetCount: 1,
      scheduledLookupCount: 1, succeededLookupCount: 1, failedLookupCount: 0,
      omittedLookupCount: 0, completionStatus: 'complete',
    }, {
      sourceAttestedGroups: [{
        groupId: 'group', sourceOrdinal: 1, label: 'source_attested_parallel', directionality: 'unspecified',
        members: [complete, { ...complete, sourceOrder: 2, matched: false }], provenanceIds: ['ubs'],
      }],
      sourceAttestedResultWindow: {
        requestedLimit: 1, returnedGroupCount: 1, additionalMatchStatus: 'no_additional_match_observed',
      },
    });
    const partialFanout = output({
      requested: true, translation: 'WEB', budget, uniqueTargetCount: 1,
      scheduledLookupCount: 1, succeededLookupCount: 0, failedLookupCount: 1,
      omittedLookupCount: 0, completionStatus: 'incomplete',
    }, {
      sourceAttestedGroups: [{
        groupId: 'group', sourceOrdinal: 1, label: 'source_attested_parallel', directionality: 'unspecified',
        members: [complete, unavailableDuplicate], provenanceIds: ['ubs'],
      }],
      sourceAttestedResultWindow: {
        requestedLimit: 1, returnedGroupCount: 1, additionalMatchStatus: 'no_additional_match_observed',
      },
    });
    expect(validateSchema(uniformFanout).valid).toBe(true);
    expect(validateParallelPassagesOutputSemantics(uniformFanout)).toBe(true);
    expect(validateSchema(partialFanout).valid).toBe(true);
    expect(validateParallelPassagesOutputSemantics(partialFanout)).toBe(false);
  });

  it.each([
    [{ requestedLimit: 5, returnedGroupCount: 1, additionalMatchStatus: 'no_additional_match_observed' }, ['ubs_source_attested'], true, 'returned count drift'],
    [{ requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'not_evaluated' }, ['ubs_source_attested'], true, 'selected UBS marked not evaluated'],
    [{ requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'no_additional_match_observed' }, ['theologai_legacy'], true, 'unselected UBS marked evaluated'],
    [{ requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'additional_match_observed' }, ['ubs_source_attested'], false, 'additional match without a full window or cursor'],
  ] as const)('rejects invalid result-window protocol state: %s', (sourceAttestedResultWindow, corpora, schemaValid) => {
    const invalid = output({
      requested: false, translation: null, budget, uniqueTargetCount: 0,
      scheduledLookupCount: 0, succeededLookupCount: 0, failedLookupCount: 0,
      omittedLookupCount: 0, completionStatus: 'not_requested',
    }, { sourceAttestedResultWindow, corpora: [...corpora] });
    expect(validateSchema(invalid).valid).toBe(schemaValid);
    expect(validateParallelPassagesOutputSemantics(invalid)).toBe(false);
  });

  it('accepts only a query-bound next cursor whose ordinal equals the last returned group', () => {
    const member = {
      sourceOrder: 1, sourceReference: 'MAT 1:1', normalizedReference: 'Matthew 1:1',
      segments: [{ bookNumber: 40, chapter: 1, startVerse: 1, endVerse: 1 }],
      languageMarker: 'GRK', matched: true, textEnrichmentStatus: 'not_requested', provenanceIds: ['ubs'],
    };
    const groups = [1, 3].map((sourceOrdinal) => ({
      groupId: `group-${sourceOrdinal}`, sourceOrdinal, label: 'source_attested_parallel', directionality: 'unspecified',
      members: [member, { ...member, sourceOrder: 2 }], provenanceIds: ['ubs'],
    }));
    const nextCursor = encodeParallelGroupCursor(member.segments, {
      pageSize: 2, afterSourceOrdinal: 3, cumulativeGroupCount: 2,
    });
    const valid = output({
      requested: false, translation: null, budget, uniqueTargetCount: 1,
      scheduledLookupCount: 0, succeededLookupCount: 0, failedLookupCount: 0,
      omittedLookupCount: 0, completionStatus: 'not_requested',
    }, {
      sourceAttestedGroups: groups,
      sourceAttestedResultWindow: {
        requestedLimit: 2, returnedGroupCount: 2, additionalMatchStatus: 'additional_match_observed', nextCursor,
      },
    });
    expect(validateSchema(valid).valid).toBe(true);
    expect(validateParallelPassagesOutputSemantics(valid)).toBe(true);
    for (const cursor of [
      encodeParallelGroupCursor(member.segments, {
        pageSize: 2, afterSourceOrdinal: 2, cumulativeGroupCount: 2,
      }),
      encodeParallelGroupCursor([{ ...member.segments[0], startVerse: 2, endVerse: 2 }], {
        pageSize: 2, afterSourceOrdinal: 3, cumulativeGroupCount: 2,
      }),
    ]) {
      expect(validateParallelPassagesOutputSemantics({
        ...valid,
        sourceAttestedResultWindow: { ...(valid.sourceAttestedResultWindow as object), nextCursor: cursor },
      })).toBe(false);
    }
  });

  it.each([
    [{ requested: false, translation: 'WEB', budget, uniqueTargetCount: 0, scheduledLookupCount: 0, succeededLookupCount: 0, failedLookupCount: 0, omittedLookupCount: 0, completionStatus: 'not_requested' }, 'not-requested translation'],
    [{ requested: true, translation: 'WEB', budget, uniqueTargetCount: 13, scheduledLookupCount: 13, succeededLookupCount: 13, failedLookupCount: 0, omittedLookupCount: 0, completionStatus: 'complete' }, 'removed budget'],
    [{ requested: true, translation: 'WEB', budget, uniqueTargetCount: 1, scheduledLookupCount: 1, succeededLookupCount: 1, failedLookupCount: 0, omittedLookupCount: 0, completionStatus: 'incomplete' }, 'false incomplete state'],
  ] as const)('rejects %s through the advertised schema', (enrichment) => {
    expect(validateSchema(output(enrichment as Record<string, unknown>)).valid).toBe(false);
  });

  it('rejects complete member status without complete excerpt/text evidence', () => {
    const member = {
      sourceOrder: 1, sourceReference: 'MAT 1:1', normalizedReference: 'Matthew 1:1',
      segments: [{ bookNumber: 40, chapter: 1, startVerse: 1, endVerse: 1 }],
      languageMarker: 'GRK', matched: true, textEnrichmentStatus: 'complete', provenanceIds: ['ubs'],
    };
    const invalid = output({
      requested: true, translation: 'WEB', budget, uniqueTargetCount: 1,
      scheduledLookupCount: 1, succeededLookupCount: 1, failedLookupCount: 0,
      omittedLookupCount: 0, completionStatus: 'complete',
    }, {
      sourceAttestedGroups: [{
        groupId: 'group', sourceOrdinal: 1, label: 'source_attested_parallel', directionality: 'unspecified',
        members: [member, { ...member, sourceOrder: 2 }], provenanceIds: ['ubs'],
      }],
    });
    expect(validateSchema(invalid).valid).toBe(false);
    expect(validateParallelPassagesOutputSemantics(invalid)).toBe(false);
  });

  it('rejects per-item status/text contradictions that JSON Schema cannot fully express', () => {
    const invalid = output({
      requested: true, translation: 'WEB', budget, uniqueTargetCount: 1,
      scheduledLookupCount: 1, succeededLookupCount: 0, failedLookupCount: 1,
      omittedLookupCount: 0, completionStatus: 'incomplete',
    }, {
      corpora: ['theologai_legacy'],
      sourceAttestedResultWindow: {
        requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'not_evaluated',
      },
      legacyParallels: [{
        reference: 'Mark 1:1', relationship: 'thematic', confidence: 0.8,
        textEnrichmentStatus: 'partial', provenanceIds: ['legacy'],
      }],
    });
    expect(validateSchema(invalid).valid).toBe(true);
    expect(validateParallelPassagesOutputSemantics(invalid)).toBe(false);
  });
});
