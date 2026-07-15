/**
 * HelloAO commentary adapter.
 *
 * Provides 6 commentaries via bible.helloao.org. Licensing varies by work.
 * Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale.
 */

import type { CommentaryAdapter } from './CommentaryAdapter.js';
import type {
  CommentaryAdapterResult,
  CommentaryCoverageEvidence,
} from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';
import { formatReference, toHelloAO } from '../../kernel/reference.js';
import { findBook } from '../../kernel/books.js';
import {
  CANONICAL_COMMENTATORS,
  resolveCommentaryCatalogEntry,
  type CommentaryCatalogEntry,
  type CommentaryScalarPolicy,
} from '../../kernel/commentaryCatalog.js';
import { HttpClient } from '../shared/HttpClient.js';
import {
  AdapterError,
  AdapterIntegrityError,
  CommentaryScalarNotFoundError,
  ValidationError,
} from '../../kernel/errors.js';

type ExtractionResult =
  | { kind: 'found'; text: string; coverage: CommentaryCoverageEvidence }
  | { kind: 'absent' }
  | { kind: 'invalid'; reason: string };

interface ValidatedEntry {
  kind: 'entry';
  entryType?: string;
  number?: number;
  verseNumber?: number;
  text?: string;
}

const MAX_CHAPTER_ENTRIES = 500;
const MAX_CONTENT_ITEMS_PER_ENTRY = 5_000;
const MAX_CONTENT_FRAGMENT_LENGTH = 100_000;
const MAX_ENTRY_TEXT_LENGTH = 200_000;
const MAX_CHAPTER_TEXT_LENGTH = 1_000_000;

export class HelloAoCommentaryAdapter implements CommentaryAdapter {
  readonly supportedCommentators = CANONICAL_COMMENTATORS;

  private client: HttpClient;

  constructor() {
    this.client = new HttpClient({
      source: 'HelloAO Commentary',
      baseUrl: 'https://bible.helloao.org/api/c',
      cacheTtlMs: 60 * 60 * 1000,
      cacheMaxSize: 300,
    });
  }

  async getCommentary(ref: BibleReference, commentator: string): Promise<CommentaryAdapterResult> {
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

    if (meta.testamentCoverage === 'old_testament' && ref.book.testament === 'NT') {
      throw new AdapterError('HelloAO', `${meta.canonicalName} is only available for Old Testament books.`);
    }

    const hao = toHelloAO(ref);
    let data: unknown;
    try {
      data = await this.client.getJSON<unknown>(`/${meta.providerWorkId}/${hao.bookCode}/${hao.chapter}.json`);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new AdapterIntegrityError('HelloAO', 'Malformed commentary JSON payload', error);
      }
      throw error;
    }

    const extraction = this.extractCommentaryText(data, hao.chapter, hao.verse, meta.scalarPolicy);
    if (extraction.kind === 'invalid') {
      throw new AdapterIntegrityError('HelloAO', extraction.reason);
    }
    if (extraction.kind === 'absent') {
      if (hao.verse != null) {
        throw new CommentaryScalarNotFoundError(
          'HelloAO',
          `${ref.book.name} ${ref.chapter}`,
          `No exact commentary match for ${formatReference(ref)} in ${meta.resultDisplayName}`,
        );
      }
      throw new AdapterError('HelloAO', `No commentary found for ${formatReference(ref)} in ${meta.resultDisplayName}`);
    }

