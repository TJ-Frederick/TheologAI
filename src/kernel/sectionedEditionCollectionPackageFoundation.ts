import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { sha256Hex } from './sha256.js';

/**
 * Gate C only. This inert compiler consumes caller-supplied transient reviewed
 * HTML, produces in-memory canonical package bytes, and never reads a source,
 * writes a package, or registers a runtime capability. Raw HTML is stripped
 * before persistence; only source spans and ordinary SHA-256 evidence remain.
 */

export const SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA = 'sectioned-edition-collection-package.v1' as const;
export const SECTIONED_EDITION_COLLECTION_MANIFEST_SCHEMA = 'sectioned-edition-collection-manifest.v1' as const;
export const SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY = 'parse5_pinned_topology_ascii_whitespace_br_lf_reviewed_blocks_nfc_only' as const;
export const SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS = 'brackets_preserved_exactly' as const;
export const SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS = 'mechanical_only_no_silent_correction' as const;

/** Immutable, content-free A1 evidence. No source body or cache locator is embedded here. */
export const AQUINAS_A1_SOURCE_LOCK_SHA256 = 'c5cfdd1edd132bf59968cbabe4c7de2180c42d205735ca6c06aec626104a180b' as const;
export const AQUINAS_A1_LOCAL_RECEIPT_SHA256 = 'bc0dab9ce5dc3672ccf2a81182655c75eaf6ef4f280584a40e079bf82a11719d' as const;
export const AQUINAS_A1_TOPOLOGY_LOCK_SHA256 = 'ce6197ba036ec7200f43513f9e6676ccfd5cb5a4727077a440770416bdf6978b' as const;
export const AQUINAS_A1_DISCREPANCY_LEDGER_SHA256 = 'c8e10cbf29d710b89fe48aa91d18f25489c96039116e53254d0592dfb0b68120' as const;
/** The historical ledger entry hashes are retained as opaque legacy A1 evidence, not recomputed under a new policy. */
export const AQUINAS_A1_DISCREPANCY_ENTRY_HASH_ALGORITHM = 'legacy_a1_canonical_entry_sha256' as const;
export const AQUINAS_A1_PACKAGE_IDENTITY = Object.freeze({ workId: 'thomas-aquinas-summa-theologiae', editionId: 'aquinas-summa-english-dominican-gutenberg-electronic', collectionId: 'aquinas-summa-pg-v1', contentFormat: 'plain_text', availability: 'local_only_inactive' } as const);
export const AQUINAS_A1_SOURCES = Object.freeze([
  { ebookId: 17611, partKey: 'prima', htmlMemberBytes: 3_090_576, htmlMemberSha256: '310b8743376036b42faa6b6d1a835aee2cf4e531dcf14ab8d9bb4f1d30edf088', intellectualStartByte: 18_414, cutoffEndByte: 3_070_657, rawCoverageSha256: 'ea9b7c7efb5f15dce4b07847983a224ec41b5ff8b8cd6980a84c24cbd8ac2314' },
  { ebookId: 17897, partKey: 'prima-secundae', htmlMemberBytes: 3_088_562, htmlMemberSha256: 'fcb4441c3771bde971c2bff47c0894b8294a813c20c6fa24dfd3ab997491a1eb', intellectualStartByte: 17_791, cutoffEndByte: 3_068_631, rawCoverageSha256: 'e038c3dd95c8c60e61745f7226560fc7617f381194cce6bc48dd640b5715f934' },
  { ebookId: 18755, partKey: 'secunda-secundae', htmlMemberBytes: 4_485_696, htmlMemberSha256: 'e8badeb59c78974db051cab37e6e841d78b2a83fb62e031668d29a7d7b9c4337', intellectualStartByte: 19_082, cutoffEndByte: 4_465_767, rawCoverageSha256: '8be29f08da126b3b3d08eff85248f471d6e4e8e2941d1477d87004512fae942f' },
  { ebookId: 19950, partKey: 'tertia', htmlMemberBytes: 2_927_390, htmlMemberSha256: '12fff95d7637f1e475057dfe60f3d550c571bf0a04fa84ddb9653e46e88fb079', intellectualStartByte: 17_012, cutoffEndByte: 2_907_468, rawCoverageSha256: '62e0f60cb7d5fb6f793f8fb7f7f55d5f2daead136fc3a506b700aa81a706a4f9' },
] as const);
export const AQUINAS_A1_TOPOLOGY_VECTOR = Object.freeze({ questionCount: 512, questionVectorSha256: '714b55268d7c2c777a12b17f7a4d3464fecc1eea69d4652568ab670e0a500aa9', questionKeysSha256: '1c3cfe11af52a7e29a09aae6ce64e854eac18bc96e5b05c55f8200e407022049', preambleCount: 512, articleCount: 2_669, articleVectorSha256: '4cb1703d44c2d7563477bd5dff9f7e346f64891b2bad2c59ed01c6c24ed0dfd3', articleKeysSha256: '6cfcf13360da2d30464ab48268c71b4d1b8408d7971ba497b41ddcce30ed79bd', orderedArticleKeysSha256: 'c55f3c3027743f68071f8316842452bf1de99f3ac4b42f2dd98afe1492d8a917', typedRangeCount: 3_184, typedRangesSha256: AQUINAS_A1_TOPOLOGY_LOCK_SHA256, partPrologues: [{ partKey: 'prima', count: 1 }, { partKey: 'prima-secundae', count: 1 }, { partKey: 'secunda-secundae', count: 0 }, { partKey: 'tertia', count: 1 }], partQuestionPreambles: [{ partKey: 'prima', count: 119 }, { partKey: 'prima-secundae', count: 114 }, { partKey: 'secunda-secundae', count: 189 }, { partKey: 'tertia', count: 90 }], partArticles: [{ partKey: 'prima', count: 584 }, { partKey: 'prima-secundae', count: 619 }, { partKey: 'secunda-secundae', count: 917 }, { partKey: 'tertia', count: 549 }] } as const);
export const AQUINAS_A1_RIGHTS_AND_COVERAGE = Object.freeze({ jurisdiction: 'US-only', rightsStatus: 'public_domain', editionLineageDisclosure: 'English Dominican Province (EDP), Benziger Brothers, Perry/McClamrock transcription, CCEL-lineage electronic edition.', limitations: ['remaining_defects', 'no_pages', 'not_critical', 'diplomatic_not_facsimile'], authorialCoverageThrough: 'tertia.q090', supplement: 'excluded', exclusionKinds: ['source_wrapper', 'gutenberg_license', 'electronic_edition_provenance', 'dedication', 'table_of_contents', 'editorial_interlude', 'structural_metadata', 'supplement'] } as const);
const AQUINAS_A1_DISCREPANCY_ROWS = `001|ceeb5adfa5f46cb93d296c158cd9baa3466601a1caf44bedda12502c8e45fe88|prima.q019|prima.q019.a009
002|46c89512db5e88a411f0a0fda4c11b29fc4c2c54b3b361cc48906666651e8ba5|prima.q028|prima.q028.a004
003|a6b5c85e25bce7476ea8e84e7a8f3ac2e72a01d93b7413b662527f629a3de694|prima.q037|prima.q037.a001
004|cddca097bb133683edcce51487811af993cf640f8d77e1f0d2d7901c25248c9b|prima.q042|prima.q042.a004
005|a896240ce7b233caa33a24f3d5a1ab03d3ac491b1ede08c2dbe6d95909892fea|prima.q056|prima.q056.a001
006|daeb960d4b75d4c6ab46a8c396f7de63589276c16e77e751a1dbff1fdcab15cd|prima.q058|prima.q058.a006
007|ba18a5b980a9eb7cecab110b23323f1e3079f0ceadae7551757e724d4c79274c|prima.q060|prima.q060.a003
008|cd0d2e50c7ad1321e8ad3a57477db82bf5f537b28a4378de82e83ade3403faf0|prima.q062|prima.q062.a009
009|982855018faa31e09ec5e9af87fa5e02306e43e66d9cbc1404d9277133d68ab8|prima.q071|prima.q071.a001
010|1ca0caf6489e3ea5ed9f6234fadfefefbe616509324a0fd3cfc415010914394f|prima.q072|prima.q072.a001
011|37190582a8a85ce0eb7cb16f46a84f4f13b99316afaa7814b3c772ac3a88175a|prima.q086|prima.q086.a001
012|4c782d8453e2be4fb2b9c26de2e0b4f2f43e8dd3e58c7e6a389313b5c47cad57|prima.q098|prima.q098.a001
013|c29e5246b212abe7ab0fc84b4619592989422b354d0042c215226b03d3096a58|prima.q111|prima.q111.a002
014|64c056d64081c35caebcf1e70b873f601baad006348c8f8035efc4df7f80aa2e|prima.q116|
015|c04671fcbcf3e0213f224bf721ed6d0820f6cd86b2bc77ee1e85b4d6bec9b03c|prima-secundae.q002|prima-secundae.q002.a006
016|99192115f4d816f638d56c97b945d24bba44e0ea88269ee47f621da61add1cb3|prima-secundae.q023|prima-secundae.q023.a001
017|95f8647e2d8b205d7adf6234c2acfc069bf2b5b769fc175c6ca5a19ab274fdac|prima-secundae.q038|
018|dad1745c0d066f12433525fe0f22dab463b6d4f7f6d673f88403853913052b1a|prima-secundae.q050|prima-secundae.q050.a002
019|f83b5ee095a66744e351321714b2c1404a68acb2202eeca0dc4d5b21c92852f6|prima-secundae.q061|prima-secundae.q061.a002
020|666c4b0dd80da781a57bca6a037387ea0a0cec5c38abe3374d76586c798d354d|prima-secundae.q080|prima-secundae.q080.a003
021|7d0e6536a3c45d27cc3f5811dfe3004d47b507268e4b37181c2422af523716e5|prima-secundae.q082|
022|8f5fe45947bb667166134bb948b16fab8e6df8876361275ad5854dbcef721e62|prima-secundae.q098|prima-secundae.q098.a004
023|f8adaddd907bcfc60400e92a5df915d20eeee061343b8f6aa518139bb6baf597|prima-secundae.q109|prima-secundae.q109.a006
024|4a2e2206aa77dcbd0e33e0a9815cc6d886c10f0b3c3724031733e5e621b98581|secunda-secundae.q019|secunda-secundae.q019.a007
025|b561e412de1274887759c74cbff056121c509381588de677605680494aaff99d|secunda-secundae.q019|secunda-secundae.q019.a008
026|b39512b0903ba68761748873345cb2c0857f33e920d73712f1de84b1dc68815a|secunda-secundae.q024|secunda-secundae.q024.a006
027|2f16d3cc409ccea81fb04d74dcc7f30b15ed628afde1f9923b474fbc258a2ec7|secunda-secundae.q040|secunda-secundae.q040.a003
028|a39e618a4076f4a4fd0824eb2d69202ce3a0a29262b68d0a6ef25df93ce3ef41|secunda-secundae.q046|secunda-secundae.q046.a002
029|5592fc8b1384cf18c697c6baf03e31fef27cba0cc8d3a626de9164fd0058fea6|secunda-secundae.q087|secunda-secundae.q087.a003
030|5cb9df73f6cfdde5fea8f5ca0bc2f084560687d12663042411aa825698eaea1f|secunda-secundae.q104|secunda-secundae.q104.a002
031|e2a1c4513229e5ff562fee0fc0268f2d3b9b8c95dc2ad2ab49f33577073b67ed|secunda-secundae.q105|secunda-secundae.q105.a001
032|a343473f85fdaf7e4e96ff73da0903523bc5a7365a798263aaf424878927975c|secunda-secundae.q128|
033|f9db2f9dac6d1e3c14b3b4d5e6bdb6c2e3f3cf73fea3d47301e4a042266a4b1f|secunda-secundae.q137|secunda-secundae.q137.a003
034|10552c1a70c7b818d75641ccebfdf7cdd4e9bdb085c59d0e44b1d9616436a704|secunda-secundae.q143|
035|6d3478357d61c8d2521e57f6e591d99071c089f920d80ebbf1ea63ae031d31dd|secunda-secundae.q146|secunda-secundae.q146.a002
036|9b818a9fac8edc096bbb6906a33cbe28fe9fb7a14c712cac8dbeee3d4133a566|secunda-secundae.q154|secunda-secundae.q154.a010
037|fc23679c09afa3904321d81688258aed8d56d21c2e4b7cb55a4214a1976615fc|secunda-secundae.q163|secunda-secundae.q163.a003
038|0b009f56f95be57c10bcb268ce23e4e07e70c8319d39ce557edfde6386606fef|secunda-secundae.q174|secunda-secundae.q174.a005
039|8614536b3ecbd2a6debd38279e8b938c4a9be241f17a9f67d52c6ecda1709bf9|secunda-secundae.q181|secunda-secundae.q181.a003
040|50a6774890ac8ba7aaf329abe2a56149fde1b0573bc837eedf7f29d2130b5411|secunda-secundae.q183|
041|77bed1034d3ebb44966cb7a17bb3f44e4d5a130bb480782295e44409de2df940|tertia.q005|tertia.q005.a004
042|a926b8fbf05422843180b24b60b31e518cd62f546805ee81195598a9a7b52e41|tertia.q007|tertia.q007.a004
043|34b463c6225d194340c13ac9ac07db2351b2679204c7ec95c7abfaad7b8e7f37|tertia.q048|tertia.q048.a004
044|f504e7bfd5fd14faaf157a3bc7560ba237feac75c3b63d9beb07d064ea4d0882|tertia.q050|
045|b3b2d976c209052f4c89e1a6a36ca1e26a8315dbce2cd50e9bbf5b4678bf1a30|tertia.q060|tertia.q060.a006
046|ef58f0a6737c9b1a866e7a3ba9b2255be2e56ac3a098cc9abe887f5ccc668d9e|tertia.q089|tertia.q089.a005`;
export const AQUINAS_A1_DISCREPANCY_INVENTORY = Object.freeze(AQUINAS_A1_DISCREPANCY_ROWS.split('\n').map(row => {
  const [ordinal, canonicalEntrySha256, questionKey, articleKey] = row.split('|');
  return { ref: `a1-ledger-${ordinal}`, canonicalEntrySha256: canonicalEntrySha256!, questionKey: questionKey!, articleKey: articleKey || null };
}));
export const AQUINAS_A1_DISCREPANCY_VECTOR_SHA256 = 'abfcc764d06f5344051fb488a31745b20b189c3c9223dc76aee663bbadfde885' as const;

