#!/usr/bin/env tsx

/**
 * Verifies the owner-approved UBS Hebrew v0.9.2 acquisition packet.
 *
 * This is intentionally an inspection-only guard: it reads the two immutable
 * source files, their copied upstream notices, and a count/shape report. It is
 * not a decoder, compiler, migration, or materialization step.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY = 'https://github.com/ubsicap/ubs-open-license';
const COMMIT = '3a6edd8212df2e1189037ad39687726990c80d56';
const SOURCE_ROOT = 'data/biblical-languages/ubs-open-license/v0.9.2';
const SCHEMA_REPORT_PATH = `${SOURCE_ROOT}/SCHEMA-REPORT.json`;
const SOURCE_MANIFEST_PATH = `${SOURCE_ROOT}/SOURCE.json`;
const SOURCE_SCHEMA_VERSION = 'theologai-ubs-hebrew-acquisition-v1';
const SCHEMA_REPORT_VERSION = 'theologai-ubs-hebrew-v0.9.2-schema-inspection-v1';
const COPYRIGHT_NOTICE = '(UBS Dictionary of Biblical Hebrew © United Bible Societies, 2023.  Adapted from Semantic Dictionary of Biblical Hebrew © 2000-2023 United Bible Societies.)';
const COVERAGE_AND_COMPLETENESS = Object.freeze({
  upstreamHebrewNotice: 'The Hebrew-specific upstream notice describes SDBH as ongoing and says around 90% of Old Testament words are included; treat the corpus as non-exhaustive.',
  upstreamV092ReleaseNote: 'The upstream dictionaries notice labels version 0.9.2 as entries added and says now at 99%. This conflicting broader release-note wording does not authorize a completeness claim.',
  theologaiPolicy: 'No current or future TheologAI result may imply complete Hebrew lexical or reference coverage solely from this acquisition.',
});
const MODIFICATIONS = Object.freeze({
  performed: 'The two approved JSON artifacts and three notices remain verbatim. A migration-free, inactive raw decoder and coordinate-validation design were added with deterministic audit reports; neither source artifact was modified.',
  plannedButNotPerformed: 'No executable migration 0004, transform 7, seed, manifest registration, D1 row, adapter, query plan, composition-root wiring, runtime tool, prompt, resource, public output, or deployment was added.',
});
const FUTURE_ATTRIBUTION_AND_SHARE_ALIKE_POLICY = 'Before sharing any derived rows, exports, database copies, or semantic output based on these artifacts, preserve the UBS/SDBH attribution, the pinned source URI, the CC BY-SA 4.0 URI, and a clear change description; offer the derived semantic layer under CC BY-SA 4.0 or a compatible license. Do not claim that this policy extends CC BY-SA to unrelated TheologAI code or datasets, while preserving every license that independently applies. Final release wording remains subject to rights review.';

export interface UbsPinnedFile {
  readonly id: string;
  readonly version?: '0.9.2';
  readonly repositoryPath: string;
  readonly trackedPath: string;
  readonly sourceUrl: string;
  readonly gitBlobSha1: string;
  readonly bytes: number;
  readonly sha256: string;
}

export const UBS_HEBREW_V092_ARTIFACTS = Object.freeze([
  {
    id: 'ubs-hebrew-dictionary-en-v0.9.2',
    version: '0.9.2',
    repositoryPath: 'dictionaries/hebrew/JSON/UBSHebrewDic-v0.9.2-en.JSON',
    trackedPath: `${SOURCE_ROOT}/en/UBSHebrewDic-v0.9.2-en.JSON`,
    sourceUrl: `https://raw.githubusercontent.com/ubsicap/ubs-open-license/${COMMIT}/dictionaries/hebrew/JSON/UBSHebrewDic-v0.9.2-en.JSON`,
    gitBlobSha1: '39e218d17f1961495ea7052e342bd9707432cdc0',
    bytes: 23_110_129,
    sha256: '1686a25dd31dc9afb7b932927e160070667c73caedad11aa7e4482c21f800e8e',
  },
  {
    id: 'ubs-hebrew-lexical-domains-en-v0.9.2',
    version: '0.9.2',
    repositoryPath: 'dictionaries/hebrew/JSON/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
    trackedPath: `${SOURCE_ROOT}/en/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON`,
    sourceUrl: `https://raw.githubusercontent.com/ubsicap/ubs-open-license/${COMMIT}/dictionaries/hebrew/JSON/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON`,
    gitBlobSha1: '88b69b48b00d8306c6d596107b3123de1d41574b',
    bytes: 114_281,
    sha256: 'fbc862b2c46966cf7f3bf19c2f3e79a7391c34f8c737e1979fa5178ac603d0df',
  },
] as const satisfies readonly UbsPinnedFile[]);

export const UBS_HEBREW_REFERENCE_VALIDATION_ARTIFACTS = Object.freeze([
  {
    id: 'usfmtc-reference-py',
    repositoryPath: 'src/usfmtc/reference.py',
    trackedPath: `${SOURCE_ROOT}/reference-validation/usfmtc-reference.py`,
    sourceUrl: 'https://raw.githubusercontent.com/usfm-bible/usfmtc/a222dd3e78360f8e275ca56f4307af7e02b2430a/src/usfmtc/reference.py',
    gitBlobSha1: '16cd6fc2a42664a494a5989b8587247a27331cb6',
    bytes: 40_159,
    sha256: 'eaff130bef0b6f6dde52386acb8c7a2e5111be11f1ca104522cffef72ea42b69',
  },
  {
    id: 'usfmtc-mit-license',
    repositoryPath: 'LICENSE',
    trackedPath: `${SOURCE_ROOT}/reference-validation/USFMTC-LICENSE`,
    sourceUrl: 'https://raw.githubusercontent.com/usfm-bible/usfmtc/a222dd3e78360f8e275ca56f4307af7e02b2430a/LICENSE',
    gitBlobSha1: '94b86440d4155c330b5fc17459effd133044064f',
    bytes: 1_061,
    sha256: '8d67696c8d8dca45ebed80adf43d53a8c5f4ebc563ace89da23d1af3b3e50be9',
  },
] as const satisfies readonly UbsPinnedFile[]);

export const UBS_HEBREW_V092_NOTICES = Object.freeze([
  {
    id: 'cc-by-sa-4.0-license',
    repositoryPath: 'LICENSE.md',
    trackedPath: `${SOURCE_ROOT}/upstream-notices/LICENSE.md`,
    sourceUrl: `https://raw.githubusercontent.com/ubsicap/ubs-open-license/${COMMIT}/LICENSE.md`,
    gitBlobSha1: '3b7b82d0da2db857eda1a798dbd908ea136f07b5',
    bytes: 20_131,
    sha256: '7abe19ec9bb73b36141b999b861d24ad855e808bafe0f81e84cce28556f6c297',
  },
  {
    id: 'dictionary-release-note',
    repositoryPath: 'dictionaries/README.md',
    trackedPath: `${SOURCE_ROOT}/upstream-notices/DICTIONARIES-README.md`,
    sourceUrl: `https://raw.githubusercontent.com/ubsicap/ubs-open-license/${COMMIT}/dictionaries/README.md`,
    gitBlobSha1: '6255bc7628139e801d30ca9d3b4549880e33c09f',
    bytes: 3_208,
    sha256: 'a3129082d10950457a0449878cadc5927c4f5707e058cb35aef572fd70fe9a56',
  },
  {
    id: 'hebrew-specific-notice',
    repositoryPath: 'dictionaries/hebrew/README.md',
    trackedPath: `${SOURCE_ROOT}/upstream-notices/HEBREW-README.md`,
    sourceUrl: `https://raw.githubusercontent.com/ubsicap/ubs-open-license/${COMMIT}/dictionaries/hebrew/README.md`,
    gitBlobSha1: '684b1403ab7638ec398e9c9713fc419bee659504',
    bytes: 3_193,
    sha256: 'f18eab18a4bad4a83f45981064139f89a96cb4ae97e0e72833d709ae2fb52940',
  },
] as const satisfies readonly UbsPinnedFile[]);

/** Exact reviewed bytes for the separately reproducible coordinate audit. */
export const UBS_HEBREW_V092_COORDINATE_AUDIT = Object.freeze({
  schemaVersion: 'theologai-ubs-tahot-coordinate-audit.v1',
  trackedPath: `${SOURCE_ROOT}/COORDINATE-AUDIT.json`,
  sha256: 'd174d827bbfdf7d1c35a8836ff28a5453a2947ac5020eb5df060fed1732a1f30',
} as const);

