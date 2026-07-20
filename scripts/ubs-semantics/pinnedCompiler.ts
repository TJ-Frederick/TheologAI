/**
 * Deterministic, migration-free compiler for the two owner-approved UBS Hebrew
 * v0.9.2 artifacts. The compiled semantic corpus is intentionally returned
 * only in memory: U3-T7 tracks the bridge and a content-free audit, not the
 * derivative corpus, a database, or an MCP/runtime integration.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UBS_HEBREW_V092_ARTIFACTS,
  UBS_HEBREW_V092_COMMIT,
  UBS_HEBREW_V092_COPYRIGHT_NOTICE,
  UBS_HEBREW_V092_REPOSITORY,
  parseUbsSourceTokenReference,
} from '../verify-ubs-hebrew-v092-acquisition.js';
import {
  decodePinnedUbsHebrewV092,
  type DecodedUbsHebrewProjection,
} from './rawDecoder.js';
import {
  parseUbsTahotNativeToNormalizedBridge,
  createUbsTahotNormalizedCoordinateResolver,
  type TahotCoordinate,
  type UbsTahotNativeToNormalizedBridge,
} from './coordinateVerifier.js';

export const UBS_PINNED_SEMANTIC_COMPILER_SCHEMA =
  'theologai-ubs-hebrew-semantic-compiled.v1' as const;
export const UBS_PINNED_SEMANTIC_COMPILER_VERSION = 1 as const;
export const UBS_PINNED_SEMANTIC_TRANSFORM_VERSION = 7 as const;
/** A deliberate byte ceiling for the complete canonical artifact output. */
export const UBS_PINNED_SEMANTIC_MAX_CANONICAL_ARTIFACT_BYTES = 128 * 1024 * 1024;
export const UBS_PINNED_SEMANTIC_BRIDGE_PATH =
  'data/biblical-languages/ubs-open-license/v0.9.2/NATIVE-TO-NORMALIZED-BRIDGE.json';
export const UBS_PINNED_SEMANTIC_DERIVED_NOTICE_PATH =
  'docs/UBS-HEBREW-V0.9.2-DERIVED-NOTICE.md';
export const UBS_PINNED_SEMANTIC_RIGHTS_NOTICE_SCHEMA =
  'theologai-ubs-hebrew-derived-rights-notice.v1' as const;
export const UBS_PINNED_SEMANTIC_PROVENANCE_NOTICE_SCHEMA =
  'theologai-ubs-hebrew-derived-provenance-notice.v1' as const;
const UBS_CC_BY_SA_40_URL = 'https://creativecommons.org/licenses/by-sa/4.0/' as const;
const UBS_CC_BY_SA_40_LEGALCODE_SECTION_5_URL =
  'https://creativecommons.org/licenses/by-sa/4.0/legalcode.en#s5' as const;
const TAHOT_REPOSITORY = 'https://github.com/STEPBible/STEPBible-Data' as const;
const TAHOT_COMMIT = '0f60797c170f11a1f8dc75c5f7617973e2e66b0d' as const;
const TAHOT_ATTRIBUTION = 'Tyndale House, Cambridge / STEP Bible (www.stepbible.org)' as const;
const TAHOT_CC_BY_40_URL = 'https://creativecommons.org/licenses/by/4.0/' as const;
const USFMTC_REPOSITORY = 'https://github.com/usfm-bible/usfmtc' as const;
const USFMTC_MIT_LICENSE_URL =
  'https://github.com/usfm-bible/usfmtc/blob/a222dd3e78360f8e275ca56f4307af7e02b2430a/LICENSE' as const;
const DERIVED_MODIFICATION_SUMMARY =
  'Deterministic migration-free normalization: canonical source IDs, NFC text, safe definitions, retained POS arrays, domain links, and coordinate-only native-to-normalized bridge references.' as const;

export interface PinnedUbsSemanticSource {
  readonly sourceId: 'ubs-hebrew-dictionary-en-v0.9.2' | 'ubs-hebrew-lexical-domains-en-v0.9.2';
  readonly sourceRole: 'dictionary' | 'lexical_domains';
  readonly artifactName: 'UBSHebrewDic-v0.9.2-en.JSON' | 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON';
  readonly artifactVersion: '0.9.2';
  readonly sourceUrl: string;
  readonly sourceCommit: string;
  readonly sourceBlob: string;
  readonly sourceSha256: string;
  readonly license: 'CC BY-SA 4.0';
  readonly licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/';
  readonly publisher: 'United Bible Societies';
  readonly modified: true;
  readonly modificationDescription: string;
}

