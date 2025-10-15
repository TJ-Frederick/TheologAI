/**
 * HelloAO Bible API Adapter
 *
 * Provides access to bible.helloao.org - a free, unlimited Bible API with:
 * - 1000+ Bible translations in JSON format
 * - 6 public domain commentaries (Matthew Henry, JFB, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale)
 * - Zero API keys, zero rate limits, zero cost
 * - Verse-level structured data with footnotes
 *
 * API Documentation: https://bible.helloao.org/docs/
 */

/**
 * Translation metadata from HelloAO API
 */
export interface HelloAOTranslation {
  id: string;
  name: string;
  englishName: string;
  website: string;
  licenseUrl: string;
  shortName: string;
  language: string;
  textDirection: string;
  availableFormats: string[];
  listOfBooksApiLink: string;
  numberOfBooks: number;
  totalNumberOfChapters: number;
  totalNumberOfVerses: number;
  languageName: string;
  languageEnglishName: string;
}

/**
 * Commentary metadata from HelloAO API
 */
export interface HelloAOCommentary {
  id: string;
  name: string;
  englishName: string;
  language: string;
  textDirection: string;
  numberOfBooks: number;
  totalNumberOfChapters: number;
  listOfBooksApiLink: string;
  languageName: string;
  languageEnglishName: string;
}

/**
 * Book information
 */
export interface HelloAOBook {
  id: string;
  name: string;
  commonName: string;
  title: string;
  order: number;
  numberOfChapters: number;
  totalNumberOfVerses: number;
  firstChapterApiLink: string;
}

/**
 * Verse content element (text or formatting)
 */
export type VerseContent =
  | string
  | { lineBreak: true }
  | { noteId: number }
  | { text: string; wordsOfJesus?: boolean };

/**
 * Verse data structure
 */
export interface HelloAOVerse {
  type: 'verse';
  number: number;
  content: VerseContent[];
}

/**
 * Footnote structure
 */
export interface HelloAOFootnote {
  noteId: number;
  text: string;
  caller: string;
  reference: {
    chapter: number;
    verse: number;
  };
}

/**
 * Chapter response from translation
 */
export interface HelloAOChapterResponse {
  translation: {
    id: string;
    name: string;
    website: string;
    licenseUrl: string;
  };
  book: {
    id: string;
    name: string;
    commonName: string;
  };
  thisChapterAudioLinks: Record<string, string>;
  nextChapterApiLink: string | null;
  previousChapterApiLink: string | null;
  numberOfVerses: number;
  chapter: {
    number: number;
    content: Array<HelloAOVerse | { type: 'heading' | 'line_break'; content?: string[] }>;
    footnotes: HelloAOFootnote[];
  };
}

/**
 * Commentary verse annotation
 */
export interface CommentaryAnnotation {
  type: 'text' | 'heading';
  content: string[];
}

/**
 * Commentary chapter response
 */
export interface HelloAOCommentaryResponse {
  commentary: {
    id: string;
    name: string;
  };
  book: {
    id: string;
    name: string;
    commonName: string;
  };
  nextChapterApiLink: string | null;
  previousChapterApiLink: string | null;
  chapter: {
    number: number;
    content: Array<{
      verseNumber: number;
      content: CommentaryAnnotation[];
    }>;
  };
}

/**
 * HelloAO Bible API Adapter
 */
export class HelloAOApiAdapter {
  private readonly baseUrl = 'https://bible.helloao.org/api';