const ENTRY_KEYS = Object.freeze([
  'AlphaPos', 'AlternateLemmas', 'Authors', 'BaseForms', 'ContributorNote', 'Contributors', 'Dates',
  'HasAramaic', 'InLXX', 'Lemma', 'Localizations', 'MainId', 'MainLinks', 'Notes', 'StrongCodes', 'Version',
]);
const BASE_FORM_KEYS = Object.freeze([
  'BaseFormID', 'BaseFormLinks', 'Constructs', 'CrossReferences', 'Etymologies', 'Inflections', 'LEXMeanings',
  'MeaningsOfName', 'PartsOfSpeech', 'RelatedLemmas', 'RelatedNames',
]);
const MEANING_KEYS = Object.freeze([
  'CONMeanings', 'LEXAntonyms', 'LEXCollocations', 'LEXCoordinates', 'LEXCoreDomains', 'LEXCrossReferences',
  'LEXDomains', 'LEXEntryCode', 'LEXForms', 'LEXID', 'LEXIllustrations', 'LEXImages', 'LEXIndent',
  'LEXIsBiblicalTerm', 'LEXLinks', 'LEXParallels', 'LEXReferences', 'LEXSenses', 'LEXSubDomains', 'LEXSynonyms',
  'LEXValencies', 'LEXVideos',
]);
const SENSE_KEYS = Object.freeze([
  'Comments', 'DefinitionLong', 'DefinitionShort', 'Glosses', 'LanguageCode', 'LastEdited', 'LastEditedBy',
]);
const DOMAIN_KEYS = Object.freeze([
  'Code', 'Entries', 'HasSubDomains', 'Level', 'Prototype', 'Reference', 'SemanticDomainLocalizations',
]);
const DOMAIN_LOCALIZATION_KEYS = Object.freeze(['Comment', 'Description', 'Label', 'LanguageCode', 'Opposite']);
const DOMAIN_ASSIGNMENT_KEYS = Object.freeze(['Domain', 'DomainCode', 'DomainSource', 'DomainSourceCode']);
const SOURCE_TOKEN_REFERENCE = /^(\d{3})(\d{3})(\d{3})(\d{2})(\d{3})((?:!?\{N:-?\d{3}\})*)$/;
/** Global field ranges observed in the exact pinned artifact; not versification validation. */
const SOURCE_MAX_BOOK_FIELD = 39;
const SOURCE_MAX_CHAPTER_FIELD = 150;
const SOURCE_MAX_VERSE = 176;

