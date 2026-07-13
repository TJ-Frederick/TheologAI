import { describe, it, expect } from 'vitest';
import {
  formatBibleResponse,
  formatMultiBibleResponse,
  formatCrossReferences,
  formatParallelPassages,
  formatParallelPassageResearch,
} from '../../../src/formatters/bibleFormatter.js';
import type { BibleResult, CrossReferenceResult, ParallelPassageResult, ParallelPassageResearchResult } from '../../../src/kernel/types.js';

// ── Fixtures ──

function makeBibleResult(overrides: Partial<BibleResult> = {}): BibleResult {
  return {
    reference: 'John 3:16',
    translation: 'ESV',
    text: 'For God so loved the world...',
    citation: { source: 'ESV API' },
    ...overrides,
  };
}

// ── formatBibleResponse ──

describe('formatBibleResponse', () => {
  it('includes reference and translation header', () => {
    const out = formatBibleResponse(makeBibleResult());
    expect(out).toContain('**John 3:16 (ESV)**');
  });

  it('includes verse text', () => {
    const out = formatBibleResponse(makeBibleResult());
    expect(out).toContain('For God so loved the world...');
  });

  it('includes citation source', () => {
    const out = formatBibleResponse(makeBibleResult());
    expect(out).toContain('*Source: ESV API*');
  });

  it('includes copyright when present', () => {
    const out = formatBibleResponse(makeBibleResult({
      citation: { source: 'ESV API', copyright: 'Crossway' },
    }));
    expect(out).toContain('ESV API* - Crossway');
  });

  it('omits copyright when absent', () => {
    const out = formatBibleResponse(makeBibleResult());
    expect(out).not.toContain(' - ');
  });

  it('renders footnotes section when present', () => {
    const out = formatBibleResponse(makeBibleResult({
      footnotes: [
        { id: 1, caller: '[a]', text: 'Some manuscripts add...', reference: { chapter: 3, verse: 16 } },
      ],
    }));
    expect(out).toContain('**Footnotes:**');
    expect(out).toContain('[a] (v16): Some manuscripts add...');
  });

  it('omits footnotes section when empty array', () => {
    const out = formatBibleResponse(makeBibleResult({ footnotes: [] }));
    expect(out).not.toContain('**Footnotes:**');
  });

  it('omits footnotes section when undefined', () => {
    const out = formatBibleResponse(makeBibleResult({ footnotes: undefined }));
    expect(out).not.toContain('**Footnotes:**');
  });

  it('returns trimmed output', () => {
    const out = formatBibleResponse(makeBibleResult());
    expect(out).toBe(out.trim());
  });
});

describe('formatParallelPassageResearch', () => {
  it('preserves complete groups while visually de-emphasizing the matched member', () => {
    const result: ParallelPassageResearchResult = {
      requestedReference: 'Luke 6:35', corpora: ['ubs_source_attested'], legacyParallels: [],
      openBibleCrossReferences: [], provenance: [{
        id: 'translation-1', kind: 'translation', label: 'Provider A', status: 'provider_attributed',
        rightsNotice: 'Licensed text', version: 'WEB',
      }],
      sourceAttestedGroups: [{
        groupId: 'ubs-pp-test', sourceOrdinal: 1, label: 'source_attested_parallel', directionality: 'unspecified',
        provenanceIds: ['ubs'], members: [
          { sourceOrder: 1, sourceReference: 'LUK 6:35', normalizedReference: 'Luke 6:35', segments: [{ bookNumber: 42, chapter: 6, startVerse: 35, endVerse: 35 }], languageMarker: 'GRK', matched: true, text: 'Matched full text', translation: 'WEB', provenanceIds: ['ubs', 'translation-1'], excerpts: [{ segmentOrder: 1, reference: 'Luke 6:35', text: 'Matched full text', translation: 'WEB', provenanceIds: ['translation-1'] }] },
          { sourceOrder: 2, sourceReference: 'MAT 5:44', normalizedReference: 'Matthew 5:44', segments: [{ bookNumber: 40, chapter: 5, startVerse: 44, endVerse: 44 }], languageMarker: 'GRK', matched: false, text: 'Parallel full text', translation: 'WEB', provenanceIds: ['ubs', 'translation-1'] },
        ],
      }],
    };
    const output = formatParallelPassageResearch(result);
    expect(output).toContain('_Matched passage: Luke 6:35_');
    expect(output).toContain('**Matthew 5:44**');
    expect(output).toContain('UBS source locator: `LUK 6:35` (normalized lookup: Luke 6:35)');
    expect(output).toContain('membership and source order only');
    expect(output).not.toMatch(/\[(?:synoptic|quotation|allusion|thematic)\]/);
    expect(output).not.toMatch(/\(\d+% confidence\)/);
    expect(output).toContain('Matched full text');
    expect(output).toContain('Segment 1 — Luke 6:35: Matched full text');
    expect(output).toContain('Parallel full text');
    expect(output).toContain('(WEB; Provider A; Licensed text)');
  });
});

