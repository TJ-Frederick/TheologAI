import type { OriginalLanguageStudyCorpusOccurrences, OriginalLanguageStudyV3ResolvedRequest } from '../../kernel/originalLanguageStudyV3Contract.js';
import type { CorpusOccurrencePageResult } from '../../kernel/types.js';
import type { OriginalLanguageStudyV2ApplicationResult } from './OriginalLanguageStudyV2ApplicationResult.js';

export interface OriginalLanguageStudyV3ApplicationResult {
  readonly request: Readonly<OriginalLanguageStudyV3ResolvedRequest>;
  readonly evidence: OriginalLanguageStudyV2ApplicationResult;
  readonly corpusOccurrences?: CorpusOccurrencePageResult | Extract<
    OriginalLanguageStudyCorpusOccurrences,
    { status: 'unavailable' | 'not_requested_continuation' }
  >;
}