export interface PinnedUbsSemanticArtifact {
  readonly schemaVersion: typeof UBS_PINNED_SEMANTIC_COMPILER_SCHEMA;
  readonly compilerVersion: typeof UBS_PINNED_SEMANTIC_COMPILER_VERSION;
  readonly transformVersion: typeof UBS_PINNED_SEMANTIC_TRANSFORM_VERSION;
  readonly sources: readonly PinnedUbsSemanticSource[];
  /** Versioned, scoped legal notice carried with every future reproduced artifact. */
  readonly rightsNotice: {
    readonly schemaVersion: typeof UBS_PINNED_SEMANTIC_RIGHTS_NOTICE_SCHEMA;
    readonly scope: 'derived_semantic_layer_and_coordinate_bridge_only_not_theologai_code_or_unrelated_data';
    readonly derivedLayerLicense: { readonly name: 'CC BY-SA 4.0'; readonly url: typeof UBS_CC_BY_SA_40_URL };
    readonly modificationSummary: typeof DERIVED_MODIFICATION_SUMMARY;
    readonly warrantyAndDisclaimer: {
      readonly statement: 'CC_BY_SA_4_0_is_offered_as_is_without_warranties_to_the_extent_provided_in_legal_code_section_5';
      readonly legalCodeSection5Url: typeof UBS_CC_BY_SA_40_LEGALCODE_SECTION_5_URL;
    };
    readonly externalNoticeReference: typeof UBS_PINNED_SEMANTIC_DERIVED_NOTICE_PATH;
  };
  /** Exact attribution/provenance and third-party boundaries, not runtime output. */
  readonly provenanceNotice: {
    readonly schemaVersion: typeof UBS_PINNED_SEMANTIC_PROVENANCE_NOTICE_SCHEMA;
    readonly ubsSdbh: {
      readonly copyright: typeof UBS_HEBREW_V092_COPYRIGHT_NOTICE;
      readonly ancestry: 'UBS_Dictionary_of_Biblical_Hebrew_adapted_from_Semantic_Dictionary_of_Biblical_Hebrew';
      readonly repository: typeof UBS_HEBREW_V092_REPOSITORY;
      readonly commit: typeof UBS_HEBREW_V092_COMMIT;
      readonly sourceArtifacts: readonly {
        readonly sourceId: PinnedUbsSemanticSource['sourceId'];
        readonly artifactName: PinnedUbsSemanticSource['artifactName'];
        readonly sourceUrl: string;
        readonly sourceBlob: string;
        readonly sourceSha256: string;
      }[];
    };
    readonly tahot: {
      readonly repository: typeof TAHOT_REPOSITORY;
      readonly commit: typeof TAHOT_COMMIT;
      readonly license: 'CC BY 4.0';
      readonly licenseUrl: typeof TAHOT_CC_BY_40_URL;
      readonly attribution: typeof TAHOT_ATTRIBUTION;
      readonly boundary: 'TAHOT_CC_BY_coordinate_witness_only_not_a_UBS_morphology_token_alignment_or_contextual_sense_adjudication';
    };
    readonly usfmtc: {
      readonly repository: typeof USFMTC_REPOSITORY;
      readonly license: 'MIT';
      readonly licenseUrl: typeof USFMTC_MIT_LICENSE_URL;
      readonly boundary: 'usfmtc_supplies_a_pinned_reference_table_only_and_does_not_imply_endorsement_by_usfmtc_or_its_contributors';
    };
  };
  readonly transformationWitness: {
    readonly coordinateBridgeIdentity: string;
    readonly coordinateBridgeSha256: string;
    readonly coordinateAudit: { readonly schemaVersion: string; readonly sha256: string };
    readonly tahot: readonly { readonly id: string; readonly sha256: string; readonly gitBlobSha1: string }[];
    readonly usfmtc: { readonly commit: string; readonly referenceBlob: string; readonly referenceSha256: string; readonly licenseBlob: string; readonly licenseSha256: string };
    readonly limitation: 'coordinate_bridge_only_not_token_alignment_or_contextual_sense_adjudication';
  };
  readonly domains: readonly {
    readonly domainId: string;
    readonly sourceId: 'ubs-hebrew-lexical-domains-en-v0.9.2';
    readonly sourceOrdinal: number;
    readonly parentDomainId?: string;
    readonly label: string;
    readonly description?: string;
  }[];
  readonly entries: readonly {
    readonly entryId: string;
    readonly sourceEntryId: string;
    readonly sourceId: 'ubs-hebrew-dictionary-en-v0.9.2';
    readonly sourceOrdinal: number;
    readonly lemma: string;
    readonly partOfSpeech: readonly string[];
    readonly lexicalIdentities: readonly string[];
  }[];
  readonly senses: readonly {
    readonly senseId: string;
    readonly sourceSenseId: string;
    readonly entryId: string;
    readonly sourceId: 'ubs-hebrew-dictionary-en-v0.9.2';
    readonly sourceOrdinal: number;
    readonly definitionStatus: 'published' | 'absent_in_source' | 'excluded_unresolved_markup';
    readonly definition?: string;
    readonly definitionExclusionReasons: readonly string[];
    readonly glosses: readonly string[];
    readonly domainIds: readonly string[];
  }[];
  readonly referenceEvidence: readonly {
    readonly evidenceId: string;
    readonly sourceId: 'ubs-hebrew-dictionary-en-v0.9.2';
    readonly senseId: string;
    readonly sourceOrdinal: number;
    readonly sourceReference: string;
    readonly rawAnchor: string;
    readonly footnoteSuffix: string;
    readonly nativeCoordinate: TahotCoordinate;
    /** Never flattened: a native verse can legitimately map to several targets. */
    readonly normalizedCoordinates: readonly TahotCoordinate[];
  }[];
  readonly artifactIdentity: string;
}