export const SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS = Object.freeze({
  contentChildUtf8Bytes: 131_072,
  packageContentUtf8Bytes: 4_194_304,
  canonicalSerializedPackageUtf8Bytes: 4_718_592,
  childRawUtf8Bytes: 1_048_576,
  childNodes: 8_192,
  childDepth: 32,
  childAttributes: 128,
  childBlocks: 4_096,
  questionRawUtf8Bytes: 4_194_304,
  questionNodes: 32_768,
  questionDepth: 48,
  questionAttributes: 512,
  questionBlocks: 8_192,
  draftRawUtf8Bytes: 67_108_864,
  draftNodes: 1_000_000,
  draftDepth: 64,
  draftAttributes: 131_072,
  draftBlocks: 131_072,
} as const);

export type AquinasPackagePartKey = 'prima' | 'prima-secundae' | 'secunda-secundae' | 'tertia';
export type SourceStatus = 'verified' | 'discrepancy_ledgered';
export type ExclusionKind = typeof AQUINAS_A1_RIGHTS_AND_COVERAGE.exclusionKinds[number];

export const AQUINAS_PACKAGE_PARTS = Object.freeze([
  { key: 'prima', questions: 119 },
  { key: 'prima-secundae', questions: 114 },
  { key: 'secunda-secundae', questions: 189 },
  { key: 'tertia', questions: 90 },
] as const satisfies readonly Readonly<{ key: AquinasPackagePartKey; questions: number }>[]);

export interface SourceArtifactEvidence {
  artifactId: string;
  partKey: AquinasPackagePartKey;
  htmlMemberBytes: number;
  htmlMemberSha256: string;
  intellectualStartByte: number;
  cutoffEndByte: number;
  rawCoverageSha256: string;
  /** Transient only; omitted from PersistedPackage. */
  html: string;
}

export interface RawSpan {
  startByte: number;
  endByte: number;
  rawSha256: string;
}

export interface ReviewedTopology {
  containerTag: 'p' | 'div' | 'blockquote' | 'h4' | 'h5';
  inlineTags: ('i' | 'em' | 'b' | 'strong' | 'span' | 'sup' | 'sub')[];
}

export interface TransientReviewedBlock {
  span: RawSpan;
  html: string;
  topology: ReviewedTopology;
}

export interface TransientChild {
  kind: 'preamble' | 'article' | 'part_prologue';
  articleKey?: string;
  ordinal?: number;
  source: { artifactId: string; span: RawSpan; blocks: TransientReviewedBlock[] };
  bracketPreservationStatus: typeof SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS;
  correctionStatus: typeof SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS;
}

export interface TransientQuestionEvidence {
  questionKey: string;
  partKey: AquinasPackagePartKey;
  questionNumber: number;
  articleCount: number;
  source: { artifactId: string; span: RawSpan };
  orderedArticleKeysSha256: string;
  bracketStatus: 'mixed_unresolved_preserve_verbatim_in_a2';
  sourceLocatorStatus: SourceStatus;
  sourceStructureStatus: SourceStatus;
}

export interface TransientQuestion extends TransientQuestionEvidence {
  discrepancyRefs: string[];
  preamble: TransientChild;
  articles: TransientChild[];
}

export interface TransientPartPrologue {
  partKey: AquinasPackagePartKey;
  child: TransientChild;
}

export interface TransientExclusion {
  exclusionId: string;
  kind: ExclusionKind;
  artifactId: string;
  span: RawSpan;
  html: string;
}

export interface PersistedExclusion {
  exclusionId: string;
  kind: ExclusionKind;
  artifactId: string;
  span: RawSpan;
}

export interface TransientDiscrepancy {
  ref: string;
  canonicalEntrySha256: string;
  questionKey: string;
  articleKey: string | null;
  observed: { locator: string | null; tagName: string | null; span: RawSpan | null };
  resolved: { preambleSpan: RawSpan | null; articleSpan: RawSpan | null; articleCount: number | null };
}

export interface TransientSectionedEditionCollectionDraft {
  mode: 'synthetic_fixture' | 'a1_attested';
  schemaVersion: typeof SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA;
  normalizationPolicy: typeof SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY;
  identity: typeof AQUINAS_A1_PACKAGE_IDENTITY;
  sourceLockSha256: string;
  localReceiptSha256: string;
  topologyLockSha256: string;
  /** Count and domain-separated digest of the ordered prologue/preamble/article source spans. */
  typedRangeCount: number;
  typedRangesSha256: string;
  discrepancyLedgerSha256: string;
  /** Full reviewed source member, retained only while this transient draft is compiled. */
  sourceArtifacts: SourceArtifactEvidence[];
  rightsAndCoverage: typeof AQUINAS_A1_RIGHTS_AND_COVERAGE;
  partPrologues: TransientPartPrologue[];
  exclusions: TransientExclusion[];
  discrepancies: TransientDiscrepancy[];
  questions: TransientQuestion[];
}

export interface PersistedSourceEvidence {
  artifactId: string;
  span: RawSpan;
  outputSha256: string;
  outputUtf8Bytes: number;
  rawStats: RawStats;
}

