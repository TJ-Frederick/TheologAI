/**
 * ESV Bible adapter using shared HttpClient + kernel reference.
 */

import type { BibleAdapter } from './BibleAdapter.js';
import type { BibleResult } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';
import { formatReference } from '../../kernel/reference.js';
import { HttpClient } from '../shared/HttpClient.js';
import { APIError } from '../../kernel/errors.js';

const COPYRIGHT = 'ESV® Bible (English Standard Version®), copyright © 2001 by Crossway';

export class EsvAdapter implements BibleAdapter {
  readonly supportedTranslations = ['ESV'];
  private client: HttpClient;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ESV_API_KEY || '';
    this.client = new HttpClient({
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

    const data = await this.client.getJSON<any>(`/text/?${params}`);

    if (!data.passages || data.passages.length === 0) {
      throw new APIError(404, `No passages found for: ${refStr}`);
    }

    return {
      reference: data.canonical || refStr,
      translation: 'ESV',
      text: data.passages[0].trim(),
      citation: { source: 'English Standard Version', copyright: COPYRIGHT },
    };
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getCopyright(): string {
    return COPYRIGHT;
  }
}