  /**
   * Get list of available translations
   */
  async getAvailableTranslations(): Promise<{ translations: HelloAOTranslation[] }> {
    const url = `${this.baseUrl}/available_translations.json`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HelloAO API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch available translations: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get list of available commentaries
   */
  async getAvailableCommentaries(): Promise<{ commentaries: HelloAOCommentary[] }> {
    const url = `${this.baseUrl}/available_commentaries.json`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HelloAO API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch available commentaries: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get chapter from a translation
   *
   * @param translation - Translation ID (e.g., 'WEB', 'BSB')
   * @param book - Book name (e.g., 'Genesis', 'John')
   * @param chapter - Chapter number
   */
  async getTranslationChapter(
    translation: string,
    book: string,
    chapter: number
  ): Promise<HelloAOChapterResponse> {
    const url = `${this.baseUrl}/${translation}/${book}/${chapter}.json`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HelloAO API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch ${translation} ${book} ${chapter}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get chapter from a commentary
   *
   * @param commentary - Commentary ID (e.g., 'matthew-henry', 'jamieson-fausset-brown')
   * @param book - Book name (e.g., 'Genesis', 'John')
   * @param chapter - Chapter number
   */
  async getCommentaryChapter(
    commentary: string,
    book: string,
    chapter: number
  ): Promise<HelloAOCommentaryResponse> {
    const url = `${this.baseUrl}/c/${commentary}/${book}/${chapter}.json`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HelloAO API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch ${commentary} ${book} ${chapter}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Extract verse text from verse content array
   * Handles mixed content (text strings, line breaks, footnote markers, wordsOfJesus objects)
   */
  static extractVerseText(content: VerseContent[]): string {
    const textParts: string[] = [];

    for (const item of content) {
      if (typeof item === 'string') {
        textParts.push(item);
      } else if ('lineBreak' in item) {
        textParts.push('\n');
      } else if ('text' in item) {
        // Handle { text: string, wordsOfJesus?: boolean } format
        textParts.push(item.text);
      }
      // Skip footnote markers ({ noteId: number })
    }

    return textParts.join('').trim();
  }

  /**
   * Extract verse from chapter response
   */
  static getVerseFromChapter(
    chapterResponse: HelloAOChapterResponse,
    verseNumber: number
  ): HelloAOVerse | undefined {
    return chapterResponse.chapter.content.find(
      (item): item is HelloAOVerse =>
        'type' in item && item.type === 'verse' && item.number === verseNumber
    );
  }

  /**
   * Extract commentary for a specific verse
   * Handles different commentary formats:
   * - Format 1: { verseNumber, content: [{ type, content }] } - annotation objects
   * - Format 2: { type: 'verse', number, content: [strings] } - string arrays
   *
   * Falls back to sectional commentary when exact verse not found
   * (e.g., Matthew Henry often groups multiple verses together)
   */
  static getCommentaryForVerse(
    commentaryResponse: any,
    verseNumber: number
  ): string | undefined {
    // Try exact match first
    let verseEntry = commentaryResponse.chapter.content.find((item: any) => {
      // Format 1: { verseNumber, content: [{ type, content }] }
      if ('verseNumber' in item) {
        return item.verseNumber === verseNumber;
      }
      // Format 2: { type: 'verse', number, content: [strings] }
      if (item.type === 'verse' && 'number' in item) {
        return item.number === verseNumber;
      }
      return false;
    });

    // If no exact match, find the section that likely contains this verse
    // (Find the verse entry with the highest number ≤ requested verse)
    if (!verseEntry) {
      const candidates = commentaryResponse.chapter.content.filter((item: any) => {
        const itemVerseNum = 'verseNumber' in item ? item.verseNumber : item.number;
        return itemVerseNum && itemVerseNum <= verseNumber;
      });

      if (candidates.length > 0) {
        // Sort by verse number descending, take the closest one
        verseEntry = candidates.sort((a: any, b: any) => {
          const aNum = 'verseNumber' in a ? a.verseNumber : a.number;
          const bNum = 'verseNumber' in b ? b.verseNumber : b.number;
          return bNum - aNum;
        })[0];
      }
    }

    if (!verseEntry) {
      return undefined;
    }

    const textParts: string[] = [];

    // Format 1: content is array of annotation objects
    if (verseEntry.content && Array.isArray(verseEntry.content)) {
      const first = verseEntry.content[0];

      // Check if content contains annotation objects
      if (first && typeof first === 'object' && 'type' in first) {
        for (const annotation of verseEntry.content) {
          if (annotation.type === 'heading') {
            textParts.push(`**${annotation.content.join(' ')}**`);
          } else if (annotation.type === 'text') {
            textParts.push(annotation.content.join(' '));
          }
        }
      }
      // Format 2: content is array of strings
      else {
        for (const item of verseEntry.content) {
          if (typeof item === 'string') {
            textParts.push(item);
          }
        }
      }
    }

    return textParts.length > 0 ? textParts.join('\n\n') : undefined;
  }

  /**
   * Get footnotes for a verse
   */
  static getFootnotesForVerse(
    chapterResponse: HelloAOChapterResponse,
    verseNumber: number
  ): HelloAOFootnote[] {
    return chapterResponse.chapter.footnotes.filter(
      note => note.reference.verse === verseNumber
    );
  }
}
