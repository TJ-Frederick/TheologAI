/**
 * NET Bible adapter using shared HttpClient + kernel reference.
 */

import type { BibleAdapter } from './BibleAdapter.js';
import type { BibleResult } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';
import { formatReference, parseReference } from '../../kernel/reference.js';
import type { HttpClient } from '../shared/HttpClient.js';
import { createBibleHttpClient } from './createBibleHttpClient.js';
import { APIError } from '../../kernel/errors.js';
import { stripHtml } from '../shared/HtmlParser.js';

const COPYRIGHT = 'NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.';

export class NetBibleAdapter implements BibleAdapter {
  readonly supportedTranslations = ['NET'];
  private client: HttpClient;

  constructor() {
    this.client = createBibleHttpClient({
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

    this.assertResponseMatchesReference(ref, data);

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

  private assertResponseMatchesReference(ref: BibleReference, data: any[]): void {
    const returnedVerses = new Set<number>();
    for (const verse of data) {
      const bookName = typeof verse.bookname === 'string' ? verse.bookname : verse.book;
      const chapter = Number(verse.chapter);
      const verseNumber = Number(verse.verse);
      if (!bookName || !Number.isSafeInteger(chapter) || !Number.isSafeInteger(verseNumber)) {
        throw new APIError(502, 'Bible provider returned incomplete passage metadata.');
      }

      let returnedRef: BibleReference;
      try {
        returnedRef = parseReference(`${bookName} ${chapter}:${verseNumber}`);
      } catch {
        throw new APIError(502, 'Bible provider returned invalid passage metadata.');
      }

      if (returnedRef.book.number !== ref.book.number || returnedRef.chapter !== ref.chapter) {
        throw new APIError(502, 'Bible provider returned a passage for a different reference.');
      }

      if (ref.startVerse != null) {
        const expectedEnd = ref.endVerse ?? ref.startVerse;
        if (verseNumber < ref.startVerse || verseNumber > expectedEnd) {
          throw new APIError(502, 'Bible provider returned a passage for a different reference.');
        }
        returnedVerses.add(verseNumber);
      }
    }

    if (ref.startVerse != null) {
      const expectedEnd = ref.endVerse ?? ref.startVerse;
      for (let verse = ref.startVerse; verse <= expectedEnd; verse++) {
        if (!returnedVerses.has(verse)) {
          throw new APIError(502, 'Bible provider returned an incomplete passage.');
        }
      }
      if (returnedVerses.size !== expectedEnd - ref.startVerse + 1) {
        throw new APIError(502, 'Bible provider returned an unexpected passage range.');
      }
    }
  }
}
