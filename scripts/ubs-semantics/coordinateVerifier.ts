import { createHash } from 'node:crypto';
import { STEPBIBLE_COMMIT, STEPBIBLE_DATA, type PinnedSourceFile } from '../biblical-language-sources.js';
import { parseUbsSourceTokenReference } from '../verify-ubs-hebrew-v092-acquisition.js';
import type { DecodedUbsCoordinateReference, UbsValidatedDefinitionReference } from './rawDecoder.js';

export const UBS_TAHOT_COORDINATE_VERIFIER_VERSION = 1 as const;
export const UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_SCHEMA =
  'theologai-ubs-tahot-native-to-normalized-bridge.v1' as const;
export const UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_COMPILER_VERSION = 1 as const;
export const UBS_TAHOT_COORDINATE_AUDIT_SHA256 =
  'd174d827bbfdf7d1c35a8836ff28a5453a2947ac5020eb5df060fed1732a1f30' as const;
/**
 * The pinned TAHOT files carry a common human-readable attribution header.
 * Retain only its bounded checksum in code: parsed token rows are accepted
 * only after both their full-file pins and the reviewed attribution header
 * have matched.
 */
export const TAHOT_ATTRIBUTION_HEADER_LINE_COUNT = 19 as const;
export const TAHOT_ATTRIBUTION_HEADER_SHA256 =
  '92848ccec4937ecd165514fa1fad292238217a864c3a0720bb9a9bc33be2ac82' as const;
export const USFMTC_COMMIT = 'a222dd3e78360f8e275ca56f4307af7e02b2430a' as const;
export const USFMTC_REFERENCE_PATH = 'src/usfmtc/reference.py' as const;
export const USFMTC_REFERENCE_BLOB = '16cd6fc2a42664a494a5989b8587247a27331cb6' as const;
export const USFMTC_REFERENCE_SHA256 = 'eaff130bef0b6f6dde52386acb8c7a2e5111be11f1ca104522cffef72ea42b69' as const;
export const USFMTC_LICENSE_PATH = 'LICENSE' as const;
export const USFMTC_LICENSE_BLOB = '94b86440d4155c330b5fc17459effd133044064f' as const;
export const USFMTC_LICENSE_SHA256 = '8d67696c8d8dca45ebed80adf43d53a8c5f4ebc563ace89da23d1af3b3e50be9' as const;
const SOURCE_ROOT = 'data/biblical-languages/ubs-open-license/v0.9.2/reference-validation';

export interface ExactPinnedBytes {
  readonly id: string;
  readonly repositoryPath: string;
  readonly trackedPath?: string;
  readonly sourceUrl: string;
  readonly gitBlobSha1: string;
  readonly bytes: number;
  readonly sha256: string;
}

export const USFMTC_REFERENCE_ARTIFACTS = Object.freeze([
  {
    id: 'usfmtc-reference-py', repositoryPath: USFMTC_REFERENCE_PATH,
    trackedPath: `${SOURCE_ROOT}/usfmtc-reference.py`,
    sourceUrl: `https://raw.githubusercontent.com/usfm-bible/usfmtc/${USFMTC_COMMIT}/${USFMTC_REFERENCE_PATH}`,
    gitBlobSha1: USFMTC_REFERENCE_BLOB, bytes: 40_159, sha256: USFMTC_REFERENCE_SHA256,
  },
  {
    id: 'usfmtc-mit-license', repositoryPath: USFMTC_LICENSE_PATH,
    trackedPath: `${SOURCE_ROOT}/USFMTC-LICENSE`,
    sourceUrl: `https://raw.githubusercontent.com/usfm-bible/usfmtc/${USFMTC_COMMIT}/${USFMTC_LICENSE_PATH}`,
    gitBlobSha1: USFMTC_LICENSE_BLOB, bytes: 1_061, sha256: USFMTC_LICENSE_SHA256,
  },
] as const satisfies readonly ExactPinnedBytes[]);

export const PINNED_TAHOT_FILES = Object.freeze(STEPBIBLE_DATA.files.filter(file =>
  ['tahot-gen-deu', 'tahot-jos-est', 'tahot-job-sng', 'tahot-isa-mal'].includes(file.id)));

if (PINNED_TAHOT_FILES.length !== 4) throw new Error('The exact four pinned TAHOT source files are unavailable');

export interface TahotRawInput {
  readonly pin: PinnedSourceFile;
  readonly bytes: Uint8Array;
}

export interface TahotCoordinate {
  readonly bookNumber: number;
  readonly bookCode: string;
  readonly chapter: number;
  readonly verse: number;
}

export interface TahotRawToken {
  readonly fileId: string;
  readonly fileSha256: string;
  readonly lineNumber: number;
  readonly rawReferenceAndType: string;
  readonly textType: string;
  readonly wordElement: string;
  readonly nativeCoordinate: TahotCoordinate;
  readonly normalizedCoordinate: TahotCoordinate;
  readonly tokenIdentity: string;
}

