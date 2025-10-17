/**
 * CrossReferenceService Tests
 *
 * Comprehensive unit tests for Bible cross-reference lookup service
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { CrossReferenceService, CrossReference, CrossReferenceResult } from '../../../src/services/crossReferenceService.js';

// Mock TSV data for testing
const MOCK_TSV_DATA = `From Verse	To Verse	Votes
Gen.1.1	John.1.1	50
Gen.1.1	Heb.11.3	45
Gen.1.1	Col.1.16	40
Gen.1.1	Ps.33.6	35
Gen.1.1	Rev.4.11	30
Gen.1.1	John.1.3	25
Gen.1.1	Isa.42.5	20
Gen.1.1	Jer.10.12	15
Matt.5.3	Luke.6.20	100
Matt.5.3	Ps.34.18	80
Matt.5.3	Isa.57.15	60
Matt.5.4	Rev.21.4	75
Matt.5.5	Ps.37.11	90
Rom.3.23	Rom.5.12	85
Rom.3.23	1John.1.8	70
Ps.148.4-Ps.148.5	Gen.1.6	55
Ps.148.4-Ps.148.5	Ps.33.6	50
1Cor.15.3	Isa.53.5	65
1Cor.15.3	1Pet.2.24	60
John.3.16	Rom.5.8	95`;

describe('CrossReferenceService', () => {
  let service: CrossReferenceService;
  let tempDir: string;
  let tempFilePath: string;

  beforeAll(() => {
    // Create temporary directory and file with mock data
    tempDir = join(process.cwd(), 'test', 'temp', 'cross-refs');
    mkdirSync(tempDir, { recursive: true });
    tempFilePath = join(tempDir, 'test_cross_references.txt');
    writeFileSync(tempFilePath, MOCK_TSV_DATA, 'utf-8');

    // Initialize service with mock data
    service = new CrossReferenceService(tempFilePath);

    // Cleanup function will run after all tests
    return () => {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    };
  });

  describe('Data loading', () => {
    it('should load TSV data file successfully', () => {
      expect(service).toBeDefined();
      expect(service.getTotalCount()).toBeGreaterThan(0);
    });

    it('should parse TSV format correctly', () => {
      expect(service.getTotalCount()).toBe(20); // Total lines minus header
    });

    it('should throw error if data file does not exist', () => {
      expect(() => {
        new CrossReferenceService('/nonexistent/path/file.txt');
      }).toThrow();
    });

    it('should skip empty lines in TSV data', () => {
      const dataWithEmptyLines = `From Verse	To Verse	Votes
Gen.1.1	John.1.1	50

Gen.1.2	John.1.2	40

`;
      const tempPath = join(tempDir, 'empty_lines.txt');
      writeFileSync(tempPath, dataWithEmptyLines, 'utf-8');
      const testService = new CrossReferenceService(tempPath);
      expect(testService.getTotalCount()).toBe(2);
    });

    it('should skip malformed lines with insufficient columns', () => {
      const malformedData = `From Verse	To Verse	Votes
Gen.1.1	John.1.1	50
Gen.1.2
Gen.1.3	John.1.3	40`;
      const tempPath = join(tempDir, 'malformed.txt');
      writeFileSync(tempPath, malformedData, 'utf-8');
      const testService = new CrossReferenceService(tempPath);
      expect(testService.getTotalCount()).toBe(2); // Only valid lines
    });

    it('should handle votes parsing with default to 0 for invalid numbers', () => {
      const invalidVotesData = `From Verse	To Verse	Votes
Gen.1.1	John.1.1	abc
Gen.1.2	John.1.2	50`;
      const tempPath = join(tempDir, 'invalid_votes.txt');
      writeFileSync(tempPath, invalidVotesData, 'utf-8');
      const testService = new CrossReferenceService(tempPath);
      const result = testService.getCrossReferences('Genesis 1:1');
      expect(result.references[0].votes).toBe(0);
    });
  });

  describe('Reference normalization', () => {
    it('should normalize "Gen.1.1" to "Genesis 1:1"', () => {
      const result = service.getCrossReferences('Gen.1.1');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('should normalize "Genesis 1:1" (already normalized)', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('should normalize "Matt.5.3" to "Matthew 5:3"', () => {
      const result = service.getCrossReferences('Matt.5.3');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('should normalize "Rom.3.23" to "Romans 3:23"', () => {
      const result = service.getCrossReferences('Rom.3.23');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('should normalize "Ps.148.4-Ps.148.5" to "Psalms 148:4-Psalms 148:5"', () => {
      const result = service.getCrossReferences('Ps.148.4-Ps.148.5');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('should handle verse ranges in cross-reference output', () => {
      const result = service.getCrossReferences('Psalms 148:4-Psalms 148:5');
      expect(result.references.length).toBeGreaterThan(0);
      expect(result.references[0].reference).toBe('Genesis 1:6');
    });

    it('should normalize "1Cor.15.3" to "1 Corinthians 15:3"', () => {
      const result = service.getCrossReferences('1Cor.15.3');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('should normalize "1John.1.8" output reference', () => {
      const result = service.getCrossReferences('Romans 3:23');
      const johnRef = result.references.find(r => r.reference.includes('John'));
      expect(johnRef?.reference).toBe('1 John 1:8');
    });
  });

  describe('Book abbreviation mapping', () => {
    it('should map "Gen" to "Genesis"', () => {
      expect(service.hasReferences('Genesis 1:1')).toBe(true);
    });

    it('should map "Matt" to "Matthew"', () => {
      expect(service.hasReferences('Matthew 5:3')).toBe(true);
    });

    it('should map "Rom" to "Romans"', () => {
      expect(service.hasReferences('Romans 3:23')).toBe(true);
    });

    it('should map "Ps" to "Psalms"', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      const psalmRef = result.references.find(r => r.reference.includes('Psalms'));
      expect(psalmRef).toBeDefined();
      expect(psalmRef?.reference).toContain('Psalms');
    });

    it('should map "Isa" to "Isaiah"', () => {
      const result = service.getCrossReferences('Matthew 5:3');
      const isaRef = result.references.find(r => r.reference.includes('Isaiah'));
      expect(isaRef).toBeDefined();
    });

    it('should map "Jer" to "Jeremiah"', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 10 });
      const jerRef = result.references.find(r => r.reference.includes('Jeremiah'));
      expect(jerRef).toBeDefined();
    });

    it('should map "Heb" to "Hebrews"', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      const hebRef = result.references.find(r => r.reference.includes('Hebrews'));
      expect(hebRef).toBeDefined();
    });

    it('should map "Col" to "Colossians"', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      const colRef = result.references.find(r => r.reference.includes('Colossians'));
      expect(colRef).toBeDefined();
    });

    it('should map "Rev" to "Revelation"', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      const revRef = result.references.find(r => r.reference.includes('Revelation'));
      expect(revRef).toBeDefined();
    });

    it('should map "1Cor" to "1 Corinthians"', () => {
      const result = service.getCrossReferences('1 Corinthians 15:3');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('should map "1Pet" to "1 Peter"', () => {
      const result = service.getCrossReferences('1 Corinthians 15:3');
      const petRef = result.references.find(r => r.reference.includes('Peter'));
      expect(petRef?.reference).toContain('1 Peter');
    });
  });

  describe('Vote-based filtering', () => {
    it('should filter by minVotes parameter', () => {
      const result = service.getCrossReferences('Genesis 1:1', { minVotes: 40 });
      expect(result.references.every(ref => ref.votes >= 40)).toBe(true);
    });

    it('should return fewer results with higher minVotes threshold', () => {
      const lowThreshold = service.getCrossReferences('Genesis 1:1', { minVotes: 10 });
      const highThreshold = service.getCrossReferences('Genesis 1:1', { minVotes: 40 });
      expect(highThreshold.references.length).toBeLessThan(lowThreshold.references.length);
    });

    it('should return empty array when minVotes exceeds all votes', () => {
      const result = service.getCrossReferences('Genesis 1:1', { minVotes: 1000 });
      expect(result.references).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should default to minVotes=0 when not specified', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      expect(result.references.length).toBeGreaterThan(0);
    });

    it('should include references with exactly minVotes value', () => {
      const result = service.getCrossReferences('Genesis 1:1', { minVotes: 50 });
      expect(result.references.some(ref => ref.votes === 50)).toBe(true);
    });

    it('should exclude references below minVotes threshold', () => {
      const result = service.getCrossReferences('Genesis 1:1', { minVotes: 30 });
      expect(result.references.every(ref => ref.votes >= 30)).toBe(true);
      expect(result.references.some(ref => ref.votes < 30)).toBe(false);
    });
  });

  describe('Result limiting', () => {
    it('should limit results to maxResults parameter', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 3 });
      expect(result.showing).toBe(3);
      expect(result.references.length).toBe(3);
    });

    it('should default to maxResults=5 when not specified', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      expect(result.showing).toBeLessThanOrEqual(5);
    });

    it('should return all results when maxResults exceeds total', () => {
      const result = service.getCrossReferences('Matthew 5:5', { maxResults: 100 });
      expect(result.showing).toBe(result.total);
      expect(result.hasMore).toBe(false);
    });

    it('should respect maxResults=1 for single result', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 1 });
      expect(result.references.length).toBe(1);
      expect(result.showing).toBe(1);
    });

    it('should work with maxResults=0 returning empty array', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 0 });
      expect(result.references.length).toBe(0);
      expect(result.showing).toBe(0);
    });
  });

  describe('Sorting by votes', () => {
    it('should sort results by votes in descending order', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 20 });
      for (let i = 1; i < result.references.length; i++) {
        expect(result.references[i - 1].votes).toBeGreaterThanOrEqual(result.references[i].votes);
      }
    });

    it('should return highest voted reference first', () => {
      const result = service.getCrossReferences('Matthew 5:3');
      expect(result.references[0].reference).toBe('Luke 6:20');
      expect(result.references[0].votes).toBe(100);
    });

    it('should maintain vote order after filtering', () => {
      const result = service.getCrossReferences('Genesis 1:1', { minVotes: 25, maxResults: 10 });
      for (let i = 1; i < result.references.length; i++) {
        expect(result.references[i - 1].votes).toBeGreaterThanOrEqual(result.references[i].votes);
      }
    });
  });

  describe('hasReferences() method', () => {
    it('should return true for verses with cross-references', () => {
      expect(service.hasReferences('Genesis 1:1')).toBe(true);
    });

    it('should return false for verses without cross-references', () => {
      expect(service.hasReferences('Genesis 50:26')).toBe(false);
    });

    it('should normalize reference before checking', () => {
      expect(service.hasReferences('Gen.1.1')).toBe(true);
      expect(service.hasReferences('Matt.5.3')).toBe(true);
    });

    it('should return false for non-existent references', () => {
      expect(service.hasReferences('InvalidBook 1:1')).toBe(false);
    });

    it('should handle verse ranges', () => {
      expect(service.hasReferences('Ps.148.4-Ps.148.5')).toBe(true);
    });
  });

  describe('getTotalCount() method', () => {
    it('should return total number of cross-references loaded', () => {
      expect(service.getTotalCount()).toBe(20);
    });

    it('should match number of data lines excluding header', () => {
      const lines = MOCK_TSV_DATA.split('\n');
      const dataLines = lines.slice(1).filter(line => line.trim() !== '');
      expect(service.getTotalCount()).toBe(dataLines.length);
    });

    it('should count all references across all verses', () => {
      const total = service.getTotalCount();
      expect(total).toBeGreaterThan(0);
      expect(typeof total).toBe('number');
    });
  });

  describe('CrossReferenceResult structure', () => {
    it('should return proper result structure', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      expect(result).toHaveProperty('references');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('showing');
      expect(result).toHaveProperty('hasMore');
    });

    it('should have references as array of CrossReference objects', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      expect(Array.isArray(result.references)).toBe(true);
      if (result.references.length > 0) {
        expect(result.references[0]).toHaveProperty('reference');
        expect(result.references[0]).toHaveProperty('votes');
      }
    });

    it('should have total reflecting filtered count', () => {
      const result = service.getCrossReferences('Genesis 1:1', { minVotes: 40 });
      expect(result.total).toBe(result.references.length + (result.hasMore ? 1 : 0) || result.showing);
    });

    it('should have showing equal to references array length', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      expect(result.showing).toBe(result.references.length);
    });

    it('should set hasMore to true when results exceed maxResults', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 2 });
      expect(result.hasMore).toBe(true);
      expect(result.total).toBeGreaterThan(result.showing);
    });

    it('should set hasMore to false when all results shown', () => {
      const result = service.getCrossReferences('Matthew 5:5', { maxResults: 100 });
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty results gracefully', () => {
      const result = service.getCrossReferences('Nonexistent 99:99');
      expect(result.references).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.showing).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle single result', () => {
      const result = service.getCrossReferences('Matthew 5:5', { maxResults: 1 });
      expect(result.references.length).toBe(1);
      expect(result.showing).toBe(1);
    });

    it('should handle many results with large maxResults', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 100 });
      expect(result.references.length).toBeGreaterThan(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle verse with exactly maxResults references', () => {
      const verse = 'Romans 3:23';
      const allRefs = service.getCrossReferences(verse, { maxResults: 100 });
      const limitedRefs = service.getCrossReferences(verse, { maxResults: allRefs.total });
      expect(limitedRefs.showing).toBe(limitedRefs.total);
      expect(limitedRefs.hasMore).toBe(false);
    });

    it('should handle combination of minVotes and maxResults', () => {
      const result = service.getCrossReferences('Genesis 1:1', {
        minVotes: 30,
        maxResults: 2
      });
      expect(result.references.length).toBeLessThanOrEqual(2);
      expect(result.references.every(ref => ref.votes >= 30)).toBe(true);
    });

    it('should return consistent results for same query', () => {
      const result1 = service.getCrossReferences('Genesis 1:1', { maxResults: 5 });
      const result2 = service.getCrossReferences('Genesis 1:1', { maxResults: 5 });
      expect(result1.references).toEqual(result2.references);
      expect(result1.total).toBe(result2.total);
    });

    it('should handle whitespace in input references', () => {
      const result1 = service.getCrossReferences('Genesis 1:1');
      const result2 = service.getCrossReferences('  Genesis   1:1  ');
      expect(result1.references.length).toBe(result2.references.length);
    });

    it('should handle negative minVotes as 0', () => {
      const result = service.getCrossReferences('Genesis 1:1', { minVotes: -10 });
      expect(result.references.length).toBeGreaterThan(0);
    });
  });

  describe('CrossReference object structure', () => {
    it('should have reference property as string', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 1 });
      if (result.references.length > 0) {
        expect(typeof result.references[0].reference).toBe('string');
      }
    });

    it('should have votes property as number', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 1 });
      if (result.references.length > 0) {
        expect(typeof result.references[0].votes).toBe('number');
      }
    });

    it('should have properly formatted reference strings', () => {
      const result = service.getCrossReferences('Genesis 1:1');
      result.references.forEach(ref => {
        expect(ref.reference).toMatch(/^[\w\s]+\s+\d+:\d+(-[\w\s]+\s+\d+:\d+)?$/);
      });
    });

    it('should have non-negative vote counts', () => {
      const result = service.getCrossReferences('Genesis 1:1', { maxResults: 100 });
      result.references.forEach(ref => {
        expect(ref.votes).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Multiple verse lookups', () => {
    it('should return different results for different verses', () => {
      const result1 = service.getCrossReferences('Genesis 1:1');
      const result2 = service.getCrossReferences('Matthew 5:3');
      expect(result1.references).not.toEqual(result2.references);
    });

    it('should handle sequential lookups correctly', () => {
      const verses = ['Genesis 1:1', 'Matthew 5:3', 'Romans 3:23', 'John 3:16'];
      const results = verses.map(v => service.getCrossReferences(v));
      results.forEach((result, i) => {
        if (result.total > 0) {
          expect(result.references.length).toBeGreaterThan(0);
        }
      });
    });

    it('should maintain data integrity across multiple queries', () => {
      const totalBefore = service.getTotalCount();
      service.getCrossReferences('Genesis 1:1');
      service.getCrossReferences('Matthew 5:3');
      service.getCrossReferences('Romans 3:23');
      const totalAfter = service.getTotalCount();
      expect(totalBefore).toBe(totalAfter);
    });
  });
});
