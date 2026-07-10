import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsvAdapter } from '../../../../src/adapters/bible/EsvAdapter.js';
import { APIError } from '../../../../src/kernel/errors.js';
import { parseReference } from '../../../../src/kernel/reference.js';

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  statusText: status === 200 ? 'OK' : 'Not Found',
  headers: { 'content-type': 'application/json' },
});

describe('EsvAdapter', () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.ESV_API_KEY;

  beforeEach(() => {
    globalThis.fetch = vi.fn<typeof fetch>();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ESV_API_KEY;
    else process.env.ESV_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it('reports unconfigured state and rejects requests without an API key', async () => {
    delete process.env.ESV_API_KEY;
    const adapter = new EsvAdapter();

    expect(adapter.isConfigured()).toBe(false);
    await expect(adapter.getPassage(parseReference('John 3:16'), 'ESV')).rejects.toMatchObject({
      name: 'APIError',
      status: 401,
      message: expect.stringContaining('ESV API key not configured'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('maps references and footnote options, authenticates, and parses a passage', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({
      canonical: 'John 3:16–17',
      passages: ['  [16] For God so loved the world.  '],
    }));
    const adapter = new EsvAdapter('secret-key');

    await expect(adapter.getPassage(parseReference('John 3:16-17'), 'ignored', {
      includeFootnotes: true,
    })).resolves.toEqual({
      reference: 'John 3:16–17',
      translation: 'ESV',
      text: '[16] For God so loved the world.',
      citation: {
        source: 'English Standard Version',
        copyright: adapter.getCopyright(),
      },
    });

    expect(adapter.isConfigured()).toBe(true);
    expect(adapter.supportedTranslations).toEqual(['ESV']);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(url)).toContain('https://api.esv.org/v3/passage/text/?');
    expect(String(url)).toContain('q=John+3%3A16-17');
    expect(String(url)).toContain('include-footnotes=true');
    expect(init?.headers).toMatchObject({ Authorization: 'Token secret-key' });
  });

  it('uses the formatted reference when canonical is absent and defaults footnotes off', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({ passages: [' Text '] }));
    const result = await new EsvAdapter('key').getPassage(parseReference('Psalms 23'), 'ESV');

    expect(result.reference).toBe('Psalms 23');
    expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toContain('include-footnotes=false');
  });

  it('accepts a common single-chapter canonical form from the provider', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({
      canonical: 'Jude 3',
      passages: ['[3] Beloved, ...'],
    }));

    await expect(new EsvAdapter('key').getPassage(parseReference('Jude 1:3'), 'ESV'))
      .resolves.toMatchObject({ reference: 'Jude 3', translation: 'ESV' });
  });

  it('rejects a canonical response for a different reference', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse({
      canonical: 'John 1:1',
      passages: ['Different passage'],
    }));

    await expect(new EsvAdapter('key').getPassage(parseReference('John 3:16'), 'ESV'))
      .rejects.toEqual(new APIError(502, 'Bible provider returned a passage for a different reference.'));
  });

  it.each([
    ['missing passages', {}],
    ['an empty passage list', { passages: [] }],
  ])('normalizes %s to a not-found API error', async (_label, payload) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(jsonResponse(payload));

    await expect(new EsvAdapter('key').getPassage(parseReference('John 3:16'), 'ESV'))
      .rejects.toEqual(new APIError(404, 'No passages found for: John 3:16'));
  });

  it('surfaces malformed JSON from the upstream response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('{not-json', { status: 200 }));

    await expect(new EsvAdapter('key').getPassage(parseReference('John 3:16'), 'ESV'))
      .rejects.toBeInstanceOf(SyntaxError);
  });
});
