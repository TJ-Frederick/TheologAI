/**
 * Bible lookup service with adapter routing.
 *
 * Receives BibleAdapter[] via constructor and routes by translation.
 */

import type { BibleAdapter } from '../../adapters/bible/BibleAdapter.js';
import type { BibleResult, BibleLookupParams } from '../../kernel/types.js';
import { parseReference, formatReference } from '../../kernel/reference.js';
import { ValidationError, NotFoundError } from '../../kernel/errors.js';

export class BibleService {
  private adaptersByTranslation = new Map<string, BibleAdapter>();

  constructor(adapters: BibleAdapter[]) {
    for (const adapter of adapters) {
      for (const t of adapter.supportedTranslations) {
        this.adaptersByTranslation.set(t.toUpperCase(), adapter);
      }
    }
  }

  async lookup(params: BibleLookupParams): Promise<BibleResult> {
    const translation = this.resolveTranslation(params.translation);
    const ref = parseReference(params.reference);

    const adapter = this.adaptersByTranslation.get(translation);
    if (!adapter) {
      throw new ValidationError(
        'translation',
        `Unsupported translation: "${translation}". Available: ${this.getSupportedTranslations().join(', ')}`
      );
    }

    if (!adapter.isConfigured()) {
      throw new NotFoundError('adapter', `${translation} adapter is not configured`);
    }

    return adapter.getPassage(ref, translation, {
      includeFootnotes: params.includeFootnotes,
    });
  }

  /** Look up the same reference in multiple translations */
  async lookupMultiple(reference: string, translations: string[]): Promise<BibleResult[]> {
    const ref = parseReference(reference);
    const results: BibleResult[] = [];

    for (const t of translations) {
      const upper = t.toUpperCase();
      const adapter = this.adaptersByTranslation.get(upper);
      if (adapter?.isConfigured()) {
        try {
          results.push(await adapter.getPassage(ref, upper));
        } catch {
          // Skip failed translations
        }
      }
    }

    return results;
  }

  getSupportedTranslations(): string[] {
    return [...this.adaptersByTranslation.keys()];
  }

  private resolveTranslation(input?: string | string[]): string {
    if (Array.isArray(input)) return (input[0] || 'ESV').toUpperCase();
    return (input || 'ESV').toUpperCase();
  }
}