export interface OutputEvidence {
  startByte: number;
  endByte: number;
  utf8Bytes: number;
  sha256: string;
}

export interface RawStats {
  rawUtf8Bytes: number;
  nodes: number;
  depth: number;
  attributes: number;
  blocks: number;
}

export interface PersistedChild {
  kind: 'preamble' | 'article' | 'part_prologue';
  articleKey?: string;
  ordinal?: number;
  source: PersistedSourceEvidence;
  output: OutputEvidence;
  content: string;
  bracketPreservationStatus: typeof SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS;
  correctionStatus: typeof SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS;
}

export interface PersistedQuestion extends TransientQuestionEvidence {
  discrepancyRefs: string[];
  source: { artifactId: string; span: RawSpan; rawStats: RawStats };
  output: OutputEvidence;
  preamble: PersistedChild;
  articles: PersistedChild[];
}

export interface PersistedPackage {
  schemaVersion: typeof SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA;
  identity: typeof AQUINAS_A1_PACKAGE_IDENTITY;
  normalizationPolicy: typeof SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY;
  sourceLockSha256: string;
  localReceiptSha256: string;
  topologyLockSha256: string;
  typedRangeCount: number;
  typedRangesSha256: string;
  discrepancyLedgerSha256: string;
  discrepancyEntryHashAlgorithm: typeof AQUINAS_A1_DISCREPANCY_ENTRY_HASH_ALGORITHM;
  /** Synthetic fixtures are explicitly non-release; attested packages carry null. */
  fixtureStatus: 'synthetic_fixture_non_release' | null;
  rightsAndCoverage: typeof AQUINAS_A1_RIGHTS_AND_COVERAGE;
  /** Source-member HTML is deliberately absent from persisted package bytes. */
  sourceArtifacts: Omit<SourceArtifactEvidence, 'html'>[];
  exclusions: PersistedExclusion[];
  /** Ledgered observation/resolution spans remain auditable without retaining source HTML. */
  discrepancyInventory: TransientDiscrepancy[];
  shard: {
    shardId: string;
    partKey: AquinasPackagePartKey;
    ordinal: number;
    firstQuestionKey: string;
    lastQuestionKey: string;
    questionKeys: string[];
    orderedArticleKeysSha256: string;
    normalizedContentUtf8Bytes: number;
  };
  partPrologue: PersistedChild | null;
  questions: PersistedQuestion[];
}

export interface PersistedManifest {
  schemaVersion: typeof SECTIONED_EDITION_COLLECTION_MANIFEST_SCHEMA;
  identity: typeof AQUINAS_A1_PACKAGE_IDENTITY;
  topologyLockSha256: string;
  discrepancyLedgerSha256: string;
  orderedQuestionKeysSha256: string;
  orderedArticleKeysSha256: string;
  shards: {
    shardId: string;
    partKey: AquinasPackagePartKey;
    ordinal: number;
    firstQuestionKey: string;
    lastQuestionKey: string;
    questionKeys: string[];
    normalizedContentUtf8Bytes: number;
    canonicalSerializedPackageUtf8Bytes: number;
    canonicalPackageSha256: string;
  }[];
  aggregateSha256: string;
}

export interface CompiledSectionedEditionCollectionPackage {
  package: PersistedPackage;
  persistedBytes: Uint8Array;
  persistedSha256: string;
}

export interface CompiledSectionedEditionCollectionPackageSet {
  manifest: PersistedManifest;
  packages: CompiledSectionedEditionCollectionPackage[];
}

/** Content-free planner used to prove the same no-split maximal-prefix gate without body fixtures. */
export interface SectionedEditionCollectionPackageMetric {
  questionKey: string;
  normalizedContentUtf8Bytes: number;
  canonicalSerializedPackageUtf8Bytes: number;
}

export class SectionedEditionCollectionPackageValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'SectionedEditionCollectionPackageValidationError';
  }
}

export function expectedAquinasPackageQuestionKeys(): readonly string[] {
  return AQUINAS_PACKAGE_PARTS.flatMap(part => Array.from({ length: part.questions }, (_, index) => `${part.key}.q${String(index + 1).padStart(3, '0')}`));
}

export function buildMaximalWithinPartPackagePlan(metrics: readonly SectionedEditionCollectionPackageMetric[]): { partKey: AquinasPackagePartKey; questionKeys: string[]; normalizedContentUtf8Bytes: number; canonicalSerializedPackageUtf8Bytes: number }[] {
  const values = arrayAt(metrics, 'metrics', 512, 512).map((value, index) => {
    const root = objectAt(value, `metrics[${index}]`, ['questionKey', 'normalizedContentUtf8Bytes', 'canonicalSerializedPackageUtf8Bytes']);
    return { questionKey: questionKeyAt(root.questionKey, `metrics[${index}].questionKey`), normalizedContentUtf8Bytes: integerAt(root.normalizedContentUtf8Bytes, `metrics[${index}].normalizedContentUtf8Bytes`, 1), canonicalSerializedPackageUtf8Bytes: integerAt(root.canonicalSerializedPackageUtf8Bytes, `metrics[${index}].canonicalSerializedPackageUtf8Bytes`, 1) };
  });
  equalCanonical(values.map(value => value.questionKey), expectedAquinasPackageQuestionKeys(), 'metrics', 'must preserve exact ordered 512-question coverage');
  return AQUINAS_PACKAGE_PARTS.flatMap(part => {
    const questions = values.filter(value => partForQuestionKey(value.questionKey) === part.key);
    const planned: { partKey: AquinasPackagePartKey; questionKeys: string[]; normalizedContentUtf8Bytes: number; canonicalSerializedPackageUtf8Bytes: number }[] = [];
    let start = 0;
    while (start < questions.length) {
      let end = start; let content = 0; let serialized = 0;
      while (end < questions.length) {
        const next = questions[end]!;
        if (content + next.normalizedContentUtf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes || serialized + next.canonicalSerializedPackageUtf8Bytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes) break;
        content += next.normalizedContentUtf8Bytes; serialized += next.canonicalSerializedPackageUtf8Bytes; end += 1;
      }
      if (end === start) fail(`metrics[${start}]`, 'one parent question cannot fit package caps without splitting');
      planned.push({ partKey: part.key, questionKeys: questions.slice(start, end).map(value => value.questionKey), normalizedContentUtf8Bytes: content, canonicalSerializedPackageUtf8Bytes: serialized });
      start = end;
    }
    return planned;
  });
}

export function canonicalSectionedEditionCollectionPackageBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(canonicalize(value)));
}

/** Strict transient-input schema validation; raw reviewed HTML never crosses this boundary into persistence. */
export function validateTransientSectionedEditionCollectionPackageDraft(input: unknown): TransientSectionedEditionCollectionDraft {
  return validateTransientDraft(input);
}

export function compileSectionedEditionCollectionPackage(input: unknown): CompiledSectionedEditionCollectionPackageSet {
  return compileValidatedTransientDraft(validateTransientDraft(input));
}

function compileValidatedTransientDraft(draft: TransientSectionedEditionCollectionDraft): CompiledSectionedEditionCollectionPackageSet {
  const compiled = compileTransientDraft(draft);
  const packages = shardCompiledDraft(draft, compiled.questions, compiled.prologues);
  const manifest = buildManifest(packages, draft);
  return { manifest, packages };
}

/** Recompiles from transient reviewed input and performs exact byte-for-byte persisted-file verification. */
export function verifyPersistedPackageBytes(input: unknown, persistedBytes: readonly Uint8Array[]): CompiledSectionedEditionCollectionPackageSet {
  const draft = validateTransientDraft(input);
  if (draft.mode !== 'a1_attested') fail('$.mode', 'release byte verification accepts only a1_attested reviewed input; synthetic fixtures are non-release');
  const compiled = compileValidatedTransientDraft(draft);
  if (persistedBytes.length !== compiled.packages.length) fail('persistedBytes', 'must contain one canonical file per deterministic shard');
  for (let index = 0; index < compiled.packages.length; index += 1) {
    if (!sameBytes(compiled.packages[index]!.persistedBytes, persistedBytes[index]!)) fail(`persistedBytes[${index}]`, 'does not byte-compare with canonical recompilation from transient input');
  }
  return compiled;
}

/** A testable content-free check for the immutable A1 descriptor itself. */
export function validateImmutableA1EvidenceDescriptor(): void {
  if (AQUINAS_A1_SOURCES.length !== 4) fail('A1.sources', 'must enumerate exactly four HTML artifacts');
  if (AQUINAS_A1_TOPOLOGY_VECTOR.questionCount !== 512 || AQUINAS_A1_TOPOLOGY_VECTOR.preambleCount !== 512 || AQUINAS_A1_TOPOLOGY_VECTOR.articleCount !== 2_669) fail('A1.topology', 'must bind 512 questions, 512 preambles, and 2669 articles');
  if (AQUINAS_A1_DISCREPANCY_INVENTORY.length !== 46) fail('A1.discrepancies', 'must bind the ordered 46-entry discrepancy inventory');
  const prologues = AQUINAS_A1_TOPOLOGY_VECTOR.partPrologues.map(value => `${value.partKey}:${value.count}`).join(',');
  if (prologues !== 'prima:1,prima-secundae:1,secunda-secundae:0,tertia:1') fail('A1.prologues', 'must include Prima, I-II, and III only');
  if (AQUINAS_A1_TOPOLOGY_VECTOR.typedRangeCount !== 3_184 || AQUINAS_A1_TOPOLOGY_VECTOR.typedRangesSha256 !== AQUINAS_A1_TOPOLOGY_LOCK_SHA256) fail('A1.typedRanges', 'must bind the exact 3,184 typed child-span topology lock');
  if (AQUINAS_A1_TOPOLOGY_VECTOR.partQuestionPreambles.map(value => value.count).join(',') !== '119,114,189,90' || AQUINAS_A1_TOPOLOGY_VECTOR.partArticles.map(value => value.count).join(',') !== '584,619,917,549') fail('A1.topology', 'must retain exact per-part preamble and article counts');
  if (AQUINAS_A1_RIGHTS_AND_COVERAGE.authorialCoverageThrough !== 'tertia.q090' || AQUINAS_A1_RIGHTS_AND_COVERAGE.supplement !== 'excluded') fail('A1.coverage', 'must stop authorial delivery at III.90 and exclude the Supplement');
}

