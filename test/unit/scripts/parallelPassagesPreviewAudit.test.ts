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

  it('verifies exact v2 bounded-window sentinels without accepting totals or off-by-one counts', () => {
    const group = (reference: string): Record<string, unknown> => ({
      members: [{ normalizedReference: reference }],
    });
    const defaultResult: ToolEvidence = {
      content: [{ type: 'text', text: 'Raise `maxGroups` (up to 10) or narrow the reference' }],
      structuredContent: {
        schemaVersion: '2',
        sourceAttestedGroups: Array.from({ length: 5 }, () => group('Mark 10:19')),
        sourceAttestedResultWindow: {
          requestedLimit: 5, returnedGroupCount: 5, additionalMatchStatus: 'additional_match_observed',
        },
      },
    };
    expect(evaluateCase({ name: 'default', arguments: {}, assert: ['v2AdditionalDefaultWindow'] }, defaultResult)[0].passed).toBe(true);
    const malformed = structuredClone(defaultResult);
    (malformed.structuredContent!.sourceAttestedResultWindow as Record<string, unknown>).returnedGroupCount = 6;
    expect(evaluateCase({ name: 'bad', arguments: {}, assert: ['v2AdditionalDefaultWindow'] }, malformed)[0].passed).toBe(false);

    const maximumResult: ToolEvidence = {
      structuredContent: {
        schemaVersion: '2',
        sourceAttestedGroups: Array.from({ length: 7 }, () => group('Mark 10:19')),
        sourceAttestedResultWindow: {
          requestedLimit: 10, returnedGroupCount: 7, additionalMatchStatus: 'no_additional_match_observed',
        },
      },
    };
    expect(evaluateCase({ name: 'maximum', arguments: {}, assert: ['v2MaximumObservedWindow'] }, maximumResult)[0].passed).toBe(true);
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
