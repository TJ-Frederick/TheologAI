import { describe, expect, it } from 'vitest';
import { evaluateCase, sanitizeEvidence, type AuditCase, type ToolEvidence } from '../../../scripts/audit-parallel-passages-preview.js';

describe('parallel-passages preview audit assertions', () => {
  it('evaluates structured groups, alignment, text attribution, and separate OpenBible evidence', () => {
    const testCase: AuditCase = { name: 'evidence', arguments: {}, assert: [
      'success', 'bothCorpora', 'ubsGroupsPresent', 'legacyParallelsPresent',
      'alignmentPresent', 'memberTextPresent', 'textAttributionPresent', 'excerptsBounded',
      'openBibleSeparate', 'openBibleAttribution',
    ] };
    const response: ToolEvidence = {
      content: [{ type: 'text', text: '> verse (WEB; Provider; Public Domain)\n### OpenBible.info cross references\nSources: OpenBible.info (CC BY)' }],
      structuredContent: {
        corpora: ['ubs_source_attested', 'theologai_legacy'],
        sourceAttestedGroups: [{ members: [{ alignmentBasis: 'UBSGNT5', alignmentRaw: '222', text: 'verse', translation: 'WEB', provenanceIds: ['web'], excerpts: [{ text: 'verse' }] }] }],
        legacyParallels: [{ reference: 'Mark 1:1' }],
        openBibleCrossReferences: [{ reference: 'John 1:1' }],
        provenance: [{ id: 'web', kind: 'translation' }],
      },
    };
    expect(evaluateCase(testCase, response).every(check => check.passed)).toBe(true);
  });

  it('recognizes successful empty results and expected validation errors', () => {
    expect(evaluateCase({ name: 'none', arguments: {}, assert: ['success', 'noUbsGroups'] }, {
      structuredContent: { sourceAttestedGroups: [] },
    }).every(check => check.passed)).toBe(true);
    expect(evaluateCase({ name: 'conflict', arguments: {}, assert: ['toolError', 'conflictMessage'] }, {
      isError: true, content: [{ type: 'text', text: 'Arguments conflict.' }],
    }).every(check => check.passed)).toBe(true);
  });

  it('verifies exact v3 bounded-window sentinels without accepting totals or off-by-one counts', () => {
    const group = (reference: string): Record<string, unknown> => ({
      members: [{ normalizedReference: reference }],
    });
    const defaultResult: ToolEvidence = {
      content: [{ type: 'text', text: 'Raise `maxGroups` (up to 10) or narrow the reference' }],
      structuredContent: {
        schemaVersion: '3',
        sourceAttestedGroups: Array.from({ length: 5 }, () => group('Mark 10:19')),
        sourceAttestedResultWindow: {
          requestedLimit: 5, returnedGroupCount: 5, additionalMatchStatus: 'additional_match_observed',
        },
      },
    };
    expect(evaluateCase({ name: 'default', arguments: {}, assert: ['v3AdditionalDefaultWindow'] }, defaultResult)[0].passed).toBe(true);
    const malformed = structuredClone(defaultResult);
    (malformed.structuredContent!.sourceAttestedResultWindow as Record<string, unknown>).returnedGroupCount = 6;
    expect(evaluateCase({ name: 'bad', arguments: {}, assert: ['v3AdditionalDefaultWindow'] }, malformed)[0].passed).toBe(false);

    const maximumResult: ToolEvidence = {
      structuredContent: {
        schemaVersion: '3',
        sourceAttestedGroups: Array.from({ length: 7 }, () => group('Mark 10:19')),
        sourceAttestedResultWindow: {
          requestedLimit: 10, returnedGroupCount: 7, additionalMatchStatus: 'no_additional_match_observed',
        },
      },
    };
    expect(evaluateCase({ name: 'maximum', arguments: {}, assert: ['v3MaximumObservedWindow'] }, maximumResult)[0].passed).toBe(true);
  });

  it('verifies complete/distinct source groups and the legacy-only not-evaluated state', () => {
    const response: ToolEvidence = {
      structuredContent: {
        sourceAttestedGroups: [
          { members: ['2 Kings 18:13', '2 Chronicles 32:1', 'Isaiah 36:1'].map(normalizedReference => ({ normalizedReference })) },
          { members: [{ normalizedReference: 'Matthew 3:3' }, { normalizedReference: 'Mark 1:2-3' }] },
        ],
      },
    };
    expect(evaluateCase({ name: 'kings', arguments: {}, assert: ['completeKingsChroniclesIsaiahGroup'] }, response)[0].passed).toBe(true);
    expect(evaluateCase({ name: 'matthew', arguments: {}, assert: ['distinctMatthewGroups'] }, {
      structuredContent: { sourceAttestedGroups: [
        { members: [{ normalizedReference: 'Matthew 3:3' }, { normalizedReference: 'Isaiah 40:3' }] },
        { members: [{ normalizedReference: 'Matthew 3:3' }, { normalizedReference: 'Mark 1:2-3' }] },
      ] },
    })[0].passed).toBe(true);
    expect(evaluateCase({ name: 'legacy', arguments: {}, assert: ['ubsNotEvaluated'] }, {
      structuredContent: {
        sourceAttestedGroups: [],
        sourceAttestedResultWindow: { requestedLimit: 5, returnedGroupCount: 0, additionalMatchStatus: 'not_evaluated' },
      },
    })[0].passed).toBe(true);
  });

  it('rejects removed budgets, contradictory counts, backfill, metadata loss, and status/text conflicts', () => {
    const members = Array.from({ length: 14 }, (_, index) => {
      const verse = index + 1;
      const reference = `Matthew 1:${verse}`;
      const member = {
        sourceOrder: verse, sourceReference: `MAT 1:${verse}`, normalizedReference: reference,
        segments: [{ bookNumber: 40, chapter: 1, startVerse: verse, endVerse: verse }],
        languageMarker: 'GRK', matched: index < 12,
        textEnrichmentStatus: index < 12 ? 'complete' : 'budget_omitted',
        provenanceIds: index < 12 ? ['ubs', 'web'] : ['ubs'],
      };
      return index < 12 ? {
        ...member, text: `text ${verse}`, translation: 'WEB',
        excerpts: [{ segmentOrder: 1, reference, text: `text ${verse}`, translation: 'WEB', provenanceIds: ['web'] }],
      } : member;
    });
    const response: ToolEvidence = {
      structuredContent: {
        schemaVersion: '3', kind: 'parallel_passages', requestedReference: 'Matthew 1:1',
        corpora: ['ubs_source_attested'],
        sourceAttestedGroups: [{
          groupId: 'group', sourceOrdinal: 1, label: 'source_attested_parallel', directionality: 'unspecified',
          members, provenanceIds: ['ubs'],
        }],
        sourceAttestedResultWindow: {
          requestedLimit: 10, returnedGroupCount: 1, additionalMatchStatus: 'no_additional_match_observed',
        },
        legacyParallels: [], openBibleCrossReferences: [], provenance: [],
        textEnrichment: {
          requested: true, translation: 'WEB', budget: { unit: 'unique_canonical_passage_lookups', maximum: 12 },
          uniqueTargetCount: 14, scheduledLookupCount: 12, succeededLookupCount: 12,
          failedLookupCount: 0, omittedLookupCount: 2, completionStatus: 'incomplete',
        },
      },
    };
    const assertions = ['v3TextBudgetApplied', 'textBudgetPreservesMetadataAndStatuses'];
    expect(evaluateCase({ name: 'valid', arguments: {}, assert: assertions }, response).every(check => check.passed)).toBe(true);

    for (const mutate of [
      (copy: ToolEvidence) => { (copy.structuredContent!.textEnrichment as any).scheduledLookupCount = 13; },
      (copy: ToolEvidence) => { (copy.structuredContent!.textEnrichment as any).failedLookupCount = 1; },
      (copy: ToolEvidence) => { (copy.structuredContent!.textEnrichment as any).omittedLookupCount = 0; },
      (copy: ToolEvidence) => { delete (copy.structuredContent!.sourceAttestedGroups as any[])[0].members[0].sourceReference; },
      (copy: ToolEvidence) => { delete (copy.structuredContent!.sourceAttestedGroups as any[])[0].members[0].excerpts; },
    ]) {
      const copy = structuredClone(response);
      mutate(copy);
      expect(evaluateCase({ name: 'invalid', arguments: {}, assert: assertions }, copy).every(check => check.passed)).toBe(false);
    }
  });

  it('never retains full provider or Markdown text in persisted evidence', () => {
    const sanitized = sanitizeEvidence({
      content: [{ type: 'text', text: `😀${'x'.repeat(500)}` }],
      structuredContent: { sourceAttestedGroups: [{ members: [{ text: 'y'.repeat(500) }] }] },
    });
    expect(Array.from(sanitized.content[0].text)).toHaveLength(200);
    expect(sanitized.content[0].text.endsWith('…')).toBe(true);
    expect(Array.from(sanitized.structuredContent.sourceAttestedGroups[0].members[0].text)).toHaveLength(200);
  });
});