export interface UbsTahotCoordinateIndex {
  readonly tokens: readonly TahotRawToken[];
  readonly tokenByFileAndLine: ReadonlyMap<string, TahotRawToken>;
  /** One native verse can straddle two normalized verses at versification boundaries. */
  readonly nativeToNormalized: ReadonlyMap<string, readonly TahotCoordinate[]>;
  readonly usfmBookByNumber: ReadonlyMap<number, { code: string; chapters: number }>;
  readonly tahotPins: readonly PinnedSourceFile[];
  readonly usfmtc: {
    readonly commit: typeof USFMTC_COMMIT;
    readonly referenceBlob: typeof USFMTC_REFERENCE_BLOB;
    readonly referenceSha256: typeof USFMTC_REFERENCE_SHA256;
    readonly licenseBlob: typeof USFMTC_LICENSE_BLOB;
    readonly licenseSha256: typeof USFMTC_LICENSE_SHA256;
  };
}

export interface UbsTahotNativeToNormalizedBridge {
  readonly schemaVersion: typeof UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_SCHEMA;
  readonly compilerVersion: typeof UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_COMPILER_VERSION;
  readonly normalizationRule: 'identity_when_no_canonical_override';
  readonly coordinateAudit: {
    readonly schemaVersion: 'theologai-ubs-tahot-coordinate-audit.v1';
    readonly sha256: typeof UBS_TAHOT_COORDINATE_AUDIT_SHA256;
  };
  readonly attributionHeader: {
    readonly lines: typeof TAHOT_ATTRIBUTION_HEADER_LINE_COUNT;
    readonly sha256: typeof TAHOT_ATTRIBUTION_HEADER_SHA256;
  };
  readonly tahot: readonly { id: string; sha256: string; gitBlobSha1: string }[];
  readonly usfmtc: UbsTahotCoordinateIndex['usfmtc'];
  /** Book codes required to reconstruct identity mappings without TAHOT bytes. */
  readonly defaultBookCodes: readonly { bookNumber: number; bookCode: string }[];
  /** Complete native-coordinate membership set, compactly encoded as BBB:CCC:VVV keys. */
  readonly nativeCoordinateKeys: readonly string[];
  /**
   * Native references are deliberately allowed to map to several normalized
   * references.  The bridge never chooses one of those alternatives.
   */
  readonly overrides: readonly {
    nativeCoordinate: TahotCoordinate;
    normalizedCoordinates: readonly TahotCoordinate[];
  }[];
  readonly bridgeIdentity: string;
}

export interface UbsTahotCoordinateAudit {
  readonly schemaVersion: 'theologai-ubs-tahot-coordinate-audit.v1';
  readonly ubsReferenceRecords: number;
  readonly ubsUniqueNativeCoordinates: number;
  readonly tahotUniqueNativeCoordinates: number;
  readonly coordinateSetEquality: true;
  readonly missingUbsCoordinates: readonly string[];
  readonly extraTahotCoordinates: readonly string[];
  readonly footnoteSuffixRecords: number;
  readonly tahotRawTokens: number;
  readonly nativeToNormalizedDifferences: number;
  readonly pins: {
    readonly stepBibleCommit: typeof STEPBIBLE_COMMIT;
    readonly tahot: readonly { id: string; bytes: number; sha256: string; gitBlobSha1: string }[];
    readonly usfmtc: UbsTahotCoordinateIndex['usfmtc'];
  };
}

export interface UbsCoordinateEvidenceRow {
  readonly artifactIdentity: string;
  readonly sourceId: string;
  readonly entryId: string;
  readonly senseId: string;
  readonly evidenceId: string;
  readonly normalizedReference: string;
  readonly rawAnchor: string;
}

export interface UbsTahotCoordinateAttestation {
  readonly schemaVersion: 'theologai-ubs-tahot-coordinate-attestation.v1';
  readonly verifierVersion: typeof UBS_TAHOT_COORDINATE_VERIFIER_VERSION;
  readonly artifactIdentity: string;
  readonly sourceId: string;
  readonly entryId: string;
  readonly senseId: string;
  readonly evidenceId: string;
  readonly rawAnchor: string;
  readonly footnoteSuffix: string;
  readonly nativeCoordinate: TahotCoordinate;
  readonly normalizedCoordinate: TahotCoordinate;
  readonly normalizedReference: string;
  readonly tahotTokenIdentity: string;
  readonly tahotWordElement: string;
  readonly tahotFileId: string;
  readonly tahotFileLine: number;
  readonly tahotCorpus: readonly { id: string; sha256: string; gitBlobSha1: string }[];
  readonly usfmtc: UbsTahotCoordinateIndex['usfmtc'];
  /**
   * This proves only that an explicitly selected raw TAHOT token has the same
   * native coordinate as an explicitly selected UBS anchor. It is deliberately
   * insufficient for a lexical or morphology-token alignment claim.
   */
  readonly limitation: 'coordinate_and_explicit_pair_only_not_token_alignment_or_lexical_sense_adjudication';
}

