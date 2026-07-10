import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelloAoAdapter } from '../../../../src/adapters/bible/HelloAoAdapter.js';
import { AdapterError } from '../../../../src/kernel/errors.js';
import { parseReference } from '../../../../src/kernel/reference.js';

const response = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  statusText: status === 200 ? 'OK' : 'Not Found',
});

describe('HelloAoAdapter', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn<typeof fetch>();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('exposes the supported public-domain translation catalog', () => {
    const adapter = new HelloAoAdapter();

    expect(adapter.isConfigured()).toBe(true);
    expect(adapter.supportedTranslations).toEqual(['KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY']);
    expect(adapter.getCopyright('asv')).toBe('Public Domain (1901)');
    expect(adapter.getCopyright('unknown')).toBe('Public Domain');
    expect(adapter.getClient()).toBeDefined();
  });

  it('maps translation and reference paths, filters a range, and extracts mixed content and footnotes', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          { type: 'heading', content: ['ignored'] },
          { type: 'verse', number: 15, content: ['Before'] },
          { type: 'verse', number: 16, content: ['For God', { text: ' loved', wordsOfJesus: true }, { noteId: 7 }, { lineBreak: true }, 'the world.'] },
          { type: 'verse', number: 17, content: ['Not condemned.'] },
          { type: 'verse', number: 18, content: ['After'] },
        ],
        footnotes: [
          { noteId: 7, caller: 'a', text: 'Or uniquely gave', reference: { chapter: 3, verse: 16 } },
          { noteId: 8, caller: 'b', text: 'Outside range', reference: { chapter: 3, verse: 18 } },
        ],
      },
    }));
    const adapter = new HelloAoAdapter();

    const result = await adapter.getPassage(parseReference('John 3:16-17'), 'web', { includeFootnotes: true });

    expect(result).toMatchObject({
      reference: 'John 3:16-17',
      translation: 'WEB',
      text: 'For God loved\nthe world. Not condemned.',
      footnotes: [{
        id: 7,
        caller: 'a',
        text: 'Or uniquely gave',
        reference: { chapter: 3, verse: 16 },
      }],
      citation: {
        source: 'World English Bible',
        copyright: 'Public Domain',
        url: 'https://worldenglish.bible/',
      },
    });
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      'https://bible.helloao.org/api/ENGWEBP/JHN/3.json',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns every verse for a chapter request and omits footnotes by default', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          { type: 'verse', number: 1, content: ['First.'] },
          { type: 'verse', number: 2, content: ['Second.'] },
        ],
        footnotes: [{ noteId: 1, reference: { verse: 1 }, text: 'note' }],
      },
    }));

    const result = await new HelloAoAdapter().getPassage(parseReference('Genesis 1'), 'KJV');
    expect(result.text).toBe('First. Second.');
    expect(result.footnotes).toBeUndefined();
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toContain('/eng_kjv/GEN/1.json');
  });

  it('joins adjacent word fragments without concatenating words or separating punctuation', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{
          type: 'verse',
          number: 1,
          content: ['the only', { text: 'Son,' }, ' born', { text: 'Son,' }, ' For', { text: 'God' }],
        }],
      },
    }));

    const result = await new HelloAoAdapter().getPassage(parseReference('Genesis 1:1'), 'WEB');
    expect(result.text).toBe('the only Son, born Son, For God');
  });

  it('includes all chapter footnotes when requested without a verse', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{ type: 'verse', number: 1, content: ['First.'] }],
        footnotes: [{ noteId: 1, caller: '*', text: 'note', reference: { chapter: 1, verse: 1 } }],
      },
    }));

    const result = await new HelloAoAdapter().getPassage(parseReference('Genesis 1'), 'BSB', { includeFootnotes: true });
    expect(result.footnotes).toHaveLength(1);
  });

  it('rejects an unsupported translation before making a request', async () => {
    await expect(new HelloAoAdapter().getPassage(parseReference('John 3:16'), 'NIV'))
      .rejects.toEqual(new AdapterError('HelloAO', 'Unsupported translation: NIV. Available: KJV, WEB, BSB, ASV, YLT, DBY'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects a response without the requested verse', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: { content: [{ type: 'verse', number: 1, content: ['Different verse'] }] },
    }));

    await expect(new HelloAoAdapter().getPassage(parseReference('John 3:16'), 'DBY'))
      .rejects.toEqual(new AdapterError('HelloAO', 'No verses found for John 3:16'));
  });

  it('rejects response metadata for a different book', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      translation: { id: 'eng_dby' },
      book: { id: 'MRK', number: 41 },
      chapter: { number: 3, content: [{ type: 'verse', number: 16, content: ['Different passage'] }] },
    }));

    await expect(new HelloAoAdapter().getPassage(parseReference('John 3:16'), 'DBY'))
      .rejects.toEqual(new AdapterError('HelloAO', 'Provider returned a different book.'));
  });

  it('rejects a partial provider response for a requested range', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{ type: 'verse', number: 16, content: ['Only verse 16'] }],
      },
    }));

    await expect(new HelloAoAdapter().getPassage(parseReference('John 3:16-17'), 'DBY'))
      .rejects.toEqual(new AdapterError('HelloAO', 'No verses found for John 3:16-17'));
  });

  it('normalizes an upstream HTTP error as an adapter error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({ message: 'missing' }, 404));

    await expect(new HelloAoAdapter().getPassage(parseReference('John 3:16'), 'YLT'))
      .rejects.toMatchObject({ name: 'AdapterError', source: 'HelloAO', message: expect.stringContaining('HTTP 404') });
  });
});
