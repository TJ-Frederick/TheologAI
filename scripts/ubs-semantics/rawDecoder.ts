import { createHash } from 'node:crypto';
import {
  UBS_HEBREW_V092_ARTIFACTS,
  assertPinnedUbsHebrewV092Bytes,
  type UbsPinnedFile,
} from '../verify-ubs-hebrew-v092-acquisition.js';

export const UBS_RAW_DECODER_SCHEMA = 'theologai-ubs-hebrew-raw-decoder.v1' as const;
export const UBS_DEFINITION_EXCLUSION_REASON_LIMIT = 8;

export type UbsDecodedDefinitionStatus =
  | 'published'
  | 'absent_in_source'
  | 'excluded_unresolved_markup';

export type UbsDefinitionExclusionReason =
  | 'unsafe_attribution_markup'
  | 'unsafe_note_markup'
  | 'malformed_lexical_link_markup'
  | 'unvalidated_scripture_link_markup'
  | 'malformed_or_unknown_markup';

export interface UbsValidatedDefinitionReference {
  readonly normalizedReference: string;
}

export type UbsDefinitionReferenceValidator = (
  rawPayload: string,
) => UbsValidatedDefinitionReference | undefined;

export interface DecodedUbsDomain {
  readonly domainId: string;
  readonly sourceOrdinal: number;
  readonly level: number;
  readonly parentDomainId?: string;
  readonly label: string;
  readonly description?: string;
}

export interface DecodedUbsSense {
  readonly senseId: string;
  readonly sourceOrdinal: number;
  readonly definitionStatus: UbsDecodedDefinitionStatus;
  readonly definition?: string;
  readonly definitionExclusionReasons: readonly UbsDefinitionExclusionReason[];
  readonly glosses: readonly string[];
  readonly domainIds: readonly string[];
  readonly sourceReferences: readonly string[];
}

export interface DecodedUbsEntry {
  readonly entryId: string;
  readonly sourceEntryId: string;
  readonly sourceOrdinal: number;
  readonly lemma: string;
  readonly partOfSpeech: readonly string[];
  readonly lexicalIdentities: readonly string[];
  readonly senses: readonly DecodedUbsSense[];
}

export interface DecodedUbsCoordinateReference {
  readonly sourceEntryId: string;
  readonly entryId: string;
  readonly senseId: string;
  readonly evidenceOrdinal: number;
  readonly sourceReference: string;
}

export interface DecodedUbsBaseFormExclusion {
  readonly sourceEntryId: string;
  readonly entryId: string;
  readonly sourceOrdinal: number;
  readonly reason: 'no_exact_h_or_a_identity';
}

export interface UbsRawDecoderAudit {
  readonly schemaVersion: 'theologai-ubs-hebrew-decoder-audit.v1';
  readonly raw: {
    readonly entries: number;
    readonly baseForms: number;
    readonly senses: number;
    readonly references: number;
    readonly domains: number;
  };
  readonly projection: {
    readonly entries: number;
    readonly senses: number;
    readonly references: number;
    readonly domains: number;
  };
  readonly identities: {
    readonly acceptedOccurrences: number;
    readonly excludedOccurrences: number;
    readonly excludedBaseForms: number;
  };
  readonly definitions: {
    readonly nonblank: number;
    readonly published: number;
    readonly absentInSource: number;
    readonly excludedUnresolvedMarkup: number;
    readonly markupOccurrences: Readonly<Record<'L' | 'S' | 'A' | 'N', number>>;
    readonly malformedLexicalLinks: number;
  };
  readonly glosses: {
    readonly sensesWithCleanNonemptyGlosses: number;
  };
  readonly domains: {
    readonly blankAssignmentsDropped: number;
    readonly rawNullDomainSenses: number;
    readonly blankOnlyDomainSenses: number;
    readonly zeroDomainSenses: number;
  };
  readonly maximumReferencesPerSense: number;
  readonly deterministicProjectionSha256: string;
}