function validateTransientDraft(input: unknown): TransientSectionedEditionCollectionDraft {
  const root = objectAt(input, '$', ['mode', 'schemaVersion', 'normalizationPolicy', 'identity', 'sourceLockSha256', 'localReceiptSha256', 'topologyLockSha256', 'typedRangeCount', 'typedRangesSha256', 'discrepancyLedgerSha256', 'sourceArtifacts', 'rightsAndCoverage', 'partPrologues', 'exclusions', 'discrepancies', 'questions']);
  const mode = enumAt(root.mode, '$.mode', ['synthetic_fixture', 'a1_attested'] as const);
  literalAt(root.schemaVersion, '$.schemaVersion', SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA);
  literalAt(root.normalizationPolicy, '$.normalizationPolicy', SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY);
  const identity = validateExactIdentity(root.identity, '$.identity');
  const sourceArtifacts = arrayAt(root.sourceArtifacts, '$.sourceArtifacts', 1, 4).map((value, index) => validateSourceArtifact(value, `$.sourceArtifacts[${index}]`));
  assertUnique(sourceArtifacts.map(value => value.artifactId), '$.sourceArtifacts');
  const artifacts = new Map(sourceArtifacts.map(value => [value.artifactId, value] as const));
  const sourceLockSha256 = shaAt(root.sourceLockSha256, '$.sourceLockSha256');
  const localReceiptSha256 = shaAt(root.localReceiptSha256, '$.localReceiptSha256');
  const topologyLockSha256 = shaAt(root.topologyLockSha256, '$.topologyLockSha256');
  const typedRangeCount = integerAt(root.typedRangeCount, '$.typedRangeCount', 1);
  const typedRangesSha256 = shaAt(root.typedRangesSha256, '$.typedRangesSha256');
  const discrepancyLedgerSha256 = shaAt(root.discrepancyLedgerSha256, '$.discrepancyLedgerSha256');
  const rightsAndCoverage = validateRightsAndCoverage(root.rightsAndCoverage, '$.rightsAndCoverage');
  const partPrologues = arrayAt(root.partPrologues, '$.partPrologues', 0, 3).map((value, index) => validatePrologue(value, `$.partPrologues[${index}]`, artifacts));
  assertExactPrologueInventory(partPrologues, '$.partPrologues');
  const exclusions = arrayAt(root.exclusions, '$.exclusions', 0, 16_384).map((value, index) => validateExclusion(value, `$.exclusions[${index}]`, artifacts));
  const discrepancies = arrayAt(root.discrepancies, '$.discrepancies', 0, 46).map((value, index) => validateDiscrepancy(value, `$.discrepancies[${index}]`));
  const refs = new Map(discrepancies.map(value => [value.ref, value] as const));
  const questions = arrayAt(root.questions, '$.questions', 1, 512).map((value, index) => validateQuestion(value, `$.questions[${index}]`, artifacts, refs));
  const typedRanges = typedRangeRows(partPrologues, questions);
  if (typedRangeCount !== typedRanges.length) fail('$.typedRangeCount', 'must equal the exact ordered prologue/preamble/article source-range count');
  literalAt(typedRangesSha256, '$.typedRangesSha256', typedRangeDigest(typedRanges));
  assertDraftStats([...partPrologues.map(value => value.child), ...questions.flatMap(question => [question.preamble, ...question.articles])], exclusions);
  assertCoverage(sourceArtifacts, partPrologues, exclusions, questions);
  const draft = { mode, schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA, normalizationPolicy: SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY, identity, sourceLockSha256, localReceiptSha256, topologyLockSha256, typedRangeCount, typedRangesSha256, discrepancyLedgerSha256, sourceArtifacts, rightsAndCoverage, partPrologues, exclusions, discrepancies, questions };
  if (mode === 'a1_attested') assertA1AttestedDraft(draft);
  return draft;
}

function validateExactIdentity(input: unknown, path: string): typeof AQUINAS_A1_PACKAGE_IDENTITY {
  const root = objectAt(input, path, ['workId', 'editionId', 'collectionId', 'contentFormat', 'availability']);
  for (const key of Object.keys(AQUINAS_A1_PACKAGE_IDENTITY) as (keyof typeof AQUINAS_A1_PACKAGE_IDENTITY)[]) literalAt(root[key], `${path}.${key}`, AQUINAS_A1_PACKAGE_IDENTITY[key]);
  return { ...AQUINAS_A1_PACKAGE_IDENTITY };
}

function validateRightsAndCoverage(input: unknown, path: string): typeof AQUINAS_A1_RIGHTS_AND_COVERAGE {
  const root = objectAt(input, path, ['jurisdiction', 'rightsStatus', 'editionLineageDisclosure', 'limitations', 'authorialCoverageThrough', 'supplement', 'exclusionKinds']);
  equalCanonical(root, AQUINAS_A1_RIGHTS_AND_COVERAGE, path, 'must exactly bind the immutable US-only rights, lineage, limitations, and coverage descriptor');
  return structuredClone(AQUINAS_A1_RIGHTS_AND_COVERAGE);
}

function validateSourceArtifact(input: unknown, path: string): SourceArtifactEvidence {
  const root = objectAt(input, path, ['artifactId', 'partKey', 'htmlMemberBytes', 'htmlMemberSha256', 'intellectualStartByte', 'cutoffEndByte', 'rawCoverageSha256', 'html']);
  const start = integerAt(root.intellectualStartByte, `${path}.intellectualStartByte`, 0);
  const end = integerAt(root.cutoffEndByte, `${path}.cutoffEndByte`, start + 1);
  const html = textAt(root.html, `${path}.html`, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.draftRawUtf8Bytes);
  const htmlMemberBytes = integerAt(root.htmlMemberBytes, `${path}.htmlMemberBytes`, end);
  if (utf8Length(html) !== htmlMemberBytes || sha256Hex(html) !== root.htmlMemberSha256) fail(path, 'must bind exact full artifact bytes and ordinary SHA-256');
  const coverage = decodeUtf8(utf8Bytes(html).slice(start, end), `${path}.rawCoverage`);
  if (sha256Hex(coverage) !== root.rawCoverageSha256) fail(path, 'must bind the separately scoped intellectual rawCoverage SHA-256');
  return {
    artifactId: safeIdAt(root.artifactId, `${path}.artifactId`),
    partKey: enumAt(root.partKey, `${path}.partKey`, AQUINAS_PACKAGE_PARTS.map(part => part.key)),
    htmlMemberBytes,
    htmlMemberSha256: shaAt(root.htmlMemberSha256, `${path}.htmlMemberSha256`),
    intellectualStartByte: start,
    cutoffEndByte: end,
    rawCoverageSha256: shaAt(root.rawCoverageSha256, `${path}.rawCoverageSha256`),
    html,
  };
}

function validatePrologue(input: unknown, path: string, artifacts: ReadonlyMap<string, SourceArtifactEvidence>): TransientPartPrologue {
  const root = objectAt(input, path, ['partKey', 'child']);
  const partKey = enumAt(root.partKey, `${path}.partKey`, AQUINAS_PACKAGE_PARTS.map(part => part.key));
  if (partKey === 'secunda-secundae') fail(`${path}.partKey`, 'must not manufacture a II-II prologue');
  const child = validateChild(root.child, `${path}.child`, artifacts, 'part_prologue');
  const source = artifacts.get(child.source.artifactId)!;
  if (source.partKey !== partKey) fail(`${path}.child.source.artifactId`, 'must use its own part artifact');
  return { partKey, child };
}

/** A1 never permits a fabricated II-II prologue or a missing Prima/I-II/III prologue. */
function assertExactPrologueInventory(prologues: readonly TransientPartPrologue[], path: string): void {
  const actual = prologues.map(value => value.partKey);
  equalCanonical(actual, ['prima', 'prima-secundae', 'tertia'], path, 'must contain exactly the ordered Prima, I-II, and III prologues (none for II-II)');
}

type TypedRangeRow = readonly [kind: TransientChild['kind'], partKey: AquinasPackagePartKey, questionKey: string | null, articleKey: string | null, artifactId: string, startByte: number, endByte: number, rawSha256: string];

/** Ordered child-span inventory forbids changing preamble/article boundaries without changing the committed digest. */
function typedRangeRows(prologues: readonly TransientPartPrologue[], questions: readonly TransientQuestion[]): TypedRangeRow[] {
  return [
    ...prologues.map(value => typedRangeRow(value.child, value.partKey, null)),
    ...questions.flatMap(question => [typedRangeRow(question.preamble, question.partKey, question.questionKey), ...question.articles.map(article => typedRangeRow(article, question.partKey, question.questionKey))]),
  ];
}

function typedRangeRow(child: TransientChild, partKey: AquinasPackagePartKey, questionKey: string | null): TypedRangeRow {
  return [child.kind, partKey, questionKey, child.articleKey ?? null, child.source.artifactId, child.source.span.startByte, child.source.span.endByte, child.source.span.rawSha256];
}

function typedRangeDigest(rows: readonly TypedRangeRow[]): string {
  return domainHash('sectioned-edition-collection-package.typed-child-ranges.v1', canonicalSectionedEditionCollectionPackageBytes(rows));
}

