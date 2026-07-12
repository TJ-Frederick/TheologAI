import { describe, expect, it } from 'vitest';
import { evaluateCase, type AuditCase, type ToolEvidence } from '../../../scripts/audit-parallel-passages-preview.js';

describe('parallel-passages preview audit assertions', () => {
  it('evaluates structured groups, alignment, text attribution, and separate OpenBible evidence', () => {
    const testCase: AuditCase = { name: 'evidence', arguments: {}, assert: [
      'success', 'bothCorpora', 'ubsGroupsPresent', 'legacyParallelsPresent',
      'alignmentPresent', 'memberTextPresent', 'textAttributionPresent',
      'openBibleSeparate', 'openBibleAttribution',
    ] };
    const response: ToolEvidence = {
      content: [{ type: 'text', text: '> verse (WEB; Provider; Public Domain)\n### OpenBible.info cross references\nSources: OpenBible.info (CC BY)' }],
      structuredContent: {
        corpora: ['ubs_source_attested', 'theologai_legacy'],
        sourceAttestedGroups: [{ members: [{ alignmentBasis: 'UBSGNT5', alignmentRaw: '222', text: 'verse', translation: 'WEB', provenanceIds: ['web'] }] }],
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
});
