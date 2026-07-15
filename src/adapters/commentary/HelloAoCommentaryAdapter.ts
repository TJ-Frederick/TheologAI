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
import {
  AdapterError,
  AdapterIntegrityError,
  CommentaryScalarNotFoundError,
  ValidationError,
} from '../../kernel/errors.js';

interface CommentatorMeta {
  id: string;
  displayName: string;
  otOnly?: boolean;
  copyright: string;
  scalarIdentity: ScalarIdentityPolicy;
}

type ScalarIdentityPolicy =
  | { kind: 'exactFields'; fields: readonly ('number' | 'verseNumber')[] }
  | { kind: 'chapterOnly' };

type ExtractionResult =
  | { kind: 'found'; text: string }
  | { kind: 'absent' }
  | { kind: 'invalid'; reason: string };

interface ValidatedEntry {
  kind: 'entry';
  entryType?: string;
  number?: number;
  verseNumber?: number;
  text?: string;
}

const PUBLIC_DOMAIN = 'Public Domain';
const TYNDALE_LICENSE = 'CC BY-SA 4.0 — Tyndale House, Cambridge (https://creativecommons.org/licenses/by-sa/4.0/)';

const CHAPTER_ONLY = { kind: 'chapterOnly' } as const;
const VERSE_ENTRY_IDENTITIES = { kind: 'exactFields', fields: ['verseNumber', 'number'] } as const;
const VERSE_NUMBER_IS_EXACT = { kind: 'exactFields', fields: ['verseNumber'] } as const;

