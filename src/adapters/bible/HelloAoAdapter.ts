/**
 * HelloAO Bible adapter — merges helloaoBibleAdapter + helloaoApi.
 *
 * Handles KJV, WEB, BSB, ASV, YLT, DBY translations via bible.helloao.org.
 * Uses kernel reference for book resolution; shared HttpClient for caching.
 */

import type { BibleProviderPort } from '../../services/bible/BibleProviderPort.js';
import type { BibleResult, Footnote } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';
import { formatReference, toHelloAO } from '../../kernel/reference.js';
import type { HttpClient } from '../shared/HttpClient.js';
import { createBibleHttpClient } from './createBibleHttpClient.js';
import { AdapterError, APIError } from '../../kernel/errors.js';

interface TranslationMeta {
  id: string;
  name: string;
  copyright: string;
  url: string;
}

const TRANSLATIONS: Record<string, TranslationMeta> = {
  KJV: { id: 'eng_kjv', name: 'King James Version', copyright: 'Public Domain', url: 'https://www.kingjamesbibleonline.org/' },
  WEB: { id: 'ENGWEBP', name: 'World English Bible', copyright: 'Public Domain', url: 'https://worldenglish.bible/' },
  BSB: { id: 'BSB', name: 'Berean Standard Bible', copyright: 'Public Domain', url: 'https://berean.bible/' },
  ASV: { id: 'eng_asv', name: 'American Standard Version', copyright: 'Public Domain (1901)', url: 'https://www.biblegateway.com/versions/American-Standard-Version-ASV-Bible/' },
  YLT: { id: 'eng_ylt', name: "Young's Literal Translation", copyright: 'Public Domain', url: 'https://www.biblestudytools.com/ylt/' },
  DBY: { id: 'eng_dby', name: 'Darby Translation', copyright: 'Public Domain', url: 'https://www.biblestudytools.com/dby/' },
};