interface SchemaInspection {
  readonly schemaVersion: typeof SCHEMA_REPORT_VERSION;
  readonly inspectionScope: string;
  readonly rawArtifacts: readonly {
    readonly id: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly gitBlobSha1: string;
  }[];
  readonly sourceAcquisitionCapacity: {
    readonly rawArtifactBytes: number;
    readonly rawNoticeBytes: number;
    readonly totalVendoredRawBytes: number;
    readonly plannedDatabaseCeilingBytes: 367001600;
    readonly materializedDatabaseMeasurement: null;
    readonly conclusion: string;
  };
  readonly dictionary: {
    readonly topLevel: 'array';
    readonly entries: number;
    readonly uniqueMainIds: number;
    readonly baseForms: number;
    readonly uniqueBaseFormIds: number;
    readonly lexicalMeanings: number;
    readonly uniqueLexIds: number;
    readonly senseLocalizations: number;
    readonly englishSenseLocalizations: number;
    readonly domainAssignments: number;
    readonly fieldSets: Record<string, readonly string[]>;
    readonly lexicalReferences: {
      readonly records: number;
      readonly uniqueRecords: number;
      readonly anchorFormat: 'BBBCCCVVVSSWWW';
      readonly anchorDigits: 14;
      readonly allRowsStartWithSourceTokenAnchor: true;
      readonly bareAnchors: number;
      readonly anchorsWithSuffix: number;
      readonly footnoteMarkers: number;
      readonly bangN001Suffixes: number;
      readonly negativeN033Markers: number;
      readonly multiMarkerSuffixes: number;
      readonly suffixKind: 'upstream footnote notation retained in raw string';
      readonly structuralFieldValidation: {
        readonly books: '1-39 observed global field range';
        readonly chapters: '1-150 observed global field range; no book/chapter cross-validation';
        readonly verses: '1-176 observed global field range; no chapter/verse cross-validation';
        readonly segment: '00';
        readonly word: 'positive even integer encoded in three digits';
        readonly biblicalReferenceValidity: 'not established by this Gate 1 inspection';
      };
      readonly observedCoordinateRange: {
        readonly book: readonly [number, number];
        readonly chapter: readonly [number, number];
        readonly verse: readonly [number, number];
        readonly word: readonly [number, number];
      };
    };
  };
  readonly domains: {
    readonly topLevel: 'array';
    readonly records: number;
    readonly uniqueCodes: number;
    readonly levels: Readonly<Record<string, number>>;
    readonly localizations: number;
    readonly englishLocalizations: number;
    readonly fieldSets: Record<string, readonly string[]>;
  };
  readonly alignmentBoundary: string;
}

