/**
 * Bible lookup service with provider routing.
 *
 * Receives application-owned provider ports via constructor and routes by translation.
 */

import type { BibleProviderPort } from './BibleProviderPort.js';
import type {
  BibleResult,
  BibleLookupMultipleResult,
  BibleLookupParams,
  RequestContext,
} from '../../kernel/types.js';
import { parseReference, formatReference, referencesEqual } from '../../kernel/reference.js';
import { APIError, ValidationError, NotFoundError } from '../../kernel/errors.js';
import { BIBLE_TRANSLATION_LOOKUP_CONCURRENCY } from '../../kernel/requestLimits.js';
import { throwIfAborted } from '../../kernel/requestDeadline.js';

export class BibleService {
  private providersByTranslation = new Map<string, BibleProviderPort>();

  constructor(providers: BibleProviderPort[]) {
    for (const provider of providers) {
      for (const t of provider.supportedTranslations) {
        this.providersByTranslation.set(t.toUpperCase(), provider);
      }
    }
  }

  async lookup(params: BibleLookupParams, context: RequestContext = {}): Promise<BibleResult> {
    throwIfAborted(context.signal);
    const translation = this.resolveTranslation(params.translation);
    const ref = parseReference(params.reference);

    const provider = this.providersByTranslation.get(translation);
    if (!provider) {
      throw new ValidationError(
        'translation',
        `Unsupported translation: "${translation}". Available: ${this.getSupportedTranslations().join(', ')}`
      );
    }

    if (!provider.isConfigured()) {
      throw new NotFoundError('adapter', `${translation} adapter is not configured`);
    }

    const result = await provider.getPassage(ref, translation, {
      includeFootnotes: params.includeFootnotes,
      signal: context.signal,
    });
    throwIfAborted(context.signal);
    this.assertResultConsistency(ref, translation, result);
    return result;
  }

  /** Look up the same reference in multiple translations */
  async lookupMultiple(
    reference: string,
    translations: string[],
    options: Pick<BibleLookupParams, 'includeFootnotes'> = {},
    context: RequestContext = {},
  ): Promise<BibleLookupMultipleResult> {
    const ref = parseReference(reference);
    type Outcome = { result: BibleResult } | { failure: BibleLookupMultipleResult['failures'][number] };
    const outcomes = new Array<Outcome>(translations.length);

    await mapWithConcurrency(translations, BIBLE_TRANSLATION_LOOKUP_CONCURRENCY, async (t, index) => {
      const upper = t.toUpperCase();
      const provider = this.providersByTranslation.get(upper);
      if (!provider) {
        outcomes[index] = { failure: { translation: upper, reason: 'Translation is not supported by this server.' } };
        return;
      }
      if (!provider.isConfigured()) {
        outcomes[index] = { failure: { translation: upper, reason: 'Translation provider is not configured.' } };
        return;
      }
      try {
        throwIfAborted(context.signal);
        const result = await provider.getPassage(ref, upper, {
          includeFootnotes: options.includeFootnotes,
          signal: context.signal,
        });
        throwIfAborted(context.signal);
        this.assertResultConsistency(ref, upper, result);
        outcomes[index] = { result };
      } catch {
        outcomes[index] = { failure: { translation: upper, reason: 'Translation could not be retrieved.' } };
      }
    });

    const results = outcomes.flatMap(outcome => outcome && 'result' in outcome ? [outcome.result] : []);
    const failures = outcomes.flatMap(outcome => outcome && 'failure' in outcome ? [outcome.failure] : []);

    return { reference: formatReference(ref), results, failures };
  }

  getSupportedTranslations(): string[] {
    return [...this.providersByTranslation.keys()];
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

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
}
