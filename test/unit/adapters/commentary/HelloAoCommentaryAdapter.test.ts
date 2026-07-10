import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelloAoCommentaryAdapter } from '../../../../src/adapters/commentary/HelloAoCommentaryAdapter.js';
import { AdapterError } from '../../../../src/kernel/errors.js';
import { parseReference } from '../../../../src/kernel/reference.js';

const response = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

describe('HelloAoCommentaryAdapter', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn<typeof fetch>();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('maps aliases and extracts exact verse headings, text, and strings', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{
          verseNumber: 16,
          content: [
            { type: 'heading', content: ['God\'s', 'love'] },
            { type: 'text', content: ['The', 'gospel.'] },
            'A final observation.',
            { type: 'unknown', content: ['ignored'] },
          ],
        }],
      },
    }));
    const adapter = new HelloAoCommentaryAdapter();

    await expect(adapter.getCommentary(parseReference('John 3:16'), '  JFB  ')).resolves.toEqual({
      reference: 'John 3:16',
      commentator: 'Jamieson-Fausset-Brown',
      text: "**God's love**\n\nThe gospel.\n\nA final observation.",
      citation: {
        source: 'Jamieson-Fausset-Brown Commentary',
        copyright: 'Public Domain',
        url: 'https://bible.helloao.org',
      },
    });
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0]))
      .toBe('https://bible.helloao.org/api/c/jamieson-fausset-brown/JHN/3.json');
    expect(adapter.supportedCommentators).toContain('Tyndale');
  });

  it('extracts an exact verse using number metadata', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          { number: 10, content: ['Earlier'] },
          { number: 16, content: ['Exact'] },
          { number: 20, content: ['Later'] },
        ],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'Clarke');
    expect(result.text).toBe('Exact');
    expect(result.commentator).toBe('Adam Clarke');
  });

  it('rejects preceding and later entries when the exact verse is missing', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          { number: 15, content: ['Preceding verse'] },
          { number: 17, content: ['Later verse'] },
        ],
      },
    }));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'Clarke'))
      .rejects.toEqual(new AdapterError('HelloAO', 'No commentary found for John 3:16 in Adam Clarke'));
  });

  it('never returns John 3:17 content for a John Gill 3:16 request', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{ number: 17, content: ['For God sent not his Son into the world'] }],
      },
    }));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'John Gill'))
      .rejects.toEqual(new AdapterError('HelloAO', 'No commentary found for John 3:16 in John Gill'));
  });

  it('attributes Tyndale Open Study Notes under CC BY-SA 4.0', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: { content: [{ verseNumber: 16, content: ['Study note'] }] },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(
      parseReference('John 3:16'),
      'Tyndale',
    );

    expect(result.citation).toMatchObject({
      source: 'Tyndale Open Study Notes Commentary',
      copyright: expect.stringContaining('CC BY-SA 4.0'),
    });
    expect(result.citation.copyright).toContain('Tyndale House, Cambridge');
    expect(result.citation.copyright).toContain('creativecommons.org/licenses/by-sa/4.0');
  });

  it('combines every non-empty entry for a chapter request', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          { content: [{ type: 'text', content: ['First section'] }] },
          { content: [] },
          { content: ['Second section'] },
        ],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parseReference('Genesis 1'), 'Gill');
    expect(result.text).toBe('First section\n\nSecond section');
  });

  it('rejects unknown commentators without a request', async () => {
    const adapter = new HelloAoCommentaryAdapter();

    await expect(adapter.getCommentary(parseReference('John 3:16'), 'Unknown'))
      .rejects.toEqual(new AdapterError(
        'HelloAO',
        'Unknown commentator: "Unknown". Available: Matthew Henry, Jamieson-Fausset-Brown, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale',
      ));
    expect(adapter.supportsBook('Unknown', 'John')).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects Keil-Delitzsch for New Testament books', async () => {
    const adapter = new HelloAoCommentaryAdapter();

    await expect(adapter.getCommentary(parseReference('John 3:16'), 'keil-delitzsch'))
      .rejects.toEqual(new AdapterError('HelloAO', 'Keil-Delitzsch is only available for Old Testament books.'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('supports known commentator aliases', () => {
    const adapter = new HelloAoCommentaryAdapter();
    expect(adapter.supportsBook('matthew henry', 'Genesis')).toBe(true);
    expect(adapter.supportsBook('keil-delitzsch', 'Genesis')).toBe(true);
    expect(adapter.supportsBook('keil-delitzsch', 'Gen')).toBe(true);
    expect(adapter.supportsBook('keil-delitzsch', 'John')).toBe(false);
    expect(adapter.supportsBook('keil-delitzsch', 'Not a book')).toBe(false);
  });

  it.each([
    ['a malformed payload', {}],
    ['a non-array chapter content payload', { chapter: { content: { number: 16 } } }],
    ['empty chapter content', { chapter: { content: [] } }],
    ['an exact entry without array content', { chapter: { content: [{ verseNumber: 16, content: 'bad' }] } }],
    ['an entry with malformed verse metadata', { chapter: { content: [{ number: 'not-a-verse', content: ['unsafe'] }] } }],
    ['an entry with conflicting verse metadata', { chapter: { content: [{ verseNumber: 16, number: 17, content: ['unsafe'] }] } }],
    ['no preceding section', { chapter: { content: [{ verseNumber: 17, content: ['later'] }] } }],
  ])('reports no commentary for %s', async (_label, payload) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response(payload));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'tyndale'))
      .rejects.toEqual(new AdapterError('HelloAO', 'No commentary found for John 3:16 in Tyndale Open Study Notes'));
  });

  it.each([
    ['Matthew Henry', 'Genesis 1:1', 'verseNumber', 'Genesis opening', 'Matthew Henry'],
    ['Jamieson-Fausset-Brown', 'John 3:16', 'number', 'JFB exact', 'Jamieson-Fausset-Brown'],
    ['Adam Clarke', 'Romans 8:28', 'verseNumber', 'Clarke exact', 'Adam Clarke'],
    ['John Gill', 'Exodus 3:14', 'number', 'Gill exact', 'John Gill'],
    ['Keil-Delitzsch', 'Genesis 1:1', 'number', 'Keil exact', 'Keil-Delitzsch'],
    ['Tyndale', 'John 3:16', 'verseNumber', 'Tyndale exact', 'Tyndale Open Study Notes'],
  ] as const)('preserves exact reference identity for %s (%s)', async (commentator, reference, metadata, text, displayName) => {
    const parsed = parseReference(reference);
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{ [metadata]: parsed.startVerse, content: [text] }],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parsed, commentator);

    expect(result.reference).toBe(reference);
    expect(result.text).toBe(text);
    expect(result.commentator).toBe(displayName);
  });

  it('surfaces malformed upstream JSON', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('not-json', { status: 200 }));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'John Gill'))
      .rejects.toBeInstanceOf(SyntaxError);
  });
});
