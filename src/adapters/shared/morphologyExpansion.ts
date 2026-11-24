import type { ExpandedMorphWord, MorphWord } from '../../kernel/repositories.js';
import { expandHebrewMorphCode } from './hebrewMorphExpander.js';

export const EXPANDED_VERSE_MORPHOLOGY_SQL = `SELECT m.position, m.word_text, m.lemma,
  m.strongs_number, m.morph_code, m.gloss, c.expansion AS stored_expansion
  FROM morphology m
  LEFT JOIN morph_codes c ON c.code = m.morph_code
  WHERE m.book = ? AND m.chapter = ? AND m.verse = ?
  ORDER BY m.position`;

export interface ExpandedMorphologyDatabaseRow extends MorphWord {
  stored_expansion: string | null;
}

export function mapExpandedMorphologyRow({
  stored_expansion,
  ...word
}: ExpandedMorphologyDatabaseRow): ExpandedMorphWord {
  return {
    ...word,
    expansion: word.morph_code ? stored_expansion ?? expandHebrewMorphCode(word.morph_code) : undefined,
  };
}