function validateExclusion(input: unknown, path: string, artifacts: ReadonlyMap<string, SourceArtifactEvidence>): TransientExclusion {
  const root = objectAt(input, path, ['exclusionId', 'kind', 'artifactId', 'span', 'html']);
  const artifactId = safeIdAt(root.artifactId, `${path}.artifactId`);
  if (!artifacts.has(artifactId)) fail(`${path}.artifactId`, 'must reference a declared source artifact');
  const html = textAt(root.html, `${path}.html`, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.childRawUtf8Bytes);
  const span = validateRawSpan(root.span, `${path}.span`);
  if (utf8Length(html) !== span.endByte - span.startByte || sha256Hex(html) !== span.rawSha256) fail(`${path}`, 'must hash-verify its transient excluded bytes against the exact span');
  assertSpanMatchesArtifact(artifacts.get(artifactId)!, span, `${path}.span`);
  return { exclusionId: safeIdAt(root.exclusionId, `${path}.exclusionId`), kind: enumAt(root.kind, `${path}.kind`, AQUINAS_A1_RIGHTS_AND_COVERAGE.exclusionKinds), artifactId, span, html };
}

function validateDiscrepancy(input: unknown, path: string): TransientDiscrepancy {
  const root = objectAt(input, path, ['ref', 'canonicalEntrySha256', 'questionKey', 'articleKey', 'observed', 'resolved']);
  const observed = objectAt(root.observed, `${path}.observed`, ['locator', 'tagName', 'span']);
  const resolved = objectAt(root.resolved, `${path}.resolved`, ['preambleSpan', 'articleSpan', 'articleCount']);
  return {
    ref: safeIdAt(root.ref, `${path}.ref`), canonicalEntrySha256: shaAt(root.canonicalEntrySha256, `${path}.canonicalEntrySha256`), questionKey: questionKeyAt(root.questionKey, `${path}.questionKey`), articleKey: nullableArticleKey(root.articleKey, `${path}.articleKey`),
    observed: { locator: nullableText(observed.locator, `${path}.observed.locator`), tagName: nullableText(observed.tagName, `${path}.observed.tagName`), span: nullableRawSpan(observed.span, `${path}.observed.span`) },
    resolved: { preambleSpan: nullableRawSpan(resolved.preambleSpan, `${path}.resolved.preambleSpan`), articleSpan: nullableRawSpan(resolved.articleSpan, `${path}.resolved.articleSpan`), articleCount: resolved.articleCount === null ? null : integerAt(resolved.articleCount, `${path}.resolved.articleCount`, 1) },
  };
}

function validateQuestion(input: unknown, path: string, artifacts: ReadonlyMap<string, SourceArtifactEvidence>, discrepancies: ReadonlyMap<string, TransientDiscrepancy>): TransientQuestion {
  const root = objectAt(input, path, ['questionKey', 'partKey', 'questionNumber', 'articleCount', 'source', 'orderedArticleKeysSha256', 'bracketStatus', 'sourceLocatorStatus', 'sourceStructureStatus', 'discrepancyRefs', 'preamble', 'articles']);
  const questionKey = questionKeyAt(root.questionKey, `${path}.questionKey`);
  const partKey = partForQuestionKey(questionKey);
  literalAt(root.partKey, `${path}.partKey`, partKey);
  const questionNumber = integerAt(root.questionNumber, `${path}.questionNumber`, 1);
  literalAt(questionKey, `${path}.questionKey`, `${partKey}.q${String(questionNumber).padStart(3, '0')}`);
  const sourceRoot = objectAt(root.source, `${path}.source`, ['artifactId', 'span']);
  const artifactId = safeIdAt(sourceRoot.artifactId, `${path}.source.artifactId`);
  const artifact = artifacts.get(artifactId);
  if (!artifact || artifact.partKey !== partKey) fail(`${path}.source.artifactId`, 'must use the matching part artifact');
  const source = { artifactId, span: validateRawSpan(sourceRoot.span, `${path}.source.span`) };
  assertSpanMatchesArtifact(artifact, source.span, `${path}.source.span`);
  const articleCount = integerAt(root.articleCount, `${path}.articleCount`, 1);
  const preamble = validateChild(root.preamble, `${path}.preamble`, artifacts, 'preamble');
  const articles = arrayAt(root.articles, `${path}.articles`, articleCount, articleCount).map((value, index) => validateChild(value, `${path}.articles[${index}]`, artifacts, 'article'));
  assertArticleSequence(questionKey, articles, path);
  assertQuestionChildCoverage(source, [preamble, ...articles], `${path}.source`);
  const refs = arrayAt(root.discrepancyRefs, `${path}.discrepancyRefs`, 0, 46).map((value, index) => safeIdAt(value, `${path}.discrepancyRefs[${index}]`));
  assertUnique(refs, `${path}.discrepancyRefs`);
  for (const ref of refs) {
    const discrepancy = discrepancies.get(ref);
    if (!discrepancy || discrepancy.questionKey !== questionKey) fail(`${path}.discrepancyRefs`, 'must reference exactly a discrepancy for this question');
  }
  const sourceLocatorStatus = enumAt(root.sourceLocatorStatus, `${path}.sourceLocatorStatus`, ['verified', 'discrepancy_ledgered'] as const);
  const sourceStructureStatus = enumAt(root.sourceStructureStatus, `${path}.sourceStructureStatus`, ['verified', 'discrepancy_ledgered'] as const);
  if (refs.length === 0 && (sourceLocatorStatus !== 'verified' || sourceStructureStatus !== 'verified')) fail(`${path}`, 'cannot ledger a locator or structure discrepancy without an ordered ref');
  return { questionKey, partKey, questionNumber, articleCount, source, orderedArticleKeysSha256: shaAt(root.orderedArticleKeysSha256, `${path}.orderedArticleKeysSha256`), bracketStatus: literalValue(root.bracketStatus, `${path}.bracketStatus`, 'mixed_unresolved_preserve_verbatim_in_a2'), sourceLocatorStatus, sourceStructureStatus, discrepancyRefs: refs, preamble, articles };
}

function validateChild(input: unknown, path: string, artifacts: ReadonlyMap<string, SourceArtifactEvidence>, expectedKind: TransientChild['kind']): TransientChild {
  const keys = expectedKind === 'article' ? ['kind', 'articleKey', 'ordinal', 'source', 'bracketPreservationStatus', 'correctionStatus'] : ['kind', 'source', 'bracketPreservationStatus', 'correctionStatus'];
  const root = objectAt(input, path, keys);
  literalAt(root.kind, `${path}.kind`, expectedKind);
  literalAt(root.bracketPreservationStatus, `${path}.bracketPreservationStatus`, SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS);
  literalAt(root.correctionStatus, `${path}.correctionStatus`, SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS);
  const sourceRoot = objectAt(root.source, `${path}.source`, ['artifactId', 'span', 'blocks']);
  const artifactId = safeIdAt(sourceRoot.artifactId, `${path}.source.artifactId`);
  if (!artifacts.has(artifactId)) fail(`${path}.source.artifactId`, 'must reference a declared source artifact');
  const span = validateRawSpan(sourceRoot.span, `${path}.source.span`);
  const artifact = artifacts.get(artifactId)!;
  assertSpanMatchesArtifact(artifact, span, `${path}.source.span`);
  const blocks = arrayAt(sourceRoot.blocks, `${path}.source.blocks`, 1, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.childBlocks).map((value, index) => validateBlock(value, `${path}.source.blocks[${index}]`));
  for (let index = 0; index < blocks.length; index += 1) assertSpanMatchesArtifact(artifact, blocks[index]!.span, `${path}.source.blocks[${index}].span`);
  assertBlockCoverage(span, blocks, `${path}.source`);
  const article = expectedKind === 'article' ? { articleKey: articleKeyAt(root.articleKey, `${path}.articleKey`), ordinal: integerAt(root.ordinal, `${path}.ordinal`, 1) } : {};
  return { kind: expectedKind, ...article, source: { artifactId, span, blocks }, bracketPreservationStatus: SECTIONED_EDITION_COLLECTION_BRACKET_PRESERVATION_STATUS, correctionStatus: SECTIONED_EDITION_COLLECTION_CORRECTION_STATUS };
}

function validateBlock(input: unknown, path: string): TransientReviewedBlock {
  const root = objectAt(input, path, ['span', 'html', 'topology']);
  const html = textAt(root.html, `${path}.html`, SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.childRawUtf8Bytes);
  const span = validateRawSpan(root.span, `${path}.span`);
  if (utf8Length(html) !== span.endByte - span.startByte) fail(`${path}.span`, 'must exactly cover transient raw HTML bytes');
  literalAt(span.rawSha256, `${path}.span.rawSha256`, sha256Hex(html));
  return { span, html, topology: validateTopology(root.topology, `${path}.topology`) };
}

function validateTopology(input: unknown, path: string): ReviewedTopology {
  const root = objectAt(input, path, ['containerTag', 'inlineTags']);
  const containerTag = enumAt(root.containerTag, `${path}.containerTag`, ['p', 'div', 'blockquote', 'h4', 'h5'] as const);
  const inlineTags = arrayAt(root.inlineTags, `${path}.inlineTags`, 0, 7).map((value, index) => enumAt(value, `${path}.inlineTags[${index}]`, ['i', 'em', 'b', 'strong', 'span', 'sup', 'sub'] as const));
  assertUnique(inlineTags, `${path}.inlineTags`);
  return { containerTag, inlineTags };
}

