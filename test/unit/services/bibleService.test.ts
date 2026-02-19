/**
 * BibleService Unit Tests
 *
 * Comprehensive tests for Bible service translation routing,
 * adapter integration, and data transformation logic.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BibleService } from '../../../src/services/bibleService.js';
import { ESVAdapter, NETBibleAdapter } from '../../../src/adapters/index.js';
import { HelloAOBibleAdapter } from '../../../src/adapters/helloaoBibleAdapter.js';
import { BibleLookupParams } from '../../../src/types/index.js';
import { APIError } from '../../../src/utils/errors.js';
import { SAMPLE_VERSES } from '../../fixtures/bibleFixtures.js';

// Mock all adapters
vi.mock('../../../src/adapters/index.js', () => ({
  ESVAdapter: vi.fn(),
  NETBibleAdapter: vi.fn()
}));

vi.mock('../../../src/adapters/helloaoBibleAdapter.js', () => ({
  HelloAOBibleAdapter: vi.fn()
}));

describe('BibleService', () => {
  let service: BibleService;
  let mockEsvAdapter: any;
  let mockNetAdapter: any;
  let mockHelloAOAdapter: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock adapter instances
    mockEsvAdapter = {
      isConfigured: vi.fn(),
      getPassage: vi.fn(),
      getCopyrightNotice: vi.fn()
    };

    mockNetAdapter = {
      getPassage: vi.fn(),
      getCopyrightNotice: vi.fn()
    };

    mockHelloAOAdapter = {
      isSupported: vi.fn(),
      getPassage: vi.fn()
    };

    // Mock constructor implementations
    (ESVAdapter as any).mockImplementation(() => mockEsvAdapter);
    (NETBibleAdapter as any).mockImplementation(() => mockNetAdapter);
    (HelloAOBibleAdapter as any).mockImplementation(() => mockHelloAOAdapter);

    // Create service instance
    service = new BibleService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Translation routing logic', () => {
    describe('ESV translation routing', () => {
      it('should route ESV requests to ESV adapter when configured', async () => {
        mockEsvAdapter.isConfigured.mockReturnValue(true);
        mockHelloAOAdapter.isSupported.mockReturnValue(false);
        mockEsvAdapter.getPassage.mockResolvedValue({
          query: 'John 3:16',
          canonical: 'John 3:16',
          parsed: [[43, 3, 16, 43, 3, 16]],
          passage_meta: [{ canonical: 'John 3:16' }],
          passages: ['  [16] For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life. (ESV)']
        });
        mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV® Bible (English Standard Version®), copyright © 2001 by Crossway');

        const params: BibleLookupParams = {
          reference: 'John 3:16',
          translation: 'ESV'
        };

        const result = await service.lookup(params);

        expect(mockEsvAdapter.isConfigured).toHaveBeenCalled();
        expect(mockEsvAdapter.getPassage).toHaveBeenCalledWith('John 3:16', {
          includeVerseNumbers: true,
          includeShortCopyright: true
        });
        expect(result.translation).toBe('ESV');
        expect(result.citation.source).toBe('ESV® Bible');
      });

      it('should use ESV as default when no translation specified', async () => {
        mockEsvAdapter.isConfigured.mockReturnValue(true);
        mockHelloAOAdapter.isSupported.mockReturnValue(false);
        mockEsvAdapter.getPassage.mockResolvedValue({
          query: 'John 3:16',
          canonical: 'John 3:16',
          parsed: [[43, 3, 16, 43, 3, 16]],
          passage_meta: [{ canonical: 'John 3:16' }],
          passages: ['  [16] For God so loved the world...']
        });
        mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV® Bible (English Standard Version®), copyright © 2001 by Crossway');

        const params: BibleLookupParams = {
          reference: 'John 3:16'
        };

        const result = await service.lookup(params);

        expect(mockEsvAdapter.getPassage).toHaveBeenCalled();
        expect(result.translation).toBe('ESV');
      });

      it('should fallback to mock data when ESV adapter not configured', async () => {
        mockEsvAdapter.isConfigured.mockReturnValue(false);
        mockHelloAOAdapter.isSupported.mockReturnValue(false);

        const params: BibleLookupParams = {
          reference: 'John 3:16',
          translation: 'ESV'
        };

        const result = await service.lookup(params);

        expect(mockEsvAdapter.getPassage).not.toHaveBeenCalled();
        expect(result.text).toBe('For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.');
        expect(result.citation.source).toBe('ESV Bible (Mock Data)');
      });

      it('should fallback to mock data when ESV adapter throws error', async () => {
        mockEsvAdapter.isConfigured.mockReturnValue(true);
        mockHelloAOAdapter.isSupported.mockReturnValue(false);
        mockEsvAdapter.getPassage.mockRejectedValue(new APIError(503, 'Service unavailable'));

        const params: BibleLookupParams = {
          reference: 'John 3:16',
          translation: 'ESV'
        };

        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await service.lookup(params);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'ESV API failed, falling back to mock data:',
          'Service unavailable'
        );
        expect(result.citation.source).toBe('ESV Bible (Mock Data)');
        consoleWarnSpy.mockRestore();
      });
    });

    describe('NET translation routing', () => {
      it('should route NET requests to NET adapter', async () => {
        mockHelloAOAdapter.isSupported.mockReturnValue(false);
        mockNetAdapter.getPassage.mockResolvedValue({
          reference: 'John 3:16',
          passage: 'For this is the way God loved the world...',
          text: 'For this is the way God loved the world...',
          notes: [],
          html: '<div>For this is the way God loved the world...</div>'
        });
        mockNetAdapter.getCopyrightNotice.mockReturnValue('NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.');

        const params: BibleLookupParams = {
          reference: 'John 3:16',
          translation: 'NET'
        };

        const result = await service.lookup(params);

        expect(mockNetAdapter.getPassage).toHaveBeenCalledWith('John 3:16');
        expect(result.translation).toBe('NET');
        expect(result.citation.source).toBe('NET Bible®');
        expect(result.citation.url).toBe('https://netbible.org');
      });

      it('should handle lowercase net translation', async () => {
        mockHelloAOAdapter.isSupported.mockReturnValue(false);
        mockNetAdapter.getPassage.mockResolvedValue({
          reference: 'John 3:16',
          text: 'For this is the way God loved the world...',
          notes: [],
          html: ''
        });
        mockNetAdapter.getCopyrightNotice.mockReturnValue('NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.');

        const params: BibleLookupParams = {
          reference: 'John 3:16',
          translation: 'net'
        };

        const result = await service.lookup(params);

        expect(mockNetAdapter.getPassage).toHaveBeenCalled();
        expect(result.translation).toBe('NET');
      });

      it('should throw error when NET adapter returns empty text', async () => {
        mockHelloAOAdapter.isSupported.mockReturnValue(false);
        mockNetAdapter.getPassage.mockResolvedValue({
          reference: 'John 99:99',
          text: '',
          notes: [],
          html: ''
        });

        const params: BibleLookupParams = {
          reference: 'John 99:99',
          translation: 'NET'
        };

        await expect(service.lookup(params)).rejects.toThrow('No passages found for reference: John 99:99');
      });
    });

    describe('HelloAO translation routing', () => {
      const helloAOTranslations = ['KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY'];

      helloAOTranslations.forEach(translation => {
        it(`should route ${translation} requests to HelloAO adapter`, async () => {
          mockHelloAOAdapter.isSupported.mockImplementation((trans: string) => trans === translation);
          mockHelloAOAdapter.getPassage.mockResolvedValue({
            reference: 'John 3:16',
            translation: translation,
            text: 'For God so loved the world...',
            citation: {
              source: `${translation} Bible`,
              copyright: 'Public Domain',
              url: 'https://bible.helloao.org'
            }
          });

          const params: BibleLookupParams = {
            reference: 'John 3:16',
            translation: translation
          };

          const result = await service.lookup(params);

          expect(mockHelloAOAdapter.isSupported).toHaveBeenCalledWith(translation);
          expect(mockHelloAOAdapter.getPassage).toHaveBeenCalledWith('John 3:16', translation, false);
          expect(result.translation).toBe(translation);
        });
      });

      it('should handle lowercase HelloAO translations', async () => {
        mockHelloAOAdapter.isSupported.mockImplementation((trans: string) => trans === 'KJV');
        mockHelloAOAdapter.getPassage.mockResolvedValue({
          reference: 'John 3:16',
          translation: 'KJV',
          text: 'For God so loved the world...',
          citation: {
            source: 'KJV Bible',
            copyright: 'Public Domain'
          }
        });

        const params: BibleLookupParams = {
          reference: 'John 3:16',
          translation: 'kjv'
        };

        const result = await service.lookup(params);

        expect(mockHelloAOAdapter.isSupported).toHaveBeenCalledWith('KJV');
        expect(result.translation).toBe('KJV');
      });

      it('should pass includeFootnotes parameter to HelloAO adapter', async () => {
        mockHelloAOAdapter.isSupported.mockReturnValue(true);
        mockHelloAOAdapter.getPassage.mockResolvedValue({
          reference: 'John 3:16',
          translation: 'KJV',
          text: 'For God so loved the world...',
          footnotes: [{ id: 1, caller: 'a', text: 'Or only begotten', reference: { chapter: 3, verse: 16 } }],
          citation: { source: 'KJV Bible' }
        });

        const params: BibleLookupParams = {
          reference: 'John 3:16',
          translation: 'KJV',
          includeFootnotes: true
        };

        await service.lookup(params);

        expect(mockHelloAOAdapter.getPassage).toHaveBeenCalledWith('John 3:16', 'KJV', true);
      });

      it('should default includeFootnotes to false when not specified', async () => {
        mockHelloAOAdapter.isSupported.mockReturnValue(true);
        mockHelloAOAdapter.getPassage.mockResolvedValue({
          reference: 'John 3:16',
          translation: 'KJV',
          text: 'For God so loved the world...',
          citation: { source: 'KJV Bible' }
        });

        const params: BibleLookupParams = {
          reference: 'John 3:16',
          translation: 'KJV'
        };

        await service.lookup(params);

        expect(mockHelloAOAdapter.getPassage).toHaveBeenCalledWith('John 3:16', 'KJV', false);
      });
    });
  });

  describe('Array vs string translation parameter handling', () => {
    it('should handle single string translation', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.translation).toBe('ESV');
    });

    it('should extract first element from translation array', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: ['ESV', 'NET', 'KJV']
      };

      const result = await service.lookup(params);

      expect(result.translation).toBe('ESV');
    });

    it('should handle translation array for HelloAO', async () => {
      mockHelloAOAdapter.isSupported.mockImplementation((trans: string) => trans === 'KJV');
      mockHelloAOAdapter.getPassage.mockResolvedValue({
        reference: 'John 3:16',
        translation: 'KJV',
        text: 'For God so loved the world...',
        citation: { source: 'KJV Bible' }
      });

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: ['KJV', 'NET']
      };

      const result = await service.lookup(params);

      expect(mockHelloAOAdapter.getPassage).toHaveBeenCalledWith('John 3:16', 'KJV', false);
      expect(result.translation).toBe('KJV');
    });

    it('should default to ESV when translation array is empty', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: []
      };

      const result = await service.lookup(params);

      expect(result.translation).toBe('ESV');
    });

    it('should maintain translation string in result when using array param', async () => {
      mockNetAdapter.getPassage.mockResolvedValue({
        reference: 'John 3:16',
        text: 'For this is the way God loved the world...',
        notes: [],
        html: ''
      });
      mockNetAdapter.getCopyrightNotice.mockReturnValue('NET Bible');
      mockHelloAOAdapter.isSupported.mockReturnValue(false);

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: ['NET']
      };

      const result = await service.lookup(params);

      expect(result.translation).toBe('NET');
    });
  });

  describe('Mock data lookups', () => {
    beforeEach(() => {
      mockEsvAdapter.isConfigured.mockReturnValue(false);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
    });

    it('should lookup available verse from mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16'
      };

      const result = await service.lookup(params);

      expect(result.text).toBe('For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.');
      expect(result.reference).toBe('John 3:16');
      expect(result.translation).toBe('ESV');
    });

    it('should lookup Genesis 1:1 from mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'Genesis 1:1'
      };

      const result = await service.lookup(params);

      expect(result.text).toBe('In the beginning, God created the heavens and the earth.');
    });

    it('should lookup Romans 8:28 from mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'Romans 8:28'
      };

      const result = await service.lookup(params);

      expect(result.text).toBe('And we know that for those who love God all things work together for good, for those who are called according to his purpose.');
    });

    it('should handle case-insensitive mock data lookups', async () => {
      const params: BibleLookupParams = {
        reference: 'JOHN 3:16'
      };

      const result = await service.lookup(params);

      expect(result.text).toBe('For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.');
    });

    it('should throw error for unavailable mock data reference', async () => {
      const params: BibleLookupParams = {
        reference: 'Revelation 22:21'
      };

      await expect(service.lookup(params)).rejects.toThrow(/Reference "Revelation 22:21" not available in mock data/);
    });

    it('should list available verses when reference not found in mock data', async () => {
      const params: BibleLookupParams = {
        reference: 'Invalid Reference'
      };

      try {
        await service.lookup(params);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Available verses:');
        expect(error.message).toContain('John 3:16');
        expect(error.message).toContain('Genesis 1:1');
      }
    });

    it('should use translation from params over mock data translation', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'NET'
      };

      const result = await service.lookup(params);

      expect(result.translation).toBe('NET');
    });

    it('should use mock data translation when no translation specified', async () => {
      const params: BibleLookupParams = {
        reference: 'John 3:16'
      };

      const result = await service.lookup(params);

      expect(result.translation).toBe('ESV');
    });
  });

  describe('Cross-reference inclusion', () => {
    it('should include cross-references when requested for mock data', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(false);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        includeCrossRefs: true
      };

      const result = await service.lookup(params);

      expect(result.crossReferences).toBeDefined();
      expect(result.crossReferences).toHaveLength(2);
      expect(result.crossReferences?.[0].reference).toBe('Romans 5:8');
      expect(result.crossReferences?.[1].reference).toBe('1 John 4:9');
    });

    it('should not include cross-references when not requested', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(false);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        includeCrossRefs: false
      };

      const result = await service.lookup(params);

      expect(result.crossReferences).toBeUndefined();
    });

    it('should include empty cross-references array for ESV when requested', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV',
        includeCrossRefs: true
      };

      const result = await service.lookup(params);

      expect(result.crossReferences).toBeDefined();
      expect(result.crossReferences).toEqual([]);
    });

    it('should include empty cross-references array for NET when requested', async () => {
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockNetAdapter.getPassage.mockResolvedValue({
        reference: 'John 3:16',
        text: 'For this is the way God loved the world...',
        notes: [],
        html: ''
      });
      mockNetAdapter.getCopyrightNotice.mockReturnValue('NET Bible');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'NET',
        includeCrossRefs: true
      };

      const result = await service.lookup(params);

      expect(result.crossReferences).toBeDefined();
      expect(result.crossReferences).toEqual([]);
    });
  });

  describe('Citation formatting', () => {
    it('should format ESV citation correctly', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV® Bible (English Standard Version®), copyright © 2001 by Crossway');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.citation.source).toBe('ESV® Bible');
      expect(result.citation.copyright).toBe('ESV® Bible (English Standard Version®), copyright © 2001 by Crossway');
      expect(result.citation.url).toBe('https://www.esv.org');
    });

    it('should format NET citation correctly', async () => {
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockNetAdapter.getPassage.mockResolvedValue({
        reference: 'John 3:16',
        text: 'For this is the way God loved the world...',
        notes: [],
        html: ''
      });
      mockNetAdapter.getCopyrightNotice.mockReturnValue('NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'NET'
      };

      const result = await service.lookup(params);

      expect(result.citation.source).toBe('NET Bible®');
      expect(result.citation.copyright).toBe('NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.');
      expect(result.citation.url).toBe('https://netbible.org');
    });

    it('should format mock data citation correctly', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(false);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);

      const params: BibleLookupParams = {
        reference: 'John 3:16'
      };

      const result = await service.lookup(params);

      expect(result.citation.source).toBe('ESV Bible (Mock Data)');
      expect(result.citation.copyright).toBe('The Holy Bible, English Standard Version. Copyright © 2001 by Crossway Bibles');
      expect(result.citation.url).toBe('https://www.esv.org');
    });

    it('should include HelloAO adapter citation', async () => {
      mockHelloAOAdapter.isSupported.mockReturnValue(true);
      mockHelloAOAdapter.getPassage.mockResolvedValue({
        reference: 'John 3:16',
        translation: 'KJV',
        text: 'For God so loved the world...',
        citation: {
          source: 'King James Version',
          copyright: 'Public Domain',
          url: 'https://www.kingjamesbibleonline.org/'
        }
      });

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'KJV'
      };

      const result = await service.lookup(params);

      expect(result.citation.source).toBe('King James Version');
      expect(result.citation.copyright).toBe('Public Domain');
      expect(result.citation.url).toBe('https://www.kingjamesbibleonline.org/');
    });
  });

  describe('Error handling', () => {
    it('should throw error when ESV adapter returns empty passages', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'Invalid 1:1',
        passages: []
      });

      const params: BibleLookupParams = {
        reference: 'Invalid 1:1',
        translation: 'ESV'
      };

      await expect(service.lookup(params)).rejects.toThrow('No passages found for reference: Invalid 1:1');
    });

    it('should throw error when ESV adapter returns null passages', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'Invalid 1:1',
        passages: null
      });

      const params: BibleLookupParams = {
        reference: 'Invalid 1:1',
        translation: 'ESV'
      };

      await expect(service.lookup(params)).rejects.toThrow('No passages found for reference: Invalid 1:1');
    });

    it('should propagate NET adapter errors', async () => {
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockNetAdapter.getPassage.mockRejectedValue(new APIError(404, 'Passage not found'));

      const params: BibleLookupParams = {
        reference: 'Invalid 1:1',
        translation: 'NET'
      };

      await expect(service.lookup(params)).rejects.toThrow('Passage not found');
    });

    it('should propagate HelloAO adapter errors', async () => {
      mockHelloAOAdapter.isSupported.mockReturnValue(true);
      mockHelloAOAdapter.getPassage.mockRejectedValue(new Error('Translation not found'));

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'KJV'
      };

      await expect(service.lookup(params)).rejects.toThrow('Translation not found');
    });

    it('should handle ESV API 401 error with fallback', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockRejectedValue(new APIError(401, 'Invalid API key'));

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await service.lookup(params);

      expect(result.citation.source).toBe('ESV Bible (Mock Data)');
      consoleWarnSpy.mockRestore();
    });

    it('should handle ESV API 503 error with fallback', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockRejectedValue(new APIError(503, 'Service unavailable'));

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await service.lookup(params);

      expect(result.citation.source).toBe('ESV Bible (Mock Data)');
      consoleWarnSpy.mockRestore();
    });

    it('should handle generic ESV API errors with fallback', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockRejectedValue(new Error('Network error'));

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await service.lookup(params);

      expect(result.citation.source).toBe('ESV Bible (Mock Data)');
      consoleWarnSpy.mockRestore();
    });
  });

  describe('ESV API text cleanup', () => {
    it('should remove footnote markers from ESV text', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved[a] the world[b], that he gave his only Son...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.text).not.toContain('[a]');
      expect(result.text).not.toContain('[b]');
      expect(result.text).toContain('For God so loved the world');
    });

    it('should remove reference prefix from ESV text', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['John 3:16 For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.text).not.toMatch(/^John 3:16/);
      expect(result.text).toMatch(/^For God so loved/);
    });

    it('should remove translation suffix from ESV text', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world... (ESV)']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.text).not.toContain('(ESV)');
      expect(result.text).toMatch(/world\.{3}$/);
    });

    it('should remove leading/trailing quotation marks from ESV text', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['"For God so loved the world..."']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.text).not.toMatch(/^"/);
      expect(result.text).not.toMatch(/"$/);
    });

    it('should normalize whitespace in ESV text', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  For God   so    loved  the   world...  ']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.text).not.toMatch(/  /); // No double spaces
      expect(result.text).toMatch(/^For God so loved the world/);
    });

    it('should trim ESV text', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['   For God so loved the world...   ']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.text).toBe('For God so loved the world...');
    });

    it('should handle complex ESV text cleanup', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  John 3:16  [16] "For God[a] so   loved  the  world[b], that he gave..." (ESV)  ']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.text).not.toContain('[16]');
      expect(result.text).not.toContain('[a]');
      expect(result.text).not.toContain('[b]');
      expect(result.text).not.toContain('(ESV)');
      expect(result.text).not.toContain('John 3:16');
      expect(result.text).not.toMatch(/  /);
      expect(result.text).toMatch(/^For God so loved the world/);
    });

    it('should use canonical reference from ESV response', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'jn 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.reference).toBe('John 3:16');
    });

    it('should fallback to original reference if canonical not provided', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: null,
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'jn 3:16',
        translation: 'ESV'
      };

      const result = await service.lookup(params);

      expect(result.reference).toBe('jn 3:16');
    });
  });

  describe('Adapter method calls with correct parameters', () => {
    it('should call ESV adapter with correct options', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      await service.lookup(params);

      expect(mockEsvAdapter.getPassage).toHaveBeenCalledWith('John 3:16', {
        includeVerseNumbers: true,
        includeShortCopyright: true
      });
    });

    it('should call NET adapter with reference only', async () => {
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockNetAdapter.getPassage.mockResolvedValue({
        reference: 'Romans 8:28',
        text: 'And we know...',
        notes: [],
        html: ''
      });
      mockNetAdapter.getCopyrightNotice.mockReturnValue('NET Bible');

      const params: BibleLookupParams = {
        reference: 'Romans 8:28',
        translation: 'NET'
      };

      await service.lookup(params);

      expect(mockNetAdapter.getPassage).toHaveBeenCalledWith('Romans 8:28');
    });

    it('should call HelloAO adapter with correct parameters', async () => {
      mockHelloAOAdapter.isSupported.mockReturnValue(true);
      mockHelloAOAdapter.getPassage.mockResolvedValue({
        reference: 'Psalm 23:1',
        translation: 'KJV',
        text: 'The LORD is my shepherd...',
        citation: { source: 'KJV' }
      });

      const params: BibleLookupParams = {
        reference: 'Psalm 23:1',
        translation: 'KJV',
        includeFootnotes: true
      };

      await service.lookup(params);

      expect(mockHelloAOAdapter.getPassage).toHaveBeenCalledWith('Psalm 23:1', 'KJV', true);
    });

    it('should call adapters only once per lookup', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      await service.lookup(params);

      expect(mockEsvAdapter.getPassage).toHaveBeenCalledTimes(1);
      expect(mockNetAdapter.getPassage).not.toHaveBeenCalled();
      expect(mockHelloAOAdapter.getPassage).not.toHaveBeenCalled();
    });

    it('should check HelloAO support before ESV routing', async () => {
      mockHelloAOAdapter.isSupported.mockReturnValue(true);
      mockHelloAOAdapter.getPassage.mockResolvedValue({
        reference: 'John 3:16',
        translation: 'KJV',
        text: 'For God so loved the world...',
        citation: { source: 'KJV' }
      });

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'KJV'
      };

      await service.lookup(params);

      expect(mockHelloAOAdapter.isSupported).toHaveBeenCalledWith('KJV');
      expect(mockEsvAdapter.isConfigured).not.toHaveBeenCalled();
    });

    it('should call getCopyrightNotice for ESV adapter', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(true);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockEsvAdapter.getPassage.mockResolvedValue({
        canonical: 'John 3:16',
        passages: ['  [16] For God so loved the world...']
      });
      mockEsvAdapter.getCopyrightNotice.mockReturnValue('ESV® Bible (English Standard Version®), copyright © 2001 by Crossway');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'ESV'
      };

      await service.lookup(params);

      expect(mockEsvAdapter.getCopyrightNotice).toHaveBeenCalled();
    });

    it('should call getCopyrightNotice for NET adapter', async () => {
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockNetAdapter.getPassage.mockResolvedValue({
        reference: 'John 3:16',
        text: 'For this is the way God loved the world...',
        notes: [],
        html: ''
      });
      mockNetAdapter.getCopyrightNotice.mockReturnValue('NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.');

      const params: BibleLookupParams = {
        reference: 'John 3:16',
        translation: 'NET'
      };

      await service.lookup(params);

      expect(mockNetAdapter.getCopyrightNotice).toHaveBeenCalled();
    });
  });

  describe('Edge cases and integration scenarios', () => {
    it('should handle verse ranges in mock data', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(false);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);

      const params: BibleLookupParams = {
        reference: 'Genesis 1:1-3'
      };

      const result = await service.lookup(params);

      expect(result.text).toContain('In the beginning');
      expect(result.text).toContain('Let there be light');
    });

    it('should handle long passages in mock data', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(false);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);

      const params: BibleLookupParams = {
        reference: 'Philippians 2:6-11'
      };

      const result = await service.lookup(params);

      expect(result.text.length).toBeGreaterThan(100);
      expect(result.text).toContain('form of God');
      expect(result.text).toContain('Jesus Christ is Lord');
    });

    it('should preserve reference format from params when using mock data', async () => {
      mockEsvAdapter.isConfigured.mockReturnValue(false);
      mockHelloAOAdapter.isSupported.mockReturnValue(false);

      const params: BibleLookupParams = {
        reference: 'JOHN 3:16'
      };

      const result = await service.lookup(params);

      expect(result.reference).toBe('JOHN 3:16');
    });

    it('should handle translation priority: HelloAO > ESV > NET > Mock', async () => {
      // When HelloAO supports it, use HelloAO
      mockHelloAOAdapter.isSupported.mockReturnValue(true);
      mockHelloAOAdapter.getPassage.mockResolvedValue({
        reference: 'John 3:16',
        translation: 'KJV',
        text: 'For God so loved...',
        citation: { source: 'KJV' }
      });

      await service.lookup({ reference: 'John 3:16', translation: 'KJV' });

      expect(mockHelloAOAdapter.getPassage).toHaveBeenCalled();
      expect(mockEsvAdapter.isConfigured).not.toHaveBeenCalled();
    });

    it('should respect translation routing order', async () => {
      // Reset for NET
      mockHelloAOAdapter.isSupported.mockReturnValue(false);
      mockNetAdapter.getPassage.mockResolvedValue({
        reference: 'John 3:16',
        text: 'For this is the way...',
        notes: [],
        html: ''
      });
      mockNetAdapter.getCopyrightNotice.mockReturnValue('NET');

      await service.lookup({ reference: 'John 3:16', translation: 'NET' });

      expect(mockNetAdapter.getPassage).toHaveBeenCalled();
      expect(mockEsvAdapter.isConfigured).not.toHaveBeenCalled();
    });
  });
});