export function createUbsTahotCoordinateIndex(
  tahotInputs: readonly TahotRawInput[],
  usfmtcReferenceBytes: Uint8Array,
  usfmtcLicenseBytes: Uint8Array,
): UbsTahotCoordinateIndex {
  assertPinnedBytes(USFMTC_REFERENCE_ARTIFACTS[0], usfmtcReferenceBytes);
  assertPinnedBytes(USFMTC_REFERENCE_ARTIFACTS[1], usfmtcLicenseBytes);
  assertExactTahotInputSet(tahotInputs);
  const usfmBookByNumber = parsePinnedUsfmtcOldTestament(usfmtcReferenceBytes);
  const usfmNumberByCode = new Map([...usfmBookByNumber].map(([number, book]) => [book.code, number]));
  const tokens: TahotRawToken[] = [];
  const tokenByFileAndLine = new Map<string, TahotRawToken>();
  const nativeToNormalized = new Map<string, TahotCoordinate[]>();
  for (const { pin, bytes } of [...tahotInputs].sort((left, right) => compare(left.pin.id, right.pin.id))) {
    assertPinnedBytes(pin, bytes);
    const text = decodeUtf8(bytes, pin.id);
    assertTahotAttributionHeader(text, pin.id);
    for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
      const firstField = line.split('\t', 1)[0]!.trim();
      if (!/^(?:[1-3][A-Za-z]{2}|[A-Za-z]{3})\./.test(firstField)) continue;
      const parsed = parseTahotReferenceAndType(firstField, usfmNumberByCode, usfmBookByNumber);
      const lineNumber = lineIndex + 1;
      const tokenIdentity = sha256([
        pin.id, pin.sha256, String(lineNumber), firstField, line,
      ].join('\0'));
      const token: TahotRawToken = {
        fileId: pin.id,
        fileSha256: pin.sha256,
        lineNumber,
        rawReferenceAndType: firstField,
        textType: parsed.textType,
        wordElement: parsed.wordElement,
        nativeCoordinate: parsed.nativeCoordinate,
        normalizedCoordinate: parsed.normalizedCoordinate,
        tokenIdentity,
      };
      const lineKey = `${pin.id}\0${lineNumber}`;
      if (tokenByFileAndLine.has(lineKey)) throw new Error(`duplicate TAHOT file/line identity ${pin.id}:${lineNumber}`);
      tokenByFileAndLine.set(lineKey, token);
      tokens.push(token);
      const nativeKey = coordinateKey(token.nativeCoordinate);
      const existing = nativeToNormalized.get(nativeKey) ?? [];
      if (!existing.some(value => coordinateKey(value) === coordinateKey(token.normalizedCoordinate))) {
        existing.push(token.normalizedCoordinate);
        existing.sort((left, right) => compare(coordinateKey(left), coordinateKey(right)));
      }
      nativeToNormalized.set(nativeKey, existing);
    }
  }
  return {
    tokens,
    tokenByFileAndLine,
    nativeToNormalized,
    usfmBookByNumber,
    tahotPins: [...tahotInputs].map(input => input.pin).sort((a, b) => compare(a.id, b.id)),
    usfmtc: {
      commit: USFMTC_COMMIT,
      referenceBlob: USFMTC_REFERENCE_BLOB,
      referenceSha256: USFMTC_REFERENCE_SHA256,
      licenseBlob: USFMTC_LICENSE_BLOB,
      licenseSha256: USFMTC_LICENSE_SHA256,
    },
  };
}

/** Build the compact override-only bridge from the complete pinned TAHOT corpus. */
export function createUbsTahotNativeToNormalizedBridge(
  index: UbsTahotCoordinateIndex,
): UbsTahotNativeToNormalizedBridge {
  const overrides = [...index.nativeToNormalized]
    .map(([nativeKey, normalizedCoordinates]) => {
      const nativeCoordinate = parseCoordinateKey(nativeKey, index.usfmBookByNumber);
      const normalized = [...normalizedCoordinates]
        .map(coordinate => ({ ...coordinate }))
        .sort((left, right) => compare(coordinateSortKey(left), coordinateSortKey(right)));
      return { nativeCoordinate, normalizedCoordinates: normalized };
    })
    .filter(({ nativeCoordinate, normalizedCoordinates }) => normalizedCoordinates.length !== 1
      || coordinateKey(nativeCoordinate) !== coordinateKey(normalizedCoordinates[0]!))
    .sort((left, right) => compare(coordinateSortKey(left.nativeCoordinate), coordinateSortKey(right.nativeCoordinate)));
  const payload = {
    schemaVersion: UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_SCHEMA,
    compilerVersion: UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_COMPILER_VERSION,
    normalizationRule: 'identity_when_no_canonical_override' as const,
    coordinateAudit: {
      schemaVersion: 'theologai-ubs-tahot-coordinate-audit.v1' as const,
      sha256: UBS_TAHOT_COORDINATE_AUDIT_SHA256,
    },
    attributionHeader: {
      lines: TAHOT_ATTRIBUTION_HEADER_LINE_COUNT,
      sha256: TAHOT_ATTRIBUTION_HEADER_SHA256,
    },
    tahot: index.tahotPins.map(pin => ({ id: pin.id, sha256: pin.sha256, gitBlobSha1: pin.gitBlobSha1 })),
    usfmtc: index.usfmtc,
    defaultBookCodes: [...index.usfmBookByNumber]
      .map(([bookNumber, book]) => ({ bookNumber, bookCode: book.code }))
      .sort((left, right) => left.bookNumber - right.bookNumber),
    nativeCoordinateKeys: [...index.nativeToNormalized.keys()]
      .sort((left, right) => compare(coordinateSortKeyFromKey(left), coordinateSortKeyFromKey(right))),
    overrides,
  };
  return { ...payload, bridgeIdentity: sha256(canonicalJson(payload)) };
}