function compileTransientDraft(draft: TransientSectionedEditionCollectionDraft): { questions: PersistedQuestion[]; prologues: Map<AquinasPackagePartKey, PersistedChild> } {
  let cursor = 0;
  const prologues = new Map<AquinasPackagePartKey, PersistedChild>();
  const questions: PersistedQuestion[] = [];
  for (const part of AQUINAS_PACKAGE_PARTS) {
    const prologue = draft.partPrologues.find(value => value.partKey === part.key);
    if (prologue) {
      const compiled = compileChild(prologue.child, cursor, `$.partPrologues.${part.key}`);
      cursor = compiled.output.endByte;
      prologues.set(part.key, compiled);
    }
    for (const question of draft.questions.filter(value => value.partKey === part.key)) {
      const preamble = compileChild(question.preamble, cursor, `$.questions.${question.questionKey}.preamble`);
      cursor = preamble.output.endByte;
      const articles = question.articles.map((article, index) => {
        const compiled = compileChild(article, cursor, `$.questions.${question.questionKey}.articles[${index}]`);
        cursor = compiled.output.endByte;
        return compiled;
      });
      const output = outputForChildren([preamble, ...articles], `$.questions.${question.questionKey}.output`);
      questions.push({ ...omitQuestionChildren(question), source: { artifactId: question.source.artifactId, span: question.source.span, rawStats: aggregateStats([question.preamble, ...question.articles]) }, output, preamble, articles });
    }
  }
  return { questions, prologues };
}

function compileChild(child: TransientChild, startByte: number, path: string): PersistedChild {
  const rendered = child.source.blocks.map((block, index) => renderReviewedElement(block, `${path}.source.blocks[${index}]`));
  const content = rendered.map(value => value.content).join('\n\n');
  assertContent(content, `${path}.content`);
  const outputBytes = utf8Length(content);
  if (outputBytes > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.contentChildUtf8Bytes) fail(`${path}.content`, 'exceeds the per-content-child 131072 UTF-8 byte cap');
  const stats = aggregateRawStats(rendered);
  assertStats(stats, 'child', `${path}.source`);
  const output = { startByte, endByte: startByte + outputBytes, utf8Bytes: outputBytes, sha256: sha256Hex(content) };
  const source: PersistedSourceEvidence = { artifactId: child.source.artifactId, span: child.source.span, outputSha256: output.sha256, outputUtf8Bytes: outputBytes, rawStats: stats };
  const article = child.kind === 'article' ? { articleKey: child.articleKey, ordinal: child.ordinal } : {};
  return { kind: child.kind, ...article, source, output, content, bracketPreservationStatus: child.bracketPreservationStatus, correctionStatus: child.correctionStatus };
}

/** Real-shaped parse5 renderer: one pinned container, explicit inline topology, and br-derived LF only. */
export function renderReviewedElement(block: TransientReviewedBlock, path = 'block'): { content: string; stats: RawStats } {
  assertTextUnicode(block.html, path, true);
  const parserErrors: string[] = [];
  const fragment = parseFragment(block.html, { onParseError: error => parserErrors.push(error.code) });
  if (parserErrors.length > 0) fail(path, `parse5 rejected malformed reviewed markup (${parserErrors[0]})`);
  const meaningful = fragment.childNodes.filter(node => !(node.nodeName === '#text' && 'value' in node && /^[\u0009-\u000d\u0020]*$/.test(node.value)));
  if (meaningful.length !== 1) fail(path, 'must contain one reviewed container plus only separator whitespace');
  const container = meaningful[0]!;
  if (!('tagName' in container) || container.tagName !== block.topology.containerTag) fail(path, 'does not match the pinned reviewed container topology');
  const state = { nodes: 0, depth: 0, attributes: 0 };
  const content = materializeTokens(renderContainer(container, block.topology, state, 1, path)).normalize('NFC');
  assertContent(content, path);
  const stats = { rawUtf8Bytes: utf8Length(block.html), nodes: state.nodes, depth: state.depth, attributes: state.attributes, blocks: 1 };
  assertStats(stats, 'child', path);
  return { content, stats };
}

type RenderToken = { type: 'text'; value: string } | { type: 'br' };
function renderContainer(node: DefaultTreeAdapterTypes.Element, topology: ReviewedTopology, state: { nodes: number; depth: number; attributes: number }, depth: number, path: string): RenderToken[] {
  state.nodes += 1; state.depth = Math.max(state.depth, depth); state.attributes += node.attrs.length;
  validateInertAttributes(node.attrs, path);
  return renderNodes(node.childNodes, topology, state, depth + 1, path);
}

function renderNodes(nodes: readonly DefaultTreeAdapterTypes.ChildNode[], topology: ReviewedTopology, state: { nodes: number; depth: number; attributes: number }, depth: number, path: string): RenderToken[] {
  const content: RenderToken[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    state.nodes += 1; state.depth = Math.max(state.depth, depth);
    if (node.nodeName === '#text' && 'value' in node) { content.push({ type: 'text', value: node.value }); continue; }
    if ('tagName' in node && node.tagName === 'br') { if (node.attrs.length !== 0 || node.childNodes.length !== 0) fail(`${path}[${index}]`, 'br must be attribute-free and empty'); content.push({ type: 'br' }); continue; }
    if ('tagName' in node && topology.inlineTags.includes(node.tagName as ReviewedTopology['inlineTags'][number])) {
      validateInertAttributes(node.attrs, `${path}[${index}]`);
      state.attributes += node.attrs.length;
      content.push(...renderNodes(node.childNodes, topology, state, depth + 1, `${path}[${index}]`));
      continue;
    }
    fail(`${path}[${index}]`, 'contains a node outside the pinned container/inline topology');
  }
  return content;
}

function materializeTokens(tokens: readonly RenderToken[]): string {
  const chunks: string[] = [];
  for (const token of tokens) {
    if (token.type === 'br') { if (chunks.length > 0) chunks[chunks.length - 1] = chunks.at(-1)!.replace(/ +$/g, ''); chunks.push('\n'); continue; }
    const text = token.value.replace(/[\u0009-\u000d\u0020]+/g, ' ');
    if (chunks.at(-1) === '\n') chunks.push(text.replace(/^ +/g, '')); else chunks.push(text);
  }
  return chunks.join('').replace(/^ +| +$/g, '');
}
function validateInertAttributes(attrs: readonly { name: string; value: string }[], path: string): void {
  const names = new Set<string>();
  for (const attr of attrs) {
    if (names.has(attr.name) || !['id', 'class'].includes(attr.name)) fail(path, 'allows only closed inert id/class attributes');
    names.add(attr.name);
    if (attr.name === 'id' && !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(attr.value)) fail(path, 'contains an invalid inert id');
    if (attr.name === 'class' && !/^[A-Za-z0-9_-]+(?: [A-Za-z0-9_-]+)*$/.test(attr.value)) fail(path, 'contains an invalid inert class');
  }
}

function shardCompiledDraft(draft: TransientSectionedEditionCollectionDraft, questions: readonly PersistedQuestion[], prologues: ReadonlyMap<AquinasPackagePartKey, PersistedChild>): CompiledSectionedEditionCollectionPackage[] {
  const packages: CompiledSectionedEditionCollectionPackage[] = [];
  for (const part of AQUINAS_PACKAGE_PARTS) {
    const partQuestions = questions.filter(question => question.partKey === part.key);
    let start = 0; let ordinal = 1;
    while (start < partQuestions.length) {
      let end = start; let contentBytes = ordinal === 1 && prologues.get(part.key) ? prologues.get(part.key)!.output.utf8Bytes : 0; let candidate: PersistedPackage | undefined;
      while (end < partQuestions.length) {
        const next = partQuestions[end]!;
        const candidateContent = contentBytes + next.output.utf8Bytes;
        if (candidateContent > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.packageContentUtf8Bytes) break;
        const packageValue = makePackage(draft, part.key, ordinal, partQuestions.slice(start, end + 1), prologues.get(part.key) ?? null, candidateContent);
        if (canonicalSectionedEditionCollectionPackageBytes(packageValue).byteLength > SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS.canonicalSerializedPackageUtf8Bytes) break;
        contentBytes = candidateContent; candidate = packageValue; end += 1;
      }
      if (!candidate) fail(`$.questions[${start}]`, 'one parent question cannot fit reviewed package caps without splitting');
      const persistedBytes = canonicalSectionedEditionCollectionPackageBytes(candidate);
      packages.push({ package: candidate, persistedBytes, persistedSha256: domainHash('sectioned-edition-collection-package.bytes.v1', persistedBytes) });
      start = end; ordinal += 1;
    }
  }
  return packages;
}

function makePackage(draft: TransientSectionedEditionCollectionDraft, partKey: AquinasPackagePartKey, ordinal: number, questions: readonly PersistedQuestion[], partPrologue: PersistedChild | null, normalizedContentUtf8Bytes: number): PersistedPackage {
  const questionKeys = questions.map(value => value.questionKey);
  const articleKeys = questions.flatMap(question => question.articles.map(article => article.articleKey!));
  return {
    schemaVersion: SECTIONED_EDITION_COLLECTION_PACKAGE_SCHEMA,
    identity: draft.identity,
    normalizationPolicy: SECTIONED_EDITION_COLLECTION_NORMALIZATION_POLICY,
    sourceLockSha256: draft.sourceLockSha256,
    localReceiptSha256: draft.localReceiptSha256,
    topologyLockSha256: draft.topologyLockSha256,
    typedRangeCount: draft.typedRangeCount,
    typedRangesSha256: draft.typedRangesSha256,
    discrepancyLedgerSha256: draft.discrepancyLedgerSha256,
    discrepancyEntryHashAlgorithm: AQUINAS_A1_DISCREPANCY_ENTRY_HASH_ALGORITHM,
    fixtureStatus: draft.mode === 'synthetic_fixture' ? 'synthetic_fixture_non_release' : null,
    rightsAndCoverage: draft.rightsAndCoverage,
    sourceArtifacts: draft.sourceArtifacts.map(({ html: _html, ...source }) => structuredClone(source)),
    exclusions: draft.exclusions.map(value => ({ exclusionId: value.exclusionId, kind: value.kind, artifactId: value.artifactId, span: value.span })),
    discrepancyInventory: structuredClone(draft.discrepancies),
    shard: { shardId: `aquinas-summa-pg-v1.${partKey}.shard-${String(ordinal).padStart(4, '0')}`, partKey, ordinal, firstQuestionKey: questionKeys[0]!, lastQuestionKey: questionKeys.at(-1)!, questionKeys, orderedArticleKeysSha256: domainHash('sectioned-edition-collection-package.article-keys.v1', canonicalSectionedEditionCollectionPackageBytes(articleKeys)), normalizedContentUtf8Bytes },
    partPrologue: ordinal === 1 ? partPrologue : null,
    questions: structuredClone([...questions]),
  };
}