// ── formatMultiBibleResponse ──

describe('formatMultiBibleResponse', () => {
  it('returns "No results found." for empty array', () => {
    expect(formatMultiBibleResponse([])).toBe('No results found.');
  });

  it('shows reference with translation count', () => {
    const out = formatMultiBibleResponse([
      makeBibleResult({ translation: 'ESV' }),
      makeBibleResult({ translation: 'KJV' }),
    ]);
    expect(out).toContain('**John 3:16** (2 translations)');
  });

  it('lists each translation with its text', () => {
    const out = formatMultiBibleResponse([
      makeBibleResult({ translation: 'ESV', text: 'ESV text' }),
      makeBibleResult({ translation: 'KJV', text: 'KJV text' }),
    ]);
    expect(out).toContain('**ESV:**\nESV text');
    expect(out).toContain('**KJV:**\nKJV text');
  });

  it('shows every requested translation, including explicit failures', () => {
    const out = formatMultiBibleResponse({
      reference: 'John 3:16',
      results: [makeBibleResult({ translation: 'NET', text: 'NET text' })],
      failures: [{ translation: 'ESV', reason: 'Translation provider is not configured.' }],
    });

    expect(out).toContain('**John 3:16** (2 translations requested; 1 available)');
    expect(out).toContain('**NET:**\nNET text');
    expect(out).toContain('- **ESV:** unavailable — Translation provider is not configured.');
  });

  it('preserves failure status when every requested translation fails', () => {
    const out = formatMultiBibleResponse({
      reference: 'John 3:16',
      results: [],
      failures: [{ translation: 'ESV', reason: 'Translation provider is not configured.' }],
    });

    expect(out).toContain('**John 3:16** (1 translations requested; 0 available)');
    expect(out).toContain('- **ESV:** unavailable');
  });

  it('includes per-translation footnotes', () => {
    const out = formatMultiBibleResponse([
      makeBibleResult({
        translation: 'NET',
        footnotes: [
          { id: 1, caller: '[1]', text: 'tn: note', reference: { chapter: 3, verse: 16 } },
        ],
      }),
    ]);
    expect(out).toContain('*Footnotes:*');
    expect(out).toContain('[1] (v16): tn: note');
  });

  it('deduplicates source citations', () => {
    const out = formatMultiBibleResponse([
      makeBibleResult({ citation: { source: 'HelloAO' } }),
      makeBibleResult({ translation: 'KJV', citation: { source: 'HelloAO' } }),
    ]);
    // Should appear only once
    expect(out).toContain('*Sources: HelloAO*');
  });

  it('shows multiple distinct sources', () => {
    const out = formatMultiBibleResponse([
      makeBibleResult({ citation: { source: 'ESV API' } }),
      makeBibleResult({ translation: 'KJV', citation: { source: 'HelloAO' } }),
    ]);
    expect(out).toContain('*Sources: ESV API, HelloAO*');
  });

  it('handles single-result array', () => {
    const out = formatMultiBibleResponse([makeBibleResult()]);
    expect(out).toContain('(1 translations)');
  });

  it('returns trimmed output', () => {
    const out = formatMultiBibleResponse([makeBibleResult()]);
    expect(out).toBe(out.trim());
  });
});

// ── formatCrossReferences ──