/** Exact canonical bytes for a tracked bridge; a trailing newline is part of its identity contract. */
export function serializeUbsTahotNativeToNormalizedBridge(bridge: UbsTahotNativeToNormalizedBridge): string {
  const parsed = validateUbsTahotNativeToNormalizedBridge(bridge);
  return `${canonicalJson(parsed)}\n`;
}

export function parseUbsTahotNativeToNormalizedBridge(bytes: Uint8Array | string): UbsTahotNativeToNormalizedBridge {
  const text = typeof bytes === 'string' ? bytes : decodeUtf8(bytes, 'native-to-normalized bridge');
  if (!text.endsWith('\n') || text.includes('\r')) throw new Error('Native-to-normalized bridge must use canonical LF-terminated JSON');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Native-to-normalized bridge is not valid JSON'); }
  const bridge = validateUbsTahotNativeToNormalizedBridge(value);
  if (`${canonicalJson(bridge)}\n` !== text) throw new Error('Native-to-normalized bridge is not canonically serialized');
  return bridge;
}

/** Resolve a source native coordinate without collapsing a legitimate one-to-many mapping. */
export function resolveUbsTahotNormalizedCoordinates(
  bridge: UbsTahotNativeToNormalizedBridge,
  native: Pick<TahotCoordinate, 'bookNumber' | 'chapter' | 'verse'>,
): readonly TahotCoordinate[] {
  return createUbsTahotNormalizedCoordinateResolver(bridge)(native);
}

/**
 * Validate once, then resolve many source references without re-parsing a
 * 23k-coordinate bridge for every one of the 250k semantic evidence rows.
 */
export function createUbsTahotNormalizedCoordinateResolver(bridge: UbsTahotNativeToNormalizedBridge): (
  native: Pick<TahotCoordinate, 'bookNumber' | 'chapter' | 'verse'>,
) => readonly TahotCoordinate[] {
  const parsed = validateUbsTahotNativeToNormalizedBridge(bridge);
  const nativeKeys = new Set(parsed.nativeCoordinateKeys);
  const overrides = new Map(parsed.overrides.map(item => [coordinateKey(item.nativeCoordinate), item.normalizedCoordinates]));
  const bookCodes = new Map(parsed.defaultBookCodes.map(item => [item.bookNumber, item.bookCode]));
  return native => {
    const key = `${native.bookNumber}:${native.chapter}:${native.verse}`;
    if (!nativeKeys.has(key)) throw new Error('Native coordinate is absent from the exact bridge membership set');
    const override = overrides.get(key);
    if (override) return override.map(item => ({ ...item }));
    const bookCode = bookCodes.get(native.bookNumber);
    if (!bookCode || !Number.isSafeInteger(native.chapter) || native.chapter < 1
      || !Number.isSafeInteger(native.verse) || native.verse < 1) {
      throw new Error('Native coordinate cannot be resolved through the exact normalized bridge');
    }
    return [{ bookNumber: native.bookNumber, bookCode, chapter: native.chapter, verse: native.verse }];
  };
}

export function createDefinitionReferenceValidator(index: UbsTahotCoordinateIndex) {
  return (payload: string): UbsValidatedDefinitionReference | undefined => {
    if (!/^[0-9]{14}$/.test(payload)) return undefined;
    const bookNumber = Number(payload.slice(0, 3));
    const chapter = Number(payload.slice(3, 6));
    const verse = Number(payload.slice(6, 9));
    const segment = Number(payload.slice(9, 11));
    const word = Number(payload.slice(11, 14));
    if (segment !== 0 || word < 0 || (word !== 0 && (word % 2 !== 0 || word > 999))) return undefined;
    const book = index.usfmBookByNumber.get(bookNumber);
    if (!book || chapter < 1 || verse < 1) return undefined;
    const normalized = index.nativeToNormalized.get(`${bookNumber}:${chapter}:${verse}`);
    if (normalized?.length !== 1) return undefined;
    return { normalizedReference: formatCoordinate(normalized[0]!) };
  };
}

export function auditUbsTahotCoordinateCoverage(
  references: readonly DecodedUbsCoordinateReference[],
  index: UbsTahotCoordinateIndex,
): UbsTahotCoordinateAudit {
  const ubsCoordinates = new Set<string>();
  let suffixRecords = 0;
  for (const row of references) {
    const parsed = parseUbsSourceTokenReference(row.sourceReference);
    const book = index.usfmBookByNumber.get(parsed.book);
    if (!book) throw new Error(`UBS reference ${row.sourceReference} has no pinned USFM OT book mapping`);
    const key = `${parsed.book}:${parsed.chapter}:${parsed.verse}`;
    if (!index.nativeToNormalized.has(key)) {
      throw new Error(`UBS reference ${row.sourceReference} is absent from the exact pinned TAHOT native coordinate set`);
    }
    ubsCoordinates.add(key);
    if (parsed.suffix) suffixRecords += 1;
  }
  const tahotCoordinates = new Set(index.nativeToNormalized.keys());
  const missing = difference(ubsCoordinates, tahotCoordinates);
  const extra = difference(tahotCoordinates, ubsCoordinates);
  if (missing.length || extra.length) {
    throw new Error(`UBS/TAHOT native coordinate sets differ: ${missing.length} missing and ${extra.length} extra`);
  }
  const differences = [...index.nativeToNormalized].filter(([native, normalized]) =>
    normalized.length !== 1 || native !== coordinateKey(normalized[0]!)).length;
  return {
    schemaVersion: 'theologai-ubs-tahot-coordinate-audit.v1',
    ubsReferenceRecords: references.length,
    ubsUniqueNativeCoordinates: ubsCoordinates.size,
    tahotUniqueNativeCoordinates: tahotCoordinates.size,
    coordinateSetEquality: true,
    missingUbsCoordinates: [],
    extraTahotCoordinates: [],
    footnoteSuffixRecords: suffixRecords,
    tahotRawTokens: index.tokens.length,
    nativeToNormalizedDifferences: differences,
    pins: {
      stepBibleCommit: STEPBIBLE_COMMIT,
      tahot: index.tahotPins.map(pin => ({
        id: pin.id, bytes: pin.bytes, sha256: pin.sha256, gitBlobSha1: pin.gitBlobSha1,
      })),
      usfmtc: index.usfmtc,
    },
  };
}

