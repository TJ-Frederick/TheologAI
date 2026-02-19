/**
 * LocalDataAdapter Tests
 *
 * Tests for loading and searching historical documents (creeds, confessions, catechisms)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataAdapter } from '../../../src/adapters/localData.js';
import {
  SAMPLE_WSC_DOCUMENT,
  SAMPLE_BALTIMORE_DOCUMENT,
  SAMPLE_CONFESSION_DOCUMENT,
  SAMPLE_CREED_DOCUMENT,
  ORDINAL_SEARCHES,
  NUMBER_SEARCHES,
  TOPIC_SEARCHES,
  MULTI_WORD_QUERIES
} from '../../fixtures/historicalFixtures.js';

describe('LocalDataAdapter', () => {
  let adapter: LocalDataAdapter;

  beforeEach(() => {
    // Initialize adapter with default data path (loads actual historical documents)
    adapter = new LocalDataAdapter();
  });

  describe('Document Loading', () => {
    it('should load historical documents from data directory', () => {
      const docs = adapter.listDocuments();
      expect(docs.length).toBeGreaterThan(0);
    });

    it('should load all expected document types', () => {
      const docs = adapter.listDocuments();

      // Should include catechisms
      expect(docs.some(d => d.includes('catechism'))).toBe(true);

      // Should include confessions
      expect(docs.some(d => d.includes('confession'))).toBe(true);

      // Should include creeds
      expect(docs.some(d => d.includes('creed'))).toBe(true);
    });

    it('should cache loaded documents', () => {
      const docs1 = adapter.listDocuments();
      const docs2 = adapter.listDocuments();

      expect(docs1).toEqual(docs2);
      expect(docs1.length).toBeGreaterThan(0);
    });

    it('should retrieve specific document by name', () => {
      const wsc = adapter.getDocument('westminster-shorter-catechism');

      expect(wsc).toBeDefined();
      expect(wsc?.title).toContain('Westminster');
      expect(wsc?.type).toBe('catechism');
    });

    it('should return undefined for non-existent document', () => {
      const doc = adapter.getDocument('non-existent-document');
      expect(doc).toBeUndefined();
    });
  });

  describe('Question Number Search', () => {
    it('should find question by number (e.g., "1")', () => {
      const results = adapter.searchDocuments('1');

      expect(results.length).toBeGreaterThan(0);
      const wscResult = results.find(r => r.document.includes('Westminster Shorter'));
      expect(wscResult).toBeDefined();
      expect(wscResult?.section).toContain('Question 1');
    });

    it('should find question by "Q" prefix (e.g., "Q100")', () => {
      const results = adapter.searchDocuments('Q100');

      expect(results.length).toBeGreaterThan(0);
      // Should find Baltimore Catechism Q100 or similar
      const hasQ100 = results.some(r => r.section.includes('100'));
      expect(hasQ100).toBe(true);
    });

    it('should find question by "Question" keyword (e.g., "Question 1")', () => {
      const results = adapter.searchDocuments('Question 1');

      expect(results.length).toBeGreaterThan(0);
      const hasQ1 = results.some(r => r.section.includes('Question 1'));
      expect(hasQ1).toBe(true);
    });

    it('should prioritize question number matches', () => {
      const results = adapter.searchDocuments('1');

      // First results should be question number matches
      expect(results[0].section).toMatch(/Question \d+/);
    });
  });

  describe('Ordinal Search', () => {
    it('should find "first question"', () => {
      const results = adapter.searchDocuments('first question');

      expect(results.length).toBeGreaterThan(0);
      const hasQ1 = results.some(r => r.section.includes('Question 1'));
      expect(hasQ1).toBe(true);
    });

    it('should find "second question"', () => {
      const results = adapter.searchDocuments('second question');

      expect(results.length).toBeGreaterThan(0);
      const hasQ2 = results.some(r => r.section.includes('Question 2'));
      expect(hasQ2).toBe(true);
    });

    it('should find "tenth question"', () => {
      const results = adapter.searchDocuments('tenth question');

      expect(results.length).toBeGreaterThan(0);
      const hasQ10 = results.some(r => r.section.includes('Question 10'));
      expect(hasQ10).toBe(true);
    });

    it('should find "hundredth question"', () => {
      const results = adapter.searchDocuments('hundredth');

      expect(results.length).toBeGreaterThan(0);
      const hasQ100 = results.some(r => r.section.includes('Question 100'));
      expect(hasQ100).toBe(true);
    });
  });

  describe('Title Search', () => {
    it('should find document by exact title', () => {
      const results = adapter.searchDocuments('Westminster Shorter Catechism');

      expect(results.length).toBeGreaterThan(0);
      const wscResult = results.find(r => r.document === 'Westminster Shorter Catechism');
      expect(wscResult).toBeDefined();
    });

    it('should find document by partial title', () => {
      const results = adapter.searchDocuments('Nicene');

      expect(results.length).toBeGreaterThan(0);
      const niceneResult = results.find(r => r.document.includes('Nicene'));
      expect(niceneResult).toBeDefined();
    });

    it('should normalize "The" prefix in titles', () => {
      const results = adapter.searchDocuments('Apostles Creed');

      expect(results.length).toBeGreaterThan(0);
      // Should find "The Apostles' Creed" even without "The"
      const apostlesResult = results.find(r => r.document.includes('Apostles'));
      expect(apostlesResult).toBeDefined();
    });

    it('should be case-insensitive', () => {
      const results1 = adapter.searchDocuments('westminster');
      const results2 = adapter.searchDocuments('WESTMINSTER');

      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);
      expect(results1.length).toBe(results2.length);
    });
  });

  describe('Topic Search', () => {
    it('should find sections by topic', () => {
      const results = adapter.searchDocuments('Trinity');

      expect(results.length).toBeGreaterThan(0);
      // Should find sections tagged with Trinity topic
    });

    it('should support multi-word topic search', () => {
      const results = adapter.searchDocuments('Holy Spirit');

      // Should find sections mentioning Holy Spirit
      expect(results.length).toBeGreaterThan(0);
    });

    it('should match document-level topics', () => {
      const results = adapter.searchDocuments('Reformed');

      expect(results.length).toBeGreaterThan(0);
      const hasReformed = results.some(r =>
        r.document.includes('Westminster') || r.document.includes('Belgic')
      );
      expect(hasReformed).toBe(true);
    });
  });

  describe('Content Search', () => {
    it('should find exact phrase matches', () => {
      const results = adapter.searchDocuments('chief end of man');

      expect(results.length).toBeGreaterThan(0);
      const wscQ1 = results.find(r => r.text.includes('chief end'));
      expect(wscQ1).toBeDefined();
    });

    it('should find multi-word queries (AND logic)', () => {
      const results = adapter.searchDocuments('glorify enjoy God');

      expect(results.length).toBeGreaterThan(0);
      // Should find WSC Q1 which contains all these words
      const hasAll = results.some(r =>
        r.text.includes('glorify') &&
        r.text.includes('enjoy') &&
        r.text.includes('God')
      );
      expect(hasAll).toBe(true);
    });

    it('should search in both questions and answers', () => {
      const results = adapter.searchDocuments('Scripture');

      expect(results.length).toBeGreaterThan(0);
      const hasScripture = results.some(r =>
        r.text.toLowerCase().includes('scripture')
      );
      expect(hasScripture).toBe(true);
    });
  });

  describe('Document Type Filtering', () => {
    it('should filter by catechism type', () => {
      const results = adapter.searchDocuments('God', undefined, 'catechism');

      expect(results.length).toBeGreaterThan(0);
      // All results should be catechisms
      const allCatechisms = results.every(r =>
        r.document.toLowerCase().includes('catechism')
      );
      expect(allCatechisms).toBe(true);
    });

    it('should filter by confession type', () => {
      const results = adapter.searchDocuments('God', undefined, 'confession');

      expect(results.length).toBeGreaterThan(0);
      // All results should be confessions
      const allConfessions = results.every(r =>
        r.document.toLowerCase().includes('confession') ||
        r.document.toLowerCase().includes('articles')
      );
      expect(allConfessions).toBe(true);
    });

    it('should filter by creed type', () => {
      const results = adapter.searchDocuments('God', undefined, 'creed');

      expect(results.length).toBeGreaterThan(0);
      // All results should be creeds
      const allCreeds = results.every(r =>
        r.document.toLowerCase().includes('creed')
      );
      expect(allCreeds).toBe(true);
    });
  });

  describe('Document Filtering', () => {
    it('should filter by document name', () => {
      const results = adapter.searchDocuments('God', 'westminster');

      expect(results.length).toBeGreaterThan(0);
      // All results should be from Westminster documents
      const allWestminster = results.every(r =>
        r.document.toLowerCase().includes('westminster')
      );
      expect(allWestminster).toBe(true);
    });

    it('should return empty array for non-matching filter', () => {
      const results = adapter.searchDocuments('God', 'non-existent-document');

      expect(results).toEqual([]);
    });
  });

  describe('Section Formatting', () => {
    it('should format catechism Q&A sections', () => {
      const results = adapter.searchDocuments('chief end of man');

      const wscQ1 = results.find(r => r.section.includes('Question 1'));
      expect(wscQ1).toBeDefined();
      expect(wscQ1?.text).toMatch(/Q:.*\n\nA:.*/);
    });

    it('should format confession content sections', () => {
      const results = adapter.searchDocuments('Holy Scripture', 'westminster-confession');

      expect(results.length).toBeGreaterThan(0);
      const confessionSection = results[0];
      expect(confessionSection.text.length).toBeGreaterThan(50);
    });

    it('should extract section titles correctly', () => {
      const results = adapter.searchDocuments('chief end');

      const wscQ1 = results.find(r => r.document.includes('Westminster Shorter'));
      expect(wscQ1?.section).toBe('Question 1');
    });

    it('should extract chapter numbers for confessions', () => {
      const results = adapter.searchDocuments('Scripture', 'westminster-confession');

      const chapter1 = results.find(r => r.section.includes('Chapter'));
      expect(chapter1).toBeDefined();
      expect(chapter1?.section).toMatch(/Chapter \d+/);
    });
  });

  describe('Citation Formatting', () => {
    it('should include document title in citation', () => {
      const results = adapter.searchDocuments('chief end');

      const wscQ1 = results.find(r => r.document.includes('Westminster Shorter'));
      expect(wscQ1?.citation.source).toContain('Westminster Shorter Catechism');
    });

    it('should include document date in citation', () => {
      const results = adapter.searchDocuments('chief end');

      const wscQ1 = results.find(r => r.document.includes('Westminster Shorter'));
      expect(wscQ1?.citation.source).toContain('1647');
    });

    it('should include local URL', () => {
      const results = adapter.searchDocuments('chief end');

      const wscQ1 = results.find(r => r.document.includes('Westminster Shorter'));
      expect(wscQ1?.citation.url).toMatch(/^local:/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty query', () => {
      const results = adapter.searchDocuments('');

      // Empty query should return no results
      expect(results).toEqual([]);
    });

    it('should handle query with no matches', () => {
      const results = adapter.searchDocuments('xyzabc123nonexistent');

      expect(results).toEqual([]);
    });

    it('should handle special characters in query', () => {
      const results = adapter.searchDocuments('God\'s');

      // Should handle apostrophes gracefully
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle very long queries', () => {
      const longQuery = 'God love faith salvation grace mercy peace joy hope righteousness holiness';
      const results = adapter.searchDocuments(longQuery);

      // Should not crash with long query
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle single-character queries', () => {
      const results = adapter.searchDocuments('a');

      // Should not crash but may return many results
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should search quickly across all documents', () => {
      const start = Date.now();
      const results = adapter.searchDocuments('God');
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(500); // Should complete in <500ms
    });

    it('should handle multiple rapid searches', () => {
      const queries = ['God', 'Scripture', 'faith', 'grace', 'Trinity'];

      const start = Date.now();
      queries.forEach(q => adapter.searchDocuments(q));
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // All 5 searches in <1s
    });
  });
});
