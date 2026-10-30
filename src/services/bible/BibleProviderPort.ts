import type { BibleReference } from '../../kernel/reference.js';
import type { BibleResult } from '../../kernel/types.js';

/** Application-owned contract for configured Bible translation providers. */
export interface BibleProviderPort {
  readonly supportedTranslations: readonly string[];
  getPassage(
    ref: BibleReference,
    translation: string,
    options?: { readonly includeFootnotes?: boolean },
  ): Promise<BibleResult>;
  isConfigured(): boolean;
}