/**
 * Attests only a caller-supplied locator for one exact pair. It never derives
 * TAHOT word position from UBS WWW, and therefore cannot establish an exact
 * morphology-token alignment or adjudicate contextual meaning. Once the
 * locator resolves, every attested field comes from the canonical token held
 * by the pinned-corpus index, never from the caller's clone.
 */
export function attestExactUbsTahotCoordinatePair(
  ubsRows: readonly UbsCoordinateEvidenceRow[],
  tahotTokens: readonly TahotRawToken[],
  index: UbsTahotCoordinateIndex,
): UbsTahotCoordinateAttestation {
  if (ubsRows.length !== 1 || tahotTokens.length !== 1) {
    throw new Error('UBS/TAHOT coordinate attestation requires exact one-to-one cardinality');
  }
  const row = ubsRows[0]!;
  const suppliedToken = tahotTokens[0]!;
  const canonicalToken = index.tokenByFileAndLine.get(`${suppliedToken.fileId}\0${suppliedToken.lineNumber}`);
  if (!canonicalToken || canonicalToken.tokenIdentity !== suppliedToken.tokenIdentity) {
    throw new Error('TAHOT token is not an exact member of the pinned raw corpus');
  }
  if (!/^[0-9a-f]{64}$/.test(row.artifactIdentity)) throw new Error('UBS artifact identity must be an exact SHA-256');
  for (const [label, value] of [
    ['source', row.sourceId], ['entry', row.entryId], ['sense', row.senseId], ['evidence', row.evidenceId],
  ] as const) {
    if (!/^[a-z0-9][a-z0-9_.-]*$/.test(value)) throw new Error(`UBS ${label} identity is not canonical`);
  }
  const anchor = parseUbsSourceTokenReference(row.rawAnchor);
  // Do not read any caller-controlled token field after exact membership
  // lookup. A clone can carry a genuine identity while its coordinate, word
  // element, or other descriptive field has been altered.
  const token = canonicalToken;
  const native = token.nativeCoordinate;
  if (anchor.book !== native.bookNumber || anchor.chapter !== native.chapter || anchor.verse !== native.verse) {
    throw new Error('UBS anchor and selected TAHOT token do not share the exact native coordinate');
  }
  const normalizedReference = formatCoordinate(token.normalizedCoordinate);
  if (row.normalizedReference !== normalizedReference) {
    throw new Error('UBS evidence normalized reference does not match the pinned TAHOT bridge');
  }
  return {
    schemaVersion: 'theologai-ubs-tahot-coordinate-attestation.v1',
    verifierVersion: UBS_TAHOT_COORDINATE_VERIFIER_VERSION,
    artifactIdentity: row.artifactIdentity,
    sourceId: row.sourceId,
    entryId: row.entryId,
    senseId: row.senseId,
    evidenceId: row.evidenceId,
    rawAnchor: row.rawAnchor,
    footnoteSuffix: anchor.suffix,
    nativeCoordinate: token.nativeCoordinate,
    normalizedCoordinate: token.normalizedCoordinate,
    normalizedReference,
    tahotTokenIdentity: token.tokenIdentity,
    tahotWordElement: token.wordElement,
    tahotFileId: token.fileId,
    tahotFileLine: token.lineNumber,
    tahotCorpus: index.tahotPins.map(pin => ({ id: pin.id, sha256: pin.sha256, gitBlobSha1: pin.gitBlobSha1 })),
    usfmtc: index.usfmtc,
    limitation: 'coordinate_and_explicit_pair_only_not_token_alignment_or_lexical_sense_adjudication',
  };
}

export function assertPinnedBytes(pin: ExactPinnedBytes, bytes: Uint8Array): void {
  if (bytes.byteLength !== pin.bytes) throw new Error(`Pinned byte length drift for ${pin.id}`);
  if (sha256(bytes) !== pin.sha256) throw new Error(`Pinned SHA-256 drift for ${pin.id}`);
  const blob = createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
  if (blob !== pin.gitBlobSha1) throw new Error(`Pinned Git blob drift for ${pin.id}`);
}

function assertExactTahotInputSet(inputs: readonly TahotRawInput[]): void {
  if (inputs.length !== 4) throw new Error('Coordinate verifier requires all four exact TAHOT files');
  const expected = [...PINNED_TAHOT_FILES].sort((a, b) => compare(a.id, b.id));
  const actual = [...inputs].sort((a, b) => compare(a.pin.id, b.pin.id));
  for (let index = 0; index < expected.length; index++) {
    const left = actual[index]?.pin;
    const right = expected[index]!;
    if (!left || left.id !== right.id || left.sha256 !== right.sha256
      || left.gitBlobSha1 !== right.gitBlobSha1 || left.bytes !== right.bytes
      || left.repositoryPath !== right.repositoryPath) {
      throw new Error('Coordinate verifier TAHOT input set differs from the exact four project pins');
    }
  }
}

