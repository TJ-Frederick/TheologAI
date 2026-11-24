/**
 * Bible lookup service with provider routing.
 *
 * Receives application-owned provider ports via constructor and routes by translation.
 */

import type { BibleProviderPort } from './BibleProviderPort.js';
import type { BibleResult, BibleLookupMultipleResult, BibleLookupParams } from '../../kernel/types.js';
import { parseReference, formatReference, referencesEqual } from '../../kernel/reference.js';
import { APIError, ValidationError, NotFoundError } from '../../kernel/errors.js';

export class BibleService {
  private providersByTranslation = new Map<string, BibleProviderPort>();

  constructor(providers: BibleProviderPort[]) {
    for (const provider of providers) {
      for (const t of provider.supportedTranslations) {
        this.providersByTranslation.set(t.toUpperCase(), provider);
      }
    }
  }

  async lookup(params: BibleLookupParams): Promise<BibleResult> {
    const translation = this.resolveTranslation(params.translation);
    const ref = parseReference(params.reference);

    const provider = this.selectConfiguredProvider(translation);
    if (provider === 'unsupported') {
      throw new ValidationError(
        'translation',
        `Unsupported translation: "${translation}". Available: ${this.getSupportedTranslations().join(', ')}`
      );
    }

    if (provider === 'unconfigured') {
      throw new NotFoundError('adapter', `${translation} adapter is not configured`);
    }

    return this.fetchPassage(provider, ref, translation, params.includeFootnotes);
  }

  /** Look up the same reference in multiple translations */
  async lookupMultiple(
    reference: string,
    translations: string[],
    includeFootnotes?: boolean,
  ): Promise<BibleLookupMultipleResult> {
    const ref = parseReference(reference);
    const results: BibleResult[] = [];
    const failures: BibleLookupMultipleResult['failures'] = [];

    for (const t of translations) {
      const upper = t.toUpperCase();
      const provider = this.selectConfiguredProvider(upper);
      if (provider === 'unsupported') {
        failures.push({ translation: upper, reason: 'Translation is not supported by this server.' });
        continue;
      }
      if (provider === 'unconfigured') {
        failures.push({ translation: upper, reason: 'Translation provider is not configured.' });
        continue;
      }
      try {
        results.push(await this.fetchPassage(provider, ref, upper, includeFootnotes));
      } catch {
        failures.push({ translation: upper, reason: 'Translation could not be retrieved.' });
      }
    }

    return { reference: formatReference(ref), results, failures };
  }

  getSupportedTranslations(): string[] {
    return [...this.providersByTranslation.keys()];
  }

  private selectConfiguredProvider(translation: string): BibleProviderPort | 'unsupported' | 'unconfigured' {
    const provider = this.providersByTranslation.get(translation);
    if (!provider) return 'unsupported';
    return provider.isConfigured() ? provider : 'unconfigured';
  }

  private async fetchPassage(
    provider: BibleProviderPort,
    ref: ReturnType<typeof parseReference>,
    translation: string,
    includeFootnotes?: boolean,
  ): Promise<BibleResult> {
    const result = await provider.getPassage(ref, translation, { includeFootnotes });
    this.assertResultConsistency(ref, translation, result);
    return result;
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
