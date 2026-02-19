/**
 * NET Bible adapter using shared HttpClient + kernel reference.
 */

import type { BibleAdapter } from './BibleAdapter.js';
import type { BibleResult } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';
import { formatReference } from '../../kernel/reference.js';
import { HttpClient } from '../shared/HttpClient.js';
import { APIError } from '../../kernel/errors.js';
import { stripHtml } from '../shared/HtmlParser.js';

const COPYRIGHT = 'NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.';

export class NetBibleAdapter implements BibleAdapter {
  readonly supportedTranslations = ['NET'];
  private client: HttpClient;

  constructor() {
    this.client = new HttpClient({
      source: 'NET Bible',
      baseUrl: 'https://labs.bible.org/api/',
      cacheTtlMs: 60 * 60 * 1000,
    });
  }

  async getPassage(ref: BibleReference, _translation: string): Promise<BibleResult> {
    const refStr = formatReference(ref);
    const params = new URLSearchParams({
      passage: refStr,
      formatting: 'full',
      type: 'json',
    });

    const data = await this.client.getJSON<any[]>(`?${params}`);

    if (!Array.isArray(data) || data.length === 0) {
      throw new APIError(404, `No passage found for: ${refStr}`);
    }

    // Combine verses
    const html = data.map((v: any) => v.text || '').join(' ');
    const text = stripHtml(html);

    return {
      reference: refStr,
      translation: 'NET',
      text,
      citation: {
        source: 'New English Translation',
        copyright: COPYRIGHT,
        url: 'https://netbible.org',
      },
    };
  }

  isConfigured(): boolean {
    return true;
  }

  getCopyright(): string {
    return COPYRIGHT;
  }
}