function parsePinnedUsfmtcOldTestament(bytes: Uint8Array): Map<number, { code: string; chapters: number }> {
  const source = decodeUtf8(bytes, 'usfmtc reference.py');
  const literal = /_bookslist\s*=\s*"""([\s\S]*?)"""/.exec(source)?.[1];
  if (!literal) throw new Error('Pinned usfmtc reference.py no longer exposes the reviewed book/chapter table');
  const entries = literal.trim().split(/\s+/).map(value => {
    const match = /^([A-Z0-9]{3})\|([0-9]+)$/.exec(value);
    if (!match) throw new Error('Pinned usfmtc book/chapter table contains an unreviewed token');
    return { code: match[1]!, chapters: Number(match[2]) };
  });
  const result = new Map<number, { code: string; chapters: number }>();
  for (let index = 0; index < 39; index++) {
    const book = entries[index];
    if (!book || book.code === 'ZZZ' || book.chapters < 1) throw new Error('Pinned usfmtc OT mapping is incomplete');
    result.set(index + 1, book);
  }
  if (result.get(1)?.code !== 'GEN' || result.get(39)?.code !== 'MAL') {
    throw new Error('Pinned usfmtc OT mapping boundaries differ from GEN-MAL');
  }
  return result;
}

function assertTahotAttributionHeader(text: string, fileId: string): void {
  const header = text.split(/\r?\n/).slice(0, TAHOT_ATTRIBUTION_HEADER_LINE_COUNT).join('\n');
  if (sha256(header) !== TAHOT_ATTRIBUTION_HEADER_SHA256) {
    throw new Error(`TAHOT attribution header drift for ${fileId}`);
  }
}

