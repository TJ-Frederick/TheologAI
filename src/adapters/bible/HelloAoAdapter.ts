/**
 * HelloAO Bible adapter — merges helloaoBibleAdapter + helloaoApi.
 *
 * Handles KJV, WEB, BSB, ASV, YLT, DBY translations via bible.helloao.org.
 * Uses kernel reference for book resolution; shared HttpClient for caching.
 */

import type { BibleAdapter } from './BibleAdapter.js';
import type { BibleResult, Footnote } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';
import { formatReference, toHelloAO } from '../../kernel/reference.js';
import { HttpClient } from '../shared/HttpClient.js';
import { AdapterError } from '../../kernel/errors.js';

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

export class HelloAoAdapter implements BibleAdapter {
  readonly supportedTranslations = Object.keys(TRANSLATIONS);
  private client: HttpClient;

  constructor() {
    this.client = new HttpClient({
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
    const data = await this.client.getJSON<any>(`/${meta.id}/${hao.bookCode}/${hao.chapter}.json`);

    // Extract verses
    const verses = this.extractVerses(data.chapter.content, hao.verse, hao.endVerse);
    if (verses.length === 0) {
      throw new AdapterError('HelloAO', `No verses found for ${formatReference(ref)}`);
    }

    const text = verses.map(v => this.extractVerseText(v.content)).join(' ');

    let footnotes: Footnote[] | undefined;
    if (options?.includeFootnotes && data.chapter.footnotes) {
      footnotes = this.extractFootnotes(data.chapter.footnotes, hao.verse, hao.endVerse);
    }

    return {
      reference: formatReference(ref),
      translation: key,
      text,
      footnotes,
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

  private extractVerses(content: any[], startVerse?: number, endVerse?: number): any[] {
    const allVerses = content.filter((item: any) => item.type === 'verse');
    if (!startVerse) return allVerses;
    const end = endVerse ?? startVerse;
    return allVerses.filter((v: any) => v.number >= startVerse && v.number <= end);
  }

  private extractVerseText(content: VerseContent[]): string {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === 'string') parts.push(item);
      else if ('lineBreak' in item) parts.push('\n');
      else if ('text' in item) parts.push(item.text);
    }
    return parts.join('').trim();
  }

  private extractFootnotes(footnotes: any[], startVerse?: number, endVerse?: number): Footnote[] {
    const filtered = startVerse
      ? footnotes.filter((n: any) => {
          const v = n.reference?.verse;
          return v >= startVerse && v <= (endVerse ?? startVerse);
        })
      : footnotes;

    return filtered.map((n: any) => ({
      id: n.noteId,
      caller: n.caller,
      text: n.text,
      reference: n.reference,
    }));
  }
}
