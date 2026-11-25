/**
 * ESV Bible adapter using shared HttpClient + kernel reference.
 */

import type { BibleProviderPort } from '../../services/bible/BibleProviderPort.js';
import type { BibleResult } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';
import { formatReference, parseReference, referencesEqual } from '../../kernel/reference.js';
import type { HttpClient } from '../shared/HttpClient.js';
import { createBibleHttpClient } from './createBibleHttpClient.js';
import { APIError } from '../../kernel/errors.js';

const COPYRIGHT = 'ESV® Bible (English Standard Version®), copyright © 2001 by Crossway';

export class EsvAdapter implements BibleProviderPort {
  readonly supportedTranslations = ['ESV'];
  private client: HttpClient;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ESV_API_KEY || '';
    this.client = createBibleHttpClient({
      source: 'ESV',
      baseUrl: 'https://api.esv.org/v3/passage',
      cacheTtlMs: 60 * 60 * 1000,
      headers: this.apiKey ? { Authorization: `Token ${this.apiKey}` } : {},
    });
  }

  async getPassage(ref: BibleReference, _translation: string, options?: { includeFootnotes?: boolean }): Promise<BibleResult> {
    if (!this.apiKey) {
      throw new APIError(401, 'ESV API key not configured. Set ESV_API_KEY environment variable.');
    }

    const refStr = formatReference(ref);
    const params = new URLSearchParams({
      q: refStr,
      'include-headings': 'false',
      'include-footnotes': String(options?.includeFootnotes ?? false),
      'include-verse-numbers': 'true',
      'include-short-copyright': 'false',
    });

    return this.client.getJSON(`/text/?${params}`, undefined, value => this.decodePassage(value, ref, refStr));
  }

  private decodePassage(value: unknown, ref: BibleReference, refStr: string): BibleResult {
    if (value === null) throw new TypeError('Malformed ESV passage payload.');
    const data = value as { passages?: unknown; canonical?: unknown };
    if (!data.passages || (Array.isArray(data.passages) && data.passages.length === 0)) {
      throw new APIError(404, `No passages found for: ${refStr}`);
    }

    if (typeof data.canonical === 'string') {
      let canonicalRef: BibleReference;
      try {
        canonicalRef = parseReference(data.canonical);
      } catch {
        throw new APIError(502, 'Bible provider returned an invalid canonical reference.');
      }
      if (!referencesEqual(ref, canonicalRef)) {
        throw new APIError(502, 'Bible provider returned a passage for a different reference.');
      }
    } else if (data.canonical != null) {
      throw new APIError(502, 'Bible provider returned an invalid canonical reference.');
    }

    if (!Array.isArray(data.passages) || typeof data.passages[0] !== 'string') {
      throw new APIError(502, 'Bible provider returned an invalid passage result.');
    }
    const text = data.passages[0].trim();
    if (!text) throw new APIError(502, 'Bible provider returned an empty passage.');

    return {
      reference: data.canonical || refStr,
      translation: 'ESV',
      text,
      citation: {
        source: 'English Standard Version',
        copyright: COPYRIGHT,
        url: 'https://www.esv.org/',
      },
    };
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getCopyright(): string {
    return COPYRIGHT;
  }
}
