import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BibleService } from '../../../../src/services/bible/BibleService.js';
import type { BibleAdapter } from '../../../../src/adapters/bible/BibleAdapter.js';
import type { BibleResult } from '../../../../src/kernel/types.js';
import { ValidationError, NotFoundError } from '../../../../src/kernel/errors.js';

// ── Mock adapter factory ──

function makeAdapter(overrides: Partial<BibleAdapter> = {}): BibleAdapter {
  return {
    supportedTranslations: ['ESV'],
    getPassage: vi.fn().mockResolvedValue({
      reference: 'John 3:16',
      translation: 'ESV',
      text: 'For God so loved the world...',
      citation: { source: 'ESV API' },
    } satisfies BibleResult),
    isConfigured: vi.fn().mockReturnValue(true),
    getCopyright: vi.fn().mockReturnValue('Test'),
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
    let esvAdapter: BibleAdapter;
    let kjvAdapter: BibleAdapter;
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
        { includeFootnotes: true }
      );
    });
  });

  describe('lookupMultiple', () => {
    let esvAdapter: BibleAdapter;
    let kjvAdapter: BibleAdapter;
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
      const results = await service.lookupMultiple('John 3:16', ['ESV', 'KJV']);
      expect(results).toHaveLength(2);
      expect(esvAdapter.getPassage).toHaveBeenCalled();
      expect(kjvAdapter.getPassage).toHaveBeenCalled();
    });

    it('skips unconfigured adapters without throwing', async () => {
      (kjvAdapter.isConfigured as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const results = await service.lookupMultiple('John 3:16', ['ESV', 'KJV']);
      expect(results).toHaveLength(1);
      expect(results[0].translation).toBe('ESV');
    });

    it('skips failed translations silently', async () => {
      (esvAdapter.getPassage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));
      const results = await service.lookupMultiple('John 3:16', ['ESV', 'KJV']);
      expect(results).toHaveLength(1);
      expect(results[0].translation).toBe('KJV');
    });

    it('returns results in order', async () => {
      const results = await service.lookupMultiple('John 3:16', ['ESV', 'KJV']);
      expect(results[0].translation).toBe('ESV');
      expect(results[1].translation).toBe('KJV');
    });

    it('skips unknown translations', async () => {
      const results = await service.lookupMultiple('John 3:16', ['NIV']);
      expect(results).toHaveLength(0);
    });
  });
});
