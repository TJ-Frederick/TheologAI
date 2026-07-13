import { parseStrongsIdentity } from '../src/kernel/strongs.js';

export interface MorphologyLemmaLexiconEntry {
  lemma?: unknown;
}

/**
 * Preserve an upstream token lemma when one exists. Hebrew TAHOT rows in the
 * tracked corpus omit that column, so fill only from the exact Strong's
 * identity in the separately tracked STEPBible Hebrew lexicon. An unresolved
 * identity remains blank; token text and English glosses are never promoted to
 * lemmas.
 */
export function resolveMorphologyLemma(
  sourceLemma: unknown,
  strongsNumber: unknown,
  testament: 'OT' | 'NT',
  hebrewLexicon: Readonly<Record<string, MorphologyLemmaLexiconEntry>>,
): string {
  if (typeof sourceLemma === 'string' && sourceLemma.trim()) return sourceLemma;
  if (testament !== 'OT' || typeof strongsNumber !== 'string') return '';

  const identity = parseStrongsIdentity(strongsNumber);
  if (!identity || identity.prefix !== 'H') return '';
  const lemma = hebrewLexicon[identity.morphologyKey]?.lemma;
  return typeof lemma === 'string' ? lemma.trim() : '';
}
