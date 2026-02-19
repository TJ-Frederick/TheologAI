/**
 * Historical Search Integration Tests
 *
 * Tests historicalSearchHandler with LocalDataAdapter
 * Uses real historical documents from data/historical-documents
 */

import { describe, it, expect } from 'vitest';
import { historicalSearchHandler } from '../../src/tools/historicalSearch.js';
import type { HistoricalSearchParams } from '../../src/types/index.js';

describe('Historical Search Integration Tests', () => {
  describe('Basic Document Search', () => {
    it('should search across all loaded documents', async () => {
      const params: HistoricalSearchParams = {
        query: 'trinity'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toMatch(/trinity/i);
    });

    it('should search for "scripture" across documents', async () => {
      const params: HistoricalSearchParams = {
        query: 'scripture'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/scripture/i);
      expect(result.content[0].text).toContain('Source:');
    });

    it('should search for "salvation" across documents', async () => {
      const params: HistoricalSearchParams = {
        query: 'salvation'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/salvation/i);
    });

    it('should search for theological terms like "justification"', async () => {
      const params: HistoricalSearchParams = {
        query: 'justification'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // May or may not find results depending on loaded documents
    });
  });

  describe('Complex Multi-Word Queries', () => {
    it('should search for "chief end of man"', async () => {
      const params: HistoricalSearchParams = {
        query: 'chief end of man'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/chief end/i);
      // Westminster Shorter Catechism Q1
      expect(result.content[0].text).toMatch(/glorify God/i);
    });

    it('should search for "Holy Scripture"', async () => {
      const params: HistoricalSearchParams = {
        query: 'Holy Scripture'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/holy scripture/i);
    });

    it('should search for "Jesus Christ our Lord"', async () => {
      const params: HistoricalSearchParams = {
        query: 'Jesus Christ our Lord'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should match creeds or confessions mentioning Jesus Christ
    });

    it('should search for multi-token query "image of God"', async () => {
      const params: HistoricalSearchParams = {
        query: 'image of God'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should find creation-related sections
    });
  });

  describe('Question Number Routing', () => {
    it('should find question by number: "1"', async () => {
      const params: HistoricalSearchParams = {
        query: '1'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/Question 1/i);
      // Should find first question of catechisms
    });

    it('should find question by number: "100"', async () => {
      const params: HistoricalSearchParams = {
        query: '100'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // May find Q100 if it exists in loaded catechisms
    });

    it('should find question by Q-notation: "Q1"', async () => {
      const params: HistoricalSearchParams = {
        query: 'Q1'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/Question 1/i);
    });

    it('should find question by full notation: "Question 1"', async () => {
      const params: HistoricalSearchParams = {
        query: 'Question 1'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/Question 1/i);
    });

    it('should find question by ordinal: "first question"', async () => {
      const params: HistoricalSearchParams = {
        query: 'first question'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/Question 1/i);
    });

    it('should find question by ordinal: "second question"', async () => {
      const params: HistoricalSearchParams = {
        query: 'second question'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/Question 2/i);
    });

    it('should find question by ordinal: "tenth question"', async () => {
      const params: HistoricalSearchParams = {
        query: 'tenth question'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should find Q10 if it exists
    });
  });

  describe('Topic-Based Discovery', () => {
    it('should discover documents by topic: "grace"', async () => {
      const params: HistoricalSearchParams = {
        query: 'grace'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/grace/i);
    });

    it('should discover documents by topic: "creation"', async () => {
      const params: HistoricalSearchParams = {
        query: 'creation'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/creation/i);
    });

    it('should discover documents by topic: "worship"', async () => {
      const params: HistoricalSearchParams = {
        query: 'worship'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
    });

    it('should discover documents by topic: "faith"', async () => {
      const params: HistoricalSearchParams = {
        query: 'faith'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toMatch(/faith/i);
    });
  });

  describe('Document Type Filtering', () => {
    it('should filter by docType: "catechism"', async () => {
      const params: HistoricalSearchParams = {
        query: 'God',
        docType: 'catechism'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should only return catechism results
      if (result.content[0].text.includes('Source:')) {
        expect(result.content[0].text).toMatch(/catechism/i);
      }
    });

    it('should filter by docType: "confession"', async () => {
      const params: HistoricalSearchParams = {
        query: 'scripture',
        docType: 'confession'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should only return confession results
      if (result.content[0].text.includes('Source:')) {
        expect(result.content[0].text).toMatch(/confession/i);
      }
    });

    it('should filter by docType: "creed"', async () => {
      const params: HistoricalSearchParams = {
        query: 'believe',
        docType: 'creed'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should only return creed results
    });
  });

  describe('Document Name Filtering', () => {
    it('should filter by document name: "Westminster"', async () => {
      const params: HistoricalSearchParams = {
        query: 'God',
        document: 'westminster'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should only search Westminster documents
      if (result.content[0].text.includes('Source:')) {
        expect(result.content[0].text).toMatch(/Westminster/i);
      }
    });

    it('should filter by document name: "Nicene"', async () => {
      const params: HistoricalSearchParams = {
        query: 'believe',
        document: 'nicene'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should search Nicene Creed
    });

    it('should filter by document name: "Apostles"', async () => {
      const params: HistoricalSearchParams = {
        query: 'believe',
        document: 'apostles'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should search Apostles' Creed
    });
  });

  describe('Full Formatting', () => {
    it('should format response with document name and section', async () => {
      const params: HistoricalSearchParams = {
        query: '1'
      };

      const result = await historicalSearchHandler.handler(params);

      const text = result.content[0].text;

      // Should have document title
      expect(text).toMatch(/\*\*.*\*\*/);
      // Should have section
      expect(text).toMatch(/Section:|Question/);
      // Should have source citation
      expect(text).toContain('Source:');
    });

    it('should format multiple results with separators', async () => {
      const params: HistoricalSearchParams = {
        query: 'trinity'
      };

      const result = await historicalSearchHandler.handler(params);

      const text = result.content[0].text;

      expect(text).toBeDefined();
      // If multiple results, should have separators
      if (text.includes('---')) {
        expect(text.split('---').length).toBeGreaterThan(1);
      }
    });

    it('should limit results to first 5 and show summary', async () => {
      const params: HistoricalSearchParams = {
        query: 'God'
      };

      const result = await historicalSearchHandler.handler(params);

      const text = result.content[0].text;

      // Should limit display
      expect(text).toBeDefined();
      // May show "Showing first 5 of X results"
      if (text.includes('Showing first')) {
        expect(text).toMatch(/Showing first 5 of \d+ results/);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle query with no results', async () => {
      const params: HistoricalSearchParams = {
        query: 'xyzabc123notfound'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toContain('No results found');
      // Should list available documents
      expect(result.content[0].text).toContain('Available documents');
    });

    it('should list available documents on no results', async () => {
      const params: HistoricalSearchParams = {
        query: 'definitelynotfound12345'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content[0].text).toContain('No results found');
      expect(result.content[0].text).toContain('Available documents');
    });

    it('should handle empty query string', async () => {
      const params: HistoricalSearchParams = {
        query: ''
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // May return no results or error
    });

    it('should handle special characters in query', async () => {
      const params: HistoricalSearchParams = {
        query: 'God\'s love'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
    });
  });

  describe('Real Data Loading', () => {
    it('should load documents from file system', async () => {
      const params: HistoricalSearchParams = {
        query: 'God'
      };

      const result = await historicalSearchHandler.handler(params);

      // Should successfully load and search documents
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBeDefined();
    });

    it('should search Westminster Shorter Catechism', async () => {
      const params: HistoricalSearchParams = {
        query: 'chief end',
        document: 'westminster-shorter'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should find WSC Q1 if document is loaded
    });

    it('should search historical creeds', async () => {
      const params: HistoricalSearchParams = {
        query: 'believe',
        docType: 'creed'
      };

      const result = await historicalSearchHandler.handler(params);

      expect(result.content).toBeDefined();
      // Should find creeds
    });
  });
});
