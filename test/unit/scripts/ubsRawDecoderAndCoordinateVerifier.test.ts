import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  UBS_DEFINITION_EXCLUSION_REASON_LIMIT,
  decodePinnedUbsHebrewV092,
  decodeUbsDefinition,
} from '../../../scripts/ubs-semantics/rawDecoder.js';
import {
  PINNED_TAHOT_FILES,
  USFMTC_COMMIT,
  USFMTC_LICENSE_BLOB,
  USFMTC_LICENSE_SHA256,
  USFMTC_REFERENCE_ARTIFACTS,
  USFMTC_REFERENCE_BLOB,
  USFMTC_REFERENCE_SHA256,
  assertPinnedBytes,
  attestExactUbsTahotCoordinatePair,
  createDefinitionReferenceValidator,
  parseTahotReferenceAndType,
  type TahotRawToken,
  type UbsTahotCoordinateIndex,
} from '../../../scripts/ubs-semantics/coordinateVerifier.js';
import {
  UBS_TAHOT_COORDINATE_AUDIT_SHA256,
  verifyUbsHebrewV092CoordinateAudit,
} from '../../../scripts/reproduce-ubs-hebrew-v092-coordinate-audit.js';

const usfmtcRoot = 'data/biblical-languages/ubs-open-license/v0.9.2/reference-validation';

function syntheticIndex(): UbsTahotCoordinateIndex {
  const token: TahotRawToken = {
    fileId: 'tahot-gen-deu',
    fileSha256: PINNED_TAHOT_FILES.find(pin => pin.id === 'tahot-gen-deu')!.sha256,
    lineNumber: 42,
    rawReferenceAndType: 'Gen.1.1#02=L',
    textType: 'L',
    wordElement: '02',
    nativeCoordinate: { bookNumber: 1, bookCode: 'GEN', chapter: 1, verse: 1 },
    normalizedCoordinate: { bookNumber: 1, bookCode: 'GEN', chapter: 1, verse: 1 },
    tokenIdentity: 'b'.repeat(64),
  };
  return {
    tokens: [token],
    tokenByFileAndLine: new Map([[`${token.fileId}\0${token.lineNumber}`, token]]),
    nativeToNormalized: new Map([['1:1:1', [token.normalizedCoordinate]]]),
    usfmBookByNumber: new Map([[1, { code: 'GEN', chapters: 50 }]]),
    tahotPins: PINNED_TAHOT_FILES,
    usfmtc: {
      commit: USFMTC_COMMIT,
      referenceBlob: USFMTC_REFERENCE_BLOB,
      referenceSha256: USFMTC_REFERENCE_SHA256,
      licenseBlob: USFMTC_LICENSE_BLOB,
      licenseSha256: USFMTC_LICENSE_SHA256,
    },
  };
}

