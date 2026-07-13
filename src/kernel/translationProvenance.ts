import type { BibleResult } from './types.js';
import type { ProvenanceContext } from './provenance.js';

type TranslationContext = Pick<ProvenanceContext, 'attribution' | 'note'>;

const TRANSLATION_CONTEXTS: Readonly<Record<string, TranslationContext>> = Object.freeze({
  ESV: {
    attribution: 'Crossway',
    note: 'Copyrighted translation delivered through the official ESV API. No open-content license is asserted.',
  },
  NET: {
    attribution: 'Biblical Studies Press, L.L.C.',
    note: 'Copyrighted translation delivered through the NET Bible API. No open-content license is asserted.',
  },
});

/** Add only publisher facts supported by the adapters' official source records. */
export function translationProvenanceContext(
  result: Pick<BibleResult, 'translation'>,
): TranslationContext | undefined {
  return TRANSLATION_CONTEXTS[result.translation.toUpperCase()];
}