function buildManifest(packages: readonly CompiledSectionedEditionCollectionPackage[], draft: TransientSectionedEditionCollectionDraft): PersistedManifest {
  const questionKeys = packages.flatMap(value => value.package.shard.questionKeys);
  const articleKeys = packages.flatMap(value => value.package.questions.flatMap(question => question.articles.map(article => article.articleKey!)));
  const shards = packages.map(value => ({ shardId: value.package.shard.shardId, partKey: value.package.shard.partKey, ordinal: value.package.shard.ordinal, firstQuestionKey: value.package.shard.firstQuestionKey, lastQuestionKey: value.package.shard.lastQuestionKey, questionKeys: value.package.shard.questionKeys, normalizedContentUtf8Bytes: value.package.shard.normalizedContentUtf8Bytes, canonicalSerializedPackageUtf8Bytes: value.persistedBytes.byteLength, canonicalPackageSha256: value.persistedSha256 }));
  const base = { schemaVersion: SECTIONED_EDITION_COLLECTION_MANIFEST_SCHEMA, identity: draft.identity, topologyLockSha256: draft.topologyLockSha256, discrepancyLedgerSha256: draft.discrepancyLedgerSha256, orderedQuestionKeysSha256: domainHash('sectioned-edition-collection-package.question-keys.v1', canonicalSectionedEditionCollectionPackageBytes(questionKeys)), orderedArticleKeysSha256: domainHash('sectioned-edition-collection-package.article-keys.v1', canonicalSectionedEditionCollectionPackageBytes(articleKeys)), shards };
  return { ...base, aggregateSha256: domainHash('sectioned-edition-collection-manifest.v1', canonicalSectionedEditionCollectionPackageBytes(base)) };
}

function assertA1AttestedDraft(draft: TransientSectionedEditionCollectionDraft): void {
  validateImmutableA1EvidenceDescriptor();
  literalAt(draft.sourceLockSha256, '$.sourceLockSha256', AQUINAS_A1_SOURCE_LOCK_SHA256);
  literalAt(draft.localReceiptSha256, '$.localReceiptSha256', AQUINAS_A1_LOCAL_RECEIPT_SHA256);
  literalAt(draft.topologyLockSha256, '$.topologyLockSha256', AQUINAS_A1_TOPOLOGY_LOCK_SHA256);
  literalAt(draft.typedRangeCount, '$.typedRangeCount', AQUINAS_A1_TOPOLOGY_VECTOR.typedRangeCount);
  literalAt(draft.typedRangesSha256, '$.typedRangesSha256', AQUINAS_A1_TOPOLOGY_VECTOR.typedRangesSha256);
  literalAt(draft.discrepancyLedgerSha256, '$.discrepancyLedgerSha256', AQUINAS_A1_DISCREPANCY_LEDGER_SHA256);
  equalCanonical(draft.sourceArtifacts.map(({ html: _html, ...source }) => source), AQUINAS_A1_SOURCES.map(source => ({ artifactId: `pg-${source.ebookId}`, ...source })), '$.sourceArtifacts', 'must bind the four exact A0 HTML IDs, bytes, and hashes');
  const questions = draft.questions.map(question => [question.questionKey, question.partKey, question.questionNumber, question.articleCount, question.source.span.startByte, question.source.span.endByte, question.source.span.rawSha256, question.orderedArticleKeysSha256, question.bracketStatus, question.sourceLocatorStatus, question.sourceStructureStatus]);
  literalAt(domainHash('sectioned-edition-collection-package.question-vector.v1', canonicalSectionedEditionCollectionPackageBytes(questions)), '$.questions', AQUINAS_A1_TOPOLOGY_VECTOR.questionVectorSha256);
  const articleKeys = draft.questions.flatMap(question => question.articles.map(article => article.articleKey!));
  literalAt(articleKeys.length, '$.questions.articles', AQUINAS_A1_TOPOLOGY_VECTOR.articleCount);
  literalAt(domainHash('sectioned-edition-collection-package.article-vector.v1', canonicalSectionedEditionCollectionPackageBytes(articleKeys)), '$.questions.articles', AQUINAS_A1_TOPOLOGY_VECTOR.articleVectorSha256);
  const discrepancyInventory = draft.discrepancies.map(value => [value.ref, value.canonicalEntrySha256, value.questionKey, value.articleKey]);
  const expectedInventory = AQUINAS_A1_DISCREPANCY_INVENTORY.map(value => [value.ref, value.canonicalEntrySha256, value.questionKey, value.articleKey]);
  equalCanonical(discrepancyInventory, expectedInventory, '$.discrepancies', 'must bind exact ordered observed-versus-resolved A1 discrepancy inventory');
  literalAt(domainHash('sectioned-edition-collection-package.discrepancy-vector.v1', canonicalSectionedEditionCollectionPackageBytes(expectedInventory)), '$.discrepancies', AQUINAS_A1_DISCREPANCY_VECTOR_SHA256);
  for (const question of draft.questions) {
    const expectedRefs = AQUINAS_A1_DISCREPANCY_INVENTORY.filter(value => value.questionKey === question.questionKey).map(value => value.ref);
    equalCanonical(question.discrepancyRefs, expectedRefs, `$.questions.${question.questionKey}.discrepancyRefs`, 'must contain the exact full locator/structure discrepancy ref set');
  }
}

function assertCoverage(artifacts: readonly SourceArtifactEvidence[], prologues: readonly TransientPartPrologue[], exclusions: readonly TransientExclusion[], questions: readonly TransientQuestion[]): void {
  for (const artifact of artifacts) {
    const ranges = [
      ...prologues.filter(value => value.child.source.artifactId === artifact.artifactId).map(value => value.child.source.span),
      ...questions.filter(value => value.source.artifactId === artifact.artifactId).map(value => value.source.span),
      ...exclusions.filter(value => value.artifactId === artifact.artifactId).map(value => value.span),
    ].sort((left, right) => left.startByte - right.startByte);
    let cursor = 0;
    for (const range of ranges) {
      if (range.startByte !== cursor) fail(`$.coverage.${artifact.artifactId}`, 'included authorial and excluded ranges must have no gaps or overlaps');
      assertSpanMatchesArtifact(artifact, range, `$.coverage.${artifact.artifactId}`);
      cursor = range.endByte;
    }
    if (cursor !== artifact.htmlMemberBytes) fail(`$.coverage.${artifact.artifactId}`, 'must exactly cover full artifact boundaries including prefix and post-cutoff exclusions');
  }
}

/** Binds every persisted raw span to the actual transient source-member bytes, not just to caller-supplied hashes. */
function assertSpanMatchesArtifact(artifact: SourceArtifactEvidence, span: RawSpan, path: string): void {
  if (span.startByte < 0 || span.endByte > artifact.htmlMemberBytes) fail(path, 'falls outside the declared full artifact member');
  const raw = decodeUtf8(utf8Bytes(artifact.html).slice(span.startByte, span.endByte), path);
  if (sha256Hex(raw) !== span.rawSha256) fail(path, 'does not match the raw SHA-256 of the actual full artifact member slice');
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail(path, 'must begin and end on exact UTF-8 source-member byte boundaries'); }
}

function assertDraftStats(children: readonly TransientChild[], exclusions: readonly TransientExclusion[]): void {
  const authorial = aggregateStats(children);
  const stats = { ...authorial, rawUtf8Bytes: authorial.rawUtf8Bytes + exclusions.reduce((total, exclusion) => total + utf8Length(exclusion.html), 0), blocks: authorial.blocks + exclusions.length };
  assertStats(stats, 'draft', '$');
  for (const questionChildren of groupQuestionChildren(children)) assertStats(aggregateStats(questionChildren), 'question', '$.questions');
}

function groupQuestionChildren(children: readonly TransientChild[]): readonly TransientChild[][] {
  const groups: TransientChild[][] = []; let current: TransientChild[] = [];
  for (const child of children) { if (child.kind === 'preamble' && current.length > 0) { groups.push(current); current = []; } current.push(child); }
  if (current.length > 0) groups.push(current);
  return groups;
}

function aggregateStats(children: readonly TransientChild[]): RawStats {
  return aggregateRawStats(children.flatMap(child => child.source.blocks.map(block => renderReviewedElement(block))));
}

function aggregateRawStats(values: readonly { stats: RawStats }[]): RawStats {
  return values.reduce((total, value) => ({ rawUtf8Bytes: total.rawUtf8Bytes + value.stats.rawUtf8Bytes, nodes: total.nodes + value.stats.nodes, depth: Math.max(total.depth, value.stats.depth), attributes: total.attributes + value.stats.attributes, blocks: total.blocks + value.stats.blocks }), { rawUtf8Bytes: 0, nodes: 0, depth: 0, attributes: 0, blocks: 0 });
}

function assertStats(stats: RawStats, scope: 'child' | 'question' | 'draft', path: string): void {
  const prefix = scope === 'child' ? 'child' : scope === 'question' ? 'question' : 'draft';
  const limits = SECTIONED_EDITION_COLLECTION_PACKAGE_LIMITS;
  const checks: [keyof RawStats, number][] = [["rawUtf8Bytes", limits[`${prefix}RawUtf8Bytes`]], ["nodes", limits[`${prefix}Nodes`]], ["depth", limits[`${prefix}Depth`]], ["attributes", limits[`${prefix}Attributes`]], ["blocks", limits[`${prefix}Blocks`]]];
  for (const [key, maximum] of checks) if (stats[key] > maximum) fail(path, `${scope} ${key} exceeds strict limit ${maximum}`);
}