type VerseContent = string | { lineBreak: true } | { noteId: number } | { text: string; wordsOfJesus?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function providerNumber(value: unknown): number {
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
}

export class HelloAoAdapter implements BibleProviderPort {
  readonly supportedTranslations = Object.keys(TRANSLATIONS);
  private client: HttpClient;

  constructor() {
    this.client = createBibleHttpClient({
      source: 'HelloAO',
      baseUrl: 'https://bible.helloao.org/api',
      cacheTtlMs: 60 * 60 * 1000,
      cacheMaxSize: 500,
    });
  }

  async getPassage(ref: BibleReference, translation: string, options?: { includeFootnotes?: boolean }): Promise<BibleResult> {
    const key = translation.toUpperCase();
    const meta = TRANSLATIONS[key];
    if (!meta) {
      throw new AdapterError('HelloAO', `Unsupported translation: ${translation}. Available: ${this.supportedTranslations.join(', ')}`);
    }

    const hao = toHelloAO(ref);
    const passage = await this.client.getJSON(`/${meta.id}/${hao.bookCode}/${hao.chapter}.json`, undefined,
      data => this.decodePassage(data, ref, hao, meta.id, options?.includeFootnotes));
    if (!passage) {
      throw new AdapterError('HelloAO', `No verses found for ${formatReference(ref)}`);
    }

    return {
      reference: formatReference(ref),
      translation: key,
      ...passage,
      citation: { source: meta.name, copyright: meta.copyright, url: meta.url },
    };
  }

  isConfigured(): boolean {
    return true;
  }

  getCopyright(translation: string): string {
    return TRANSLATIONS[translation.toUpperCase()]?.copyright ?? 'Public Domain';
  }

  /** Also used by commentary adapter */
  getClient(): HttpClient {
    return this.client;
  }

  private decodePassage(
    data: unknown,
    ref: BibleReference,
    hao: ReturnType<typeof toHelloAO>,
    translationId: string,
    includeFootnotes?: boolean,
  ): Pick<BibleResult, 'text' | 'footnotes'> | undefined {
    if (!isRecord(data) || !isRecord(data.chapter) || !Array.isArray(data.chapter.content)) {
      throw new AdapterError('HelloAO', 'Malformed Bible chapter payload.');
    }
    const { translation, book, chapter } = data;
    if ((translation != null && !isRecord(translation)) || (book != null && !isRecord(book))) {
      throw new AdapterError('HelloAO', 'Malformed Bible chapter metadata.');
    }
    if (isRecord(translation) && translation.id != null && translation.id !== translationId) {
      throw new AdapterError('HelloAO', 'Provider returned a different translation.');
    }
    if (isRecord(book) && ((book.id != null && book.id !== hao.bookCode)
      || (book.number != null && providerNumber(book.number) !== ref.book.number))) {
      throw new AdapterError('HelloAO', 'Provider returned a different book.');
    }
    if (chapter.number != null && providerNumber(chapter.number) !== ref.chapter) {
      throw new AdapterError('HelloAO', 'Provider returned a different chapter.');
    }

    const verses: Array<{ number: number; content: VerseContent[] }> = [];
    for (const item of data.chapter.content as unknown[]) {
      if (!isRecord(item) || typeof item.type !== 'string') {
        throw new AdapterError('HelloAO', 'Malformed Bible chapter entry.');
      }
      if (item.type !== 'verse') continue;

      const { number, content } = item;
      const verseNumber = providerNumber(number);
      if (!Number.isSafeInteger(verseNumber) || verseNumber < 1 || !Array.isArray(content)
        || !content.every(fragment => typeof fragment === 'string'
          || (isRecord(fragment) && (!('text' in fragment) || typeof fragment.text === 'string')))) {
        throw new AdapterError('HelloAO', 'Malformed Bible verse entry.');
      }
      if (hao.verse == null || (verseNumber >= hao.verse && verseNumber <= (hao.endVerse ?? hao.verse))) {
        verses.push({ number: verseNumber, content });
      }
    }

    if (chapter.footnotes != null && !Array.isArray(chapter.footnotes)) {
      throw new AdapterError('HelloAO', 'Malformed Bible chapter footnotes.');
    }
    if (verses.length === 0) return undefined;
    if (hao.verse != null) {
      const returned = new Set(verses.map(verse => verse.number));
      for (let verse = hao.verse; verse <= (hao.endVerse ?? hao.verse); verse++) {
        if (!returned.has(verse)) return undefined;
      }
    }
    const text = verses.map(verse => this.extractVerseText(verse.content)).join(' ');
    if (!text.trim()) throw new APIError(502, 'Bible provider returned an empty passage.');
    const footnotes = includeFootnotes && Array.isArray(chapter.footnotes)
      ? this.extractFootnotes(chapter.footnotes, hao.verse, hao.endVerse)
      : undefined;
    return { text, footnotes };
  }

  private extractVerseText(content: VerseContent[]): string {
    let text = '';
    for (const item of content) {
      if (typeof item === 'string') {
        text = this.appendFragment(text, item);
      } else if ('lineBreak' in item) {
        text = `${text.trimEnd()}\n`;
      } else if ('text' in item) {
        text = this.appendFragment(text, item.text);
      }
    }
    return text.trim();
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

  private extractFootnotes(footnotes: unknown[], startVerse?: number, endVerse?: number): Footnote[] {
    const result: Footnote[] = [];
    for (const note of footnotes) {
      if (!isRecord(note) || !isRecord(note.reference)) {
        throw new AdapterError('HelloAO', 'Malformed Bible chapter footnote.');
      }
      const { chapter, verse } = note.reference;
      if (typeof verse !== 'number' || !Number.isSafeInteger(verse)) {
        throw new AdapterError('HelloAO', 'Malformed Bible chapter footnote.');
      }
      if (startVerse && (verse < startVerse || verse > (endVerse ?? startVerse))) continue;
      const { noteId, caller, text } = note;
      if (typeof noteId !== 'number' || typeof caller !== 'string' || typeof text !== 'string'
        || typeof chapter !== 'number' || !Number.isSafeInteger(chapter)) {
        throw new AdapterError('HelloAO', 'Malformed Bible chapter footnote.');
      }
      result.push({ id: noteId, caller, text, reference: { ...note.reference, chapter, verse } });
    }
    return result;
  }
}