export interface DecodedUbsHebrewProjection {
  readonly schemaVersion: typeof UBS_RAW_DECODER_SCHEMA;
  readonly entries: readonly DecodedUbsEntry[];
  readonly domains: readonly DecodedUbsDomain[];
  readonly excludedBaseForms: readonly DecodedUbsBaseFormExclusion[];
  /** Complete raw reference inventory, including base forms excluded from semantic projection. */
  readonly coordinateReferences: readonly DecodedUbsCoordinateReference[];
  readonly audit: UbsRawDecoderAudit;
}

const ENTRY_KEYS = [
  'AlphaPos', 'AlternateLemmas', 'Authors', 'BaseForms', 'ContributorNote', 'Contributors', 'Dates',
  'HasAramaic', 'InLXX', 'Lemma', 'Localizations', 'MainId', 'MainLinks', 'Notes', 'StrongCodes', 'Version',
] as const;
const BASE_FORM_KEYS = [
  'BaseFormID', 'BaseFormLinks', 'Constructs', 'CrossReferences', 'Etymologies', 'Inflections', 'LEXMeanings',
  'MeaningsOfName', 'PartsOfSpeech', 'RelatedLemmas', 'RelatedNames',
] as const;
const MEANING_KEYS = [
  'CONMeanings', 'LEXAntonyms', 'LEXCollocations', 'LEXCoordinates', 'LEXCoreDomains', 'LEXCrossReferences',
  'LEXDomains', 'LEXEntryCode', 'LEXForms', 'LEXID', 'LEXIllustrations', 'LEXImages', 'LEXIndent',
  'LEXIsBiblicalTerm', 'LEXLinks', 'LEXParallels', 'LEXReferences', 'LEXSenses', 'LEXSubDomains', 'LEXSynonyms',
  'LEXValencies', 'LEXVideos',
] as const;
const SENSE_KEYS = [
  'Comments', 'DefinitionLong', 'DefinitionShort', 'Glosses', 'LanguageCode', 'LastEdited', 'LastEditedBy',
] as const;
const DOMAIN_ASSIGNMENT_KEYS = ['Domain', 'DomainCode', 'DomainSource', 'DomainSourceCode'] as const;
const DOMAIN_KEYS = ['Code', 'Entries', 'HasSubDomains', 'Level', 'Prototype', 'Reference', 'SemanticDomainLocalizations'] as const;
const DOMAIN_LOCALIZATION_KEYS = ['Comment', 'Description', 'Label', 'LanguageCode', 'Opposite'] as const;
const EXACT_LEXICAL_IDENTITY = /^(?:H|A)(?!0000$)[0-9]{4}$/;
const RAW_IDENTIFIER = /^[0-9]{15}$/;
const DOMAIN_CODE = /^(?:[0-9]{3}){1,8}$/;

export function decodePinnedUbsHebrewV092(
  dictionaryBytes: Uint8Array,
  domainBytes: Uint8Array,
  validateDefinitionReference: UbsDefinitionReferenceValidator,
): DecodedUbsHebrewProjection {
  return decodeExactUbsHebrewRaw(
    dictionaryBytes,
    domainBytes,
    UBS_HEBREW_V092_ARTIFACTS,
    validateDefinitionReference,
  );
}