function assertQuestionChildCoverage(parent: { artifactId: string; span: RawSpan }, children: readonly TransientChild[], path: string): void {
  let cursor = parent.span.startByte; let raw = '';
  for (const child of children) {
    if (child.source.artifactId !== parent.artifactId || child.source.span.startByte !== cursor) fail(path, 'question children must share the parent artifact with no gaps or overlaps');
    cursor = child.source.span.endByte; raw += child.source.blocks.map(block => block.html).join('');
  }
  if (cursor !== parent.span.endByte || sha256Hex(raw) !== parent.span.rawSha256) fail(path, 'must exactly bind contiguous child raw bytes and SHA-256');
}

function assertBlockCoverage(parent: RawSpan, blocks: readonly TransientReviewedBlock[], path: string): void {
  let cursor = parent.startByte; let raw = '';
  for (const block of blocks) { if (block.span.startByte !== cursor) fail(path, 'reviewed blocks must have no gaps or overlaps'); cursor = block.span.endByte; raw += block.html; }
  if (cursor !== parent.endByte || sha256Hex(raw) !== parent.rawSha256) fail(path, 'reviewed blocks must exactly cover the source span and SHA-256');
}

function assertArticleSequence(questionKey: string, articles: readonly TransientChild[], path: string): void {
  for (let index = 0; index < articles.length; index += 1) {
    const article = articles[index]!; const ordinal = index + 1;
    if (article.ordinal !== ordinal || article.articleKey !== `${questionKey}.a${String(ordinal).padStart(3, '0')}`) fail(`${path}.articles[${index}]`, 'must preserve exact contiguous article key/order');
  }
}

function outputForChildren(children: readonly PersistedChild[], path: string): OutputEvidence {
  let cursor = children[0]!.output.startByte; let bytes = 0; let text = '';
  for (const child of children) { if (child.output.startByte !== cursor) fail(path, 'child output spans must be contiguous'); cursor = child.output.endByte; bytes += child.output.utf8Bytes; text += child.content; }
  return { startByte: children[0]!.output.startByte, endByte: cursor, utf8Bytes: bytes, sha256: sha256Hex(text) };
}

function omitQuestionChildren(question: TransientQuestion): Omit<PersistedQuestion, 'source' | 'output' | 'preamble' | 'articles'> {
  const { preamble: _preamble, articles: _articles, source, ...rest } = question;
  return rest;
}

function assertContent(content: string, path: string): void {
  assertTextUnicode(content, path, true);
  if (content.length === 0 || content !== content.normalize('NFC') || /[\t\v\f\r]/.test(content)) fail(path, 'must be nonempty NFC text with only br-derived LF and normalized ASCII spaces');
}

function validateRawSpan(input: unknown, path: string): RawSpan {
  const root = objectAt(input, path, ['startByte', 'endByte', 'rawSha256']);
  const startByte = integerAt(root.startByte, `${path}.startByte`, 0);
  return { startByte, endByte: integerAt(root.endByte, `${path}.endByte`, startByte + 1), rawSha256: shaAt(root.rawSha256, `${path}.rawSha256`) };
}

function nullableRawSpan(value: unknown, path: string): RawSpan | null { return value === null ? null : validateRawSpan(value, path); }
function nullableText(value: unknown, path: string): string | null { return value === null ? null : textAt(value, path, 4_096); }
function nullableArticleKey(value: unknown, path: string): string | null { return value === null ? null : articleKeyAt(value, path); }

function questionKeyAt(value: unknown, path: string): string {
  const key = safeAsciiAt(value, path, /^[a-z]+(?:-[a-z]+)*\.q\d{3}$/);
  if (!expectedAquinasPackageQuestionKeys().includes(key)) fail(path, 'must be an exact frozen A1 question key');
  return key;
}
function articleKeyAt(value: unknown, path: string): string { return safeAsciiAt(value, path, /^[a-z]+(?:-[a-z]+)*\.q\d{3}\.a\d{3}$/); }
function partForQuestionKey(questionKey: string): AquinasPackagePartKey { return AQUINAS_PACKAGE_PARTS.find(part => questionKey.startsWith(`${part.key}.q`))?.key ?? fail('questionKey', 'does not use a frozen part key'); }
function safeIdAt(value: unknown, path: string): string { return safeAsciiAt(value, path, /^[a-z][a-z0-9-]{0,127}$/); }
function safeAsciiAt(value: unknown, path: string, pattern: RegExp): string { if (typeof value !== 'string' || !pattern.test(value)) fail(path, 'must be an ASCII non-confusable identifier'); return value; }
function shaAt(value: unknown, path: string): string { return safeAsciiAt(value, path, /^[a-f0-9]{64}$/); }
function textAt(value: unknown, path: string, maximum: number): string { if (typeof value !== 'string' || value.length === 0 || value.length > maximum) fail(path, `must be nonempty text of at most ${maximum} UTF-16 code units`); assertTextUnicode(value, path, true); return value; }
function integerAt(value: unknown, path: string, minimum: number): number { if (!Number.isSafeInteger(value) || Object.is(value, -0) || (value as number) < minimum) fail(path, `must be a nonnegative safe integer at least ${minimum}`); return value as number; }
function enumAt<T extends readonly string[]>(value: unknown, path: string, values: T): T[number] { if (typeof value !== 'string' || !values.includes(value)) fail(path, `must be one of ${values.join(', ')}`); return value as T[number]; }
function literalAt(value: unknown, path: string, expected: unknown): void { if (value !== expected) fail(path, `must equal ${JSON.stringify(expected)}`); }
function literalValue<T extends string>(value: unknown, path: string, expected: T): T { literalAt(value, path, expected); return expected; }
function assertUnique(values: readonly string[], path: string): void { if (new Set(values).size !== values.length) fail(path, 'must not contain duplicate values'); }
function equalCanonical(actual: unknown, expected: unknown, path: string, message: string): void { if (!sameBytes(canonicalSectionedEditionCollectionPackageBytes(actual), canonicalSectionedEditionCollectionPackageBytes(expected))) fail(path, message); }

function objectAt(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(path, 'must be a plain object');
  const source = value as Record<string, unknown>; const observed = Object.keys(source).sort(); const expected = [...keys].sort();
  if (observed.length !== expected.length || observed.some((key, index) => key !== expected[index]) || Object.getOwnPropertySymbols(source).length !== 0) fail(path, 'must contain exactly reviewed data keys without symbols');
  for (const key of expected) { const descriptor = Object.getOwnPropertyDescriptor(source, key); if (!descriptor || !('value' in descriptor)) fail(`${path}.${key}`, 'must be a data property, not an accessor'); }
  return source;
}
function arrayAt(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0 || value.length < minimum || value.length > maximum) fail(path, `must be a dense plain array with ${minimum}..${maximum} values`);
  const keys = Object.keys(value); if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) fail(path, 'must be a dense plain array without extra properties');
  return Array.from({ length: value.length }, (_, index) => { const descriptor = Object.getOwnPropertyDescriptor(value, String(index)); if (!descriptor || !('value' in descriptor)) fail(`${path}[${index}]`, 'must be a data value, not an accessor'); return descriptor.value; });
}
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) fail('canonical value', 'rejects non-finite, negative, unsafe, and -0 numbers'); return value; }
  if (typeof value === 'undefined' || typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') fail('canonical value', 'rejects undefined, bigint, symbols, and functions');
  if (Array.isArray(value)) return arrayAt(value, 'canonical value', 0, Number.MAX_SAFE_INTEGER).map(canonicalize);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) fail('canonical value', 'must be a plain object');
  const source = value as Record<string, unknown>; const target: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) { const descriptor = Object.getOwnPropertyDescriptor(source, key); if (!descriptor || !('value' in descriptor)) fail(`canonical value.${key}`, 'must be a data property'); target[key] = canonicalize(descriptor.value); }
  return target;
}
function domainHash(domain: string, bytes: Uint8Array): string { return sha256Hex(`${domain}:${new TextDecoder().decode(bytes)}`); }
function sameBytes(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]); }
function utf8Length(value: string): number { return new TextEncoder().encode(value).byteLength; }
function utf8Bytes(value: string): Uint8Array { return new TextEncoder().encode(value); }
function assertTextUnicode(value: string, path: string, allowAsciiWhitespace: boolean): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index); let point = unit;
    if (unit >= 0xd800 && unit <= 0xdbff) { const next = value.charCodeAt(index + 1); if (next < 0xdc00 || next > 0xdfff) fail(path, 'contains an unpaired surrogate'); point = 0x1_0000 + ((unit - 0xd800) << 10) + next - 0xdc00; index += 1; }
    else if (unit >= 0xdc00 && unit <= 0xdfff) fail(path, 'contains an unpaired surrogate');
    const asciiWhitespace = point === 0x09 || point === 0x0a || point === 0x0b || point === 0x0c || point === 0x0d;
    if ((point <= 0x1f && !(allowAsciiWhitespace && asciiWhitespace)) || (point >= 0x7f && point <= 0x9f)) fail(path, 'contains a disallowed control character');
    if (point === 0x061c || point === 0x200e || point === 0x200f || (point >= 0x202a && point <= 0x202e) || (point >= 0x2066 && point <= 0x2069)) fail(path, 'contains a bidi control character');
    if (point === 0xfdd0 || point === 0xfdef || (point & 0xfffe) === 0xfffe || point === 0x200c || point === 0x200d || (point >= 0x2060 && point <= 0x2064) || point === 0xfeff) fail(path, 'contains a forbidden Unicode format/noncharacter');
  }
}
function fail(path: string, message: string): never { throw new SectionedEditionCollectionPackageValidationError(path, message); }