function validateUbsTahotNativeToNormalizedBridge(value: unknown): UbsTahotNativeToNormalizedBridge {
  const root = record(value, 'Native-to-normalized bridge');
  exactRecordKeys(root, [
    'schemaVersion', 'compilerVersion', 'normalizationRule', 'coordinateAudit', 'attributionHeader',
    'tahot', 'usfmtc', 'defaultBookCodes', 'nativeCoordinateKeys', 'overrides', 'bridgeIdentity',
  ], 'Native-to-normalized bridge');
  if (root.schemaVersion !== UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_SCHEMA
    || root.compilerVersion !== UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_COMPILER_VERSION
    || root.normalizationRule !== 'identity_when_no_canonical_override') {
    throw new Error('Native-to-normalized bridge has an unsupported schema, compiler, or normalization rule');
  }
  const coordinateAudit = record(root.coordinateAudit, 'Native-to-normalized bridge coordinate audit');
  exactRecordKeys(coordinateAudit, ['schemaVersion', 'sha256'], 'Native-to-normalized bridge coordinate audit');
  if (coordinateAudit.schemaVersion !== 'theologai-ubs-tahot-coordinate-audit.v1'
    || coordinateAudit.sha256 !== UBS_TAHOT_COORDINATE_AUDIT_SHA256) {
    throw new Error('Native-to-normalized bridge does not bind the exact coordinate audit');
  }
  const attributionHeader = record(root.attributionHeader, 'Native-to-normalized bridge attribution header');
  exactRecordKeys(attributionHeader, ['lines', 'sha256'], 'Native-to-normalized bridge attribution header');
  if (attributionHeader.lines !== TAHOT_ATTRIBUTION_HEADER_LINE_COUNT
    || attributionHeader.sha256 !== TAHOT_ATTRIBUTION_HEADER_SHA256) {
    throw new Error('Native-to-normalized bridge attribution header witness differs from the reviewed pin');
  }
  if (!Array.isArray(root.tahot) || canonicalJson(root.tahot) !== canonicalJson(
    [...PINNED_TAHOT_FILES].sort((left, right) => compare(left.id, right.id))
      .map(pin => ({ id: pin.id, sha256: pin.sha256, gitBlobSha1: pin.gitBlobSha1 })),
  )) {
    throw new Error('Native-to-normalized bridge TAHOT witnesses differ from the exact reviewed pins');
  }
  const usfmtc = record(root.usfmtc, 'Native-to-normalized bridge usfmtc');
  exactRecordKeys(usfmtc, ['commit', 'referenceBlob', 'referenceSha256', 'licenseBlob', 'licenseSha256'],
    'Native-to-normalized bridge usfmtc');
  const expectedUsfmtc = {
    commit: USFMTC_COMMIT, referenceBlob: USFMTC_REFERENCE_BLOB, referenceSha256: USFMTC_REFERENCE_SHA256,
    licenseBlob: USFMTC_LICENSE_BLOB, licenseSha256: USFMTC_LICENSE_SHA256,
  };
  if (canonicalJson(usfmtc) !== canonicalJson(expectedUsfmtc)) {
    throw new Error('Native-to-normalized bridge usfmtc witness differs from the exact reviewed pin');
  }
  if (!Array.isArray(root.defaultBookCodes) || root.defaultBookCodes.length !== 39) {
    throw new Error('Native-to-normalized bridge default book codes are incomplete');
  }
  const defaultBookCodes = root.defaultBookCodes.map((item, index) => {
    const candidate = record(item, `Native-to-normalized bridge default book ${index + 1}`);
    exactRecordKeys(candidate, ['bookNumber', 'bookCode'], `Native-to-normalized bridge default book ${index + 1}`);
    if (!Number.isSafeInteger(candidate.bookNumber) || candidate.bookNumber !== index + 1
      || typeof candidate.bookCode !== 'string' || !/^[A-Z0-9]{3}$/.test(candidate.bookCode)) {
      throw new Error('Native-to-normalized bridge default book code is malformed or unordered');
    }
    return { bookNumber: candidate.bookNumber, bookCode: candidate.bookCode };
  });
  if (defaultBookCodes[0]!.bookCode !== 'GEN' || defaultBookCodes[38]!.bookCode !== 'MAL') {
    throw new Error('Native-to-normalized bridge default book-code bounds differ from GEN-MAL');
  }
  if (!Array.isArray(root.nativeCoordinateKeys) || root.nativeCoordinateKeys.length === 0) {
    throw new Error('Native-to-normalized bridge native-coordinate membership set is missing');
  }
  let priorNativeCoordinateKey = '';
  const nativeBookCodes = new Map(defaultBookCodes.map(book => [book.bookNumber, { code: book.bookCode }]));
  const nativeCoordinateKeys = root.nativeCoordinateKeys.map((value, index) => {
    if (typeof value !== 'string') throw new Error('Native-to-normalized bridge native-coordinate key is not a string');
    const coordinate = parseCoordinateKey(value, nativeBookCodes);
    const key = coordinateSortKey(coordinate);
    if (key <= priorNativeCoordinateKey) {
      throw new Error('Native-to-normalized bridge native-coordinate membership set is duplicated or unordered');
    }
    priorNativeCoordinateKey = key;
    if (index === 0 && value !== '1:1:1') throw new Error('Native-to-normalized bridge native-coordinate lower bound drift');
    return value;
  });
  if (!Array.isArray(root.overrides)) throw new Error('Native-to-normalized bridge overrides must be an array');
  let previous = '';
  const overrideKeys = new Set<string>();
  const overrides = root.overrides.map((item, index) => {
    const candidate = record(item, `Native-to-normalized bridge override ${index + 1}`);
    exactRecordKeys(candidate, ['nativeCoordinate', 'normalizedCoordinates'], `Native-to-normalized bridge override ${index + 1}`);
    const nativeCoordinate = bridgeCoordinate(candidate.nativeCoordinate, defaultBookCodes,
      `Native-to-normalized bridge override ${index + 1} native coordinate`);
    if (!Array.isArray(candidate.normalizedCoordinates) || candidate.normalizedCoordinates.length < 1) {
      throw new Error('Native-to-normalized bridge override must retain one or more normalized coordinates');
    }
    const normalizedCoordinates = candidate.normalizedCoordinates.map((normalized, normalizedIndex) =>
      bridgeCoordinate(normalized, defaultBookCodes,
        `Native-to-normalized bridge override ${index + 1} normalized coordinate ${normalizedIndex + 1}`, true));
    const normalizedKeys = normalizedCoordinates.map(coordinateSortKey);
    if (new Set(normalizedKeys).size !== normalizedKeys.length
      || normalizedKeys.some((key, normalizedIndex) => normalizedIndex > 0 && normalizedKeys[normalizedIndex - 1]! >= key)) {
      throw new Error('Native-to-normalized bridge normalized coordinates are duplicated or not canonical');
    }
    if (normalizedCoordinates.length === 1 && coordinateKey(nativeCoordinate) === coordinateKey(normalizedCoordinates[0]!)) {
      throw new Error('Native-to-normalized bridge must omit identity-only override rows');
    }
    const key = coordinateSortKey(nativeCoordinate);
    if (key <= previous || overrideKeys.has(key)) {
      throw new Error('Native-to-normalized bridge overrides are duplicated or not in canonical order');
    }
    previous = key; overrideKeys.add(key);
    return { nativeCoordinate, normalizedCoordinates };
  });
  if (typeof root.bridgeIdentity !== 'string' || !/^[0-9a-f]{64}$/.test(root.bridgeIdentity)) {
    throw new Error('Native-to-normalized bridge identity is malformed');
  }
  const payload = {
    schemaVersion: root.schemaVersion,
    compilerVersion: root.compilerVersion,
    normalizationRule: root.normalizationRule,
    coordinateAudit,
    attributionHeader,
    tahot: root.tahot,
    usfmtc,
    defaultBookCodes,
    nativeCoordinateKeys,
    overrides,
  };
  if (sha256(canonicalJson(payload)) !== root.bridgeIdentity) {
    throw new Error('Native-to-normalized bridge identity does not match its canonical payload');
  }
  return { ...payload, bridgeIdentity: root.bridgeIdentity } as UbsTahotNativeToNormalizedBridge;
}