describe('formatCrossReferences', () => {
  it('shows reference in header', () => {
    const result: CrossReferenceResult = { references: [], total: 0, showing: 0, hasMore: false };
    const out = formatCrossReferences('John 3:16', result);
    expect(out).toContain('**Cross-References for John 3:16**');
  });

  it('shows "No cross-references found" for empty references', () => {
    const result: CrossReferenceResult = { references: [], total: 0, showing: 0, hasMore: false };
    const out = formatCrossReferences('John 3:16', result);
    expect(out).toContain('No cross-references found for this verse.');
    expect(out).toContain('OpenBible.info cross references — CC BY');
  });

  it('lists references with votes', () => {
    const result: CrossReferenceResult = {
      references: [
        { reference: 'Romans 5:8', votes: 42 },
        { reference: '1 John 4:9', votes: 30 },
      ],
      total: 2,
      showing: 2,
      hasMore: false,
    };
    const out = formatCrossReferences('John 3:16', result);
    expect(out).toContain('- **Romans 5:8** (42 votes)');
    expect(out).toContain('- **1 John 4:9** (30 votes)');
    expect(out).toContain('OpenBible.info cross references — CC BY');
  });

  it('shows pagination when hasMore is true', () => {
    const result: CrossReferenceResult = {
      references: [{ reference: 'Romans 5:8', votes: 42 }],
      total: 50,
      showing: 10,
      hasMore: true,
    };
    const out = formatCrossReferences('John 3:16', result);
    expect(out).toContain('*Showing 10 of 50 cross-references*');
  });

  it('does not show pagination when hasMore is false', () => {
    const result: CrossReferenceResult = {
      references: [{ reference: 'Romans 5:8', votes: 42 }],
      total: 1,
      showing: 1,
      hasMore: false,
    };
    const out = formatCrossReferences('John 3:16', result);
    expect(out).not.toContain('Showing');
  });

  it('returns trimmed output', () => {
    const result: CrossReferenceResult = {
      references: [{ reference: 'Romans 5:8', votes: 42 }],
      total: 1,
      showing: 1,
      hasMore: false,
    };
    const out = formatCrossReferences('John 3:16', result);
    expect(out).toBe(out.trim());
  });
});

// ── formatParallelPassages ──

describe('formatParallelPassages', () => {
  function makeResult(overrides: Partial<ParallelPassageResult> = {}): ParallelPassageResult {
    return {
      primary: { reference: 'Matthew 4:1-11' },
      parallels: [],
      citation: { source: 'TheologAI Parallel Passages Database' },
      ...overrides,
    };
  }

  it('shows primary reference in header', () => {
    const out = formatParallelPassages(makeResult());
    expect(out).toContain('**Parallel Passages for Matthew 4:1-11**');
  });

  it('returns "No parallel passages found." for empty parallels', () => {
    const out = formatParallelPassages(makeResult());
    expect(out).toContain('No parallel passages found.');
  });

  it('lists parallels with relationship and confidence', () => {
    const out = formatParallelPassages(makeResult({
      parallels: [
        { reference: 'Luke 4:1-13', relationship: 'synoptic', confidence: 0.95 },
      ],
    }));
    expect(out).toContain('- **Luke 4:1-13** [synoptic] (95% confidence)');
  });

  it('truncates text at 200 chars with ellipsis', () => {
    const longText = 'x'.repeat(250);
    const out = formatParallelPassages(makeResult({
      parallels: [
        { reference: 'Luke 4:1-13', relationship: 'synoptic', confidence: 0.9, text: longText },
      ],
    }));
    expect(out).toContain('Text excerpt: ' + 'x'.repeat(200) + '…');
  });

  it('does not truncate text under 200 chars', () => {
    const shortText = 'Short passage text';
    const out = formatParallelPassages(makeResult({
      parallels: [
        { reference: 'Luke 4:1-13', relationship: 'synoptic', confidence: 0.9, text: shortText },
      ],
    }));
    expect(out).toContain(shortText);
    expect(out).toContain('Text excerpt: ' + shortText);
    expect(out).not.toContain(shortText + '…');
  });

  it('shows notes in italics', () => {
    const out = formatParallelPassages(makeResult({
      parallels: [
        { reference: 'Luke 4:1-13', relationship: 'synoptic', confidence: 0.9, notes: 'Same event' },
      ],
    }));
    expect(out).toContain('*Same event*');
  });

  it('appends citation source', () => {
    const out = formatParallelPassages(makeResult({
      parallels: [
        { reference: 'Luke 4:1-13', relationship: 'synoptic', confidence: 0.9 },
      ],
    }));
    expect(out).toContain('*TheologAI Parallel Passages Database*');
  });

  it('appends parallel-passage copyright attribution', () => {
    const out = formatParallelPassages(makeResult({
      parallels: [{ reference: 'Luke 4:1-13', relationship: 'synoptic', confidence: 0.9 }],
      citation: {
        source: 'TheologAI Parallel Passages + OpenBible.info',
        copyright: 'Cross-references from OpenBible.info (CC-BY)',
      },
    }));
    expect(out).toContain('Cross-references from OpenBible.info (CC-BY)');
  });

  it('returns trimmed output', () => {
    const out = formatParallelPassages(makeResult({
      parallels: [
        { reference: 'Luke 4:1-13', relationship: 'synoptic', confidence: 0.9 },
      ],
    }));
    expect(out).toBe(out.trim());
  });
});
