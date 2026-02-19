/**
 * Bible adapter interface.
 *
 * All Bible translation providers implement this contract.
 * Services receive BibleAdapter[] via constructor and route by translation.
 */

import type { BibleResult, Citation } from '../../kernel/types.js';
import type { BibleReference } from '../../kernel/reference.js';

export interface BibleAdapter {
  /** Translation codes this adapter handles (e.g. ["ESV"], ["KJV","WEB","BSB","ASV","YLT","DBY"]) */
  readonly supportedTranslations: string[];

  /** Fetch passage text for a parsed reference */
  getPassage(ref: BibleReference, translation: string, options?: { includeFootnotes?: boolean }): Promise<BibleResult>;

  /** Whether this adapter is configured and ready */
  isConfigured(): boolean;

  /** Copyright notice for a given translation */
  getCopyright(translation: string): string;
}
