import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BibleService } from '../../../../src/services/bible/BibleService.js';
import type { BibleProviderPort } from '../../../../src/services/bible/BibleProviderPort.js';
import type { BibleResult } from '../../../../src/kernel/types.js';
import { APIError, ValidationError, NotFoundError } from '../../../../src/kernel/errors.js';

// ── Mock adapter factory ──

function makeAdapter(overrides: Partial<BibleProviderPort> = {}): BibleProviderPort {
  return {
    supportedTranslations: ['ESV'],
    getPassage: vi.fn().mockResolvedValue({
      reference: 'John 3:16',
      translation: 'ESV',
      text: 'For God so loved the world...',
      citation: { source: 'ESV API' },
    } satisfies BibleResult),
    isConfigured: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

describe('BibleService', () => {
  describe('constructor', () => {
    it('registers adapter translations uppercased', () => {
      const adapter = makeAdapter({ supportedTranslations: ['esv'] });
      const service = new BibleService([adapter]);
      expect(service.getSupportedTranslations()).toContain('ESV');
    });

    it('maps multiple translations to the same adapter', () => {
      const adapter = makeAdapter({ supportedTranslations: ['KJV', 'WEB', 'BSB'] });
      const service = new BibleService([adapter]);
      expect(service.getSupportedTranslations()).toEqual(expect.arrayContaining(['KJV', 'WEB', 'BSB']));
    });

    it('registers translations from multiple adapters', () => {
      const esv = makeAdapter({ supportedTranslations: ['ESV'] });
      const helloao = makeAdapter({ supportedTranslations: ['KJV', 'WEB'] });
      const service = new BibleService([esv, helloao]);
      expect(service.getSupportedTranslations()).toHaveLength(3);
    });
  });

  describe('lookup', () => {
    let esvAdapter: BibleProviderPort;
    let kjvAdapter: BibleProviderPort;
    let service: BibleService;

    beforeEach(() => {
      esvAdapter = makeAdapter({ supportedTranslations: ['ESV'] });
      kjvAdapter = makeAdapter({
        supportedTranslations: ['KJV'],
        getPassage: vi.fn().mockResolvedValue({
          reference: 'John 3:16',
          translation: 'KJV',
          text: 'For God so loved the world...',
          citation: { source: 'HelloAO' },
        }),
      });
      service = new BibleService([esvAdapter, kjvAdapter]);
    });

    it('routes to correct adapter by translation', async () => {
      await service.lookup({ reference: 'John 3:16', translation: 'KJV' });
      expect(kjvAdapter.getPassage).toHaveBeenCalled();
      expect(esvAdapter.getPassage).not.toHaveBeenCalled();
    });

    it('defaults to ESV when no translation specified', async () => {
      await service.lookup({ reference: 'John 3:16' });
      expect(esvAdapter.getPassage).toHaveBeenCalled();
    });

    it('uppercases translation input', async () => {
      await service.lookup({ reference: 'John 3:16', translation: 'esv' });
      expect(esvAdapter.getPassage).toHaveBeenCalled();
    });

    it('handles array input for translation (takes first element)', async () => {
      await service.lookup({ reference: 'John 3:16', translation: ['KJV', 'ESV'] });
      expect(kjvAdapter.getPassage).toHaveBeenCalled();
    });

    it('throws ValidationError for unsupported translation', async () => {
      await expect(
        service.lookup({ reference: 'John 3:16', translation: 'NIV' })
      ).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError when adapter is not configured', async () => {
      (esvAdapter.isConfigured as ReturnType<typeof vi.fn>).mockReturnValue(false);
      await expect(
        service.lookup({ reference: 'John 3:16', translation: 'ESV' })
      ).rejects.toThrow(NotFoundError);
    });

    it('passes includeFootnotes to adapter', async () => {
      await service.lookup({ reference: 'John 3:16', includeFootnotes: true });
      expect(esvAdapter.getPassage).toHaveBeenCalledWith(
        expect.anything(),
        'ESV',
        { includeFootnotes: true, signal: undefined }
      );
    });
  });

  describe('lookupMultiple', () => {
    let esvAdapter: BibleProviderPort;
    let kjvAdapter: BibleProviderPort;
    let service: BibleService;

    beforeEach(() => {
      esvAdapter = makeAdapter({
        supportedTranslations: ['ESV'],
        getPassage: vi.fn().mockResolvedValue({
          reference: 'John 3:16', translation: 'ESV', text: 'ESV text',
          citation: { source: 'ESV API' },
        }),
      });
      kjvAdapter = makeAdapter({
        supportedTranslations: ['KJV'],
        getPassage: vi.fn().mockResolvedValue({
          reference: 'John 3:16', translation: 'KJV', text: 'KJV text',
          citation: { source: 'HelloAO' },
        }),
      });
      service = new BibleService([esvAdapter, kjvAdapter]);
    });

    it('calls each adapter with correct translation', async () => {
      const response = await service.lookupMultiple('John 3:16', ['ESV', 'KJV']);
      expect(response.results).toHaveLength(2);
      expect(response.failures).toEqual([]);
      expect(response.reference).toBe('John 3:16');
      expect(esvAdapter.getPassage).toHaveBeenCalled();
      expect(kjvAdapter.getPassage).toHaveBeenCalled();
    });

    it('forwards footnotes and one cancellation signal to every translation provider', async () => {
      const controller = new AbortController();

      await service.lookupMultiple(
        'John 3:16',
        ['ESV', 'KJV'],
        { includeFootnotes: true },
        { signal: controller.signal },
      );

      expect(esvAdapter.getPassage).toHaveBeenCalledWith(
        expect.anything(),
        'ESV',
        { includeFootnotes: true, signal: controller.signal },
      );
      expect(kjvAdapter.getPassage).toHaveBeenCalledWith(
        expect.anything(),
        'KJV',
        { includeFootnotes: true, signal: controller.signal },
      );
    });

    it('reports unconfigured adapters without discarding successful translations', async () => {
      (kjvAdapter.isConfigured as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const response = await service.lookupMultiple('John 3:16', ['ESV', 'KJV']);
      expect(response.results).toHaveLength(1);
      expect(response.results[0].translation).toBe('ESV');
      expect(response.failures).toEqual([{
        translation: 'KJV',
        reason: 'Translation provider is not configured.',
      }]);
    });

    it('reports failed translations explicitly', async () => {
      (esvAdapter.getPassage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));
      const response = await service.lookupMultiple('John 3:16', ['ESV', 'KJV']);
      expect(response.results).toHaveLength(1);
      expect(response.results[0].translation).toBe('KJV');
      expect(response.failures).toEqual([{
        translation: 'ESV',
        reason: 'Translation could not be retrieved.',
      }]);
    });

    it('returns results in order', async () => {
      const response = await service.lookupMultiple('John 3:16', ['ESV', 'KJV']);
      expect(response.results[0].translation).toBe('ESV');
      expect(response.results[1].translation).toBe('KJV');
    });

    it('bounds concurrency while preserving requested order across partial failures', async () => {
      let active = 0;
      let maximumActive = 0;
      const translations = ['ESV', 'KJV', 'WEB', 'BSB', 'ASV'];
      const adapter = makeAdapter({
        supportedTranslations: translations,
        getPassage: vi.fn().mockImplementation(async (_ref, translation) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise(resolve => setTimeout(resolve, translation === 'ESV' ? 10 : 1));
          active -= 1;
          if (translation === 'KJV') throw new Error('unavailable');
          return {
            reference: 'John 3:16', translation, text: `${translation} text`,
            citation: { source: 'Fixture' },
          };
        }),
      });

      const response = await new BibleService([adapter]).lookupMultiple('John 3:16', translations);

      expect(maximumActive).toBe(4);
      expect(response.results.map(result => result.translation)).toEqual(['ESV', 'WEB', 'BSB', 'ASV']);
      expect(response.failures).toEqual([{
        translation: 'KJV',
        reason: 'Translation could not be retrieved.',
      }]);
    });

    it('stops starting provider calls after cancellation and fills stable failure outcomes', async () => {
      const controller = new AbortController();
      const translations = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
      const getPassage = vi.fn().mockImplementation(async (
        _ref: unknown,
        _translation: string,
        options?: { signal?: AbortSignal },
      ) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      }));
      const runtime = new BibleService([makeAdapter({ supportedTranslations: translations, getPassage })]);

      const pending = runtime.lookupMultiple(
        'John 3:16',
        translations,
        {},
        { signal: controller.signal },
      );
      expect(getPassage).toHaveBeenCalledTimes(4);
      controller.abort(new DOMException('cancelled', 'AbortError'));

      const response = await pending;
      expect(getPassage).toHaveBeenCalledTimes(4);
      expect(response.results).toEqual([]);
      expect(response.failures.map(failure => failure.translation)).toEqual(translations);
    });

    it('reports unknown translations instead of omitting them', async () => {
      const response = await service.lookupMultiple('John 3:16', ['NIV']);
      expect(response.results).toHaveLength(0);
      expect(response.failures).toEqual([{
        translation: 'NIV',
        reason: 'Translation is not supported by this server.',
      }]);
    });

    it('rejects impossible references before any adapter call', async () => {
      await expect(service.lookupMultiple('John 999:999', ['ESV', 'KJV']))
        .rejects.toThrow('Chapter 999 is out of range for John');
      expect(esvAdapter.getPassage).not.toHaveBeenCalled();
      expect(kjvAdapter.getPassage).not.toHaveBeenCalled();
    });

    it('rejects a provider result for a different reference', async () => {
      (esvAdapter.getPassage as ReturnType<typeof vi.fn>).mockResolvedValue({
        reference: 'John 1:1',
        translation: 'ESV',
        text: 'Different passage',
        citation: { source: 'ESV API' },
      });

      await expect(service.lookup({ reference: 'John 3:16', translation: 'ESV' }))
        .rejects.toBeInstanceOf(APIError);
    });

    it('accepts a common single-chapter input when the provider returns explicit chapter notation', async () => {
      const adapter = makeAdapter({
        supportedTranslations: ['ESV'],
        getPassage: vi.fn().mockResolvedValue({
          reference: 'Jude 1:3',
          translation: 'ESV',
          text: 'Beloved, ...',
          citation: { source: 'ESV API' },
        }),
      });
      const singleChapterService = new BibleService([adapter]);

      await expect(singleChapterService.lookup({ reference: 'Jude 3', translation: 'ESV' }))
        .resolves.toMatchObject({ reference: 'Jude 1:3', translation: 'ESV' });
    });
  });
});