/** Hash-first seam retained for synthetic tests and future independently pinned revisions. */
export function decodeExactUbsHebrewRaw(
  dictionaryBytes: Uint8Array,
  domainBytes: Uint8Array,
  pins: readonly [UbsPinnedFile, UbsPinnedFile],
  validateDefinitionReference: UbsDefinitionReferenceValidator,
): DecodedUbsHebrewProjection {
  assertPinnedUbsHebrewV092Bytes(pins[0], dictionaryBytes);
  assertPinnedUbsHebrewV092Bytes(pins[1], domainBytes);
  const rawDictionary = parseJsonArray(dictionaryBytes, 'dictionary');
  const rawDomains = parseJsonArray(domainBytes, 'domains');
  const domains = decodeDomains(rawDomains);
  const knownDomains = new Set(domains.map(domain => domain.domainId));
  const entries: DecodedUbsEntry[] = [];
  const excludedBaseForms: DecodedUbsBaseFormExclusion[] = [];
  const coordinateReferences: DecodedUbsCoordinateReference[] = [];
  const counts = {
    baseForms: 0, senses: 0, references: 0,
    acceptedIdentityOccurrences: 0, excludedIdentityOccurrences: 0, excludedBaseForms: 0,
    nonblankDefinitions: 0, publishedDefinitions: 0, absentDefinitions: 0, excludedDefinitions: 0,
    l: 0, s: 0, a: 0, n: 0, malformedL: 0, glosses: 0,
    blankDomainAssignments: 0, rawNullDomainSenses: 0, blankOnlyDomainSenses: 0,
    zeroDomainSenses: 0, maximumReferencesPerSense: 0,
  };
  let baseOrdinal = 0;
  let projectedSenseCount = 0;
  let projectedReferenceCount = 0;

  for (const [entryIndex, rawEntry] of rawDictionary.entries()) {
    const entry = exactObject(rawEntry, ENTRY_KEYS, `dictionary[${entryIndex}]`);
    const sourceEntryId = exactRawId(entry.MainId, `dictionary[${entryIndex}].MainId`);
    const lemma = cleanRequiredText(entry.Lemma, `dictionary[${entryIndex}].Lemma`);
    const rawIdentities = exactStringArray(entry.StrongCodes, `dictionary[${entryIndex}].StrongCodes`);
    const lexicalIdentities = uniqueSorted(rawIdentities.filter(identity => EXACT_LEXICAL_IDENTITY.test(identity)));
    counts.acceptedIdentityOccurrences += rawIdentities.filter(identity => EXACT_LEXICAL_IDENTITY.test(identity)).length;
    counts.excludedIdentityOccurrences += rawIdentities.filter(identity => !EXACT_LEXICAL_IDENTITY.test(identity)).length;
    const baseForms = exactArray(entry.BaseForms, `dictionary[${entryIndex}].BaseForms`);
    for (const [baseIndex, rawBase] of baseForms.entries()) {
      counts.baseForms += 1;
      baseOrdinal += 1;
      const basePath = `dictionary[${entryIndex}].BaseForms[${baseIndex}]`;
      const base = exactObject(rawBase, BASE_FORM_KEYS, basePath);
      const entryId = exactRawId(base.BaseFormID, `${basePath}.BaseFormID`);
      const rawPartsOfSpeech = base.PartsOfSpeech === null
        ? []
        : exactStringArray(base.PartsOfSpeech, `${basePath}.PartsOfSpeech`);
      const partOfSpeech = uniqueSorted(rawPartsOfSpeech.flatMap((value, index) =>
        value === '' ? [] : [cleanRequiredText(value, `${basePath}.PartsOfSpeech[${index}]`)]));
      const decodedSenses: DecodedUbsSense[] = [];
      for (const [meaningIndex, rawMeaning] of exactArray(base.LEXMeanings, `${basePath}.LEXMeanings`).entries()) {
        const meaningPath = `${basePath}.LEXMeanings[${meaningIndex}]`;
        const meaning = exactObject(rawMeaning, MEANING_KEYS, meaningPath);
        const senseId = exactRawId(meaning.LEXID, `${meaningPath}.LEXID`);
        const localizations = exactArray(meaning.LEXSenses, `${meaningPath}.LEXSenses`);
        const english = localizations.flatMap((rawSense, senseIndex) => {
          const sensePath = `${meaningPath}.LEXSenses[${senseIndex}]`;
          const sense = exactObject(rawSense, SENSE_KEYS, sensePath);
          return exactString(sense.LanguageCode, `${sensePath}.LanguageCode`) === 'en' ? [{ sense, sensePath }] : [];
        });
        if (english.length !== 1) throw new Error(`${meaningPath} must contain exactly one English sense localization`);
        counts.senses += 1;
        const { sense, sensePath } = english[0]!;
        const longDefinition = exactString(sense.DefinitionLong, `${sensePath}.DefinitionLong`);
        if (longDefinition !== '') throw new Error(`${sensePath}.DefinitionLong is outside the approved empty v0.9.2 projection`);
        const decodedDefinition = decodeDefinition(
          exactString(sense.DefinitionShort, `${sensePath}.DefinitionShort`),
          validateDefinitionReference,
        );
        counts.l += decodedDefinition.occurrences.L;
        counts.s += decodedDefinition.occurrences.S;
        counts.a += decodedDefinition.occurrences.A;
        counts.n += decodedDefinition.occurrences.N;
        counts.malformedL += decodedDefinition.malformedLexicalLinks;
        if (decodedDefinition.status === 'published') {
          counts.publishedDefinitions += 1;
          counts.nonblankDefinitions += 1;
        } else if (decodedDefinition.status === 'absent_in_source') {
          counts.absentDefinitions += 1;
        } else {
          counts.excludedDefinitions += 1;
          counts.nonblankDefinitions += 1;
        }
        const glosses = uniqueSorted(exactStringArray(sense.Glosses, `${sensePath}.Glosses`)
          .flatMap((gloss, glossIndex) => {
            const normalized = cleanGloss(gloss, `${sensePath}.Glosses[${glossIndex}]`);
            return normalized === undefined ? [] : [normalized];
          }));
        if (glosses.length === 0) throw new Error(`${sensePath}.Glosses must contain at least one clean gloss`);
        counts.glosses += 1;
        const domainIds: string[] = [];
        const assignments = meaning.LEXDomains === null
          ? []
          : exactArray(meaning.LEXDomains, `${meaningPath}.LEXDomains`);
        if (meaning.LEXDomains === null) counts.rawNullDomainSenses += 1;
        for (const [assignmentIndex, rawAssignment] of assignments.entries()) {
          const assignmentPath = `${meaningPath}.LEXDomains[${assignmentIndex}]`;
          const assignment = exactObject(rawAssignment, DOMAIN_ASSIGNMENT_KEYS, assignmentPath);
          const domainId = exactString(assignment.DomainCode, `${assignmentPath}.DomainCode`);
          exactString(assignment.Domain, `${assignmentPath}.Domain`);
          exactString(assignment.DomainSource, `${assignmentPath}.DomainSource`);
          exactString(assignment.DomainSourceCode, `${assignmentPath}.DomainSourceCode`);
          if (domainId === '') {
            counts.blankDomainAssignments += 1;
            continue;
          }
          if (!DOMAIN_CODE.test(domainId) || !knownDomains.has(domainId)) {
            throw new Error(`${assignmentPath}.DomainCode does not name an approved lexical domain`);
          }
          domainIds.push(domainId);
        }
        const normalizedDomainIds = uniqueSorted(domainIds);
        if (normalizedDomainIds.length === 0) {
          counts.zeroDomainSenses += 1;
          if (assignments.length > 0) counts.blankOnlyDomainSenses += 1;
        }
        const sourceReferences = exactStringArray(meaning.LEXReferences, `${meaningPath}.LEXReferences`)
          .map((reference, referenceIndex) => cleanRequiredText(reference, `${meaningPath}.LEXReferences[${referenceIndex}]`));
        sourceReferences.forEach((sourceReference, referenceIndex) => coordinateReferences.push({
          sourceEntryId,
          entryId,
          senseId,
          evidenceOrdinal: referenceIndex + 1,
          sourceReference,
        }));
        counts.references += sourceReferences.length;
        counts.maximumReferencesPerSense = Math.max(counts.maximumReferencesPerSense, sourceReferences.length);
        decodedSenses.push({
          senseId,
          sourceOrdinal: meaningIndex + 1,
          definitionStatus: decodedDefinition.status,
          ...(decodedDefinition.definition === undefined ? {} : { definition: decodedDefinition.definition }),
          definitionExclusionReasons: decodedDefinition.reasons,
          glosses,
          domainIds: normalizedDomainIds,
          sourceReferences,
        });
      }
      if (lexicalIdentities.length === 0) {
        counts.excludedBaseForms += 1;
        excludedBaseForms.push({
          sourceEntryId,
          entryId,
          sourceOrdinal: baseOrdinal,
          reason: 'no_exact_h_or_a_identity',
        });
        continue;
      }
      projectedSenseCount += decodedSenses.length;
      projectedReferenceCount += decodedSenses.reduce((total, sense) => total + sense.sourceReferences.length, 0);
      entries.push({
        entryId,
        sourceEntryId,
        sourceOrdinal: baseOrdinal,
        lemma,
        partOfSpeech,
        lexicalIdentities,
        senses: decodedSenses,
      });
    }
  }

  const projectionCore = {
    schemaVersion: UBS_RAW_DECODER_SCHEMA,
    entries,
    domains,
    excludedBaseForms,
    coordinateReferences,
  } as const;
  const deterministicProjectionSha256 = sha256(canonicalJson(projectionCore));
  const audit: UbsRawDecoderAudit = {
    schemaVersion: 'theologai-ubs-hebrew-decoder-audit.v1',
    raw: {
      entries: rawDictionary.length,
      baseForms: counts.baseForms,
      senses: counts.senses,
      references: counts.references,
      domains: domains.length,
    },
    projection: {
      entries: entries.length,
      senses: projectedSenseCount,
      references: projectedReferenceCount,
      domains: domains.length,
    },
    identities: {
      acceptedOccurrences: counts.acceptedIdentityOccurrences,
      excludedOccurrences: counts.excludedIdentityOccurrences,
      excludedBaseForms: counts.excludedBaseForms,
    },
    definitions: {
      nonblank: counts.nonblankDefinitions,
      published: counts.publishedDefinitions,
      absentInSource: counts.absentDefinitions,
      excludedUnresolvedMarkup: counts.excludedDefinitions,
      markupOccurrences: { L: counts.l, S: counts.s, A: counts.a, N: counts.n },
      malformedLexicalLinks: counts.malformedL,
    },
    glosses: { sensesWithCleanNonemptyGlosses: counts.glosses },
    domains: {
      blankAssignmentsDropped: counts.blankDomainAssignments,
      rawNullDomainSenses: counts.rawNullDomainSenses,
      blankOnlyDomainSenses: counts.blankOnlyDomainSenses,
      zeroDomainSenses: counts.zeroDomainSenses,
    },
    maximumReferencesPerSense: counts.maximumReferencesPerSense,
    deterministicProjectionSha256,
  };
  return { ...projectionCore, audit };
}

