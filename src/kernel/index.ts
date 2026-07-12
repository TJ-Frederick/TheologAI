/**
 * Kernel — shared domain primitives.
 *
 * Public API: everything downstream should import from here.
 */

// Books
export {
  BIBLE_BOOKS,
  BIBLE_BOOK_BOUNDS,
  findBook,
  findBookByHelloaoCode,
  findBookByAbbreviation,
  findBookByStepbibleId,
  findBookByNumber,
  getOTBooks,
  getNTBooks,
  getBibleBookBounds,
  type BibleBook,
  type BibleBookBounds,
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
  referencesEqual,
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

// Source-attested parallel passage groups
export type {
  SourceParallelLanguageMarker,
  SourceParallelAlignmentBasis,
  SourceParallelReferenceSegment,
  SourceParallelMember,
  ParallelSourceProvenance,
  SourceAttestedParallelGroup,
  SourceAttestedParallelLookup,
  ISourceAttestedParallelRepository,
} from './sourceAttestedParallels.js';
export {
  parseSourceAttestedLookupReference,
  type SourceAttestedLookupReference,
} from './sourceAttestedReference.js';
export {
  UBS_PARALLEL_PASSAGE_PROVENANCE,
  deriveUbsParallelGroupId,
} from './ubsParallelSource.js';

// Provenance
export {
  provenanceFromCitation,
  type ProvenanceKind,
  type ProvenanceStatus,
  type ProvenanceRecord,
  type ProvenanceLink,
  type ProvenanceContext,
} from './provenance.js';

// Types
export type {
  ToolHandler,
  ToolResult,
  BibleLookupParams,
  Citation,
  Reference,
  Footnote,
  BibleResult,
  BibleTranslationFailure,
  BibleLookupMultipleResult,
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
