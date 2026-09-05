import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { IHistoricalDocumentRepository } from '../../../src/kernel/repositories.js';
import {
  loadPrimarySourceBenchmarkFixture,
  runPrimarySourceBenchmark,
  runPrimarySourceBenchmarkCli,
  validatePrimarySourceBenchmarkFixture,
  type PrimarySourceBenchmarkFixture,
} from '../../../scripts/benchmark-primary-source-research.js';

const document = { id: 'source-work', title: 'Source Work', type: 'treatise', date: null, topics: [] };
const section = {
  id: 1, document_id: document.id, section_number: '1', title: 'Grace', content: 'Grace and faith.', topics: [],
};

function repository(): IHistoricalDocumentRepository {
  return {
    listDocuments: () => [document],
    getDocument: () => document,
    getSections: () => [section],
    getSection: () => section,
    getDeliveryProfile: () => undefined,
    resolveSection: (_documentId, sectionKey) => sectionKey === 'section-1' ? {
      document, section, sectionKey, sourceOrdinal: 1, requestedSectionId: sectionKey, resolution: 'canonical',
    } : undefined,
    browseHistoricalSectionSummaries: () => [],
    hasHistoricalSectionBoundary: () => false,
    search: () => [section],
    searchResolvedSections: () => [],
    searchPrimarySources: () => [{ document, section, sectionKey: 'section-1', sourceOrdinal: 1 }],
    findDocumentByName: () => document,
  };
}

function fixture(expectedStatus: 'ok' | 'no_results', sectionKey = 'section-1'): PrimarySourceBenchmarkFixture {
  return {
    schemaVersion: 1,
    fixtureRole: 'checked-in exact-locator retrieval regression anchors, not human-reviewed scholarly relevance judgments',
    limits: { minimumCases: 30, maximumCases: 50, maximumAttemptsPerCase: 2, maximumResultsPerAttempt: 5 },
    cases: [{
      id: 'behavior', kind: 'exact_term', humanQuestion: 'Where is grace discussed?',
      attempts: [{ text: 'grace', match: 'all_terms', selection: 'relevance', limit: 1, expectedStatus }],
      regressionAnchors: [{ documentId: 'source-work', sectionKey, sourceOrdinal: 1 }],
    }],
    limitations: ['one', 'two', 'three'],
  };
}

describe('primary-source research quality benchmark', () => {
  it('keeps a bounded, source-anchor fixture with explicit gap and ambiguity coverage', () => {
    const fixture = loadPrimarySourceBenchmarkFixture();
    expect(fixture.cases).toHaveLength(42);
    expect(fixture.cases.filter(item => item.kind === 'exact_term')).toHaveLength(15);
    expect(fixture.cases.filter(item => item.kind === 'paraphrase')).toHaveLength(14);
    expect(fixture.cases.filter(item => item.kind === 'ambiguous')).toHaveLength(6);
    expect(fixture.cases.filter(item => item.kind === 'catalog_miss')).toHaveLength(3);
    expect(fixture.cases.filter(item => item.kind === 'no_results')).toHaveLength(4);
    expect(fixture.cases.every(item => item.humanQuestion !== item.attempts[0]!.text)).toBe(true);
    expect(fixture.cases.flatMap(item => item.attempts).every(attempt => attempt.limit <= 5)).toBe(true);
    expect(fixture.fixtureRole).toContain('not human-reviewed scholarly relevance judgments');
    expect(fixture.limitations.join(' ')).toContain('does not evaluate synthesis');
    expect(fixture.limitations.join(' ')).toContain('token use');
  });

  it('freezes the demonstrated all-terms failure and bounded local reformulation', () => {
    const fixture = loadPrimarySourceBenchmarkFixture();
    const churchGovernment = fixture.cases.find(item => item.id === 'paraphrase-church-government');
    expect(churchGovernment).toMatchObject({
      humanQuestion: 'Historical perspectives on church government?',
      attempts: [
        { text: 'historical perspectives on church government', expectedStatus: 'no_results' },
        { text: 'church government', expectedStatus: 'ok' },
      ],
      regressionAnchors: [{ documentId: 'belgic-confession', sectionKey: '30', sourceOrdinal: 30 }],
    });
  });

  it('fails closed when a fixture relabels regression anchors as scholarly judgments', () => {
    const fixture = JSON.parse(readFileSync(
      new URL('../../fixtures/primary-source-research-quality-benchmark.json', import.meta.url),
      'utf8',
    )) as Record<string, unknown>;
    fixture.fixtureRole = 'human-reviewed scholarly relevance judgments';
    expect(() => validatePrimarySourceBenchmarkFixture(fixture)).toThrow('must disclaim scholarly relevance judgment');
  });

  it('reports an expected-status mutation instead of accepting the returned hit', async () => {
    const report = await runPrimarySourceBenchmark(fixture('no_results'), repository(), {
      documentCount: 1, sectionCount: 1,
    });
    expect(report.status).toBe('fail');
    expect(report.failures).toContain('behavior: expected no_results for "grace" but received ok');
  });

  it('reports both retrieval and exact-read failures for a mutated anchor', async () => {
    const report = await runPrimarySourceBenchmark(fixture('ok', 'wrong-section'), repository(), {
      documentCount: 1, sectionCount: 1,
    });
    expect(report.status).toBe('fail');
    expect(report.failures).toEqual([
      'behavior: retrieval window omitted anchor source-work#wrong-section@1',
      'behavior: exact locator source-work#wrong-section@1 resolved with mismatched identity or empty content',
    ]);
  });

  it('rejects unknown CLI arguments before opening a database', async () => {
    await expect(runPrimarySourceBenchmarkCli(['--unknown'])).rejects.toThrow(
      'Usage: benchmark-primary-source-research --database <path>',
    );
  });
});
