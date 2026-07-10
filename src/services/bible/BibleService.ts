/**
 * Bible lookup service with adapter routing.
 *
 * Receives BibleAdapter[] via constructor and routes by translation.
 */

import type { BibleAdapter } from '../../adapters/bible/BibleAdapter.js';
import type { BibleResult, BibleLookupMultipleResult, BibleLookupParams } from '../../kernel/types.js';
import { parseReference, formatReference, referencesEqual } from '../../kernel/reference.js';
import { APIError, ValidationError, NotFoundError } from '../../kernel/errors.js';

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

    const result = await adapter.getPassage(ref, translation, {
      includeFootnotes: params.includeFootnotes,
    });
    this.assertResultConsistency(ref, translation, result);
    return result;
  }

  /** Look up the same reference in multiple translations */
  async lookupMultiple(reference: string, translations: string[]): Promise<BibleLookupMultipleResult> {
    const ref = parseReference(reference);
    const results: BibleResult[] = [];
    const failures: BibleLookupMultipleResult['failures'] = [];

    for (const t of translations) {
      const upper = t.toUpperCase();
      const adapter = this.adaptersByTranslation.get(upper);
      if (!adapter) {
        failures.push({ translation: upper, reason: 'Translation is not supported by this server.' });
        continue;
      }
      if (!adapter.isConfigured()) {
        failures.push({ translation: upper, reason: 'Translation provider is not configured.' });
        continue;
      }
      try {
        const result = await adapter.getPassage(ref, upper);
        this.assertResultConsistency(ref, upper, result);
        results.push(result);
      } catch {
        failures.push({ translation: upper, reason: 'Translation could not be retrieved.' });
      }
    }

    return { reference: formatReference(ref), results, failures };
  }

  getSupportedTranslations(): string[] {
    return [...this.adaptersByTranslation.keys()];
  }

  private resolveTranslation(input?: string | string[]): string {
    if (Array.isArray(input)) return (input[0] || 'ESV').toUpperCase();
    return (input || 'ESV').toUpperCase();
  }

  /** Prevent a provider from returning a different passage under the request label. */
  private assertResultConsistency(ref: ReturnType<typeof parseReference>, translation: string, result: BibleResult): void {
    if (!result || typeof result.reference !== 'string' || typeof result.translation !== 'string' || typeof result.text !== 'string') {
      throw new APIError(502, 'Bible provider returned an invalid passage result.');
    }

    let returnedRef: ReturnType<typeof parseReference>;
    try {
      returnedRef = parseReference(result.reference);
    } catch {
      throw new APIError(502, 'Bible provider returned an invalid passage reference.');
    }

    if (!referencesEqual(ref, returnedRef)) {
      throw new APIError(502, 'Bible provider returned a passage for a different reference.');
    }
    if (result.translation.toUpperCase() !== translation) {
      throw new APIError(502, 'Bible provider returned a passage for a different translation.');
    }
    if (!result.text.trim()) {
      throw new APIError(502, 'Bible provider returned an empty passage.');
    }
  }
}
