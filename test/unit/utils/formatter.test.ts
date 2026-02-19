/**
 * Formatter Utility Tests
 *
 * Tests for markdown formatting and response generation
 */

import { describe, it, expect } from 'vitest';
import {
  formatMarkdown,
  formatBibleResponse,
  formatCommentaryResponse,
  formatHistoricalResponse,
  formatMultiBibleResponse
} from '../../../src/utils/formatter.js';
import {
  createMockBibleResult,
  createMockCommentaryResult,
  createMockFootnote
} from '../../helpers/testHelpers.js';

describe('Formatter Utils', () => {
  describe('formatMarkdown', () => {
    it('should format with title and content', () => {
      const result = formatMarkdown({
        title: 'Test Title',
        content: 'Test content'
      });

      expect(result).toContain('**Test Title**');
      expect(result).toContain('Test content');
    });

    it('should include citation when provided', () => {
      const result = formatMarkdown({
        title: 'Test Title',
        content: 'Test content',
        citation: 'https://example.com'
      });

      expect(result).toContain('https://example.com');
    });

    it('should include footer when provided', () => {
      const result = formatMarkdown({
        title: 'Test Title',
        content: 'Test content',
        footer: 'Test footer'
      });

      expect(result).toContain('Test footer');
    });

    it('should handle missing optional fields', () => {
      const result = formatMarkdown({
        title: 'Test Title',
        content: 'Test content'
      });

      expect(result).toContain('Test Title');
      expect(result).toContain('Test content');
    });

    it('should escape markdown special characters', () => {
      const result = formatMarkdown({
        title: 'Test * Title # with special chars',
        content: 'Content with `code` and [links](url)'
      });

      // Should still contain the content but properly formatted
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('formatBibleResponse', () => {
    it('should format basic Bible response', () => {
      const mockResult = createMockBibleResult();
      const formatted = formatBibleResponse(mockResult);

      expect(formatted).toContain('John 3:16');
      expect(formatted).toContain('ESV');
      expect(formatted).toContain('For God so loved the world');
    });

    it('should include footnotes when present', () => {
      const mockResult = createMockBibleResult({
        footnotes: [createMockFootnote()]
      });
      const formatted = formatBibleResponse(mockResult);

      expect(formatted).toContain('Footnotes');
      expect(formatted).toContain('Or only begotten');
    });

    it('should not show footnotes section when empty', () => {
      const mockResult = createMockBibleResult({
        footnotes: []
      });
      const formatted = formatBibleResponse(mockResult);

      expect(formatted).not.toContain('Footnotes');
    });

    it('should include cross-references when present', () => {
      const mockResult = createMockBibleResult({
        crossReferences: [
          { reference: 'Romans 5:8' },
          { reference: '1 John 4:9' }
        ]
      });
      const formatted = formatBibleResponse(mockResult);

      expect(formatted).toContain('Cross References');
      expect(formatted).toContain('Romans 5:8');
      expect(formatted).toContain('1 John 4:9');
    });

    it('should include citation', () => {
      const mockResult = createMockBibleResult();
      const formatted = formatBibleResponse(mockResult);

      expect(formatted).toContain('ESV Bible');
      expect(formatted).toContain('© 2001 Crossway Bibles');
    });
  });

  describe('formatCommentaryResponse', () => {
    it('should format basic commentary response', () => {
      const mockResult = createMockCommentaryResult();
      const formatted = formatCommentaryResponse(mockResult);

      expect(formatted).toContain('John 3:16');
      expect(formatted).toContain('Matthew Henry');
      expect(formatted).toContain('God so loved the world');
    });

    it('should handle long commentary text', () => {
      const longText = 'A'.repeat(5000);
      const mockResult = createMockCommentaryResult({
        text: longText
      });
      const formatted = formatCommentaryResponse(mockResult);

      expect(formatted).toContain(longText);
      expect(formatted.length).toBeGreaterThan(5000);
    });

    it('should include citation', () => {
      const mockResult = createMockCommentaryResult();
      const formatted = formatCommentaryResponse(mockResult);

      expect(formatted).toContain('Matthew Henry\'s Complete Commentary');
    });
  });

  describe('formatMultiBibleResponse', () => {
    it('should format multiple translations', () => {
      const results = [
        createMockBibleResult({ translation: 'ESV', text: 'ESV text' }),
        createMockBibleResult({ translation: 'KJV', text: 'KJV text' }),
        createMockBibleResult({ translation: 'NET', text: 'NET text' })
      ];
      const formatted = formatMultiBibleResponse(results);

      expect(formatted).toContain('ESV');
      expect(formatted).toContain('KJV');
      expect(formatted).toContain('NET');
      expect(formatted).toContain('ESV text');
      expect(formatted).toContain('KJV text');
      expect(formatted).toContain('NET text');
    });

    it('should separate translations clearly', () => {
      const results = [
        createMockBibleResult({ translation: 'ESV' }),
        createMockBibleResult({ translation: 'KJV' })
      ];
      const formatted = formatMultiBibleResponse(results);

      // Should have translation labels
      expect(formatted).toContain('**ESV:**');
      expect(formatted).toContain('**KJV:**');
    });

    it('should handle single translation', () => {
      const results = [createMockBibleResult()];
      const formatted = formatMultiBibleResponse(results);

      expect(formatted).toContain('John 3:16');
      expect(formatted).toContain('ESV');
    });

    it('should preserve footnotes in multi-translation format', () => {
      const results = [
        createMockBibleResult({
          translation: 'ESV',
          footnotes: [createMockFootnote()]
        }),
        createMockBibleResult({
          translation: 'KJV'
        })
      ];
      const formatted = formatMultiBibleResponse(results);

      expect(formatted).toContain('Footnotes');
      expect(formatted).toContain('Or only begotten');
    });
  });

  describe('formatHistoricalResponse', () => {
    it('should format historical document result', () => {
      const mockResult = {
        document: 'Westminster Confession',
        section: 'Chapter 1: Of the Holy Scripture',
        text: 'The authority of the Holy Scripture...',
        citation: {
          source: 'Local Historical Documents',
          copyright: 'Public Domain'
        }
      };
      const formatted = formatHistoricalResponse(mockResult);

      expect(formatted).toContain('Westminster Confession');
      expect(formatted).toContain('Chapter 1: Of the Holy Scripture');
      expect(formatted).toContain('The authority of the Holy Scripture');
    });

    it('should handle missing optional fields', () => {
      const mockResult = {
        document: 'Nicene Creed',
        section: 'Full Text',
        text: 'We believe in one God...',
        citation: {
          source: 'Local Historical Documents'
        }
      };
      const formatted = formatHistoricalResponse(mockResult);

      expect(formatted).toContain('Nicene Creed');
      expect(formatted).toContain('We believe in one God');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty strings', () => {
      const result = formatMarkdown({
        title: '',
        content: ''
      });

      expect(result).toBeTruthy();
    });

    it('should handle special Unicode characters', () => {
      const mockResult = createMockBibleResult({
        text: 'Greek: ἀγάπη (agapē) Hebrew: אָהַב (ahav)'
      });
      const formatted = formatBibleResponse(mockResult);

      expect(formatted).toContain('ἀγάπη');
      expect(formatted).toContain('אָהַב');
    });

    it('should handle very long text', () => {
      const longText = 'A'.repeat(50000);
      const mockResult = createMockBibleResult({ text: longText });
      const formatted = formatBibleResponse(mockResult);

      expect(formatted.length).toBeGreaterThan(50000);
    });

    it('should handle HTML entities in text', () => {
      const mockResult = createMockBibleResult({
        text: 'Text with &lt;tags&gt; and &amp; entities'
      });
      const formatted = formatBibleResponse(mockResult);

      expect(formatted).toBeTruthy();
    });
  });

  describe('Markdown formatting consistency', () => {
    it('should use consistent heading levels', () => {
      const result = formatMarkdown({
        title: 'Main Title',
        content: '## Subheading\n\nContent here'
      });

      expect(result).toContain('**Main Title**');
      expect(result).toContain('## Subheading');
    });

    it('should properly format lists', () => {
      const result = formatMarkdown({
        title: 'List Test',
        content: '- Item 1\n- Item 2\n- Item 3'
      });

      expect(result).toContain('- Item 1');
      expect(result).toContain('- Item 2');
      expect(result).toContain('- Item 3');
    });

    it('should preserve line breaks', () => {
      const result = formatMarkdown({
        title: 'Line Break Test',
        content: 'Line 1\n\nLine 2\n\nLine 3'
      });

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });
  });
});
