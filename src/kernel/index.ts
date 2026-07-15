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

// Strong's identity
export {
  parseStrongsIdentity,
  STRONGS_IDENTITY_MAX_DIGITS,
  STRONGS_IDENTITY_MAX_NUMBER,
  STRONGS_IDENTITY_PATTERN,
  type CanonicalStrongsIdentity,
} from './strongs.js';

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
  UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY,
  computeUbsParallelArtifactIdentity,
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
export {
  OPENBIBLE_PROVENANCE_ID,
  OPENBIBLE_CROSS_REFERENCE_PROVENANCE,
} from './openBibleCrossReferenceProvenance.js';

// Staged primary-source rollout flags
export {
  DEFAULT_PRIMARY_SOURCE_FEATURE_FLAGS,
  readPrimarySourceFeatureFlags,
  type PrimarySourceFeatureFlags,
  type PrimarySourceFlagEnvironment,
} from './featureFlags.js';

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
