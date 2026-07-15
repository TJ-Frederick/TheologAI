import { createStepBibleProvenance } from '../kernel/stepBibleSource.js';
import type { VerseMorphologyResult } from '../kernel/types.js';
import {
  VERSE_MORPHOLOGY_MAX_WORDS,
  type VerseMorphologyOutputV1,
} from '../mcp/schemas/verseMorphology.js';

const MORPHOLOGY_SOURCE_ID = 'stepbible-morphology';
const HEBREW_LEMMA_SOURCE_ID = 'stepbible-lexicon';

/** Present the verse morphology result without changing its legacy Markdown view. */
export function presentVerseMorphologyStructured(
  result: VerseMorphologyResult,
): VerseMorphologyOutputV1 {
  if (result.words.length > VERSE_MORPHOLOGY_MAX_WORDS) {
    throw new RangeError(
      `Verse morphology result exceeds the ${VERSE_MORPHOLOGY_MAX_WORDS}-word structured output limit`,
    );
  }

  const morphologyProvenance = createStepBibleProvenance({
    id: MORPHOLOGY_SOURCE_ID,
    kind: 'morphology_dataset',
    label: result.citation.source,
    rightsNotice: result.citation.copyright,
    locator: result.reference,
  });
  const hasPresentedLemma = result.words.some(word => nullableText(word.lemma) !== null);
  const hebrewLemmaProvenance = result.testament === 'OT'
    && hasPresentedLemma
    && result.lemmaCitation
    ? createStepBibleProvenance({
      id: HEBREW_LEMMA_SOURCE_ID,
      kind: 'lexicon',
      label: result.lemmaCitation.source,
      rightsNotice: result.lemmaCitation.copyright,
      locator: result.reference,
    })
    : undefined;

  return {
    schemaVersion: '1',
    kind: 'bible_verse_morphology',
    reference: result.reference,
    testament: result.testament,
    language: result.testament === 'NT' ? 'Greek' : 'Hebrew',
    book: result.book,
    chapter: result.chapter,
    verse: result.verse,
    words: result.words.map(word => {
      const lemma = nullableText(word.lemma);
      return {
        position: word.position,
        text: nullableText(word.text),
        lemma,
        strongsNumber: nullableText(word.strong),
        morphologyCode: nullableText(word.morph),
        morphologyExpansion: nullableText(word.morphExpanded),
        gloss: nullableText(word.gloss),
        provenanceIds: [MORPHOLOGY_SOURCE_ID],
        lemmaProvenanceIds: lemma === null
          ? []
          : [hebrewLemmaProvenance ? HEBREW_LEMMA_SOURCE_ID : MORPHOLOGY_SOURCE_ID],
      };
    }),
    provenance: [
      morphologyProvenance,
      ...(hebrewLemmaProvenance ? [hebrewLemmaProvenance] : []),
    ],
  };
}

function nullableText(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
