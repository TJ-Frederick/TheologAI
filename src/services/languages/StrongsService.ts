/**
 * Strong's concordance service using SQLite repository.
 */

import type { StrongsRepository, StrongsEntry, LexiconEntry } from '../../adapters/data/StrongsRepository.js';
import type { StrongsResult, EnhancedStrongsResult, Citation } from '../../kernel/types.js';
import { ValidationError, NotFoundError } from '../../kernel/errors.js';

const CITATION: Citation = {
  source: "Strong's Concordance",
  copyright: 'Public Domain (OpenScriptures)',
  url: 'https://github.com/openscriptures/strongs',
};

export class StrongsService {
  constructor(private repo: StrongsRepository) {}

  /** Look up a Strong's number */
  async lookup(strongsNumber: string, includeExtended?: boolean): Promise<EnhancedStrongsResult> {
    const normalized = strongsNumber.toUpperCase().trim();
    if (!/^[GH]\d+[a-z]?$/i.test(normalized)) {
      throw new ValidationError('strongs_number', `Invalid Strong's number format: ${strongsNumber}. Expected G#### or H####.`);
    }

    const entry = await this.repo.lookup(normalized);
    if (!entry) {
      throw new NotFoundError('strongs', `Strong's number ${normalized} not found`);
    }

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
      const lexicon = await this.repo.getLexiconEntry(normalized);
      if (lexicon) {
        result.extended = {
          strongsExtended: (lexicon.extended_data as any).extendedStrongs,
          senses: (lexicon.extended_data as any).senses,
        };
      }
    }

    return result;
  }

  /** Search by lemma or transliteration */
  async search(query: string, limit?: number): Promise<StrongsEntry[]> {
    return await this.repo.search(query, limit);
  }

  /** Get database statistics */
  async getStats() {
    return await this.repo.getStats();
  }
}