export function decodeUbsDefinition(
  raw: string,
  validateReference: UbsDefinitionReferenceValidator,
): {
  status: UbsDecodedDefinitionStatus;
  definition?: string;
  reasons: readonly UbsDefinitionExclusionReason[];
  occurrences: Readonly<Record<'L' | 'S' | 'A' | 'N', number>>;
  malformedLexicalLinks: number;
} {
  return decodeDefinition(raw, validateReference);
}

function decodeDefinition(raw: string, validateReference: UbsDefinitionReferenceValidator) {
  if (raw === '') {
    return {
      status: 'absent_in_source' as const,
      reasons: [] as UbsDefinitionExclusionReason[],
      occurrences: { L: 0, S: 0, A: 0, N: 0 },
      malformedLexicalLinks: 0,
    };
  }
  const reasons = new Set<UbsDefinitionExclusionReason>();
  const occurrences = { L: 0, S: 0, A: 0, N: 0 };
  let malformedLexicalLinks = 0;
  let output = '';
  let cursor = 0;
  const marker = /\{([A-Za-z][A-Za-z0-9_-]*):([^{}]*)\}/g;
  for (const match of raw.matchAll(marker)) {
    const index = match.index!;
    output += raw.slice(cursor, index);
    cursor = index + match[0].length;
    const kind = match[1]!;
    const payload = match[2]!;
    if (kind === 'L') {
      occurrences.L += 1;
      const lexical = /^([^<>{}]+)<SDBH:([^<>{}]+)>$/.exec(payload);
      if (!lexical) {
        malformedLexicalLinks += 1;
        reasons.add('malformed_lexical_link_markup');
        continue;
      }
      output += cleanMarkupText(lexical[1]!, 'lexical-link visible label');
      cleanMarkupText(lexical[2]!, 'lexical-link SDBH payload');
    } else if (kind === 'S') {
      occurrences.S += 1;
      const validated = validateReference(payload);
      if (!validated) {
        reasons.add('unvalidated_scripture_link_markup');
        continue;
      }
      output += cleanMarkupText(validated.normalizedReference, 'validated scripture-link reference');
    } else if (kind === 'A') {
      occurrences.A += 1;
      reasons.add('unsafe_attribution_markup');
    } else if (kind === 'N') {
      occurrences.N += 1;
      reasons.add('unsafe_note_markup');
    } else {
      reasons.add('malformed_or_unknown_markup');
    }
  }
  output += raw.slice(cursor);
  const observedKnown = [...raw.matchAll(/\{([LASN]):/g)].reduce((counts, match) => {
    counts[match[1] as 'L' | 'S' | 'A' | 'N'] += 1;
    return counts;
  }, { L: 0, S: 0, A: 0, N: 0 });
  for (const kind of ['L', 'S', 'A', 'N'] as const) {
    if (observedKnown[kind] !== occurrences[kind]) {
      if (kind === 'L') {
        malformedLexicalLinks += observedKnown[kind] - occurrences[kind];
        reasons.add('malformed_lexical_link_markup');
      } else reasons.add('malformed_or_unknown_markup');
      occurrences[kind] = observedKnown[kind];
    }
  }
  const strippedRecognized = raw.replace(marker, '');
  if (/[{}]/.test(strippedRecognized) || /\{[A-Za-z][A-Za-z0-9_-]*:/.test(raw.replace(marker, ''))) {
    reasons.add('malformed_or_unknown_markup');
  }
  if (/\|[A-Za-z][A-Za-z0-9]*(?:\*)?/.test(raw)) reasons.add('malformed_or_unknown_markup');
  const boundedReasons = [...reasons].sort(compareCodePoints).slice(0, UBS_DEFINITION_EXCLUSION_REASON_LIMIT);
  if (boundedReasons.length > 0) {
    return {
      status: 'excluded_unresolved_markup' as const,
      reasons: boundedReasons,
      occurrences,
      malformedLexicalLinks,
    };
  }
  return {
    status: 'published' as const,
    definition: cleanRequiredText(output, 'decoded definition'),
    reasons: boundedReasons,
    occurrences,
    malformedLexicalLinks,
  };
}

function decodeDomains(values: unknown[]): DecodedUbsDomain[] {
  const domains = values.map((rawDomain, index): DecodedUbsDomain => {
    const path = `domains[${index}]`;
    const domain = exactObject(rawDomain, DOMAIN_KEYS, path);
    const domainId = exactString(domain.Code, `${path}.Code`);
    const level = positiveInteger(domain.Level, `${path}.Level`);
    if (!DOMAIN_CODE.test(domainId) || domainId.length !== level * 3) {
      throw new Error(`${path}.Code must contain exactly one three-digit component per level`);
    }
    const localizations = exactArray(domain.SemanticDomainLocalizations, `${path}.SemanticDomainLocalizations`)
      .map((rawLocalization, localizationIndex) => {
        const localizationPath = `${path}.SemanticDomainLocalizations[${localizationIndex}]`;
        return {
          localization: exactObject(rawLocalization, DOMAIN_LOCALIZATION_KEYS, localizationPath),
          localizationPath,
        };
      });
    const english = localizations.filter(({ localization, localizationPath }) =>
      exactString(localization.LanguageCode, `${localizationPath}.LanguageCode`) === 'en');
    if (english.length !== 1) throw new Error(`${path} must contain exactly one English localization`);
    const { localization, localizationPath } = english[0]!;
    const description = optionalCleanText(localization.Description, `${localizationPath}.Description`);
    return {
      domainId,
      sourceOrdinal: index + 1,
      level,
      ...(level === 1 ? {} : { parentDomainId: domainId.slice(0, -3) }),
      label: cleanRequiredText(localization.Label, `${localizationPath}.Label`),
      ...(description === undefined ? {} : { description }),
    };
  });
  if (new Set(domains.map(domain => domain.domainId)).size !== domains.length) {
    throw new Error('raw lexical domains contain duplicate codes');
  }
  const byId = new Map(domains.map(domain => [domain.domainId, domain]));
  for (const domain of domains) {
    if (!domain.parentDomainId) continue;
    const parent = byId.get(domain.parentDomainId);
    if (!parent || parent.level !== domain.level - 1 || parent.sourceOrdinal >= domain.sourceOrdinal) {
      throw new Error(`raw lexical domain ${domain.domainId} has a missing or non-prior parent`);
    }
  }
  validateNoDomainCycles(domains);
  return domains;
}

function validateNoDomainCycles(domains: readonly DecodedUbsDomain[]): void {
  const byId = new Map(domains.map(domain => [domain.domainId, domain]));
  const state = new Map<string, 'gray' | 'black'>();
  const visit = (id: string): void => {
    if (state.get(id) === 'gray') throw new Error(`raw lexical domains contain a cycle at ${id}`);
    if (state.get(id) === 'black') return;
    state.set(id, 'gray');
    const parent = byId.get(id)?.parentDomainId;
    if (parent) visit(parent);
    state.set(id, 'black');
  };
  for (const domain of domains) visit(domain.domainId);
}

function parseJsonArray(bytes: Uint8Array, label: string): unknown[] {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error(`${label} is not valid UTF-8`); }
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${label} must not contain a UTF-8 BOM`);
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`${label} is not valid JSON`); }
  return exactArray(parsed, `${label} root`);
}

function exactObject(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${path} keys differ from the exact approved raw schema`);
  }
  return record;
}

function exactArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function exactString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  return value;
}

function exactStringArray(value: unknown, path: string): string[] {
  return exactArray(value, path).map((item, index) => exactString(item, `${path}[${index}]`));
}

function exactRawId(value: unknown, path: string): string {
  const id = exactString(value, path);
  if (!RAW_IDENTIFIER.test(id)) throw new Error(`${path} must be the exact 15-digit raw identity`);
  return id;
}

function cleanRequiredText(value: unknown, path: string): string {
  const source = exactString(value, path);
  const text = source.normalize('NFC')
    .replace(/[\t\n\r]+/g, ' ')
    .replace(/[\u200e\u200f]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  if (!text || hostileUnicode(text)) {
    throw new Error(`${path} must normalize to nonempty, trimmed, NFC, control-free text`);
  }
  return text;
}

function optionalCleanText(value: unknown, path: string): string | undefined {
  const text = exactString(value, path);
  return text === '' ? undefined : cleanRequiredText(text, path);
}

function cleanGloss(value: unknown, path: string): string | undefined {
  const source = exactString(value, path);
  if (source.trim() === '') return undefined;
  const text = cleanRequiredText(source, path);
  if (/\{[A-Za-z][A-Za-z0-9_-]*:/.test(text) || /[{}]/.test(text)) {
    throw new Error(`${path} contains unresolved markup`);
  }
  return text;
}

function cleanMarkupText(value: string, path: string): string {
  const text = cleanRequiredText(value, path);
  if (/[{}]/.test(text)) throw new Error(`${path} contains nested markup`);
  return text;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${path} must be a positive safe integer`);
  return value as number;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareCodePoints);
}

function hostileUnicode(value: string): boolean {
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)) return true;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) >= 0xfffe) return true;
  }
  return false;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(compareCodePoints)
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function compareCodePoints(left: string, right: string): number {
  const a = [...left].map(character => character.codePointAt(0)!);
  const b = [...right].map(character => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}
