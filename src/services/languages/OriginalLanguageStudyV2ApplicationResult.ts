import type { OriginalLanguageStudyV2SemanticEvidence, OriginalLanguageStudyV2ResolvedRequest } from '../../kernel/originalLanguageStudyV2Contract.js';
import type { OriginalLanguageStudyDomainResult } from './OriginalLanguageStudyService.js';

/**
 * Validated application output for original-language study v2. Presentation
 * concerns such as the closed public packet, byte accounting, and Markdown
 * remain outside the language service.
 */
export interface OriginalLanguageStudyV2ApplicationResult {
  readonly request: Readonly<OriginalLanguageStudyV2ResolvedRequest>;
  readonly v1Result: OriginalLanguageStudyDomainResult;
  readonly semanticEvidence: OriginalLanguageStudyV2SemanticEvidence;
}