export interface PinnedUbsSemanticCompilationAudit {
  readonly schemaVersion: 'theologai-ubs-hebrew-semantic-compilation-audit.v1';
  readonly compilerVersion: typeof UBS_PINNED_SEMANTIC_COMPILER_VERSION;
  readonly transformVersion: typeof UBS_PINNED_SEMANTIC_TRANSFORM_VERSION;
  readonly inputs: {
    readonly dictionarySha256: string;
    readonly lexicalDomainsSha256: string;
    readonly coordinateBridgeSha256: string;
    readonly coordinateBridgeIdentity: string;
    readonly coordinateAuditSha256: string;
    readonly tahotPins: readonly { readonly id: string; readonly sha256: string; readonly gitBlobSha1: string }[];
    readonly usfmtc: { readonly commit: string; readonly referenceBlob: string; readonly referenceSha256: string; readonly licenseBlob: string; readonly licenseSha256: string };
  };
  readonly projection: {
    readonly entries: number;
    readonly senses: number;
    readonly referenceEvidence: number;
    readonly domains: number;
    readonly uniqueHIdentities: number;
    readonly uniqueAIdentities: number;
    readonly entriesWithMultiplePartOfSpeechValues: number;
    readonly sensesWithPublishedDefinitions: number;
    readonly sensesWithAbsentDefinitions: number;
    readonly sensesWithExcludedDefinitions: number;
    readonly zeroDomainSenses: number;
    readonly nativeCoordinateMembershipCount: number;
    readonly normalizationOverrideCount: number;
    readonly ambiguousNativeCoordinateCount: number;
    readonly sourceEvidenceWithAmbiguousNormalizedCoordinates: number;
    readonly normalizedCoordinateRows: number;
  };
  readonly artifact: {
    /** SHA-256 of the canonical payload excluding its self-describing identity field. */
    readonly semanticPayloadSha256: string;
    /** SHA-256 of the complete canonical artifact bytes, including artifactIdentity. */
    readonly canonicalArtifactSha256: string;
    readonly canonicalByteLength: number;
    readonly maximumCanonicalByteLength: typeof UBS_PINNED_SEMANTIC_MAX_CANONICAL_ARTIFACT_BYTES;
  };
}

export function compilePinnedUbsHebrewV092(root: string): {
  artifact: PinnedUbsSemanticArtifact;
  canonicalArtifactSha256: string;
  canonicalArtifactByteLength: number;
  audit: PinnedUbsSemanticCompilationAudit;
  canonicalAudit: string;
} {
  const dictionary = readFileSync(join(root, UBS_HEBREW_V092_ARTIFACTS[0].trackedPath));
  const domains = readFileSync(join(root, UBS_HEBREW_V092_ARTIFACTS[1].trackedPath));
  const bridgeBytes = readFileSync(join(root, UBS_PINNED_SEMANTIC_BRIDGE_PATH));
  const bridge = parseUbsTahotNativeToNormalizedBridge(bridgeBytes);
  const resolveNormalizedCoordinates = createUbsTahotNormalizedCoordinateResolver(bridge);
  const projection = decodePinnedUbsHebrewV092(dictionary, domains,
    createBridgeDefinitionReferenceValidator(bridge, resolveNormalizedCoordinates));
  const artifact = compileProjection(projection, bridge, sha256(bridgeBytes), resolveNormalizedCoordinates);
  const semanticPayload = canonicalJsonDigest(withoutArtifactIdentity(artifact));
  const artifactIdentity = semanticPayload.sha256;
  const complete = { ...withoutArtifactIdentity(artifact), artifactIdentity } as PinnedUbsSemanticArtifact;
  // Hash canonical bytes incrementally and stop as soon as the complete
  // canonical artifact would exceed its explicit output-byte ceiling.
  const completeArtifact = canonicalJsonDigest(complete, {
    maxBytes: UBS_PINNED_SEMANTIC_MAX_CANONICAL_ARTIFACT_BYTES,
  });
  const canonicalByteLength = completeArtifact.byteLength;
  const audit = buildAudit(
    complete,
    bridge,
    sha256(bridgeBytes),
    canonicalByteLength,
    completeArtifact.sha256,
  );
  const canonicalAudit = `${canonicalJson(audit)}\n`;
  return {
    artifact: complete,
    canonicalArtifactSha256: completeArtifact.sha256,
    canonicalArtifactByteLength: completeArtifact.byteLength,
    audit,
    canonicalAudit,
  };
}

