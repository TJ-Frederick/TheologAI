import {
  provenanceFromCitation,
  type ProvenanceRecord,
} from '../kernel/provenance.js';
import type { StrongsEntry } from '../kernel/repositories.js';
import type { EnhancedStrongsResult } from '../kernel/types.js';
import type { CorpusUsageResult } from '../kernel/types.js';
import type {
  OriginalLanguageEntryV1,
  OriginalLanguageExtendedV1,
  OriginalLanguageOutputV1,
} from '../mcp/schemas/originalLanguage.js';
import { summarizeDefinition } from '../formatters/languagesFormatter.js';
import { normalizeLexiconText } from '../kernel/lexiconText.js';
import { MORPHOLOGY_USAGE_IDENTITY } from '../kernel/morphologyUsageCursor.js';

const STRONGS_CITATION = {
  source: "Strong's Concordance",
  copyright: 'Public Domain (OpenScriptures)',
  url: 'https://github.com/openscriptures/strongs',
};

/** Present search hits without coupling the repository entry to MCP output. */
export function presentOriginalLanguageSearch(
  query: string,
  results: StrongsEntry[],
): OriginalLanguageOutputV1 {
  const provenance: ProvenanceRecord[] = [strongsProvenance()];
  const entries = results.map(entry => ({
    strongsNumber: entry.strongs_number,
    language: languageFor(entry.testament),
    testament: entry.testament,
    lemma: nullableText(entry.lemma),
    ...(entry.transliteration ? { transliteration: entry.transliteration } : {}),
    ...(entry.pronunciation ? { pronunciation: entry.pronunciation } : {}),
    definition: nullableText(summarizeDefinition(entry.definition)),
    provenanceIds: ['src-1'],
  }));

  return {
    schemaVersion: '1',
    kind: 'original_language_lookup',
    mode: 'search',
    query,
    detailLevel: 'summary',
    entries,
    ...(results.length === 1 ? {
      nextStep: {
        tool: 'original_language_lookup' as const,
        arguments: {
          strongs_number: results[0].strongs_number,
          detail_level: 'detailed' as const,
          include_extended: true as const,
        },
      },
    } : {}),
    provenance,
  };
}

/** Present an exact lookup with progressive summary/detail disclosure. */
export function presentOriginalLanguageEntry(
  result: EnhancedStrongsResult,
  detailLevel: 'simple' | 'detailed',
  corpusUsage?: CorpusUsageResult,
): OriginalLanguageOutputV1 {
  const stepBibleBase = result.sourceKind === 'stepbible_lexicon';
  const base = provenanceFromCitation(result.citation, {
    id: 'src-1',
    kind: 'lexicon',
    status: 'verified_source',
    license: stepBibleBase ? {
      label: 'CC BY 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    } : { label: 'Public Domain' },
    attribution: stepBibleBase ? 'Tyndale House, Cambridge' : 'OpenScriptures',
  });
  const provenance: ProvenanceRecord[] = [base];
  const provenanceIds = [base.id];

  if (result.extended && result.extendedCitation) {
    const extended = provenanceFromCitation(result.extendedCitation, {
      id: 'src-2',
      kind: 'lexicon',
      status: 'verified_source',
      license: {
        label: 'CC BY 4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
      attribution: 'Tyndale House, Cambridge',
    });
    provenance.push(extended);
    provenanceIds.push(extended.id);
  }

  if (corpusUsage) provenance.push(morphologyUsageProvenance());

  const extended = result.extended;
  const entry: OriginalLanguageEntryV1 = {
    strongsNumber: result.strongs_number,
    language: result.language ?? languageFor(result.testament, result.strongs_number),
    testament: result.testament,
    lemma: nullableText(result.lemma),
    ...(result.transliteration ? { transliteration: result.transliteration } : {}),
    ...(result.pronunciation ? { pronunciation: result.pronunciation } : {}),
    ...(extended?.gloss ? { gloss: extended.gloss } : {}),
    definition: nullableText(result.definition),
    ...(detailLevel === 'detailed' && result.derivation ? { derivation: result.derivation } : {}),
    ...(extended ? { extended: presentExtended(extended) } : {}),
    provenanceIds,
  };

  return {
    schemaVersion: '1',
    kind: 'original_language_lookup',
    mode: 'entry',
    detailLevel: detailLevel === 'detailed' ? 'detailed' : 'summary',
    entries: [entry],
    ...(corpusUsage ? { corpusUsage: { ...corpusUsage, provenanceIds: ['src-usage'] } } : {}),
    provenance,
  };
}

function morphologyUsageProvenance(): ProvenanceRecord {
  return {
    id: 'src-usage',
    kind: 'morphology_dataset',
    label: 'Corrected STEPBible morphology corpus',
    url: 'https://github.com/STEPBible/STEPBible-Data',
    license: { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    rightsNotice: 'CC BY 4.0 (Tyndale House, Cambridge)',
    attribution: 'Tyndale House, Cambridge',
    version: MORPHOLOGY_USAGE_IDENTITY,
    status: 'verified_source',
    note: 'Counts are derived from exact corrected morphology tokens and are distinct from lexicon occurrence metadata.',
  };
}

function presentExtended(extended: NonNullable<EnhancedStrongsResult['extended']>): OriginalLanguageExtendedV1 {
  const definition = extended.definition
    ? normalizeLexiconText(extended.definition)
    : '';

  return {
    ...(extended.strongsExtended ? { strongsExtended: extended.strongsExtended } : {}),
    ...(extended.morphologyCode ? { morphologyCode: extended.morphologyCode } : {}),
    ...(extended.source ? { lexicon: extended.source } : {}),
    ...(definition ? { definition } : {}),
    ...(extended.occurrences !== undefined ? { occurrences: extended.occurrences } : {}),
    ...(extended.senses ? {
      senses: Object.values(extended.senses).map(sense => ({
        gloss: sense.gloss,
        usage: sense.usage,
        count: sense.count,
      })),
    } : {}),
  };
}

function strongsProvenance(): ProvenanceRecord {
  return provenanceFromCitation(STRONGS_CITATION, {
    id: 'src-1',
    kind: 'lexicon',
    status: 'verified_source',
    license: { label: 'Public Domain' },
    attribution: 'OpenScriptures',
  });
}

function languageFor(testament: 'OT' | 'NT' | null, strongsNumber?: string): 'Greek' | 'Hebrew' {
  if (testament === 'NT') return 'Greek';
  if (testament === 'OT') return 'Hebrew';
  return strongsNumber?.startsWith('H') ? 'Hebrew' : 'Greek';
}

function nullableText(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
