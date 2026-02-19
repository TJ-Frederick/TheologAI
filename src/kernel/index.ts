/**
 * Kernel — shared domain primitives.
 *
 * Public API: everything downstream should import from here.
 */

// Books
export {
  BIBLE_BOOKS,
  findBook,
  findBookByHelloaoCode,
  findBookByAbbreviation,
  findBookByStepbibleId,
  findBookByNumber,
  getOTBooks,
  getNTBooks,
  type BibleBook,
} from './books.js';

// Reference parsing & formatting
export {
  parseReference,
  formatReference,
  toOpenBibleKey,
  toHelloAO,
  toCcelMatthewHenry,
  toCcelMHCConcise,
  toCcelJFB,
  toStepBible,
  normalizeOpenBibleRef,
  toRomanNumeral,
  type BibleReference,
} from './reference.js';

// Error hierarchy
export {
  TheologAIError,
  APIError,
  ValidationError,
  RateLimitError,
  AdapterError,
  NotFoundError,
  getUserMessage,
  handleToolError,
} from './errors.js';

// Cache
export { Cache } from './cache.js';

// Types
export type {
  ToolHandler,
  ToolResult,
  BibleLookupParams,
  Citation,
  Reference,
  Footnote,
  BibleResult,
  CommentaryLookupParams,
  CommentaryResult,
  HistoricalSearchParams,
  HistoricalResult,
  CrossReference,
  CrossReferenceResult,
  CrossReferenceOptions,
  ParallelPassageLookupParams,
  ParallelPassage,
  ParallelPassageAnalysis,
  ParallelPassageResult,
  StrongsLookupParams,
  StrongsResult,
  SenseInfo,
  EnhancedStrongsResult,
  VerseWord,
  VerseData,
  VerseMorphologyParams,
  VerseMorphologyResult,
  BookData,
  StepBibleIndex,
  MorphologyExpansion,
  StepBibleMetadata,
  TopicalSearchParams,
  ToolResponse,
} from './types.js';
