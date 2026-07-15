/**
 * HelloAO commentary adapter.
 *
 * Provides 6 commentaries via bible.helloao.org. Licensing varies by work.
 * Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale.
 */

import type { CommentaryAdapter } from './CommentaryAdapter.js';
import type { CommentaryResult } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';
import { formatReference, toHelloAO } from '../../kernel/reference.js';
import { findBook } from '../../kernel/books.js';
import { HttpClient } from '../shared/HttpClient.js';
import { AdapterError, ValidationError } from '../../kernel/errors.js';

interface CommentatorMeta {
  id: string;
  displayName: string;
  otOnly?: boolean;
  copyright: string;
  verseIdentity: VerseIdentityPolicy;
}

type VerseIdentityPolicy = 'verseNumberOrNumber' | 'verseNumberOnly';

const PUBLIC_DOMAIN = 'Public Domain';
const TYNDALE_LICENSE = 'CC BY-SA 4.0 — Tyndale House, Cambridge (https://creativecommons.org/licenses/by-sa/4.0/)';

const COMMENTATORS: Record<string, CommentatorMeta> = {
  'matthew henry': { id: 'matthew-henry', displayName: 'Matthew Henry', copyright: PUBLIC_DOMAIN, verseIdentity: 'verseNumberOrNumber' },
  'jfb': { id: 'jamieson-fausset-brown', displayName: 'Jamieson-Fausset-Brown', copyright: PUBLIC_DOMAIN, verseIdentity: 'verseNumberOrNumber' },
  'jamieson-fausset-brown': { id: 'jamieson-fausset-brown', displayName: 'Jamieson-Fausset-Brown', copyright: PUBLIC_DOMAIN, verseIdentity: 'verseNumberOrNumber' },
  'adam clarke': { id: 'adam-clarke', displayName: 'Adam Clarke', copyright: PUBLIC_DOMAIN, verseIdentity: 'verseNumberOrNumber' },
  'clarke': { id: 'adam-clarke', displayName: 'Adam Clarke', copyright: PUBLIC_DOMAIN, verseIdentity: 'verseNumberOrNumber' },
  'john gill': { id: 'john-gill', displayName: 'John Gill', copyright: PUBLIC_DOMAIN, verseIdentity: 'verseNumberOnly' },
  'gill': { id: 'john-gill', displayName: 'John Gill', copyright: PUBLIC_DOMAIN, verseIdentity: 'verseNumberOnly' },
  'keil-delitzsch': { id: 'keil-delitzsch', displayName: 'Keil-Delitzsch', otOnly: true, copyright: PUBLIC_DOMAIN, verseIdentity: 'verseNumberOrNumber' },
  'tyndale': { id: 'tyndale', displayName: 'Tyndale Open Study Notes', copyright: TYNDALE_LICENSE, verseIdentity: 'verseNumberOrNumber' },
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
    if (ref.endVerse != null) {
      throw new ValidationError(
        'reference',
        'Commentary verse ranges are not supported; request one verse or a full chapter.',
      );
    }

    const meta = this.resolveCommentator(commentator);
    if (!meta) {
      throw new AdapterError('HelloAO', `Unknown commentator: "${commentator}". Available: ${this.supportedCommentators.join(', ')}`);
    }

    if (meta.otOnly && ref.book.testament === 'NT') {
      throw new AdapterError('HelloAO', `${meta.displayName} is only available for Old Testament books.`);
    }

    const hao = toHelloAO(ref);
    const data = await this.client.getJSON<any>(`/${meta.id}/${hao.bookCode}/${hao.chapter}.json`);

    const text = this.extractCommentaryText(data, hao.verse, meta.verseIdentity);
    if (!text) {
      if (hao.verse != null) {
        throw new AdapterError('HelloAO', `No exact commentary match for ${formatReference(ref)} in ${meta.displayName}`);
      }
      throw new AdapterError('HelloAO', `No commentary found for ${formatReference(ref)} in ${meta.displayName}`);
    }

    return {
      reference: formatReference(ref),
      commentator: meta.displayName,
      text,
      citation: {
        source: `${meta.displayName} Commentary`,
        copyright: meta.copyright,
        url: 'https://bible.helloao.org',
      },
    };
  }

  supportsBook(commentator: string, bookName: string): boolean {
    const meta = this.resolveCommentator(commentator);
    if (!meta) return false;
    if (!meta.otOnly) return true;

    return findBook(bookName)?.testament === 'OT';
  }

  private resolveCommentator(name: string): CommentatorMeta | undefined {
    return COMMENTATORS[name.toLowerCase().trim()];
  }

  private extractCommentaryText(
    data: unknown,
    verseNumber: number | undefined,
    verseIdentity: VerseIdentityPolicy,
  ): string | undefined {
    const content = this.getChapterContent(data);
    if (!content) return undefined;

    // If no specific verse, return all commentary for the chapter
    if (verseNumber == null) {
      const parts: string[] = [];
      for (const entry of content) {
        const text = this.extractEntryText(entry);
        if (text) parts.push(text);
      }
      return parts.length > 0 ? parts.join('\n\n') : undefined;
    }

    // Verse requests require an exact, trustworthy provider identity. A
    // neighboring entry may be broader commentary or commentary for another
    // verse, so never substitute it for the requested verse.
    const exactEntries = content.filter(entry => this.getEntryVerseNumber(entry, verseIdentity) === verseNumber);
    if (exactEntries.length !== 1) return undefined;

    return this.extractEntryText(exactEntries[0]);
  }

  private getChapterContent(data: unknown): unknown[] | undefined {
    if (!this.isRecord(data) || !this.isRecord(data.chapter) || !Array.isArray(data.chapter.content)) {
      return undefined;
    }
    return data.chapter.content;
  }

  /** Return an entry's verse only when its metadata is unambiguous and numeric. */
  private getEntryVerseNumber(entry: unknown, verseIdentity: VerseIdentityPolicy): number | undefined {
    if (!this.isRecord(entry)) return undefined;

    const verseNumber = this.readVerseMetadata(entry.verseNumber);
    const hasVerseNumber = entry.verseNumber !== undefined && entry.verseNumber !== null;

    if (verseIdentity === 'verseNumberOnly') {
      return hasVerseNumber && verseNumber === undefined ? undefined : verseNumber;
    }

    const number = this.readVerseMetadata(entry.number);
    const hasNumber = entry.number !== undefined && entry.number !== null;

    // If a provider supplies both fields, disagreement or malformed metadata
    // makes the identity untrustworthy. Null/undefined are treated as absent.
    if ((hasVerseNumber && verseNumber === undefined) || (hasNumber && number === undefined)) {
      return undefined;
    }
    if (verseNumber !== undefined && number !== undefined && verseNumber !== number) {
      return undefined;
    }
    return verseNumber ?? number;
  }

  private readVerseMetadata(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : undefined;
    }
    return undefined;
  }

  private extractEntryText(entry: unknown): string | undefined {
    if (!this.isRecord(entry) || !Array.isArray(entry.content)) return undefined;

    const parts: string[] = [];
    for (const item of entry.content) {
      if (this.isRecord(item) && item.type === 'heading') {
        const heading = this.joinContent(item.content);
        if (heading) parts.push(`**${heading}**`);
      } else if (this.isRecord(item) && item.type === 'text') {
        const text = this.joinContent(item.content);
        if (text) parts.push(text);
      } else if (typeof item === 'string') {
        parts.push(item);
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  private joinContent(value: unknown): string | undefined {
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return undefined;
    return value.join(' ');
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