export function compileProjection(
  projection: DecodedUbsHebrewProjection,
  bridge: UbsTahotNativeToNormalizedBridge,
  bridgeSha256: string,
  resolveNormalizedCoordinates = createUbsTahotNormalizedCoordinateResolver(bridge),
): Omit<PinnedUbsSemanticArtifact, 'artifactIdentity'> {
  const dictionarySourceId = 'ubs-hebrew-dictionary-en-v0.9.2' as const;
  const domainSourceId = 'ubs-hebrew-lexical-domains-en-v0.9.2' as const;
  const sources: readonly PinnedUbsSemanticSource[] = [
    sourceFromPin(UBS_HEBREW_V092_ARTIFACTS[0], dictionarySourceId, 'dictionary', 'UBSHebrewDic-v0.9.2-en.JSON'),
    sourceFromPin(UBS_HEBREW_V092_ARTIFACTS[1], domainSourceId, 'lexical_domains', 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON'),
  ];
  const rightsNotice = createRightsNotice();
  const provenanceNotice = createProvenanceNotice(sources);
  const domains = projection.domains.map(domain => ({
    domainId: `ubs-domain-${domain.domainId}`,
    sourceId: domainSourceId,
    sourceOrdinal: domain.sourceOrdinal,
    ...(domain.parentDomainId === undefined ? {} : { parentDomainId: `ubs-domain-${domain.parentDomainId}` }),
    label: domain.label,
    ...(domain.description === undefined ? {} : { description: domain.description }),
  }));
  const entries: PinnedUbsSemanticArtifact['entries'][number][] = [];
  const senses: PinnedUbsSemanticArtifact['senses'][number][] = [];
  const referenceEvidence: PinnedUbsSemanticArtifact['referenceEvidence'][number][] = [];
  for (const entry of projection.entries) {
    const entryId = `ubs-entry-${entry.entryId}`;
    entries.push({
      entryId, sourceEntryId: entry.sourceEntryId, sourceId: dictionarySourceId,
      sourceOrdinal: entry.sourceOrdinal, lemma: entry.lemma,
      partOfSpeech: [...entry.partOfSpeech].sort(compareCodePoints),
      lexicalIdentities: [...entry.lexicalIdentities].sort(compareCodePoints),
    });
    for (const sense of entry.senses) {
      const senseId = `ubs-sense-${sense.senseId}`;
      senses.push({
        senseId, sourceSenseId: sense.senseId, entryId, sourceId: dictionarySourceId,
        sourceOrdinal: sense.sourceOrdinal, definitionStatus: sense.definitionStatus,
        ...(sense.definition === undefined ? {} : { definition: sense.definition }),
        definitionExclusionReasons: [...sense.definitionExclusionReasons].sort(compareCodePoints),
        glosses: [...sense.glosses].sort(compareCodePoints),
        domainIds: sense.domainIds.map(domainId => `ubs-domain-${domainId}`).sort(compareCodePoints),
      });
      for (const [referenceIndex, sourceReference] of sense.sourceReferences.entries()) {
        const parsed = parseUbsSourceTokenReference(sourceReference);
        const nativeCoordinate = nativeCoordinateFromBridge(bridge, parsed.book, parsed.chapter, parsed.verse);
        const normalizedCoordinates = resolveNormalizedCoordinates(nativeCoordinate);
        referenceEvidence.push({
          evidenceId: `ubs-reference-${sense.senseId}-${String(referenceIndex + 1).padStart(5, '0')}`,
          sourceId: dictionarySourceId,
          senseId,
          sourceOrdinal: referenceIndex + 1,
          sourceReference,
          rawAnchor: sourceReference.slice(0, 14),
          footnoteSuffix: parsed.suffix,
          nativeCoordinate,
          normalizedCoordinates,
        });
      }
    }
  }
  return {
    schemaVersion: UBS_PINNED_SEMANTIC_COMPILER_SCHEMA,
    compilerVersion: UBS_PINNED_SEMANTIC_COMPILER_VERSION,
    transformVersion: UBS_PINNED_SEMANTIC_TRANSFORM_VERSION,
    sources,
    rightsNotice,
    provenanceNotice,
    transformationWitness: {
      coordinateBridgeIdentity: bridge.bridgeIdentity,
      coordinateBridgeSha256: bridgeSha256,
      coordinateAudit: bridge.coordinateAudit,
      tahot: bridge.tahot,
      usfmtc: bridge.usfmtc,
      limitation: 'coordinate_bridge_only_not_token_alignment_or_contextual_sense_adjudication',
    },
    domains,
    entries,
    senses,
    referenceEvidence,
  };
}

function sourceFromPin(
  pin: typeof UBS_HEBREW_V092_ARTIFACTS[number],
  sourceId: PinnedUbsSemanticSource['sourceId'],
  sourceRole: PinnedUbsSemanticSource['sourceRole'],
  artifactName: PinnedUbsSemanticSource['artifactName'],
): PinnedUbsSemanticSource {
  const sourceCommit = new URL(pin.sourceUrl).pathname.split('/')[3]!;
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error('Pinned UBS source URL does not contain an exact commit');
  return {
    sourceId, sourceRole, artifactName, artifactVersion: '0.9.2', sourceUrl: pin.sourceUrl,
    sourceCommit, sourceBlob: pin.gitBlobSha1, sourceSha256: pin.sha256,
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    publisher: 'United Bible Societies', modified: true,
    modificationDescription: DERIVED_MODIFICATION_SUMMARY,
  };
}

function createRightsNotice(): PinnedUbsSemanticArtifact['rightsNotice'] {
  return {
    schemaVersion: UBS_PINNED_SEMANTIC_RIGHTS_NOTICE_SCHEMA,
    scope: 'derived_semantic_layer_and_coordinate_bridge_only_not_theologai_code_or_unrelated_data',
    derivedLayerLicense: { name: 'CC BY-SA 4.0', url: UBS_CC_BY_SA_40_URL },
    modificationSummary: DERIVED_MODIFICATION_SUMMARY,
    warrantyAndDisclaimer: {
      statement: 'CC_BY_SA_4_0_is_offered_as_is_without_warranties_to_the_extent_provided_in_legal_code_section_5',
      legalCodeSection5Url: UBS_CC_BY_SA_40_LEGALCODE_SECTION_5_URL,
    },
    externalNoticeReference: UBS_PINNED_SEMANTIC_DERIVED_NOTICE_PATH,
  };
}

function createProvenanceNotice(
  sources: readonly PinnedUbsSemanticSource[],
): PinnedUbsSemanticArtifact['provenanceNotice'] {
  return {
    schemaVersion: UBS_PINNED_SEMANTIC_PROVENANCE_NOTICE_SCHEMA,
    ubsSdbh: {
      copyright: UBS_HEBREW_V092_COPYRIGHT_NOTICE,
      ancestry: 'UBS_Dictionary_of_Biblical_Hebrew_adapted_from_Semantic_Dictionary_of_Biblical_Hebrew',
      repository: UBS_HEBREW_V092_REPOSITORY,
      commit: UBS_HEBREW_V092_COMMIT,
      sourceArtifacts: sources.map(source => ({
        sourceId: source.sourceId,
        artifactName: source.artifactName,
        sourceUrl: source.sourceUrl,
        sourceBlob: source.sourceBlob,
        sourceSha256: source.sourceSha256,
      })),
    },
    tahot: {
      repository: TAHOT_REPOSITORY,
      commit: TAHOT_COMMIT,
      license: 'CC BY 4.0',
      licenseUrl: TAHOT_CC_BY_40_URL,
      attribution: TAHOT_ATTRIBUTION,
      boundary: 'TAHOT_CC_BY_coordinate_witness_only_not_a_UBS_morphology_token_alignment_or_contextual_sense_adjudication',
    },
    usfmtc: {
      repository: USFMTC_REPOSITORY,
      license: 'MIT',
      licenseUrl: USFMTC_MIT_LICENSE_URL,
      boundary: 'usfmtc_supplies_a_pinned_reference_table_only_and_does_not_imply_endorsement_by_usfmtc_or_its_contributors',
    },
  };
}

function nativeCoordinateFromBridge(
  bridge: UbsTahotNativeToNormalizedBridge, bookNumber: number, chapter: number, verse: number,
): TahotCoordinate {
  const bookCode = bridge.defaultBookCodes.find(book => book.bookNumber === bookNumber)?.bookCode;
  if (!bookCode) throw new Error('UBS source reference has no exact bridge book code');
  return { bookNumber, bookCode, chapter, verse };
}

function createBridgeDefinitionReferenceValidator(
  bridge: UbsTahotNativeToNormalizedBridge,
  resolveNormalizedCoordinates: ReturnType<typeof createUbsTahotNormalizedCoordinateResolver>,
) {
  return (payload: string) => {
    if (!/^[0-9]{14}$/.test(payload)) return undefined;
    const bookNumber = Number(payload.slice(0, 3));
    const chapter = Number(payload.slice(3, 6));
    const verse = Number(payload.slice(6, 9));
    const segment = Number(payload.slice(9, 11));
    const word = Number(payload.slice(11, 14));
    if (segment !== 0 || word < 0 || (word !== 0 && (word % 2 !== 0 || word > 999))) return undefined;
    try {
      const normalized = resolveNormalizedCoordinates(nativeCoordinateFromBridge(bridge, bookNumber, chapter, verse));
      return normalized.length === 1
        ? { normalizedReference: `${normalized[0]!.bookCode} ${normalized[0]!.chapter}:${normalized[0]!.verse}` }
        : undefined;
    } catch { return undefined; }
  };
}

function buildAudit(
  artifact: PinnedUbsSemanticArtifact,
  bridge: UbsTahotNativeToNormalizedBridge,
  bridgeSha256: string,
  canonicalByteLength: number,
  canonicalArtifactSha256: string,
): PinnedUbsSemanticCompilationAudit {
  const identities = artifact.entries.flatMap(entry => entry.lexicalIdentities);
  const statuses = artifact.senses.reduce((counts, sense) => {
    counts[sense.definitionStatus] += 1;
    return counts;
  }, { published: 0, absent_in_source: 0, excluded_unresolved_markup: 0 });
  return {
    schemaVersion: 'theologai-ubs-hebrew-semantic-compilation-audit.v1',
    compilerVersion: UBS_PINNED_SEMANTIC_COMPILER_VERSION,
    transformVersion: UBS_PINNED_SEMANTIC_TRANSFORM_VERSION,
    inputs: {
      dictionarySha256: artifact.sources[0]!.sourceSha256,
      lexicalDomainsSha256: artifact.sources[1]!.sourceSha256,
      coordinateBridgeSha256: bridgeSha256,
      coordinateBridgeIdentity: bridge.bridgeIdentity,
      coordinateAuditSha256: bridge.coordinateAudit.sha256,
      tahotPins: bridge.tahot,
      usfmtc: bridge.usfmtc,
    },
    projection: {
      entries: artifact.entries.length,
      senses: artifact.senses.length,
      referenceEvidence: artifact.referenceEvidence.length,
      domains: artifact.domains.length,
      uniqueHIdentities: new Set(identities.filter(identity => identity.startsWith('H'))).size,
      uniqueAIdentities: new Set(identities.filter(identity => identity.startsWith('A'))).size,
      entriesWithMultiplePartOfSpeechValues: artifact.entries.filter(entry => entry.partOfSpeech.length > 1).length,
      sensesWithPublishedDefinitions: statuses.published,
      sensesWithAbsentDefinitions: statuses.absent_in_source,
      sensesWithExcludedDefinitions: statuses.excluded_unresolved_markup,
      zeroDomainSenses: artifact.senses.filter(sense => sense.domainIds.length === 0).length,
      nativeCoordinateMembershipCount: bridge.nativeCoordinateKeys.length,
      normalizationOverrideCount: bridge.overrides.length,
      ambiguousNativeCoordinateCount: bridge.overrides.filter(item => item.normalizedCoordinates.length > 1).length,
      sourceEvidenceWithAmbiguousNormalizedCoordinates: artifact.referenceEvidence
        .filter(item => item.normalizedCoordinates.length > 1).length,
      normalizedCoordinateRows: artifact.referenceEvidence
        .reduce((total, item) => total + item.normalizedCoordinates.length, 0),
    },
    artifact: {
      semanticPayloadSha256: artifact.artifactIdentity,
      canonicalArtifactSha256,
      canonicalByteLength,
      maximumCanonicalByteLength: UBS_PINNED_SEMANTIC_MAX_CANONICAL_ARTIFACT_BYTES,
    },
  };
}

/**
 * Full-corpus integrity checks for the untracked artifact. These are kept in
 * the verifier path rather than a runtime repository: U3-T7 must fail closed
 * before any later materialization can mistake a malformed compiler output for
 * a relationally sound semantic layer.
 */
export function assertPinnedUbsSemanticArtifactIntegrity(artifact: PinnedUbsSemanticArtifact): void {
  const sourceIds = new Set(artifact.sources.map(source => source.sourceId));
  if (sourceIds.size !== 2 || !sourceIds.has('ubs-hebrew-dictionary-en-v0.9.2')
    || !sourceIds.has('ubs-hebrew-lexical-domains-en-v0.9.2')) {
    throw new Error('Pinned UBS semantic artifact source identities are incomplete or duplicated');
  }
  assertEmbeddedRightsAndProvenanceNotice(artifact);

  const domainIds = new Set<string>();
  assertStrictCanonicalTupleOrder('domains', artifact.domains,
    domain => [domain.sourceOrdinal, domain.domainId]);
  for (const domain of artifact.domains) {
    assertUnique(domainIds, domain.domainId, 'domain');
    if (domain.sourceId !== 'ubs-hebrew-lexical-domains-en-v0.9.2'
      || !sourceIds.has(domain.sourceId)
      || !/^ubs-domain-(?:[0-9]{3})+$/.test(domain.domainId)
      || !positiveInteger(domain.sourceOrdinal)) {
      throw new Error('Pinned UBS semantic artifact domain identity or source ordinal is malformed');
    }
  }
  assertContiguousOrdinalsByParent('domains', artifact.domains,
    () => 'root',
    domain => domain.sourceOrdinal);
  for (const domain of artifact.domains) {
    if (domain.parentDomainId !== undefined && !domainIds.has(domain.parentDomainId)) {
      throw new Error('Pinned UBS semantic artifact domain parent foreign key is missing');
    }
  }

  const entryById = new Map<string, PinnedUbsSemanticArtifact['entries'][number]>();
  assertStrictCanonicalTupleOrder('entries', artifact.entries,
    entry => [entry.sourceOrdinal, entry.entryId]);
  for (const entry of artifact.entries) {
    if (!/^ubs-entry-[0-9]{15}$/.test(entry.entryId)
      || !/^[0-9]{15}$/.test(entry.sourceEntryId)
      || entry.sourceId !== 'ubs-hebrew-dictionary-en-v0.9.2'
      || !sourceIds.has(entry.sourceId)
      || !positiveInteger(entry.sourceOrdinal)
      || !isUniqueSorted(entry.partOfSpeech)
      || !isUniqueSorted(entry.lexicalIdentities)) {
      throw new Error('Pinned UBS semantic artifact entry identity, array, or source ordinal is malformed');
    }
    if (entryById.has(entry.entryId)) throw new Error('Pinned UBS semantic artifact entry ID is duplicated');
    entryById.set(entry.entryId, entry);
  }

  const senseById = new Map<string, PinnedUbsSemanticArtifact['senses'][number]>();
  const sourceSenseIds = new Set<string>();
  assertStrictCanonicalTupleOrder('senses', artifact.senses, sense => {
    const entry = entryById.get(sense.entryId);
    if (!entry) throw new Error('Pinned UBS semantic artifact sense entry foreign key is missing');
    return [entry.sourceOrdinal, sense.sourceOrdinal, sense.senseId];
  });
  for (const sense of artifact.senses) {
    const entry = entryById.get(sense.entryId);
    if (!entry || sense.senseId !== `ubs-sense-${sense.sourceSenseId}`
      || !/^[0-9]{15}$/.test(sense.sourceSenseId)
      || sense.sourceId !== 'ubs-hebrew-dictionary-en-v0.9.2'
      || !sourceIds.has(sense.sourceId)
      || !positiveInteger(sense.sourceOrdinal)
      || !isUniqueSorted(sense.definitionExclusionReasons)
      || !isUniqueSorted(sense.glosses)
      || !isUniqueSorted(sense.domainIds)) {
      throw new Error('Pinned UBS semantic artifact sense identity, array, foreign key, or source ordinal is malformed');
    }
    assertUnique(sourceSenseIds, sense.sourceSenseId, 'sense source');
    if (senseById.has(sense.senseId)) throw new Error('Pinned UBS semantic artifact sense ID is duplicated');
    for (const domainId of sense.domainIds) {
      if (!domainIds.has(domainId)) throw new Error('Pinned UBS semantic artifact sense domain foreign key is missing');
    }
    senseById.set(sense.senseId, sense);
  }
  assertContiguousOrdinalsByParent('senses', artifact.senses,
    sense => sense.entryId,
    sense => sense.sourceOrdinal);

  const evidenceIds = new Set<string>();
  assertStrictCanonicalTupleOrder('reference evidence', artifact.referenceEvidence, evidence => {
    const sense = senseById.get(evidence.senseId);
    if (!sense) throw new Error('Pinned UBS semantic artifact evidence sense foreign key is missing');
    const entry = entryById.get(sense.entryId);
    if (!entry) throw new Error('Pinned UBS semantic artifact evidence entry foreign key is missing');
    return [entry.sourceOrdinal, sense.sourceOrdinal, evidence.sourceOrdinal, evidence.evidenceId];
  });
  for (const evidence of artifact.referenceEvidence) {
    const sense = senseById.get(evidence.senseId);
    if (!sense || evidence.sourceId !== 'ubs-hebrew-dictionary-en-v0.9.2'
      || !sourceIds.has(evidence.sourceId)
      || evidence.evidenceId !== `ubs-reference-${sense.sourceSenseId}-${String(evidence.sourceOrdinal).padStart(5, '0')}`
      || !positiveInteger(evidence.sourceOrdinal)
      || !/^[0-9]{14}$/.test(evidence.rawAnchor)
      || evidence.sourceReference !== `${evidence.rawAnchor}${evidence.footnoteSuffix}`
      || evidence.normalizedCoordinates.length < 1
      || !isUniqueSorted(evidence.normalizedCoordinates.map(coordinateSortKey))) {
      throw new Error('Pinned UBS semantic artifact evidence identity, source ordinal, or coordinate mapping is malformed');
    }
    assertUnique(evidenceIds, evidence.evidenceId, 'reference evidence');
  }
  assertContiguousOrdinalsByParent('reference evidence', artifact.referenceEvidence,
    evidence => evidence.senseId,
    evidence => evidence.sourceOrdinal);
}

function assertEmbeddedRightsAndProvenanceNotice(artifact: PinnedUbsSemanticArtifact): void {
  const rights = artifact.rightsNotice;
  if (rights.schemaVersion !== UBS_PINNED_SEMANTIC_RIGHTS_NOTICE_SCHEMA
    || rights.scope !== 'derived_semantic_layer_and_coordinate_bridge_only_not_theologai_code_or_unrelated_data'
    || rights.derivedLayerLicense.name !== 'CC BY-SA 4.0'
    || rights.derivedLayerLicense.url !== UBS_CC_BY_SA_40_URL
    || rights.modificationSummary !== DERIVED_MODIFICATION_SUMMARY
    || rights.warrantyAndDisclaimer.statement !== 'CC_BY_SA_4_0_is_offered_as_is_without_warranties_to_the_extent_provided_in_legal_code_section_5'
    || rights.warrantyAndDisclaimer.legalCodeSection5Url !== UBS_CC_BY_SA_40_LEGALCODE_SECTION_5_URL
    || rights.externalNoticeReference !== UBS_PINNED_SEMANTIC_DERIVED_NOTICE_PATH) {
    throw new Error('Pinned UBS semantic artifact rights notice is incomplete or detached from the reviewed policy');
  }
  const provenance = artifact.provenanceNotice;
  if (provenance.schemaVersion !== UBS_PINNED_SEMANTIC_PROVENANCE_NOTICE_SCHEMA
    || provenance.ubsSdbh.copyright !== UBS_HEBREW_V092_COPYRIGHT_NOTICE
    || provenance.ubsSdbh.ancestry !== 'UBS_Dictionary_of_Biblical_Hebrew_adapted_from_Semantic_Dictionary_of_Biblical_Hebrew'
    || provenance.ubsSdbh.repository !== UBS_HEBREW_V092_REPOSITORY
    || provenance.ubsSdbh.commit !== UBS_HEBREW_V092_COMMIT
    || provenance.tahot.repository !== TAHOT_REPOSITORY
    || provenance.tahot.commit !== TAHOT_COMMIT
    || provenance.tahot.license !== 'CC BY 4.0'
    || provenance.tahot.licenseUrl !== TAHOT_CC_BY_40_URL
    || provenance.tahot.attribution !== TAHOT_ATTRIBUTION
    || provenance.tahot.boundary !== 'TAHOT_CC_BY_coordinate_witness_only_not_a_UBS_morphology_token_alignment_or_contextual_sense_adjudication'
    || provenance.usfmtc.repository !== USFMTC_REPOSITORY
    || provenance.usfmtc.license !== 'MIT'
    || provenance.usfmtc.licenseUrl !== USFMTC_MIT_LICENSE_URL
    || provenance.usfmtc.boundary !== 'usfmtc_supplies_a_pinned_reference_table_only_and_does_not_imply_endorsement_by_usfmtc_or_its_contributors') {
    throw new Error('Pinned UBS semantic artifact provenance notice is incomplete or detached from reviewed source boundaries');
  }
  const expectedSources = artifact.sources.map(source => ({
    sourceId: source.sourceId,
    artifactName: source.artifactName,
    sourceUrl: source.sourceUrl,
    sourceBlob: source.sourceBlob,
    sourceSha256: source.sourceSha256,
  }));
  if (canonicalJson(provenance.ubsSdbh.sourceArtifacts) !== canonicalJson(expectedSources)) {
    throw new Error('Pinned UBS semantic artifact provenance notice does not retain both exact source identities and pins');
  }
}

function assertUnique(values: Set<string>, value: string, label: string): void {
  if (values.has(value)) throw new Error(`Pinned UBS semantic artifact ${label} ID is duplicated`);
  values.add(value);
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isUniqueSorted(values: readonly string[]): boolean {
  return values.every((value, index) => typeof value === 'string'
    && (index === 0 || compareCodePoints(values[index - 1]!, value) < 0));
}

function assertStrictCanonicalTupleOrder<T>(
  label: string,
  values: readonly T[],
  tuple: (value: T) => readonly (string | number)[],
): void {
  let previous: readonly (string | number)[] | undefined;
  for (const value of values) {
    const current = tuple(value);
    if (previous !== undefined && compareCanonicalTuple(previous, current) >= 0) {
      throw new Error(`Pinned UBS semantic artifact ${label} are not in strict source-ordinal/canonical-ID tuple order`);
    }
    previous = current;
  }
}

function compareCanonicalTuple(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined) return -1;
    if (rightValue === undefined) return 1;
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      if (leftValue !== rightValue) return leftValue - rightValue;
    } else {
      const compared = compareCodePoints(String(leftValue), String(rightValue));
      if (compared !== 0) return compared;
    }
  }
  return 0;
}

