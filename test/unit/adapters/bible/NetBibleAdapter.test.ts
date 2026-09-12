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
      { bookname: 'John', chapter: 1, verse: 1, text: '<b>In</b> the beginning<n id="1" />&nbsp;' },
      { bookname: 'John', chapter: 1, verse: 2, text: '<span>was the Word.</span><n id="2" />' },
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

  it('discloses that requested NET note bodies are unavailable while preserving the passage', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response([
      {
        bookname: 'John', chapter: 1, verse: 1,
        text: '<st data-num="1722">In</st> the beginning<n id="1" /> was the Word<n id="2" />.',
      },
    ]));

    const result = await new NetBibleAdapter().getPassage(
      parseReference('John 1:1'),
      'NET',
      { includeFootnotes: true },
    );

    expect(result.text).toBe('In the beginning was the Word.');
    expect(result.footnotes).toBeUndefined();
    expect(result.footnoteDelivery).toEqual({
      status: 'unavailable',
      markerCount: 2,
      reason: 'The configured NET Bible public API returns note markers but not translator or study note bodies.',
    });
  });

  it('keeps omitted and false footnote behavior compatible', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response([
      { bookname: 'John', chapter: 1, verse: 1, text: 'In the beginning<n id="1" />.' },
    ]));

    const adapter = new NetBibleAdapter();
    const omitted = await adapter.getPassage(parseReference('John 1:1'), 'NET');
    const disabled = await adapter.getPassage(parseReference('John 1:1'), 'NET', { includeFootnotes: false });

    expect(omitted).toEqual(disabled);
    expect(omitted).not.toHaveProperty('footnoteDelivery');
  });

  it('reports no notes when a notes-enabled NET response has no markers', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response([
      { bookname: 'John', chapter: 11, verse: 35, text: 'Jesus wept.' },
    ]));

    const result = await new NetBibleAdapter().getPassage(
      parseReference('John 11:35'),
      'NET',
      { includeFootnotes: true },
    );

    expect(result.footnoteDelivery).toEqual({ status: 'none', noteCount: 0, markerCount: 0 });
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
});
