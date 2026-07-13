/**
 * Strong's concordance service using SQLite repository.
 */

import type { IMorphologyRepository, IStrongsRepository, StrongsEntry } from '../../kernel/repositories.js';
import type { StrongsResult, EnhancedStrongsResult, Citation, CorpusUsageLevel, CorpusUsageResult } from '../../kernel/types.js';
import { ValidationError, NotFoundError } from '../../kernel/errors.js';
import { parseStrongsIdentity } from '../../kernel/strongs.js';
import { normalizeLexiconText } from '../../kernel/lexiconText.js';
import {
  decodeMorphologyUsageCursor,
  encodeMorphologyUsageCursor,
  MORPHOLOGY_CORPUS_IDENTITY,
} from '../../kernel/morphologyUsageCursor.js';

const CITATION: Citation = {
  source: "Strong's Concordance",
  copyright: 'Public Domain (OpenScriptures)',
  url: 'https://github.com/openscriptures/strongs',
};

const STEP_BIBLE_CITATION: Citation = {
  source: 'STEPBible lexicon data',
  copyright: 'CC BY 4.0 (Tyndale House, Cambridge)',
  url: 'https://github.com/STEPBible/STEPBible-Data',
};

interface StepBibleLexiconData {
  extendedStrongs?: unknown;
  gloss?: unknown;
  definition?: unknown;
  morph?: unknown;
  source?: unknown;
  senses?: unknown;
  lemma?: unknown;
  translit?: unknown;
}

export class StrongsService {
  constructor(
    private repo: IStrongsRepository,
    private morphologyRepo?: IMorphologyRepository,
  ) {}

  /** Look up a Strong's number */
  async lookup(strongsNumber: string, includeExtended?: boolean): Promise<EnhancedStrongsResult> {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) {
      throw new ValidationError('strongs_number', `Invalid Strong's number format: ${strongsNumber}. Expected G#### or H####.`);
    }

    const entry = await this.repo.lookup(identity.publicId);
    const lexicon = !entry || includeExtended
      ? await this.repo.getLexiconEntry(identity.publicId)
      : undefined;
    if (!entry && !lexicon) throw new NotFoundError('strongs', `Strong's number ${identity.publicId} not found`);

    if (!entry) return resultFromStepBible(identity.publicId, identity.prefix, lexicon!, includeExtended === true);

    const result: EnhancedStrongsResult = {
      strongs_number: entry.strongs_number,
      testament: entry.testament as 'OT' | 'NT',
      lemma: entry.lemma,
      transliteration: entry.transliteration ?? undefined,
      pronunciation: entry.pronunciation ?? undefined,
      definition: entry.definition,
      derivation: entry.derivation ?? undefined,
      citation: CITATION,
    };

    if (includeExtended) {
      if (lexicon) {
        const data = lexicon.extended_data as StepBibleLexiconData;
        result.extended = extendedFromLexicon(data, lexicon.source);
        result.extendedCitation = STEP_BIBLE_CITATION;
      }
    }