describe('UBS raw definition decoder', () => {
  const validScripture = (payload: string) => payload === '00100100100002'
    ? { normalizedReference: 'GEN 1:1' }
    : undefined;

  it('publishes only complete safe L and validated S markup', () => {
    expect(decodeUbsDefinition('a {L:visible<SDBH:opaque>} b', validScripture)).toMatchObject({
      status: 'published', definition: 'a visible b', occurrences: { L: 1, S: 0, A: 0, N: 0 },
    });
    expect(decodeUbsDefinition('see {S:00100100100002}', validScripture)).toMatchObject({
      status: 'published', definition: 'see GEN 1:1', occurrences: { L: 0, S: 1, A: 0, N: 0 },
    });
    expect(decodeUbsDefinition('', validScripture)).toEqual({
      status: 'absent_in_source', reasons: [], occurrences: { L: 0, S: 0, A: 0, N: 0 },
      malformedLexicalLinks: 0,
    });
  });

  it.each([
    ['attribution', 'clean {A:witness}', 'unsafe_attribution_markup'],
    ['note', 'clean {N:note}', 'unsafe_note_markup'],
    ['unvalidated S', 'clean {S:00100100100003}', 'unvalidated_scripture_link_markup'],
    ['malformed L', 'clean {L:label<BT-OT:target>}', 'malformed_lexical_link_markup'],
    ['unknown braced markup', 'clean {X:value}', 'malformed_or_unknown_markup'],
    ['unknown paired markup', 'clean |iitalic|i*', 'malformed_or_unknown_markup'],
  ])('excludes the whole definition for %s while retaining a bounded reason', (_label, raw, reason) => {
    const decoded = decodeUbsDefinition(raw, validScripture);
    expect(decoded.status).toBe('excluded_unresolved_markup');
    expect(decoded).not.toHaveProperty('definition');
    expect(decoded.reasons).toContain(reason);
    expect(decoded.reasons.length).toBeLessThanOrEqual(UBS_DEFINITION_EXCLUSION_REASON_LIMIT);
  });

  it('counts malformed known openings and all reviewed marker kinds deterministically', () => {
    const first = decodeUbsDefinition('{L:broken {S:bad} {A:a} {N:n}', validScripture);
    const second = decodeUbsDefinition('{L:broken {S:bad} {A:a} {N:n}', validScripture);
    expect(first).toEqual(second);
    expect(first.occurrences).toEqual({ L: 1, S: 1, A: 1, N: 1 });
    expect(first.malformedLexicalLinks).toBe(1);
  });

  it('reproduces the tracked full-corpus decoder audit without changing Gate 1', () => {
    const bridge = new Map([
      ['01100401900002', '1KI 4:19'],
      ['00402100900000', 'NUM 21:9'],
      ['02401801500032', 'JER 18:15'],
      ['01804100800000', 'JOB 41:16'],
      ['01800101900000', 'JOB 1:19'],
    ]);
    const projection = decodePinnedUbsHebrewV092(
      readFileSync('data/biblical-languages/ubs-open-license/v0.9.2/en/UBSHebrewDic-v0.9.2-en.JSON'),
      readFileSync('data/biblical-languages/ubs-open-license/v0.9.2/en/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON'),
      payload => bridge.has(payload) ? { normalizedReference: bridge.get(payload)! } : undefined,
    );
    const tracked = JSON.parse(readFileSync(
      'data/biblical-languages/ubs-open-license/v0.9.2/DECODER-AUDIT.json', 'utf8',
    ));
    expect(projection.audit).toEqual(tracked);
    expect(projection.audit).toMatchObject({
      raw: { entries: 7932, baseForms: 8902, senses: 16224, references: 260813, domains: 411 },
      identities: { excludedBaseForms: 617 },
      definitions: { nonblank: 16220, absentInSource: 4, excludedUnresolvedMarkup: 123 },
      domains: { blankAssignmentsDropped: 208, rawNullDomainSenses: 27, blankOnlyDomainSenses: 207, zeroDomainSenses: 234 },
      maximumReferencesPerSense: 10944,
    });
    const identities = projection.entries.flatMap(entry => entry.lexicalIdentities);
    expect(identities.length).toBeGreaterThan(0);
    expect(identities.every(identity => /^(?:H|A)(?!0000$)[0-9]{4}$/.test(identity))).toBe(true);
    expect(identities.some(identity => /[+/]|[A-Z]$/.test(identity.slice(1)))).toBe(false);
    expect(projection.excludedBaseForms).toHaveLength(617);
    expect(new Set(projection.excludedBaseForms.map(exclusion => exclusion.entryId)).size).toBe(617);
    expect(projection.excludedBaseForms.every(exclusion => exclusion.reason === 'no_exact_h_or_a_identity')).toBe(true);
  });
});