function assertContiguousOrdinalsByParent<T>(
  label: string,
  values: readonly T[],
  parent: (value: T) => string,
  ordinal: (value: T) => number,
): void {
  const nextByParent = new Map<string, number>();
  for (const value of values) {
    const parentId = parent(value);
    const expected = nextByParent.get(parentId) ?? 1;
    if (ordinal(value) !== expected) {
      throw new Error(`Pinned UBS semantic artifact ${label} source ordinals are not contiguous within their canonical parent`);
    }
    nextByParent.set(parentId, expected + 1);
  }
}

function coordinateSortKey(coordinate: TahotCoordinate): string {
  return `${String(coordinate.bookNumber).padStart(3, '0')}:${String(coordinate.chapter).padStart(3, '0')}:${String(coordinate.verse).padStart(3, '0')}`;
}

function withoutArtifactIdentity(artifact: Omit<PinnedUbsSemanticArtifact, 'artifactIdentity'> | PinnedUbsSemanticArtifact): Omit<PinnedUbsSemanticArtifact, 'artifactIdentity'> {
  const { artifactIdentity: _identity, ...core } = artifact as PinnedUbsSemanticArtifact;
  return core;
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Canonical JSON has no incidental object-key or platform formatting variance. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error('Canonical JSON cannot represent undefined, bigint, symbol, or function values');
}

