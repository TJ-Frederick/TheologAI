import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CcelAdapter } from '../../../../src/adapters/commentary/CcelAdapter.js';
import { AdapterError } from '../../../../src/kernel/errors.js';
import { parseReference } from '../../../../src/kernel/reference.js';

const htmlResponse = (body: string, status = 200): Response => new Response(body, {
  status,
  statusText: status === 200 ? 'OK' : 'Not Found',
});

const page = (content: string): string => `
  <html><body><div class="book-content">
    ${content}
  </div></body></html>
`;

describe('CcelAdapter', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn<typeof fetch>();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetches a work section and strips non-content markup and entities', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(htmlResponse(page(`
      <!-- remove --><style>.x { color: red }</style><script>alert('x')</script>
      <table class="book_navbar"><tr><td>Navigation</td></tr></table>
      <h2>Grace &amp; Truth</h2>
      <div><p>Nested <b>commentary</b>.</p></div>
      <sup class="Note">1</sup>
    `)));
    const adapter = new CcelAdapter();

    const result = await adapter.getWorkSection('author/work', 'section.i');
    expect(result).toMatchObject({ work: 'author/work', section: 'section.i' });
    expect(result.content).toContain('Grace & Truth');
    expect(result.content).toContain('Nested commentary.');
    expect(result.content).not.toMatch(/Navigation|alert|remove/);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://ccel.org/ccel/author/work/section.i.html?html=true',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    ['Matthew Henry', '/ccel/henry/mhc5/mhc5.John.iii.html?html=true'],
    ['MHC Concise', '/ccel/henry/mhcc/mhcc.John.iii.html?html=true'],
    ['JFB', '/ccel/jfb/jfb/jfb.John.iii.html?html=true'],
    ['Jamieson Fausset Brown', '/ccel/jfb/jfb/jfb.John.iii.html?html=true'],
  ])('maps %s commentary references to the expected CCEL section', async (commentator, path) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(htmlResponse(page('<p>Commentary text long enough for extraction.</p>')));

    const result = await new CcelAdapter().getCommentary(parseReference('John 3:16'), commentator);

    expect(result.content).toBe('Commentary text long enough for extraction.');
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toBe(`https://ccel.org${path}`);
  });

  it('requests and parses scripture XML with encoded markup', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(htmlResponse(
      '<response><body>&lt;b&gt;For God&lt;/b&gt; so loved &amp; gave.</body></response>',
    ));

    await expect(new CcelAdapter().getScripture('John 3:16', 'kjv'))
      .resolves.toBe('For God so loved & gave.');
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0]))
      .toBe('https://ccel.org/ajax/scripture?version=kjv&passage=John+3%3A16');
  });

  it('uses NRSV as the default scripture version', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(htmlResponse('<body>Text</body>'));

    await new CcelAdapter().getScripture('Psalm 23');
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toContain('version=nrsv');
  });

  it('rejects scripture XML without a body', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(htmlResponse('<response><error>missing</error></response>'));

    await expect(new CcelAdapter().getScripture('John 3:16'))
      .rejects.toEqual(new AdapterError('CCEL', 'Could not parse scripture response'));
  });

  it.each([
    ['an explicit error page', `${'x'.repeat(100)} Something went wrong`],
    ['a short response', '<html>missing</html>'],
    ['a page without book content', `<html><body>${'text '.repeat(30)}</body></html>`],
    ['an unclosed content div', `<html><body><div class="book-content">${'text '.repeat(30)}</body></html>`],
  ])('rejects %s', async (_label, body) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(htmlResponse(body));

    await expect(new CcelAdapter().getWorkSection('author/work', 'missing'))
      .rejects.toBeInstanceOf(AdapterError);
  });

  it('surfaces an upstream HTTP error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(htmlResponse('missing', 404));

    await expect(new CcelAdapter().getWorkSection('author/work', 'missing'))
      .rejects.toMatchObject({ source: 'CCEL', message: expect.stringContaining('HTTP 404') });
  });
});