describe('pinned USFM/TAHOT coordinate contract', () => {
  it('reproduces the byte-pinned full-corpus coordinate audit from all four exact TAHOT inputs', async () => {
    const audit = await verifyUbsHebrewV092CoordinateAudit(process.cwd());
    expect(audit).toMatchObject({
      schemaVersion: 'theologai-ubs-tahot-coordinate-audit.v1',
      ubsReferenceRecords: 260813,
      ubsUniqueNativeCoordinates: 23213,
      tahotRawTokens: 305652,
      coordinateSetEquality: true,
      missingUbsCoordinates: [],
      extraTahotCoordinates: [],
    });
    expect(audit.pins.tahot.map(pin => pin.id).sort()).toEqual([
      'tahot-gen-deu', 'tahot-isa-mal', 'tahot-job-sng', 'tahot-jos-est',
    ]);
    expect(UBS_TAHOT_COORDINATE_AUDIT_SHA256).toMatch(/^[0-9a-f]{64}$/);
  }, 120_000);

  it('pins both official usfmtc artifacts by byte length, SHA-256, and Git blob identity', () => {
    for (const pin of USFMTC_REFERENCE_ARTIFACTS) {
      expect(() => assertPinnedBytes(pin, readFileSync(pin.trackedPath!))).not.toThrow();
    }
  });

  it('validates definition coordinates only for one unambiguous pinned bridge mapping', () => {
    const index = syntheticIndex();
    const validate = createDefinitionReferenceValidator(index);
    expect(validate('00100100100002')).toEqual({ normalizedReference: 'GEN 1:1' });
    expect(validate('00100100100003')).toBeUndefined();
    expect(validate('00100100100002extra')).toBeUndefined();
    const ambiguous: UbsTahotCoordinateIndex = {
      ...index,
      nativeToNormalized: new Map([['1:1:1', [
        { bookNumber: 1, bookCode: 'GEN', chapter: 1, verse: 1 },
        { bookNumber: 1, bookCode: 'GEN', chapter: 1, verse: 2 },
      ]]]),
    };
    expect(createDefinitionReferenceValidator(ambiguous)('00100100100002')).toBeUndefined();
  });

  it('parses all four corpus boundaries and preserves reviewed versification differences', () => {
    const books = new Map([
      [1, { code: 'GEN', chapters: 50 }], [5, { code: 'DEU', chapters: 34 }],
      [6, { code: 'JOS', chapters: 24 }], [17, { code: 'EST', chapters: 10 }],
      [18, { code: 'JOB', chapters: 42 }], [19, { code: 'PSA', chapters: 150 }],
      [22, { code: 'SNG', chapters: 8 }], [23, { code: 'ISA', chapters: 66 }],
      [29, { code: 'JOL', chapters: 3 }], [39, { code: 'MAL', chapters: 4 }],
    ]);
    const numbers = new Map([...books].map(([number, book]) => [book.code, number]));
    for (const raw of [
      'Gen.1.1#01=L', 'Deu.34.12#20=L', 'Jos.1.1#01=L', 'Est.10.3#12=L',
      'Job.1.1#01=L', 'Sng.8.14#10=L', 'Isa.1.1#01=L', 'Mal.4.6#20=L',
    ]) expect(() => parseTahotReferenceAndType(raw, numbers, books)).not.toThrow();
    expect(parseTahotReferenceAndType('Psa.3.0(3.1)#01=L', numbers, books)).toMatchObject({
      normalizedCoordinate: { chapter: 3, verse: 0 }, nativeCoordinate: { chapter: 3, verse: 1 },
    });
    expect(parseTahotReferenceAndType('Jol.3.1(4.1)#01=L', numbers, books)).toMatchObject({
      normalizedCoordinate: { chapter: 3, verse: 1 }, nativeCoordinate: { chapter: 4, verse: 1 },
    });
    expect(parseTahotReferenceAndType('Isa.64.1(63.19)#10=L', numbers, books)).toMatchObject({
      normalizedCoordinate: { chapter: 64, verse: 1 }, nativeCoordinate: { chapter: 63, verse: 19 },
      wordElement: '10', textType: 'L',
    });
  });

  it('attests only an exact caller-supplied locator and emits canonical pinned-token fields', () => {
    const index = syntheticIndex();
    const token = index.tokens[0]!;
    const row = {
      artifactIdentity: 'a'.repeat(64), sourceId: 'ubs-source', entryId: 'entry-1', senseId: 'sense-1',
      evidenceId: 'evidence-1', normalizedReference: 'GEN 1:1', rawAnchor: '00100100100002',
    };
    expect(attestExactUbsTahotCoordinatePair([row], [token], index)).toMatchObject({
      artifactIdentity: row.artifactIdentity,
      entryId: row.entryId,
      senseId: row.senseId,
      evidenceId: row.evidenceId,
      tahotTokenIdentity: token.tokenIdentity,
      verifierVersion: 1,
      limitation: 'coordinate_and_explicit_pair_only_not_token_alignment_or_lexical_sense_adjudication',
    });
    expect(() => attestExactUbsTahotCoordinatePair([], [token], index)).toThrow('one-to-one cardinality');
    expect(() => attestExactUbsTahotCoordinatePair([row, row], [token], index)).toThrow('one-to-one cardinality');
    expect(() => attestExactUbsTahotCoordinatePair([row], [token, token], index)).toThrow('one-to-one cardinality');
    expect(() => attestExactUbsTahotCoordinatePair([{ ...row, normalizedReference: 'GEN 1:2' }], [token], index))
      .toThrow('normalized reference');

    // A caller can clone a legitimate locator and mutate every descriptive
    // field. The attestation must read solely from the canonical indexed raw
    // token after membership lookup, so these mutations cannot forge evidence.
    const forgedClone: TahotRawToken = {
      ...token,
      wordElement: '999',
      nativeCoordinate: { bookNumber: 39, bookCode: 'MAL', chapter: 4, verse: 6 },
      normalizedCoordinate: { bookNumber: 39, bookCode: 'MAL', chapter: 4, verse: 6 },
      tokenIdentity: token.tokenIdentity,
    };
    expect(attestExactUbsTahotCoordinatePair([row], [forgedClone], index)).toMatchObject({
      tahotTokenIdentity: token.tokenIdentity,
      tahotWordElement: token.wordElement,
      nativeCoordinate: token.nativeCoordinate,
      normalizedCoordinate: token.normalizedCoordinate,
    });
    expect(() => attestExactUbsTahotCoordinatePair([row], [{
      ...token, tokenIdentity: 'c'.repeat(64),
    }], index)).toThrow('not an exact member');
    expect(() => attestExactUbsTahotCoordinatePair([row], [{
      ...token, fileId: 'tahot-jos-est',
    }], index)).toThrow('not an exact member');
  });
});
