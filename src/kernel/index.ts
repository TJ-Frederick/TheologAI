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

// Planned source-attested UBS dictionary semantics (source-free foundation).
export type {
  UbsSemanticLanguage,
  UbsSemanticPublicLanguage,
  UbsLexicalIdentityPrefix,
  UbsSemanticSourceProvenance,
  UbsSemanticSource,
  UbsSemanticEntry,
  UbsSemanticSense,
  UbsSemanticDomainRef,
  UbsSemanticDomain,
  UbsSemanticReferenceEvidence,
  UbsSemanticRepositoryOrder,
  UbsSemanticRepositoryCollection,
  UbsSemanticPageRequest,
  UbsSemanticPaginatedOperation,
  IUbsSemanticRepository,
  UbsLexicalSenseCandidate,
  UbsSemanticResolution,
} from './ubsSemanticDomain.js';
export {
  UBS_SEMANTIC_REPOSITORY_LIMITS,
  UBS_SEMANTIC_REPOSITORY_ORDER,
  UBS_SEMANTIC_ARTIFACT_VERSION,
  UBS_SEMANTIC_TRANSFORM_VERSION,
  createUbsSemanticCursor,
  parseUbsSemanticCursor,
  createUbsSemanticRepositoryCollection,
} from './ubsSemanticDomain.js';

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
export { PUBLIC_DONATION_URL } from './publicUrls.js';
export {
  COMMENTARY_CATALOG,
  CANONICAL_COMMENTATORS,
  HELLOAO_COMMENTARY_DELIVERY,
  HELLOAO_COMMENTARY_DELIVERY_ID,
  resolveCommentaryCatalogEntry,
  commentaryCatalogEntry,
  type CommentaryCatalogEntry,
  type CommentaryScalarPolicy,
} from './commentaryCatalog.js';

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
  CanonicalCommentator,
  CommentaryCoverageEvidence,
  CommentaryAdapterResult,
  CommentaryLookupResult,
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
