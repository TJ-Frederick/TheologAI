import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetBibleAdapter } from '../../../../src/adapters/bible/NetBibleAdapter.js';
import { APIError } from '../../../../src/kernel/errors.js';
import { parseReference } from '../../../../src/kernel/reference.js';

const response = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

describe('NetBibleAdapter', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn<typeof fetch>();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('maps a range request and combines sanitized verse text', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response([
      { bookname: 'John', chapter: 1, verse: 1, text: '<b>In</b> the beginning&nbsp;' },
      { bookname: 'John', chapter: 1, verse: 2, text: '<span>was the Word.</span>' },
    ]));
    const adapter = new NetBibleAdapter();

    await expect(adapter.getPassage(parseReference('John 1:1-2'), 'ignored')).resolves.toEqual({
      reference: 'John 1:1-2',
      translation: 'NET',
      text: 'In the beginning was the Word.',
      citation: {
        source: 'New English Translation',
        copyright: adapter.getCopyright(),
        url: 'https://netbible.org',
      },
    });

    expect(adapter.isConfigured()).toBe(true);
    expect(adapter.supportedTranslations).toEqual(['NET']);
    const url = String(vi.mocked(globalThis.fetch).mock.calls[0][0]);
    expect(url).toBe('https://labs.bible.org/api/?passage=John+1%3A1-2&formatting=full&type=json');
  });

  it.each([
    ['a non-array response', { text: 'wrong shape' }],
    ['an empty array', []],
  ])('rejects %s as not found', async (_label, payload) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response(payload));

    await expect(new NetBibleAdapter().getPassage(parseReference('Romans 8:1'), 'NET'))
      .rejects.toEqual(new APIError(404, 'No passage found for: Romans 8:1'));
  });

  it('rejects verse metadata for a different reference', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response([
      { bookname: 'John', chapter: 1, verse: 1, text: 'Different passage' },
    ]));

    await expect(new NetBibleAdapter().getPassage(parseReference('John 1:2'), 'NET'))
      .rejects.toEqual(new APIError(502, 'Bible provider returned a passage for a different reference.'));
  });

  it('surfaces malformed upstream JSON', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('not-json', { status: 200 }));

    await expect(new NetBibleAdapter().getPassage(parseReference('John 1:1'), 'NET'))
      .rejects.toBeInstanceOf(SyntaxError);
  });

  it.each(['wrong reference', 'incomplete range', 'empty text'])('refetches NET after %s', async failure => {
    const verse = { bookname: 'John', chapter: 1, verse: 1, text: 'First.' };
    const good = [verse, { ...verse, verse: 2, text: 'Second.' }];
    const invalid = failure === 'wrong reference' ? [{ ...verse, chapter: 2 }]
      : failure === 'incomplete range' ? [verse] : good.map(item => ({ ...item, text: '<b></b>' }));
    const reason = failure === 'wrong reference' ? 'a passage for a different reference'
      : failure === 'incomplete range' ? 'an incomplete passage' : 'an empty passage';
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(response(invalid)).mockResolvedValueOnce(response(good));
    const adapter = new NetBibleAdapter();
    const read = () => adapter.getPassage(parseReference('John 1:1-2'), 'NET');
    await expect(read()).rejects.toEqual(new APIError(502, `Bible provider returned ${reason}.`));
    await expect(read()).resolves.toMatchObject({ text: 'First. Second.' });
    await expect(read()).resolves.toMatchObject({ text: 'First. Second.' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