function bridgeCoordinate(
  value: unknown,
  defaultBookCodes: readonly { bookNumber: number; bookCode: string }[],
  label: string,
  allowVerseZero = false,
): TahotCoordinate {
  const coordinate = record(value, label);
  exactRecordKeys(coordinate, ['bookNumber', 'bookCode', 'chapter', 'verse'], label);
  if (!Number.isSafeInteger(coordinate.bookNumber) || coordinate.bookNumber < 1 || coordinate.bookNumber > 39
    || typeof coordinate.bookCode !== 'string' || coordinate.bookCode !== defaultBookCodes[coordinate.bookNumber - 1]?.bookCode
    || !Number.isSafeInteger(coordinate.chapter) || coordinate.chapter < 1
    || !Number.isSafeInteger(coordinate.verse) || coordinate.verse < (allowVerseZero ? 0 : 1)) {
    throw new Error(`${label} is malformed or does not use the exact default book-code map`);
  }
  return {
    bookNumber: coordinate.bookNumber, bookCode: coordinate.bookCode,
    chapter: coordinate.chapter, verse: coordinate.verse,
  };
}

function parseCoordinateKey(
  value: string,
  bookByNumber: ReadonlyMap<number, { code: string }>,
): TahotCoordinate {
  const match = /^([1-9][0-9]*):([1-9][0-9]*):([1-9][0-9]*)$/.exec(value);
  if (!match) throw new Error('TAHOT coordinate index has a malformed native coordinate key');
  const bookNumber = Number(match[1]);
  const bookCode = bookByNumber.get(bookNumber)?.code;
  if (!bookCode) throw new Error('TAHOT coordinate index native coordinate has no USFM book code');
  return { bookNumber, bookCode, chapter: Number(match[2]), verse: Number(match[3]) };
}

function coordinateSortKey(value: Pick<TahotCoordinate, 'bookNumber' | 'chapter' | 'verse'>): string {
  return `${String(value.bookNumber).padStart(3, '0')}:${String(value.chapter).padStart(3, '0')}:${String(value.verse).padStart(3, '0')}`;
}

function coordinateSortKeyFromKey(value: string): string {
  const match = /^([1-9][0-9]*):([1-9][0-9]*):([1-9][0-9]*)$/.exec(value);
  if (!match) throw new Error('TAHOT coordinate index has a malformed coordinate key');
  return `${match[1]!.padStart(3, '0')}:${match[2]!.padStart(3, '0')}:${match[3]!.padStart(3, '0')}`;
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, any>;
}

function exactRecordKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compare);
  const sortedExpected = [...expected].sort(compare);
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort(compare).map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  throw new Error('Canonical JSON cannot serialize undefined, bigint, symbol, or function values');
}

export function parseTahotReferenceAndType(
  value: string,
  bookNumberByCode: ReadonlyMap<string, number>,
  bookByNumber: ReadonlyMap<number, { code: string; chapters: number }>,
) {
  const match = /^((?:[1-3][A-Za-z]{2}|[A-Za-z]{3}))\.(\d+)\.(\d+)(?:\((\d+)\.(\d+)\))?#([0-9]{2,4})=([^\t]+)$/.exec(value);
  if (!match) throw new Error(`TAHOT reference/type field is malformed: ${value}`);
  const code = match[1]!.toUpperCase();
  const bookNumber = bookNumberByCode.get(code);
  if (!bookNumber) throw new Error(`TAHOT book ${code} is absent from pinned usfmtc mapping`);
  const maximumChapters = bookByNumber.get(bookNumber)!.chapters;
  const englishChapter = Number(match[2]);
  const englishVerse = Number(match[3]);
  const nativeChapter = Number(match[4] ?? match[2]);
  const nativeVerse = Number(match[5] ?? match[3]);
  if (!Number.isSafeInteger(englishChapter) || englishChapter < 1 || englishChapter > maximumChapters
    || !Number.isSafeInteger(englishVerse) || englishVerse < 0) {
    throw new Error(`TAHOT normalized coordinate is outside the pinned usfmtc book/chapter boundary: ${value}`);
  }
  // The parenthesized coordinate is the Hebrew versification. It can have a
  // chapter number beyond the English/USFM chapter maximum (for example Joel
  // 4), so TAHOT itself is authoritative for this native side of the bridge.
  if (!Number.isSafeInteger(nativeChapter) || nativeChapter < 1
    || !Number.isSafeInteger(nativeVerse) || nativeVerse < 1) {
    throw new Error(`TAHOT native coordinate is malformed: ${value}`);
  }
  const textType = match[7]!;
  if (!/^[A-Za-z+()]+$/.test(textType)) throw new Error(`TAHOT text type is malformed: ${textType}`);
  return {
    normalizedCoordinate: { bookNumber, bookCode: code, chapter: englishChapter, verse: englishVerse },
    nativeCoordinate: { bookNumber, bookCode: code, chapter: nativeChapter, verse: nativeVerse },
    wordElement: match[6]!,
    textType,
  };
}

function coordinateKey(value: Pick<TahotCoordinate, 'bookNumber' | 'chapter' | 'verse'>): string {
  return `${value.bookNumber}:${value.chapter}:${value.verse}`;
}

function formatCoordinate(value: TahotCoordinate): string {
  return `${value.bookCode} ${value.chapter}:${value.verse}`;
}

function difference(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  return [...left].filter(value => !right.has(value)).sort(compare).slice(0, 32);
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  let value: string;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error(`${label} is not valid UTF-8`); }
  if (value.charCodeAt(0) === 0xfeff) throw new Error(`${label} must not contain a BOM`);
  return value;
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