    return result;
  }

  /** Search by lemma or transliteration */
  async search(query: string, limit: number = 10): Promise<StrongsEntry[]> {
    const normalized = query.trim();
    if (normalized.length < 2 || normalized.length > 100) {
      throw new ValidationError('query', 'Search query must be between 2 and 100 characters.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new ValidationError('limit', 'Search limit must be an integer between 1 and 20.');
    }
    return await this.repo.search(normalized, limit);
  }

  /** Get database statistics */
  async getStats() {
    return await this.repo.getStats();
  }

  async getCorpusUsage(
    strongsNumber: string,
    level: CorpusUsageLevel,
    occurrenceLimit?: number,
    occurrenceCursor?: string,
  ): Promise<CorpusUsageResult> {
    const identity = parseStrongsIdentity(strongsNumber);
    if (!identity) throw new ValidationError('strongs_number', `Invalid Strong's number format: ${strongsNumber}.`);
    if (!this.morphologyRepo) throw new Error('Morphology usage repository is not configured');
    if (!['overview', 'study', 'technical'].includes(level)) {
      throw new ValidationError('usage_level', 'usage_level must be overview, study, or technical.');
    }
    if (level === 'overview' && (occurrenceLimit !== undefined || occurrenceCursor !== undefined)) {
      throw new ValidationError('usage_level', 'overview usage does not accept occurrence_limit or occurrence_cursor.');
    }
    const occurrenceMaximum = level === 'study' ? 12 : 25;
    if (occurrenceLimit !== undefined && (!Number.isSafeInteger(occurrenceLimit)
      || occurrenceLimit < 1 || occurrenceLimit > occurrenceMaximum)) {
      throw new ValidationError(
        'occurrence_limit',
        `occurrence_limit must be an integer between 1 and ${occurrenceMaximum} for ${level} usage.`,
      );
    }

    let after;
    if (occurrenceCursor) {
      try {
        after = decodeMorphologyUsageCursor(occurrenceCursor, identity.morphologyKey);
      } catch (error) {
        throw new ValidationError('occurrence_cursor', (error as Error).message);
      }
    }

    const formLimit = level === 'study' ? 10 : 25;
    const stats = await this.morphologyRepo.getUsageStats(identity.publicId);
    const [books, forms] = stats
      ? await Promise.all([
        this.morphologyRepo.getBookUsage(identity.publicId),
        level === 'overview' ? [] : this.morphologyRepo.getFormUsage(identity.publicId, formLimit),
      ])
      : [[], []];

    let occurrencePage: Awaited<ReturnType<IMorphologyRepository['getTokenOccurrences']>> | undefined;
    if (level !== 'overview' && stats) {
      const limit = occurrenceLimit ?? (level === 'study' ? 8 : 20);
      occurrencePage = await this.morphologyRepo.getTokenOccurrences(identity.publicId, after, limit);
    }

    return {
      level,
      exactMorphologyKey: identity.morphologyKey,
      corpusIdentity: MORPHOLOGY_CORPUS_IDENTITY,
      attested: stats !== undefined,
      totals: {
        tokenCount: stats?.token_count ?? 0,
        verseCount: stats?.verse_count ?? 0,
        bookCount: stats?.book_count ?? 0,
        sourceSurfaceVariantCount: stats?.form_count ?? 0,
      },
      bookDistribution: books.map(book => ({
        book: book.book,
        canonicalOrder: book.book_order,
        tokenCount: book.token_count,
        verseCount: book.verse_count,
      })),
      sourceSurfaceVariants: forms.map(form => ({
        sourceForm: form.form_text,
        tokenCount: form.token_count,
        verseCount: form.verse_count,
        firstOccurrence: {
          book: form.first.book,
          canonicalOrder: form.first.book_order,
          chapter: form.first.chapter,
          verse: form.first.verse,
          position: form.first.position,
        },
      })),
      ...(occurrencePage ? {
        occurrences: occurrencePage.occurrences.map(occurrence => ({
          book: occurrence.book,
          canonicalOrder: occurrence.book_order,
          chapter: occurrence.chapter,
          verse: occurrence.verse,
          position: occurrence.position,
          sourceForm: occurrence.word_text,
          lemma: occurrence.lemma,
          exactMorphologyKey: occurrence.strongs_number,
          morphologyCode: occurrence.morph_code,
          gloss: occurrence.gloss,
        })),
        ...(occurrencePage.next_after ? {
          nextOccurrenceCursor: encodeMorphologyUsageCursor(identity.morphologyKey, occurrencePage.next_after),
        } : {}),
      } : {}),
      cautions: [
        'Counts are exact tokens in the corrected STEPBible morphology corpus, not counts from the lexicon and not claims about meaning.',
        'Source surface variants are exact source text; punctuation, accents, breathing marks, and cantillation remain significant.',
        'Frequency and distribution do not establish a word’s meaning in any particular verse; use original_language_study for context.',
      ],
    };
  }
}

function resultFromStepBible(
  publicId: string,
  prefix: 'G' | 'H',
  lexicon: NonNullable<Awaited<ReturnType<IStrongsRepository['getLexiconEntry']>>>,
  includeExtended: boolean,
): EnhancedStrongsResult {
  const data = lexicon.extended_data as StepBibleLexiconData;
  const lemma = stringValue(data.lemma);
  const rawDefinition = stringValue(data.definition) ?? stringValue(data.gloss);
  if (!lemma || !rawDefinition) {
    throw new NotFoundError('strongs', `Strong's number ${publicId} has no complete lexicon entry`);
  }
  const definition = normalizeLexiconText(rawDefinition);
  const result: EnhancedStrongsResult = {
    strongs_number: publicId,
    testament: null,
    language: prefix === 'G' ? 'Greek' : 'Hebrew',
    lemma,
    transliteration: stringValue(data.translit),
    definition,
    citation: STEP_BIBLE_CITATION,
    sourceKind: 'stepbible_lexicon',
  };
  if (includeExtended) result.extended = extendedFromLexicon(data, lexicon.source);
  return result;
}

function extendedFromLexicon(data: StepBibleLexiconData, fallbackSource: string): NonNullable<EnhancedStrongsResult['extended']> {
  return {
    strongsExtended: stringValue(data.extendedStrongs),
    gloss: stringValue(data.gloss),
    definition: stringValue(data.definition),
    morphologyCode: stringValue(data.morph),
    source: stringValue(data.source) ?? fallbackSource,
    senses: isSenseRecord(data.senses) ? data.senses : undefined,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isSenseRecord(value: unknown): value is NonNullable<EnhancedStrongsResult['extended']>['senses'] {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
