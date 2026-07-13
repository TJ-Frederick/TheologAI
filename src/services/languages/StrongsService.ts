/**
 * Strong's concordance service using SQLite repository.
 */

import type { IStrongsRepository, StrongsEntry } from '../../kernel/repositories.js';
import type { StrongsResult, EnhancedStrongsResult, Citation } from '../../kernel/types.js';
import { ValidationError, NotFoundError } from '../../kernel/errors.js';
import { parseStrongsIdentity } from '../../kernel/strongs.js';
import { normalizeLexiconText } from '../../kernel/lexiconText.js';

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
  constructor(private repo: IStrongsRepository) {}

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
