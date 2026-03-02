/**
 * Verse morphology service using SQLite repository.
 */

import type { MorphologyRepository, MorphWord } from '../../adapters/data/MorphologyRepository.js';
import type { VerseMorphologyResult, VerseWord, Citation } from '../../kernel/types.js';
import { parseReference, toStepBible, formatReference } from '../../kernel/reference.js';
import { NotFoundError } from '../../kernel/errors.js';

const CITATION: Citation = {
  source: 'STEPBible TAGNT/TAHOT',
  copyright: 'CC BY 4.0 (Tyndale House, Cambridge)',
  url: 'https://github.com/STEPBible/STEPBible-Data',
};

export class MorphologyService {
  constructor(private repo: MorphologyRepository) {}

  /** Get word-by-word morphology for a verse */
  async getVerseMorphology(reference: string, expandMorphology?: boolean): Promise<VerseMorphologyResult> {
    const ref = parseReference(reference);
    if (!ref.startVerse) {
      throw new NotFoundError('verse', `Please provide a specific verse, not just a chapter: "${reference}"`);
    }

    const sb = toStepBible(ref);
    const words = await this.repo.getVerseMorphology(sb.book, ref.chapter, ref.startVerse);

    if (words.length === 0) {
      throw new NotFoundError('morphology', `No morphology data for ${formatReference(ref)}`);
    }

    const verseWords: VerseWord[] = [];
    for (const w of words) {
      const vw: VerseWord = {
        position: w.position,
        text: w.word_text,
        lemma: w.lemma,
        strong: w.strongs_number ?? '',
        morph: w.morph_code ?? '',
        gloss: w.gloss ?? '',
      };

      if (expandMorphology && w.morph_code) {
        vw.morphExpanded = await this.repo.expandMorphCode(w.morph_code);
      }

      verseWords.push(vw);
    }

    return {
      reference: formatReference(ref),
      testament: ref.book.testament,
      book: ref.book.name,
      chapter: ref.chapter,
      verse: ref.startVerse,
      words: verseWords,
      citation: CITATION,
    };
  }

  /** List available books with morphology data */
  async getAvailableBooks(): Promise<string[]> {
    return await this.repo.getAvailableBooks();
  }
}