/**
 * The exact same canonical JSON grammar as canonicalJson(), written directly
 * into a SHA-256/byte-count sink so large untracked artifacts do not require a
 * second contiguous string allocation merely to prove their byte identity.
 */
export function canonicalJsonDigest(
  value: unknown,
  options: { readonly maxBytes?: number } = {},
): { readonly sha256: string; readonly byteLength: number } {
  const maxBytes = options.maxBytes;
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 1)) {
    throw new Error('Canonical JSON byte ceiling must be a positive safe integer');
  }
  const hash = createHash('sha256');
  let byteLength = 0;
  let buffered = '';
  const flush = (): void => {
    if (buffered === '') return;
    const bufferedByteLength = Buffer.byteLength(buffered, 'utf8');
    if (maxBytes !== undefined && byteLength + bufferedByteLength > maxBytes) {
      throw new Error('Canonical artifact byte ceiling exceeded while streaming canonical JSON');
    }
    byteLength += bufferedByteLength;
    hash.update(buffered, 'utf8');
    buffered = '';
  };
  const write = (fragment: string): void => {
    buffered += fragment;
    // Keep the peak bounded while avoiding millions of tiny hash/byte-length
    // calls for the 250k evidence-row artifact.
    if (buffered.length >= 64 * 1024) flush();
  };
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate === 'boolean' || typeof candidate === 'number' || typeof candidate === 'string') {
      write(JSON.stringify(candidate));
      return;
    }
    if (Array.isArray(candidate)) {
      write('[');
      candidate.forEach((item, index) => {
        if (index > 0) write(',');
        visit(item);
      });
      write(']');
      return;
    }
    if (typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      write('{');
      Object.keys(record).sort(compareCodePoints).forEach((key, index) => {
        if (index > 0) write(',');
        write(JSON.stringify(key));
        write(':');
        visit(record[key]);
      });
      write('}');
      return;
    }
    throw new Error('Canonical JSON cannot represent undefined, bigint, symbol, or function values');
  };
  visit(value);
  flush();
  return { sha256: hash.digest('hex'), byteLength };
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