export interface UbsSourceTokenReference {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
  readonly segment: 0;
  readonly word: number;
  readonly suffix: string;
  readonly footnoteMarkers: readonly string[];
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha1(bytes: Uint8Array): string {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

export function assertPinnedUbsHebrewV092Bytes(file: UbsPinnedFile, bytes: Uint8Array): void {
  if (bytes.byteLength !== file.bytes) {
    throw new Error(`Pinned UBS source byte length drift for ${file.id}: expected ${file.bytes}, got ${bytes.byteLength}`);
  }
  if (sha256(bytes) !== file.sha256) {
    throw new Error(`Pinned UBS source SHA-256 drift for ${file.id}`);
  }
  if (gitBlobSha1(bytes) !== file.gitBlobSha1) {
    throw new Error(`Pinned UBS source Git blob drift for ${file.id}`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function assertExactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} fields differ from the approved v0.9.2 schema inspection`);
  }
}

function getRequiredArray(record: Record<string, unknown>, key: string, label: string): unknown[] {
  return asArray(record[key], `${label}.${key}`);
}

function stableCountRecord(values: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...values.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function parseUbsSourceTokenReference(reference: string): UbsSourceTokenReference {
  const match = SOURCE_TOKEN_REFERENCE.exec(reference);
  if (!match) throw new Error('UBS source-token reference does not match BBBCCCVVVSSWWW plus inspected footnote syntax');
  const book = Number(match[1]);
  const chapter = Number(match[2]);
  const verse = Number(match[3]);
  const segment = Number(match[4]);
  const word = Number(match[5]);
  const suffix = match[6] ?? '';
  if (!Number.isInteger(book) || book < 1 || book > SOURCE_MAX_BOOK_FIELD) {
    throw new Error(`UBS source-token reference book field must be within the pinned global observed range 1-${SOURCE_MAX_BOOK_FIELD}`);
  }
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > SOURCE_MAX_CHAPTER_FIELD) {
    throw new Error(`UBS source-token reference chapter field must be within the pinned global observed range 1-${SOURCE_MAX_CHAPTER_FIELD}`);
  }
  if (!Number.isInteger(verse) || verse < 1 || verse > SOURCE_MAX_VERSE) {
    throw new Error(`UBS source-token reference verse field must be within the pinned global observed range 1-${SOURCE_MAX_VERSE}`);
  }
  if (segment !== 0) throw new Error('UBS Hebrew source-token reference segment must be 00');
  if (!Number.isInteger(word) || word <= 0 || word % 2 !== 0) {
    throw new Error('UBS Hebrew source-token reference word must be a positive even integer');
  }
  const footnoteMarkers = suffix.match(/!?\{N:-?\d{3}\}/g) ?? [];
  if (footnoteMarkers.join('') !== suffix) {
    throw new Error('UBS source-token reference contains an uninspected suffix');
  }
  return { book, chapter, verse, segment: 0, word, suffix, footnoteMarkers };
}

export function inspectUbsHebrewV092Schema(dictionaryBytes: Uint8Array, domainsBytes: Uint8Array): SchemaInspection {
  const dictionary = asArray(JSON.parse(Buffer.from(dictionaryBytes).toString('utf8')), 'dictionary root');
  const domains = asArray(JSON.parse(Buffer.from(domainsBytes).toString('utf8')), 'domain root');
  const mainIds = new Set<string>();
  const baseFormIds = new Set<string>();
  const lexIds = new Set<string>();
  const references = new Set<string>();
  const domainCodes = new Set<string>();
  const levels = new Map<string, number>();
  let baseForms = 0;
  let lexicalMeanings = 0;
  let senseLocalizations = 0;
  let englishSenseLocalizations = 0;
  let domainAssignments = 0;
  let referenceRecords = 0;
  let bareAnchors = 0;
  let anchorsWithSuffix = 0;
  let footnoteMarkers = 0;
  let bangN001Suffixes = 0;
  let negativeN033Markers = 0;
  let multiMarkerSuffixes = 0;
  const coordinateMinimum = { book: Number.POSITIVE_INFINITY, chapter: Number.POSITIVE_INFINITY, verse: Number.POSITIVE_INFINITY, word: Number.POSITIVE_INFINITY };
  const coordinateMaximum = { book: 0, chapter: 0, verse: 0, word: 0 };
  let localizations = 0;
  let englishLocalizations = 0;

  for (const [entryIndex, rawEntry] of dictionary.entries()) {
    const entry = asRecord(rawEntry, `dictionary[${entryIndex}]`);
    assertExactKeys(entry, ENTRY_KEYS, `dictionary[${entryIndex}]`);
    mainIds.add(asString(entry.MainId, `dictionary[${entryIndex}].MainId`));
    for (const [baseIndex, rawBase] of getRequiredArray(entry, 'BaseForms', `dictionary[${entryIndex}]`).entries()) {
      const base = asRecord(rawBase, `dictionary[${entryIndex}].BaseForms[${baseIndex}]`);
      assertExactKeys(base, BASE_FORM_KEYS, `dictionary[${entryIndex}].BaseForms[${baseIndex}]`);
      baseForms++;
      baseFormIds.add(asString(base.BaseFormID, `dictionary[${entryIndex}].BaseForms[${baseIndex}].BaseFormID`));
      for (const [meaningIndex, rawMeaning] of getRequiredArray(base, 'LEXMeanings', `base form ${baseIndex}`).entries()) {
        const meaning = asRecord(rawMeaning, `meaning[${meaningIndex}]`);
        assertExactKeys(meaning, MEANING_KEYS, `meaning[${meaningIndex}]`);
        lexicalMeanings++;
        lexIds.add(asString(meaning.LEXID, `meaning[${meaningIndex}].LEXID`));
        for (const [senseIndex, rawSense] of getRequiredArray(meaning, 'LEXSenses', `meaning[${meaningIndex}]`).entries()) {
          const sense = asRecord(rawSense, `meaning[${meaningIndex}].LEXSenses[${senseIndex}]`);
          assertExactKeys(sense, SENSE_KEYS, `meaning[${meaningIndex}].LEXSenses[${senseIndex}]`);
          senseLocalizations++;
          if (asString(sense.LanguageCode, `sense[${senseIndex}].LanguageCode`) === 'en') englishSenseLocalizations++;
        }
        const rawAssignments = meaning.LEXDomains;
        if (rawAssignments !== null) {
          for (const [assignmentIndex, rawAssignment] of asArray(rawAssignments, `meaning[${meaningIndex}].LEXDomains`).entries()) {
            assertExactKeys(asRecord(rawAssignment, `domain assignment[${assignmentIndex}]`), DOMAIN_ASSIGNMENT_KEYS, `domain assignment[${assignmentIndex}]`);
            domainAssignments++;
          }
        }
        for (const [referenceIndex, rawReference] of getRequiredArray(meaning, 'LEXReferences', `meaning[${meaningIndex}]`).entries()) {
          const reference = asString(rawReference, `meaning[${meaningIndex}].LEXReferences[${referenceIndex}]`);
          const parsed = parseUbsSourceTokenReference(reference);
          referenceRecords++;
          references.add(reference);
          if (parsed.suffix === '') bareAnchors++;
          else anchorsWithSuffix++;
          footnoteMarkers += parsed.footnoteMarkers.length;
          if (parsed.suffix === '!{N:001}') bangN001Suffixes++;
          if (parsed.footnoteMarkers.includes('{N:-033}')) negativeN033Markers++;
          if (parsed.footnoteMarkers.length > 1) multiMarkerSuffixes++;
          for (const key of ['book', 'chapter', 'verse', 'word'] as const) {
            coordinateMinimum[key] = Math.min(coordinateMinimum[key], parsed[key]);
            coordinateMaximum[key] = Math.max(coordinateMaximum[key], parsed[key]);
          }
        }
      }
    }
  }
  for (const [domainIndex, rawDomain] of domains.entries()) {
    const domain = asRecord(rawDomain, `domains[${domainIndex}]`);
    assertExactKeys(domain, DOMAIN_KEYS, `domains[${domainIndex}]`);
    domainCodes.add(asString(domain.Code, `domains[${domainIndex}].Code`));
    const level = domain.Level;
    if (!Number.isSafeInteger(level)) throw new Error(`domains[${domainIndex}].Level must be an integer`);
    const levelKey = String(level);
    levels.set(levelKey, (levels.get(levelKey) ?? 0) + 1);
    for (const [localizationIndex, rawLocalization] of getRequiredArray(domain, 'SemanticDomainLocalizations', `domains[${domainIndex}]`).entries()) {
      const localization = asRecord(rawLocalization, `domain localization[${localizationIndex}]`);
      assertExactKeys(localization, DOMAIN_LOCALIZATION_KEYS, `domain localization[${localizationIndex}]`);
      localizations++;
      if (asString(localization.LanguageCode, `domain localization[${localizationIndex}].LanguageCode`) === 'en') {
        englishLocalizations++;
      }
    }
  }
  const dictionaryArtifact = UBS_HEBREW_V092_ARTIFACTS[0];
  const domainArtifact = UBS_HEBREW_V092_ARTIFACTS[1];
  const rawArtifactBytes = UBS_HEBREW_V092_ARTIFACTS.reduce((total, artifact) => total + artifact.bytes, 0);
  const rawNoticeBytes = UBS_HEBREW_V092_NOTICES.reduce((total, notice) => total + notice.bytes, 0);
  return {
    schemaVersion: SCHEMA_REPORT_VERSION,
    inspectionScope: 'Raw-source count and shape inspection only; no decoding, normalization, transformation, token alignment, materialization, or public semantic output.',
    rawArtifacts: [
      { id: dictionaryArtifact.id, bytes: dictionaryArtifact.bytes, sha256: dictionaryArtifact.sha256, gitBlobSha1: dictionaryArtifact.gitBlobSha1 },
      { id: domainArtifact.id, bytes: domainArtifact.bytes, sha256: domainArtifact.sha256, gitBlobSha1: domainArtifact.gitBlobSha1 },
    ],
    sourceAcquisitionCapacity: {
      rawArtifactBytes,
      rawNoticeBytes,
      totalVendoredRawBytes: rawArtifactBytes + rawNoticeBytes,
      plannedDatabaseCeilingBytes: 367_001_600,
      materializedDatabaseMeasurement: null,
      conclusion: 'Raw source size is not a D1 materialization measurement. Migration, transform, generated seed, and built-database capacity verification remain separately gated.',
    },
    dictionary: {
      topLevel: 'array', entries: dictionary.length, uniqueMainIds: mainIds.size, baseForms, uniqueBaseFormIds: baseFormIds.size,
      lexicalMeanings, uniqueLexIds: lexIds.size, senseLocalizations, englishSenseLocalizations, domainAssignments,
      fieldSets: {
        entry: ENTRY_KEYS, baseForm: BASE_FORM_KEYS, lexicalMeaning: MEANING_KEYS,
        senseLocalization: SENSE_KEYS, domainAssignment: DOMAIN_ASSIGNMENT_KEYS,
      },
      lexicalReferences: {
        records: referenceRecords, uniqueRecords: references.size, anchorFormat: 'BBBCCCVVVSSWWW', anchorDigits: 14,
        allRowsStartWithSourceTokenAnchor: true, bareAnchors, anchorsWithSuffix, footnoteMarkers,
        bangN001Suffixes, negativeN033Markers, multiMarkerSuffixes,
        suffixKind: 'upstream footnote notation retained in raw string',
        structuralFieldValidation: {
          books: '1-39 observed global field range',
          chapters: '1-150 observed global field range; no book/chapter cross-validation',
          verses: '1-176 observed global field range; no chapter/verse cross-validation',
          segment: '00',
          word: 'positive even integer encoded in three digits',
          biblicalReferenceValidity: 'not established by this Gate 1 inspection',
        },
        observedCoordinateRange: {
          book: [coordinateMinimum.book, coordinateMaximum.book],
          chapter: [coordinateMinimum.chapter, coordinateMaximum.chapter],
          verse: [coordinateMinimum.verse, coordinateMaximum.verse],
          word: [coordinateMinimum.word, coordinateMaximum.word],
        },
      },
    },
    domains: {
      topLevel: 'array', records: domains.length, uniqueCodes: domainCodes.size, levels: stableCountRecord(levels),
      localizations, englishLocalizations,
      fieldSets: { domain: DOMAIN_KEYS, localization: DOMAIN_LOCALIZATION_KEYS },
    },
    alignmentBoundary: 'UBS source token anchors are not verified alignments to TheologAI morphology tokens; no contextual-token semantic assertion is authorized without a separately versioned alignment verifier.',
  };
}

function sourceManifestProjection(): Record<string, unknown> {
  const projectFile = (file: UbsPinnedFile) => ({
    id: file.id,
    ...(file.version === undefined ? {} : { version: file.version }),
    repositoryPath: file.repositoryPath,
    sourceUrl: file.sourceUrl,
    gitBlobSha1: file.gitBlobSha1,
    bytes: file.bytes,
    sha256: file.sha256,
    trackedPath: file.trackedPath,
  });
  return {
    schemaVersion: SOURCE_SCHEMA_VERSION,
    status: 'verbatim_source_vendored_no_transformation_or_runtime_registration',
    upstream: {
      publisher: 'United Bible Societies',
      repository: REPOSITORY,
      commit: COMMIT,
      commitUrl: `${REPOSITORY}/tree/${COMMIT}`,
      commitDate: '2026-07-09T18:17:22Z',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      copyright: COPYRIGHT_NOTICE,
    },
    artifacts: UBS_HEBREW_V092_ARTIFACTS.map(projectFile),
    referenceValidation: {
      purpose: 'Pin the reviewed USFM book/chapter reference table and its MIT license; TAHOT remains authoritative for raw Hebrew coordinates and usfmtc does not establish token alignment.',
      repository: 'https://github.com/usfm-bible/usfmtc',
      commit: 'a222dd3e78360f8e275ca56f4307af7e02b2430a',
      license: 'MIT',
      artifacts: UBS_HEBREW_REFERENCE_VALIDATION_ARTIFACTS.map(projectFile),
    },
    inactiveAuditReports: [
      {
        schemaVersion: 'theologai-ubs-hebrew-decoder-audit.v1',
        trackedPath: `${SOURCE_ROOT}/DECODER-AUDIT.json`,
        purpose: 'Deterministic normalized projection counts, fail-closed exclusions, and projection identity; separate from immutable Gate 1 SCHEMA-REPORT.json.',
      },
      {
        schemaVersion: 'theologai-ubs-tahot-coordinate-audit.v1',
        trackedPath: `${SOURCE_ROOT}/COORDINATE-AUDIT.json`,
        sha256: UBS_HEBREW_V092_COORDINATE_AUDIT.sha256,
        purpose: 'Exact raw UBS/TAHOT native-coordinate set equality and reviewed source pins; not contextual token or sense adjudication.',
      },
    ],
    upstreamNotices: UBS_HEBREW_V092_NOTICES.map(projectFile),
    coverageAndCompleteness: COVERAGE_AND_COMPLETENESS,
    modifications: MODIFICATIONS,
    futureAttributionAndShareAlikePolicy: FUTURE_ATTRIBUTION_AND_SHARE_ALIKE_POLICY,
  };
}

export function assertUbsHebrewV092SourceManifest(manifest: unknown): void {
  if (JSON.stringify(manifest) !== JSON.stringify(sourceManifestProjection())) {
    throw new Error('UBS acquisition manifest differs from the exact approved compliance projection');
  }
}

function verifyAcquisitionManifest(root: string): void {
  assertUbsHebrewV092SourceManifest(JSON.parse(readFileSync(join(root, SOURCE_MANIFEST_PATH), 'utf8')));
}

export function verifyUbsHebrewV092Acquisition(root: string): SchemaInspection {
  verifyAcquisitionManifest(root);
  for (const file of [
    ...UBS_HEBREW_V092_ARTIFACTS,
    ...UBS_HEBREW_REFERENCE_VALIDATION_ARTIFACTS,
    ...UBS_HEBREW_V092_NOTICES,
  ]) {
    assertPinnedUbsHebrewV092Bytes(file, readFileSync(join(root, file.trackedPath)));
  }
  if (sha256(readFileSync(join(root, UBS_HEBREW_V092_COORDINATE_AUDIT.trackedPath)))
    !== UBS_HEBREW_V092_COORDINATE_AUDIT.sha256) {
    throw new Error('Tracked UBS/TAHOT coordinate audit byte hash drift');
  }
  const dictionary = readFileSync(join(root, UBS_HEBREW_V092_ARTIFACTS[0].trackedPath));
  const domains = readFileSync(join(root, UBS_HEBREW_V092_ARTIFACTS[1].trackedPath));
  const actualReport = inspectUbsHebrewV092Schema(dictionary, domains);
  const trackedReport = JSON.parse(readFileSync(join(root, SCHEMA_REPORT_PATH), 'utf8'));
  if (JSON.stringify(trackedReport) !== JSON.stringify(actualReport)) {
    throw new Error('Tracked UBS v0.9.2 schema report differs from the exact inspected source bytes');
  }
  return actualReport;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = verifyUbsHebrewV092Acquisition(ROOT);
  console.error(`[verify-ubs-hebrew-v092-acquisition] Verified ${report.dictionary.entries} dictionary entries, ${report.dictionary.lexicalReferences.records} source-token references, and ${report.domains.records} semantic domains.`);
}