    return {
      reference: formatReference(ref),
      commentator: meta.resultDisplayName,
      text: extraction.text,
      citation: { ...meta.citation },
      coverage: extraction.coverage,
    };
  }

  supportsBook(commentator: string, bookName: string): boolean {
    const meta = this.resolveCommentator(commentator);
    if (!meta) return false;
    if (meta.testamentCoverage !== 'old_testament') return true;

    return findBook(bookName)?.testament === 'OT';
  }

  private resolveCommentator(name: string): CommentaryCatalogEntry | undefined {
    return resolveCommentaryCatalogEntry(name);
  }

  private extractCommentaryText(
    data: unknown,
    chapterNumber: number,
    verseNumber: number | undefined,
    scalarIdentity: CommentaryScalarPolicy,
  ): ExtractionResult {
    const chapter = this.getChapterContent(data);
    if (chapter.kind === 'invalid') return chapter;
    const content = chapter.content;

    const validEntries: ValidatedEntry[] = [];
    let chapterTextLength = 0;
    let chapterTextEntries = 0;
    for (let index = 0; index < content.length; index++) {
      const entry = this.validateEntry(content[index], index);
      if (entry.kind === 'invalid') return entry;
      if (entry.text != null) {
        chapterTextLength += entry.text.length + (chapterTextEntries > 0 ? 2 : 0);
        chapterTextEntries++;
        if (chapterTextLength > MAX_CHAPTER_TEXT_LENGTH) {
          return { kind: 'invalid', reason: 'Commentary chapter content exceeds safety limit' };
        }
      }
      validEntries.push(entry);
    }

    // If no specific verse, return all commentary for the chapter
    if (verseNumber == null) {
      const parts = validEntries.map(entry => entry.text).filter((text): text is string => text != null);
      return parts.length > 0
        ? {
          kind: 'found', text: parts.join('\n\n'),
          coverage: {
            requestedScope: 'chapter', returnedGranularity: 'chapter_aggregate',
            identityBasis: 'provider_chapter_payload',
            providerIdentity: { field: 'chapter_payload', chapter: chapterNumber },
          },
        }
        : { kind: 'absent' };
    }

    if (scalarIdentity.kind === 'chapter_only') return { kind: 'absent' };

    // Verse requests require an exact, trustworthy provider identity. A
    // neighboring entry may be broader commentary or commentary for another
    // verse, so never substitute it for the requested verse.
    const identities = validEntries
      .map(entry => this.getScalarIdentity(entry, scalarIdentity))
      .filter((identity): identity is Exclude<ReturnType<HelloAoCommentaryAdapter['getScalarIdentity']>, undefined> => identity != null);
    if (new Set(identities.map(identity => identity.value)).size !== identities.length) {
      return { kind: 'invalid', reason: 'Duplicate exact commentary identity' };
    }

    const exactEntry = validEntries
      .map(entry => ({ entry, identity: this.getScalarIdentity(entry, scalarIdentity) }))
      .find(candidate => candidate.identity?.value === verseNumber);
    if (!exactEntry?.entry.text || !exactEntry.identity) return { kind: 'absent' };

    return {
      kind: 'found', text: exactEntry.entry.text,
      coverage: exactEntry.identity.field === 'verseNumber'
        ? {
          requestedScope: 'verse', returnedGranularity: 'exact_verse',
          identityBasis: 'provider_verse_number',
          providerIdentity: { field: 'verseNumber', value: exactEntry.identity.value },
        }
        : {
          requestedScope: 'verse', returnedGranularity: 'exact_verse',
          identityBasis: 'provider_typed_verse_number',
          providerIdentity: { field: 'number', value: exactEntry.identity.value, entryType: 'verse' },
        },
    };
  }

  private getChapterContent(data: unknown): { kind: 'chapter'; content: unknown[] } | { kind: 'invalid'; reason: string } {
    if (!this.isRecord(data) || !this.isRecord(data.chapter) || !Array.isArray(data.chapter.content)) {
      return { kind: 'invalid', reason: 'Malformed commentary chapter payload' };
    }
    if (data.chapter.content.length > MAX_CHAPTER_ENTRIES) {
      return { kind: 'invalid', reason: 'Commentary chapter entry count exceeds safety limit' };
    }
    return { kind: 'chapter', content: data.chapter.content };
  }

  private validateEntry(entry: unknown, index: number): ValidatedEntry | { kind: 'invalid'; reason: string } {
    if (!this.isRecord(entry) || !Array.isArray(entry.content)) {
      return { kind: 'invalid', reason: `Malformed commentary entry at index ${index}` };
    }
    if (entry.content.length > MAX_CONTENT_ITEMS_PER_ENTRY) {
      return { kind: 'invalid', reason: `Commentary entry content exceeds safety limit at index ${index}` };
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
    policy: CommentaryScalarPolicy,
  ): { field: 'verseNumber' | 'number'; value: number } | undefined {
    if (policy.kind === 'chapter_only') return undefined;
    if (entry.verseNumber != null) return { field: 'verseNumber', value: entry.verseNumber };
    if (policy.kind === 'verse_number_or_typed_number'
        && entry.number != null && entry.entryType === 'verse') {
      return { field: 'number', value: entry.number };
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
    const blocks: string[] = [];
    let current = '';
    // A bare string is a possible note block until an official inline variant
    // proves it belongs to a continued stream. A second bare string commits
    // the first as a paragraph, preserving live Tyndale multi-note payloads.
    let pendingBareString: string | undefined;
    let inlineStreamActive = false;
    let renderedLength = 0;

    const appendCurrent = (fragment: string): boolean => {
      const next = this.appendFragment(current, fragment);
      renderedLength += next.length - current.length;
      current = next;
      return renderedLength <= MAX_ENTRY_TEXT_LENGTH;
    };
    const flushCurrent = (): void => {
      const text = current.trim();
      if (text) blocks.push(text);
      current = '';
    };
    const appendBlock = (block: string): boolean => {
      flushCurrent();
      if (block) {
        blocks.push(block);
        renderedLength += block.length;
      }
      return renderedLength <= MAX_ENTRY_TEXT_LENGTH;
    };
    const promotePendingBareString = (): boolean => {
      if (pendingBareString == null) return true;
      const pending = pendingBareString;
      pendingBareString = undefined;
      return appendCurrent(pending);
    };
    const commitPendingBareString = (): boolean => {
      if (pendingBareString == null) return true;
      const pending = pendingBareString;
      pendingBareString = undefined;
      return appendBlock(pending);
    };

    for (const item of entry.content) {
      if (typeof item === 'string') {
        const text = this.sanitizeContentFragment(item);
        if (text == null) return { kind: 'invalid', reason: 'Commentary text fragment exceeds safety limit' };
        if (inlineStreamActive) {
          if (!appendCurrent(text)) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        } else if (pendingBareString == null) {
          pendingBareString = text;
        } else {
          if (!commitPendingBareString()) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
          pendingBareString = text;
        }
        continue;
      }
      if (!this.isRecord(item)) {
        return { kind: 'invalid', reason: 'Unknown commentary content item' };
      }

      const officialKeys = ['text', 'heading', 'lineBreak', 'noteId'].filter(key => Object.hasOwn(item, key));
      if (officialKeys.length > 1 || (item.type != null && officialKeys.length > 0)) {
        return { kind: 'invalid', reason: 'Ambiguous commentary content item' };
      }

      if (this.isRecord(item) && item.type === 'heading') {
        if (!commitPendingBareString()) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        const heading = this.joinContent(item.content);
        if (heading == null) return { kind: 'invalid', reason: 'Malformed commentary heading content' };
        if (!appendBlock(heading ? `**${heading}**` : '')) {
          return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        }
        inlineStreamActive = false;
      } else if (this.isRecord(item) && item.type === 'text') {
        if (!commitPendingBareString()) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        const text = this.joinContent(item.content);
        if (text == null) return { kind: 'invalid', reason: 'Malformed commentary text content' };
        if (!appendBlock(text)) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        inlineStreamActive = false;
      } else if (officialKeys.length !== 1) {
        return { kind: 'invalid', reason: 'Unknown commentary content item' };
      } else if (officialKeys[0] === 'text') {
        if (typeof item.text !== 'string') return { kind: 'invalid', reason: 'Malformed formatted commentary text' };
        const text = this.sanitizeContentFragment(item.text);
        if (text == null) return { kind: 'invalid', reason: 'Commentary text fragment exceeds safety limit' };
        if (!promotePendingBareString()) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        inlineStreamActive = true;
        if (!appendCurrent(text)) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
      } else if (officialKeys[0] === 'heading') {
        if (typeof item.heading !== 'string') return { kind: 'invalid', reason: 'Malformed inline commentary heading' };
        const heading = this.sanitizeContentFragment(item.heading);
        if (heading == null) return { kind: 'invalid', reason: 'Commentary heading exceeds safety limit' };
        if (!commitPendingBareString()) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        if (!appendBlock(heading ? `**${heading}**` : '')) {
          return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        }
        inlineStreamActive = false;
      } else if (officialKeys[0] === 'lineBreak') {
        if (item.lineBreak !== true) return { kind: 'invalid', reason: 'Malformed inline commentary line break' };
        if (!promotePendingBareString()) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        inlineStreamActive = true;
        // Markdown collapses a plain newline; two trailing spaces preserve the
        // provider's explicit break. Repeated variants yield repeated hard breaks.
        const next = `${current.replace(/[ \t]+$/u, '')}  \n`;
        renderedLength += next.length - current.length;
        current = next;
        if (renderedLength > MAX_ENTRY_TEXT_LENGTH) {
          return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        }
      } else if (officialKeys[0] === 'noteId') {
        if (!Number.isSafeInteger(item.noteId) || item.noteId < 0) {
          return { kind: 'invalid', reason: 'Malformed commentary footnote reference' };
        }
        if (!promotePendingBareString()) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
        inlineStreamActive = true;
        // The chapter commentary response does not supply authoritative note
        // text. Match the Bible adapter's convention and omit the reference.
      } else {
        return { kind: 'invalid', reason: 'Unknown commentary content item' };
      }
    }

    if (!commitPendingBareString()) return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
    flushCurrent();
    const text = blocks.join('\n\n');
    if (text.length > MAX_ENTRY_TEXT_LENGTH) {
      return { kind: 'invalid', reason: 'Commentary entry text exceeds safety limit' };
    }
    return { kind: 'text', text: text || undefined };
  }

  private joinContent(value: unknown): string | undefined {
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return undefined;
    const fragments: string[] = [];
    for (const item of value) {
      const text = this.sanitizeContentFragment(item);
      if (text == null) return undefined;
      fragments.push(text);
    }
    return fragments.join(' ');
  }

  private sanitizeContentFragment(value: string): string | undefined {
    if (value.length > MAX_CONTENT_FRAGMENT_LENGTH) return undefined;
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  /** Join provider fragments as words while leaving punctuation attached. */
  private appendFragment(current: string, fragment: string): string {
    if (!fragment) return current;
    if (!current || /\s$/.test(current) || /^\s/.test(fragment) || /\n$/.test(current)) {
      return current + fragment;
    }

    const previous = current[current.length - 1];
    const next = fragment[0];
    if (/^[,.;:!?%…)\]}"'”’]/u.test(next) || /^[([{"'“‘]/u.test(previous) || previous === '-' || next === '-') {
      return current + fragment;
    }
    return `${current} ${fragment}`;
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
