/**
 * HelloAO commentary adapter.
 *
 * Provides 6 public domain commentaries via bible.helloao.org:
 * Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale.
 */

import type { CommentaryAdapter } from './CommentaryAdapter.js';
import type { CommentaryResult } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';
import { formatReference, toHelloAO } from '../../kernel/reference.js';
import { HttpClient } from '../shared/HttpClient.js';
import { AdapterError } from '../../kernel/errors.js';

interface CommentatorMeta {
  id: string;
  displayName: string;
  otOnly?: boolean;
}

const COMMENTATORS: Record<string, CommentatorMeta> = {
  'matthew henry': { id: 'matthew-henry', displayName: 'Matthew Henry' },
  'jfb': { id: 'jamieson-fausset-brown', displayName: 'Jamieson-Fausset-Brown' },
  'jamieson-fausset-brown': { id: 'jamieson-fausset-brown', displayName: 'Jamieson-Fausset-Brown' },
  'adam clarke': { id: 'adam-clarke', displayName: 'Adam Clarke' },
  'clarke': { id: 'adam-clarke', displayName: 'Adam Clarke' },
  'john gill': { id: 'john-gill', displayName: 'John Gill' },
  'gill': { id: 'john-gill', displayName: 'John Gill' },
  'keil-delitzsch': { id: 'keil-delitzsch', displayName: 'Keil-Delitzsch', otOnly: true },
  'tyndale': { id: 'tyndale', displayName: 'Tyndale Open Study Notes' },
};

export class HelloAoCommentaryAdapter implements CommentaryAdapter {
  readonly supportedCommentators = [
    'Matthew Henry', 'Jamieson-Fausset-Brown', 'Adam Clarke',
    'John Gill', 'Keil-Delitzsch', 'Tyndale',
  ];

  private client: HttpClient;

  constructor() {
    this.client = new HttpClient({
      source: 'HelloAO Commentary',
      baseUrl: 'https://bible.helloao.org/api/c',
      cacheTtlMs: 60 * 60 * 1000,
      cacheMaxSize: 300,
    });
  }

  async getCommentary(ref: BibleReference, commentator: string): Promise<CommentaryResult> {
    const meta = this.resolveCommentator(commentator);
    if (!meta) {
      throw new AdapterError('HelloAO', `Unknown commentator: "${commentator}". Available: ${this.supportedCommentators.join(', ')}`);
    }

    if (meta.otOnly && ref.book.testament === 'NT') {
      throw new AdapterError('HelloAO', `${meta.displayName} is only available for Old Testament books.`);
    }

    const hao = toHelloAO(ref);
    const data = await this.client.getJSON<any>(`/${meta.id}/${hao.bookCode}/${hao.chapter}.json`);

    const text = this.extractCommentaryText(data, hao.verse);
    if (!text) {
      throw new AdapterError('HelloAO', `No commentary found for ${formatReference(ref)} in ${meta.displayName}`);
    }

    return {
      reference: formatReference(ref),
      commentator: meta.displayName,
      text,
      citation: {
        source: `${meta.displayName} Commentary`,
        copyright: 'Public Domain',
        url: 'https://bible.helloao.org',
      },
    };
  }

  supportsBook(commentator: string, _bookName: string): boolean {
    const meta = this.resolveCommentator(commentator);
    return !!meta;
  }

  private resolveCommentator(name: string): CommentatorMeta | undefined {
    return COMMENTATORS[name.toLowerCase().trim()];
  }

  private extractCommentaryText(data: any, verseNumber?: number): string | undefined {
    if (!data?.chapter?.content) return undefined;

    // If no specific verse, return all commentary for the chapter
    if (!verseNumber) {
      const parts: string[] = [];
      for (const entry of data.chapter.content) {
        const text = this.extractEntryText(entry);
        if (text) parts.push(text);
      }
      return parts.length > 0 ? parts.join('\n\n') : undefined;
    }

    // Try exact verse match
    let entry = data.chapter.content.find((item: any) => {
      const num = item.verseNumber ?? item.number;
      return num === verseNumber;
    });

    // Fallback: closest preceding verse section
    if (!entry) {
      const candidates = data.chapter.content
        .filter((item: any) => (item.verseNumber ?? item.number) <= verseNumber)
        .sort((a: any, b: any) => (b.verseNumber ?? b.number) - (a.verseNumber ?? a.number));
      entry = candidates[0];
    }

    return entry ? this.extractEntryText(entry) : undefined;
  }

  private extractEntryText(entry: any): string | undefined {
    if (!entry?.content || !Array.isArray(entry.content)) return undefined;

    const parts: string[] = [];
    for (const item of entry.content) {
      if (typeof item === 'object' && item.type === 'heading') {
        parts.push(`**${item.content.join(' ')}**`);
      } else if (typeof item === 'object' && item.type === 'text') {
        parts.push(item.content.join(' '));
      } else if (typeof item === 'string') {
        parts.push(item);
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }
}
