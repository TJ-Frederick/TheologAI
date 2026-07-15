import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelloAoCommentaryAdapter } from '../../../../src/adapters/commentary/HelloAoCommentaryAdapter.js';
import {
  AdapterError,
  AdapterIntegrityError,
  CommentaryScalarNotFoundError,
  ValidationError,
} from '../../../../src/kernel/errors.js';
import { parseReference } from '../../../../src/kernel/reference.js';

const response = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

function inlineTextEntry(number: number, length: number): Record<string, unknown> {
  const firstLength = Math.min(length, 100_000);
  const remaining = length - firstLength;
  return {
    type: 'verse',
    number,
    content: [
      { text: 'x'.repeat(firstLength) },
      ...(remaining > 0 ? [{ text: ` ${'x'.repeat(remaining - 1)}` }] : []),
    ],
  };
}

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
          { type: 'verse', number: 10, content: ['Earlier'] },
          { type: 'verse', number: 16, content: ['Exact'] },
          { type: 'verse', number: 20, content: ['Later'] },
        ],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'Clarke');
    expect(result.text).toBe('Exact');
    expect(result.commentator).toBe('Adam Clarke');
  });

  it('does not treat an untyped number field as exact verse identity', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: { content: [{ number: 16, content: ['Ambiguous numbered section'] }] },
    }));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'Clarke'))
      .rejects.toEqual(new CommentaryScalarNotFoundError('HelloAO', 'John 3', 'No exact commentary match for John 3:16 in Adam Clarke'));
  });

  it('rejects verse ranges before making a provider request', async () => {
    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16-17'), 'John Gill'))
      .rejects.toEqual(new ValidationError(
        'reference',
        'Commentary verse ranges are not supported; request one verse or a full chapter.',
      ));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects preceding and later entries when the exact verse is missing', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          { type: 'verse', number: 15, content: ['Preceding verse'] },
          { type: 'verse', number: 17, content: ['Later verse'] },
        ],
      },
    }));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'Clarke'))
      .rejects.toEqual(new CommentaryScalarNotFoundError('HelloAO', 'John 3', 'No exact commentary match for John 3:16 in Adam Clarke'));
  });

  it.each(['John 3:1', 'John 3:22'])(
    'fails closed for Matthew Henry production-shaped multi-verse section anchor %s while its chapter remains available',
    async (reference) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          { type: 'verse', number: 1, content: ['Commentary spanning John 3:1-21'] },
          { type: 'verse', number: 22, content: ['Commentary spanning John 3:22-36'] },
        ],
      },
    }));
    const adapter = new HelloAoCommentaryAdapter();

    await expect(adapter.getCommentary(parseReference(reference), 'Matthew Henry'))
      .rejects.toEqual(new CommentaryScalarNotFoundError('HelloAO', 'John 3', `No exact commentary match for ${reference} in Matthew Henry`));

    await expect(adapter.getCommentary(parseReference('John 3'), 'Matthew Henry'))
      .resolves.toMatchObject({
        reference: 'John 3',
        commentator: 'Matthew Henry',
        text: 'Commentary spanning John 3:1-21\n\nCommentary spanning John 3:22-36',
      });
    },
  );

  it('treats Keil-Delitzsch numbered passage sections as chapter-only', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          { type: 'verse', number: 1, content: ['Commentary spanning Genesis 1:1-5'] },
          { type: 'verse', number: 6, content: ['Commentary spanning Genesis 1:6-8'] },
        ],
      },
    }));
    const adapter = new HelloAoCommentaryAdapter();

    await expect(adapter.getCommentary(parseReference('Genesis 1:1'), 'Keil-Delitzsch'))
      .rejects.toEqual(new CommentaryScalarNotFoundError('HelloAO', 'Genesis 1', 'No exact commentary match for Genesis 1:1 in Keil-Delitzsch'));
    await expect(adapter.getCommentary(parseReference('Genesis 1'), 'Keil-Delitzsch'))
      .resolves.toMatchObject({
        reference: 'Genesis 1',
        text: 'Commentary spanning Genesis 1:1-5\n\nCommentary spanning Genesis 1:6-8',
      });
  });

  it('never returns John 3:17 content for a John Gill 3:16 request', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{ type: 'verse', number: 17, content: ['For God sent not his Son into the world'] }],
      },
    }));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'John Gill'))
      .rejects.toEqual(new CommentaryScalarNotFoundError('HelloAO', 'John 3', 'No exact commentary match for John 3:16 in John Gill'));
  });

  it.each(['John 3:15', 'John 3:16'])('does not use John Gill number metadata for %s', async (reference) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          { type: 'verse', number: 15, content: ['For God so loved the world'] },
          { type: 'verse', number: 16, content: ['For God sent not his Son into the world'] },
        ],
      },
    }));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference(reference), 'John Gill'))
      .rejects.toEqual(new CommentaryScalarNotFoundError('HelloAO', 'John 3', `No exact commentary match for ${reference} in John Gill`));
  });

  it('accepts John Gill scalar commentary only with a genuine verseNumber field', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{ verseNumber: 16, content: ['Genuine verse 16 commentary'] }],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'John Gill');

    expect(result.text).toBe('Genuine verse 16 commentary');
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

  it('renders official Tyndale formatted text, headings, line breaks, and footnote references safely', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{
          type: 'verse',
          number: 16,
          content: [
            { heading: 'Love <and grace>' },
            { text: 'For' },
            { text: ' God' },
            { lineBreak: true },
            { text: 'loved <the world> & gave.' },
            { noteId: 7 },
          ],
        }],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'Tyndale');

    expect(result.text).toBe(
      '**Love &lt;and grace&gt;**\n\nFor God\nloved &lt;the world&gt; &amp; gave.',
    );
    expect(result.text).not.toMatch(/<|noteId|HelloAO|\[7\]/);
  });

  it('renders official formatted-text fragments for another exact provider', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{
          type: 'verse',
          verseNumber: 16,
          content: [{ text: 'Exact' }, { text: ',' }, { text: ' verse note.' }],
        }],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(
      parseReference('John 3:16'),
      'Jamieson-Fausset-Brown',
    );

    expect(result.text).toBe('Exact, verse note.');
  });

  it('preserves mixed official and existing content shapes in chapter mode', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          {
            type: 'verse',
            number: 1,
            content: [
              { type: 'heading', content: ['Legacy heading'] },
              { type: 'text', content: ['Legacy paragraph'] },
            ],
          },
          {
            type: 'verse',
            number: 2,
            content: [
              { heading: 'Official heading' },
              { text: 'First line' },
              { lineBreak: true },
              { lineBreak: true },
              { text: 'Second paragraph' },
              { noteId: 9 },
              'Existing string block',
            ],
          },
        ],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3'), 'John Gill');

    expect(result.text).toBe(
      '**Legacy heading**\n\nLegacy paragraph\n\n**Official heading**\n\nFirst line\n\nSecond paragraph Existing string block',
    );
    expect(result.text).not.toContain('noteId');
  });

  it.each([
    [
      'keeps strings around an omitted footnote in one sentence',
      ['Before', { noteId: 1 }, ' after.'],
      'Before after.',
    ],
    [
      'keeps strings and formatted text in one sentence',
      ['Before ', { text: 'emphasized' }, ' after.'],
      'Before emphasized after.',
    ],
    [
      'applies an inline line break between strings',
      ['First line', { lineBreak: true }, 'Second line'],
      'First line\nSecond line',
    ],
  ])('%s', async (_label, content, expected) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: { content: [{ type: 'verse', number: 16, content }] },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'Tyndale');

    expect(result.text).toBe(expected);
  });

  it('uses deterministic block boundaries around headings and legacy block content', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{
          type: 'verse',
          number: 16,
          content: [
            'Opening sentence.',
            { heading: 'Official heading' },
            'After heading',
            { type: 'text', content: ['Legacy block'] },
            'After legacy',
            { lineBreak: true },
            { lineBreak: true },
            'new paragraph.',
          ],
        }],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'Tyndale');

    expect(result.text).toBe(
      'Opening sentence.\n\n**Official heading**\n\nAfter heading\n\nLegacy block\n\nAfter legacy\n\nnew paragraph.',
    );
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
    ['a malformed payload', {}, 'Malformed commentary chapter payload'],
    ['a non-array chapter content payload', { chapter: { content: { number: 16 } } }, 'Malformed commentary chapter payload'],
    ['an exact entry without array content', { chapter: { content: [{ verseNumber: 16, content: 'bad' }] } }, 'Malformed commentary entry at index 0'],
    ['an entry with malformed verse metadata', { chapter: { content: [{ number: 'not-a-verse', content: ['unsafe'] }] } }, 'Malformed commentary identity at index 0'],
    ['an entry with conflicting verse metadata', { chapter: { content: [{ verseNumber: 16, number: 17, content: ['unsafe'] }] } }, 'Conflicting commentary identity at index 0'],
    ['duplicate exact verse entries', { chapter: { content: [{ type: 'verse', number: 16, content: ['first'] }, { type: 'verse', number: 16, content: ['second'] }] } }, 'Duplicate exact commentary identity'],
    ['an unknown content item', { chapter: { content: [{ type: 'verse', number: 16, content: [{ type: 'unknown', content: ['unsafe'] }] }] } }, 'Unknown commentary content item at index 0'],
    ['malformed text content', { chapter: { content: [{ type: 'verse', number: 16, content: [{ type: 'text', content: 'unsafe' }] }] } }, 'Malformed commentary text content at index 0'],
    ['malformed formatted text', { chapter: { content: [{ type: 'verse', number: 16, content: [{ text: 42 }] }] } }, 'Malformed formatted commentary text at index 0'],
    ['malformed inline heading', { chapter: { content: [{ type: 'verse', number: 16, content: [{ heading: ['unsafe'] }] }] } }, 'Malformed inline commentary heading at index 0'],
    ['malformed inline line break', { chapter: { content: [{ type: 'verse', number: 16, content: [{ lineBreak: false }] }] } }, 'Malformed inline commentary line break at index 0'],
    ['malformed footnote reference', { chapter: { content: [{ type: 'verse', number: 16, content: [{ noteId: '7' }] }] } }, 'Malformed commentary footnote reference at index 0'],
    ['ambiguous official variant', { chapter: { content: [{ type: 'verse', number: 16, content: [{ text: 'one', heading: 'two' }] }] } }, 'Ambiguous commentary content item at index 0'],
    ['mixed legacy and official discriminants', { chapter: { content: [{ type: 'verse', number: 16, content: [{ type: 'text', content: ['one'], text: 'two' }] }] } }, 'Ambiguous commentary content item at index 0'],
  ])('classifies %s as an integrity failure', async (_label, payload, reason) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response(payload));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'tyndale'))
      .rejects.toEqual(new AdapterIntegrityError('HelloAO', reason));
  });

  it.each([
    [
      'an oversized content fragment',
      { chapter: { content: [{ type: 'verse', number: 16, content: [{ text: 'x'.repeat(100_001) }] }] } },
      'Commentary text fragment exceeds safety limit at index 0',
    ],
    [
      'too many content items',
      { chapter: { content: [{ type: 'verse', number: 16, content: Array.from({ length: 5_001 }, () => ({ noteId: 1 })) }] } },
      'Commentary entry content exceeds safety limit at index 0',
    ],
    [
      'too many chapter entries',
      { chapter: { content: Array.from({ length: 501 }, () => ({ type: 'verse', number: 1, content: ['text'] })) } },
      'Commentary chapter entry count exceeds safety limit',
    ],
  ])('bounds %s as an integrity failure', async (_label, payload, reason) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response(payload));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'Tyndale'))
      .rejects.toEqual(new AdapterIntegrityError('HelloAO', reason));
  });

  it('accepts a chapter whose final joined output is exactly the chapter limit including separators', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          inlineTextEntry(1, 200_000),
          inlineTextEntry(2, 200_000),
          inlineTextEntry(3, 200_000),
          inlineTextEntry(4, 200_000),
          inlineTextEntry(5, 199_992),
        ],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3'), 'John Gill');

    expect(result.text).toHaveLength(1_000_000);
  });

  it('rejects a chapter one character over the final joined-output limit including separators', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [
          inlineTextEntry(1, 200_000),
          inlineTextEntry(2, 200_000),
          inlineTextEntry(3, 200_000),
          inlineTextEntry(4, 200_000),
          inlineTextEntry(5, 199_993),
        ],
      },
    }));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3'), 'John Gill'))
      .rejects.toEqual(new AdapterIntegrityError('HelloAO', 'Commentary chapter content exceeds safety limit'));
  });

  it.each([
    ['empty chapter content', { chapter: { content: [] } }],
    ['no exact entry', { chapter: { content: [{ type: 'verse', number: 17, content: ['later'] }] } }],
    ['exact entry with valid empty content', { chapter: { content: [{ type: 'verse', number: 16, content: [] }] } }],
  ])('classifies structurally valid scalar absence for %s as an actionable no-match', async (_label, payload) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(response(payload));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'tyndale'))
      .rejects.toEqual(new CommentaryScalarNotFoundError('HelloAO', 'John 3', 'No exact commentary match for John 3:16 in Tyndale Open Study Notes'));
  });

  it.each([
    ['Jamieson-Fausset-Brown', 'John 3:16', 'number', 'JFB exact', 'Jamieson-Fausset-Brown'],
    ['Adam Clarke', 'Romans 8:28', 'verseNumber', 'Clarke exact', 'Adam Clarke'],
    ['John Gill', 'Exodus 3:14', 'verseNumber', 'Gill exact', 'John Gill'],
    ['Tyndale', 'John 3:16', 'number', 'Tyndale exact', 'Tyndale Open Study Notes'],
  ] as const)('preserves exact reference identity for %s (%s)', async (commentator, reference, metadata, text, displayName) => {
    const parsed = parseReference(reference);
    vi.mocked(globalThis.fetch).mockResolvedValue(response({
      chapter: {
        content: [{ type: 'verse', [metadata]: parsed.startVerse, content: [text] }],
      },
    }));

    const result = await new HelloAoCommentaryAdapter().getCommentary(parsed, commentator);

    expect(result.reference).toBe(reference);
    expect(result.text).toBe(text);
    expect(result.commentator).toBe(displayName);
  });

  it('classifies malformed upstream JSON as an integrity failure', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('not-json', { status: 200 }));

    await expect(new HelloAoCommentaryAdapter().getCommentary(parseReference('John 3:16'), 'John Gill'))
      .rejects.toMatchObject({
        name: 'AdapterIntegrityError',
        source: 'HelloAO',
        message: '[HelloAO] Malformed commentary JSON payload',
        cause: expect.any(SyntaxError),
      });
  });
});