const COMMENTATORS: Record<string, CommentatorMeta> = {
  // Matthew Henry and Keil-Delitzsch use numbered multi-verse sections. Their
  // `number` values are section anchors, not exact-verse identities.
  'matthew henry': { id: 'matthew-henry', displayName: 'Matthew Henry', copyright: PUBLIC_DOMAIN, scalarIdentity: CHAPTER_ONLY },
  'keil-delitzsch': { id: 'keil-delitzsch', displayName: 'Keil-Delitzsch', otOnly: true, copyright: PUBLIC_DOMAIN, scalarIdentity: CHAPTER_ONLY },
  // These sources publish verse-scoped entries under `number`.
  'jfb': { id: 'jamieson-fausset-brown', displayName: 'Jamieson-Fausset-Brown', copyright: PUBLIC_DOMAIN, scalarIdentity: VERSE_ENTRY_IDENTITIES },
  'jamieson-fausset-brown': { id: 'jamieson-fausset-brown', displayName: 'Jamieson-Fausset-Brown', copyright: PUBLIC_DOMAIN, scalarIdentity: VERSE_ENTRY_IDENTITIES },
  'adam clarke': { id: 'adam-clarke', displayName: 'Adam Clarke', copyright: PUBLIC_DOMAIN, scalarIdentity: VERSE_ENTRY_IDENTITIES },
  'clarke': { id: 'adam-clarke', displayName: 'Adam Clarke', copyright: PUBLIC_DOMAIN, scalarIdentity: VERSE_ENTRY_IDENTITIES },
  'tyndale': { id: 'tyndale', displayName: 'Tyndale Open Study Notes', copyright: TYNDALE_LICENSE, scalarIdentity: VERSE_ENTRY_IDENTITIES },
  // Gill's provider `number` is not accepted. Scalar lookup remains available
  // only if the source supplies the stronger `verseNumber` identity.
  'john gill': { id: 'john-gill', displayName: 'John Gill', copyright: PUBLIC_DOMAIN, scalarIdentity: VERSE_NUMBER_IS_EXACT },
  'gill': { id: 'john-gill', displayName: 'John Gill', copyright: PUBLIC_DOMAIN, scalarIdentity: VERSE_NUMBER_IS_EXACT },
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
    let data: unknown;
    try {
      data = await this.client.getJSON<unknown>(`/${meta.id}/${hao.bookCode}/${hao.chapter}.json`);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new AdapterIntegrityError('HelloAO', 'Malformed commentary JSON payload', error);
      }
      throw error;
    }

    const extraction = this.extractCommentaryText(data, hao.verse, meta.scalarIdentity);
    if (extraction.kind === 'invalid') {
      throw new AdapterIntegrityError('HelloAO', extraction.reason);
    }
    if (extraction.kind === 'absent') {
      if (hao.verse != null) {
        throw new CommentaryScalarNotFoundError(
          'HelloAO',
          `${ref.book.name} ${ref.chapter}`,
          `No exact commentary match for ${formatReference(ref)} in ${meta.displayName}`,
        );
      }
      throw new AdapterError('HelloAO', `No commentary found for ${formatReference(ref)} in ${meta.displayName}`);
    }

    return {
      reference: formatReference(ref),
      commentator: meta.displayName,
      text: extraction.text,
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
    scalarIdentity: ScalarIdentityPolicy,
  ): ExtractionResult {
    const chapter = this.getChapterContent(data);
    if (chapter.kind === 'invalid') return chapter;
    const content = chapter.content;

    const entries = content.map((entry, index) => this.validateEntry(entry, index));
    const invalid = entries.find((entry): entry is { kind: 'invalid'; reason: string } => entry.kind === 'invalid');
    if (invalid) return invalid;
    const validEntries = entries.filter((entry): entry is ValidatedEntry => entry.kind === 'entry');

    // If no specific verse, return all commentary for the chapter
    if (verseNumber == null) {
      const parts = validEntries.map(entry => entry.text).filter((text): text is string => text != null);
      return parts.length > 0 ? { kind: 'found', text: parts.join('\n\n') } : { kind: 'absent' };
    }

    if (scalarIdentity.kind === 'chapterOnly') return { kind: 'absent' };

    // Verse requests require an exact, trustworthy provider identity. A
    // neighboring entry may be broader commentary or commentary for another
    // verse, so never substitute it for the requested verse.
    const identities = validEntries
      .map(entry => this.getScalarIdentity(entry, scalarIdentity.fields))
      .filter((identity): identity is number => identity != null);
    if (new Set(identities).size !== identities.length) {
      return { kind: 'invalid', reason: 'Duplicate exact commentary identity' };
    }

    const exactEntry = validEntries.find(entry => this.getScalarIdentity(entry, scalarIdentity.fields) === verseNumber);
    if (!exactEntry?.text) return { kind: 'absent' };

    return { kind: 'found', text: exactEntry.text };
  }

  private getChapterContent(data: unknown): { kind: 'chapter'; content: unknown[] } | { kind: 'invalid'; reason: string } {
    if (!this.isRecord(data) || !this.isRecord(data.chapter) || !Array.isArray(data.chapter.content)) {
      return { kind: 'invalid', reason: 'Malformed commentary chapter payload' };
    }
    return { kind: 'chapter', content: data.chapter.content };
  }

  private validateEntry(entry: unknown, index: number): ValidatedEntry | { kind: 'invalid'; reason: string } {
    if (!this.isRecord(entry) || !Array.isArray(entry.content)) {
      return { kind: 'invalid', reason: `Malformed commentary entry at index ${index}` };
    }
    if (entry.type != null && typeof entry.type !== 'string') {
      return { kind: 'invalid', reason: `Malformed commentary entry type at index ${index}` };
    }

    const verseNumber = this.readVerseMetadata(entry.verseNumber);
    const hasVerseNumber = entry.verseNumber !== undefined && entry.verseNumber !== null;
    const number = this.readVerseMetadata(entry.number);
    const hasNumber = entry.number !== undefined && entry.number !== null;

    if ((hasVerseNumber && verseNumber === undefined) || (hasNumber && number === undefined)) {
      return { kind: 'invalid', reason: `Malformed commentary identity at index ${index}` };
    }
    if (verseNumber !== undefined && number !== undefined && verseNumber !== number) {
      return { kind: 'invalid', reason: `Conflicting commentary identity at index ${index}` };
    }

    const text = this.extractEntryText(entry);
    if (text.kind === 'invalid') return { kind: 'invalid', reason: `${text.reason} at index ${index}` };
    return { kind: 'entry', entryType: entry.type, number, verseNumber, text: text.text };
  }

  private getScalarIdentity(
    entry: ValidatedEntry,
    acceptedFields: readonly ('number' | 'verseNumber')[],
  ): number | undefined {
    for (const field of acceptedFields) {
      if (entry[field] == null) continue;
      if (field === 'number' && entry.entryType !== 'verse') continue;
      return entry[field];
    }
    return undefined;
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

  private extractEntryText(entry: Record<string, any>): { kind: 'text'; text?: string } | { kind: 'invalid'; reason: string } {
    const parts: string[] = [];
    for (const item of entry.content) {
      if (this.isRecord(item) && item.type === 'heading') {
        const heading = this.joinContent(item.content);
        if (heading == null) return { kind: 'invalid', reason: 'Malformed commentary heading content' };
        if (heading) parts.push(`**${heading}**`);
      } else if (this.isRecord(item) && item.type === 'text') {
        const text = this.joinContent(item.content);
        if (text == null) return { kind: 'invalid', reason: 'Malformed commentary text content' };
        if (text) parts.push(text);
      } else if (typeof item === 'string') {
        parts.push(item);
      } else {
        return { kind: 'invalid', reason: 'Unknown commentary content item' };
      }
    }

    return { kind: 'text', text: parts.length > 0 ? parts.join('\n\n') : undefined };
  }

  private joinContent(value: unknown): string | undefined {
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return undefined;
    return value.join(' ');
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
