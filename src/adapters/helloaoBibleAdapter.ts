/**
 * HelloAO Bible Translation Adapter
 *
 * Provides access to 1000+ Bible translations from bible.helloao.org
 * with support for footnotes and multiple English translations.
 */

import { HelloAOApiAdapter, HelloAOChapterResponse, HelloAOVerse } from './helloaoApi.js';
import { mapReferenceToHelloAO } from '../utils/helloaoMapper.js';
import { BibleResult, Footnote } from '../types/index.js';

/**
 * Translation metadata for HelloAO Bible translations
 */
interface TranslationMetadata {
  id: string;
  name: string;
  shortName: string;
  url: string;
  copyright: string;
}

/**
 * Popular English Bible translations available from HelloAO
 */
const HELLOAO_TRANSLATIONS: Record<string, TranslationMetadata> = {
  'KJV': {
    id: 'eng_kjv',
    name: 'King James Version',
    shortName: 'KJV',
    url: 'https://www.kingjamesbibleonline.org/',
    copyright: 'Public Domain'
  },
  'WEB': {
    id: 'ENGWEBP',
    name: 'World English Bible',
    shortName: 'WEB',
    url: 'https://worldenglish.bible/',
    copyright: 'Public Domain'
  },
  'BSB': {
    id: 'BSB',
    name: 'Berean Standard Bible',
    shortName: 'BSB',
    url: 'https://berean.bible/',
    copyright: 'Public Domain'
  },
  'ASV': {
    id: 'eng_asv',
    name: 'American Standard Version',
    shortName: 'ASV',
    url: 'https://www.biblegateway.com/versions/American-Standard-Version-ASV-Bible/',
    copyright: 'Public Domain (1901)'
  },
  'YLT': {
    id: 'eng_ylt',
    name: "Young's Literal Translation",
    shortName: 'YLT',
    url: 'https://www.biblestudytools.com/ylt/',
    copyright: 'Public Domain'
  },
  'DBY': {
    id: 'eng_dby',
    name: 'Darby Translation',
    shortName: 'DBY',
    url: 'https://www.biblestudytools.com/dby/',
    copyright: 'Public Domain'
  }
};

/**
 * HelloAO Bible Translation Adapter
 */
export class HelloAOBibleAdapter {
  private api: HelloAOApiAdapter;

  constructor() {
    this.api = new HelloAOApiAdapter();
  }

  /**
   * Check if a translation is supported
   */
  isSupported(translation: string): boolean {
    return translation.toUpperCase() in HELLOAO_TRANSLATIONS;
  }

  /**
   * Get list of supported translations
   */
  getSupportedTranslations(): string[] {
    return Object.keys(HELLOAO_TRANSLATIONS);
  }

  /**
   * Get passage from HelloAO API
   *
   * @param reference - Bible reference (e.g., "John 3:16", "Genesis 1:1-3")
   * @param translation - Translation code (e.g., "KJV", "WEB", "BSB")
   * @param includeFootnotes - Whether to include footnotes (default: false)
   */
  async getPassage(
    reference: string,
    translation: string = 'KJV',
    includeFootnotes: boolean = false
  ): Promise<BibleResult> {
    // Validate translation
    const translationKey = translation.toUpperCase();
    if (!this.isSupported(translationKey)) {
      throw new Error(
        `Translation "${translation}" not supported. ` +
        `Available: ${this.getSupportedTranslations().join(', ')}`
      );
    }

    const metadata = HELLOAO_TRANSLATIONS[translationKey];

    // Parse reference
    const parsed = mapReferenceToHelloAO(reference);

    // Fetch chapter from HelloAO API
    // Note: Translations use book codes (e.g., "1JN") not full names (e.g., "1 John")
    const chapterResponse = await this.api.getTranslationChapter(
      metadata.id,
      parsed.bookCode,
      parsed.chapter
    );

    // Extract verse(s)
    const verses = this.extractVerses(chapterResponse, parsed.verse, parsed.endVerse);

    if (verses.length === 0) {
      throw new Error(`No verses found for reference: ${reference}`);
    }

    // Build verse text
    const verseTexts: string[] = [];
    for (const verse of verses) {
      const text = HelloAOApiAdapter.extractVerseText(verse.content);
      verseTexts.push(text);
    }

    // Extract footnotes if requested
    let footnotes: Footnote[] | undefined;
    if (includeFootnotes) {
      footnotes = this.extractFootnotesForVerses(
        chapterResponse,
        parsed.verse,
        parsed.endVerse
      );
    }

    // Format canonical reference
    const canonicalRef = this.formatCanonicalReference(
      parsed.book,
      parsed.chapter,
      parsed.verse,
      parsed.endVerse
    );

    return {
      reference: canonicalRef,
      translation: translationKey,
      text: verseTexts.join(' '),
      footnotes,
      citation: {
        source: metadata.name,
        copyright: metadata.copyright,
        url: metadata.url
      }
    };
  }

  /**
   * Extract verses from chapter response
   */
  private extractVerses(
    chapterResponse: HelloAOChapterResponse,
    startVerse?: number,
    endVerse?: number
  ): HelloAOVerse[] {
    const verses: HelloAOVerse[] = [];

    // If no verse specified, return all verses
    if (!startVerse) {
      for (const item of chapterResponse.chapter.content) {
        if ('type' in item && item.type === 'verse') {
          verses.push(item as HelloAOVerse);
        }
      }
      return verses;
    }

    // Extract specific verse range
    const start = startVerse;
    const end = endVerse || startVerse;

    for (const item of chapterResponse.chapter.content) {
      if ('type' in item && item.type === 'verse') {
        const verse = item as HelloAOVerse;
        if (verse.number >= start && verse.number <= end) {
          verses.push(verse);
        }
      }
    }

    return verses;
  }

  /**
   * Extract footnotes for a verse range
   */
  private extractFootnotesForVerses(
    chapterResponse: HelloAOChapterResponse,
    startVerse?: number,
    endVerse?: number
  ): Footnote[] {
    const allFootnotes = chapterResponse.chapter.footnotes || [];

    // If no verse specified, return all footnotes
    if (!startVerse) {
      return allFootnotes.map(note => ({
        id: note.noteId,
        caller: note.caller,
        text: note.text,
        reference: note.reference
      }));
    }

    // Filter by verse range
    const start = startVerse;
    const end = endVerse || startVerse;

    return allFootnotes
      .filter(note => note.reference.verse >= start && note.reference.verse <= end)
      .map(note => ({
        id: note.noteId,
        caller: note.caller,
        text: note.text,
        reference: note.reference
      }));
  }

  /**
   * Format canonical reference
   */
  private formatCanonicalReference(
    book: string,
    chapter: number,
    startVerse?: number,
    endVerse?: number
  ): string {
    let ref = `${book} ${chapter}`;

    if (startVerse) {
      ref += `:${startVerse}`;
      if (endVerse && endVerse !== startVerse) {
        ref += `-${endVerse}`;
      }
    }

    return ref;
  }

  /**
   * Get copyright notice for a translation
   */
  getCopyrightNotice(translation: string): string {
    const metadata = HELLOAO_TRANSLATIONS[translation.toUpperCase()];
    return metadata ? metadata.copyright : 'Public Domain';
  }
}
