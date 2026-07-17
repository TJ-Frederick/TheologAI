import { sha256Hex } from '../../src/kernel/sha256.js';
import type {
  UbsSemanticDomain,
  UbsSemanticDomainRef,
  UbsSemanticEntry,
  UbsInternalLexicalIdentity,
  UbsSemanticReferenceEvidence,
  UbsSemanticSense,
  UbsSemanticSource,
  UbsSemanticSourceProvenance,
} from '../../src/kernel/ubsSemanticDomain.js';
import {
  UBS_SEMANTIC_ARTIFACT_VERSION,
  UBS_SEMANTIC_TRANSFORM_VERSION,
  requireUbsSemanticNormalizedReference,
} from '../../src/kernel/ubsSemanticDomain.js';

export const UBS_SEMANTIC_INTERMEDIATE_SCHEMA = 'theologai-ubs-semantics-intermediate.synthetic-v1';
export const UBS_SEMANTIC_ARTIFACT_SCHEMA = 'ubs-semantics.v1';

export interface CompiledUbsSemanticArtifact {
  schemaVersion: typeof UBS_SEMANTIC_ARTIFACT_SCHEMA;
  artifactIdentity: string;
  sources: UbsSemanticSource[];
  domains: UbsSemanticDomain[];
  entries: UbsSemanticEntry[];
  senses: UbsSemanticSense[];
  referenceEvidence: UbsSemanticReferenceEvidence[];
}

/** Independently recompute the canonical identity of a compiled artifact. */
export function computeUbsSemanticArtifactIdentity(artifact: CompiledUbsSemanticArtifact): string {
  const sources = artifact.sources.map(item => {
    const { schemaVersion: _schema, artifactIdentity: _identity, ...descriptor } = item;
    return descriptor;
  });
  return sha256Hex(canonicalJson({
    schemaVersion: artifact.schemaVersion,
    sources,
    domains: artifact.domains,
    entries: artifact.entries,
    senses: artifact.senses,
    referenceEvidence: artifact.referenceEvidence,
  }));
}

type JsonObject = Record<string, unknown>;

const ID = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LEXICAL_IDENTITY = /^(?:H|A)(?!0000$)[0-9]{4}$/;
const THIRD_PARTY_TAG = /\{[A-Za-z][A-Za-z0-9_-]*\s*:/;
const SOURCE_KEYS = [
  'sourceId', 'sourceRole', 'title', 'artifactName', 'artifactVersion', 'language', 'publisher',
  'license', 'licenseUrl', 'sourceUrl', 'sourceCommit', 'sourceSha256',
  'sourceBlob',
  'transformVersion', 'modified', 'modificationNote',
] as const;

/** Parse a reviewed normalized intermediate, not the future UBS raw format. */
export function compileUbsSemanticIntermediate(bytes: Uint8Array | string): CompiledUbsSemanticArtifact {
  const text = decodeUtf8(bytes);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`UBS semantic intermediate is not valid JSON: ${message(error)}`);
  }
  const root = object(value, 'root');
  exactKeys(root, ['schemaVersion', 'fixtureStatus', 'sources', 'domains', 'entries'], 'root');
  equalString(root.schemaVersion, UBS_SEMANTIC_INTERMEDIATE_SCHEMA, 'root.schemaVersion');
  equalString(root.fixtureStatus, 'invented_synthetic_only', 'root.fixtureStatus');

  const sources = parseSources(root.sources);
  const dictionarySource = sources.find(source => source.sourceRole === 'dictionary')!;
  const domainSource = sources.find(source => source.sourceRole === 'lexical_domains')!;
  const domains = parseDomains(root.domains, domainSource.sourceId);
  const { entries, senses, referenceEvidence } = parseEntries(
    root.entries,
    dictionarySource.sourceId,
    domainSource.sourceId,
  );
  validateRelationships(domains, entries, senses, referenceEvidence);

  const identityPayload = {
    schemaVersion: UBS_SEMANTIC_ARTIFACT_SCHEMA as typeof UBS_SEMANTIC_ARTIFACT_SCHEMA,
    sources,
    domains: sortByOrdinal(domains),
    entries: sortByOrdinal(entries),
    senses: [...senses].sort(compareNestedOrdinal),
    referenceEvidence: [...referenceEvidence].sort(compareNestedOrdinal),
  };
  const artifactIdentity = sha256Hex(canonicalJson(identityPayload));
  return {
    ...identityPayload,
    artifactIdentity,
    sources: sources.map(source => ({
      ...source, schemaVersion: UBS_SEMANTIC_ARTIFACT_SCHEMA, artifactIdentity,
    })),
  };
}

function parseSources(input: unknown): UbsSemanticSourceProvenance[] {
  const values = array(input, 'sources');
  if (values.length !== 2) throw new Error('sources must contain exactly the dictionary and lexical-domain artifacts');
  const sources = values.map((item, index) => parseSource(item, `sources[${index}]`));
  unique(sources.map(source => source.sourceId), 'source ID');
  unique(sources.map(source => source.sourceRole), 'source role');
  for (const role of ['dictionary', 'lexical_domains'] as const) {
    if (!sources.some(source => source.sourceRole === role)) throw new Error(`sources is missing ${role}`);
  }
  return [...sources].sort((left, right) => sourceRoleOrder(left.sourceRole) - sourceRoleOrder(right.sourceRole));
}

function parseSource(input: unknown, path: string): UbsSemanticSourceProvenance {
  const value = object(input, path);
  exactKeys(value, SOURCE_KEYS, path);
  const language = equalString(value.language, 'Hebrew', `${path}.language`);
  const sourceRole = oneOf(value.sourceRole, ['dictionary', 'lexical_domains'] as const, `${path}.sourceRole`);
  const common = {
    sourceId: identifier(value.sourceId, `${path}.sourceId`),
    title: cleanString(value.title, `${path}.title`),
    artifactVersion: equalString(value.artifactVersion, UBS_SEMANTIC_ARTIFACT_VERSION, `${path}.artifactVersion`),
    language,
    publisher: equalString(value.publisher, 'United Bible Societies', `${path}.publisher`),
    license: equalString(value.license, 'CC BY-SA 4.0', `${path}.license`),
    licenseUrl: equalString(value.licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/', `${path}.licenseUrl`),
    sourceUrl: httpUrl(value.sourceUrl, `${path}.sourceUrl`),
    sourceCommit: patternString(value.sourceCommit, SOURCE_COMMIT, `${path}.sourceCommit`),
    sourceBlob: patternString(value.sourceBlob, SOURCE_COMMIT, `${path}.sourceBlob`),
    sourceSha256: patternString(value.sourceSha256, SHA256, `${path}.sourceSha256`),
    transformVersion: equalNumber(value.transformVersion, UBS_SEMANTIC_TRANSFORM_VERSION, `${path}.transformVersion`),
    modified: equalBoolean(value.modified, true, `${path}.modified`),
    modificationNote: cleanString(value.modificationNote, `${path}.modificationNote`),
  };
  if (sourceRole === 'dictionary') {
    return {
      ...common, sourceRole,
      artifactName: equalString(value.artifactName, 'UBSHebrewDic-v0.9.2-en.JSON', `${path}.artifactName`),
    };
  }
  return {
    ...common, sourceRole,
    artifactName: equalString(
      value.artifactName,
      'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
      `${path}.artifactName`,
    ),
  };
}

function parseDomains(input: unknown, sourceId: string): UbsSemanticDomain[] {
  const values = array(input, 'domains');
  const result = values.map((inputDomain, index): UbsSemanticDomain => {
    const path = `domains[${index}]`;
    const value = object(inputDomain, path);
    exactKeys(value, ['domainId', 'sourceOrdinal', 'parentDomainId', 'label', 'description'], path);
    const parent = optionalIdentifier(value.parentDomainId, `${path}.parentDomainId`);
    const description = optionalCleanString(value.description, `${path}.description`);
    return {
      domainId: identifier(value.domainId, `${path}.domainId`), sourceId,
      sourceOrdinal: positiveInteger(value.sourceOrdinal, `${path}.sourceOrdinal`),
      ...(parent ? { parentDomainId: parent } : {}),
      label: cleanString(value.label, `${path}.label`),
      ...(description ? { description } : {}),
    };
  });
  unique(result.map(item => item.domainId), 'domain ID');
  unique(result.map(item => item.sourceOrdinal), 'domain sourceOrdinal');
  return result;
}

function parseEntries(input: unknown, sourceId: string, domainSourceId: string): {
  entries: UbsSemanticEntry[];
  senses: UbsSemanticSense[];
  referenceEvidence: UbsSemanticReferenceEvidence[];
} {
  const entries: UbsSemanticEntry[] = [];
  const senses: UbsSemanticSense[] = [];
  const referenceEvidence: UbsSemanticReferenceEvidence[] = [];
  for (const [entryIndex, inputEntry] of array(input, 'entries').entries()) {
    const path = `entries[${entryIndex}]`;
    const value = object(inputEntry, path);
    exactKeys(value, ['entryId', 'sourceOrdinal', 'lemma', 'transliteration', 'partOfSpeech', 'lexicalIdentities', 'senses'], path);
    const entryId = identifier(value.entryId, `${path}.entryId`);
    const lexicalIdentities = stringArray(value.lexicalIdentities, `${path}.lexicalIdentities`)
      .map((identity, index) => patternString(
        identity, LEXICAL_IDENTITY, `${path}.lexicalIdentities[${index}]`,
      ) as UbsInternalLexicalIdentity);
    if (lexicalIdentities.length === 0) throw new Error(`${path}.lexicalIdentities must not be empty`);
    unique(lexicalIdentities, `${path} lexical identity`);
    lexicalIdentities.sort(compareCodePoints);
    const transliteration = optionalCleanString(value.transliteration, `${path}.transliteration`);
    const partOfSpeech = optionalCleanString(value.partOfSpeech, `${path}.partOfSpeech`);
    entries.push({
      entryId, sourceId,
      sourceOrdinal: positiveInteger(value.sourceOrdinal, `${path}.sourceOrdinal`),
      lemma: cleanString(value.lemma, `${path}.lemma`),
      ...(transliteration ? { transliteration } : {}),
      ...(partOfSpeech ? { partOfSpeech } : {}),
      lexicalIdentities,
    });

    const inputSenses = array(value.senses, `${path}.senses`);
    for (const [senseIndex, inputSense] of inputSenses.entries()) {
      const sensePath = `${path}.senses[${senseIndex}]`;
      const sense = object(inputSense, sensePath);
      exactKeys(sense, ['senseId', 'entryId', 'sourceOrdinal', 'definition', 'glosses', 'domainIds', 'references'], sensePath);
      const senseId = identifier(sense.senseId, `${sensePath}.senseId`);
      const senseEntryId = identifier(sense.entryId, `${sensePath}.entryId`);
      if (senseEntryId !== entryId) {
        throw new Error(`${sensePath}.entryId must equal enclosing entry ${entryId}`);
      }
      const domainIds = stringArray(sense.domainIds, `${sensePath}.domainIds`)
        .map((id, index) => identifier(id, `${sensePath}.domainIds[${index}]`));
      if (domainIds.length === 0) throw new Error(`${sensePath}.domainIds must not be empty`);
      unique(domainIds, `${sensePath} domain ID`);
      domainIds.sort(compareCodePoints);
      const glosses = stringArray(sense.glosses, `${sensePath}.glosses`)
        .map((gloss, index) => cleanString(gloss, `${sensePath}.glosses[${index}]`));
      unique(glosses, `${sensePath} gloss`);
      const domainRefs: UbsSemanticDomainRef[] = domainIds.map(domainId => ({ sourceId: domainSourceId, domainId }));
      senses.push({
        senseId, sourceId, entryId: senseEntryId,
        sourceOrdinal: positiveInteger(sense.sourceOrdinal, `${sensePath}.sourceOrdinal`),
        definition: cleanString(sense.definition, `${sensePath}.definition`),
        glosses, domainRefs,
      });

      for (const [referenceIndex, inputReference] of array(sense.references, `${sensePath}.references`).entries()) {
        const referencePath = `${sensePath}.references[${referenceIndex}]`;
        const reference = object(inputReference, referencePath);
        exactKeys(reference, ['evidenceId', 'senseId', 'sourceOrdinal', 'sourceReference', 'normalizedReference'], referencePath);
        const referenceSenseId = identifier(reference.senseId, `${referencePath}.senseId`);
        if (referenceSenseId !== senseId) {
          throw new Error(`${referencePath}.senseId must equal enclosing sense ${senseId}`);
        }
        referenceEvidence.push({
          evidenceId: identifier(reference.evidenceId, `${referencePath}.evidenceId`), sourceId,
          senseId: referenceSenseId,
          sourceOrdinal: positiveInteger(reference.sourceOrdinal, `${referencePath}.sourceOrdinal`),
          sourceReference: cleanString(reference.sourceReference, `${referencePath}.sourceReference`),
          normalizedReference: requireUbsSemanticNormalizedReference(
            reference.normalizedReference,
            `${referencePath}.normalizedReference`,
          ),
          evidenceKind: 'source_attested_sense_reference',
        });
      }
    }
  }
  unique(entries.map(item => item.entryId), 'entry ID');
  unique(entries.map(item => item.sourceOrdinal), 'entry sourceOrdinal');
  unique(senses.map(item => item.senseId), 'sense ID');
  unique(referenceEvidence.map(item => item.evidenceId), 'reference evidence ID');
  for (const entry of entries) {
    unique(senses.filter(sense => sense.entryId === entry.entryId).map(sense => sense.sourceOrdinal), `${entry.entryId} sense sourceOrdinal`);
  }
  for (const sense of senses) {
    unique(referenceEvidence.filter(evidence => evidence.senseId === sense.senseId).map(evidence => evidence.sourceOrdinal), `${sense.senseId} reference sourceOrdinal`);
  }
  return { entries, senses, referenceEvidence };
}

function validateRelationships(
  domains: UbsSemanticDomain[], entries: UbsSemanticEntry[], senses: UbsSemanticSense[],
  references: UbsSemanticReferenceEvidence[],
): void {
  const domainIds = new Set(domains.map(item => item.domainId));
  const entryIds = new Set(entries.map(item => item.entryId));
  const senseIds = new Set(senses.map(item => item.senseId));
  for (const domain of domains) {
    if (domain.parentDomainId && !domainIds.has(domain.parentDomainId)) {
      throw new Error(`Domain ${domain.domainId} has missing parent ${domain.parentDomainId}`);
    }
  }
  validateDomainCycles(domains);
  const domainById = new Map(domains.map(domain => [domain.domainId, domain]));
  for (const domain of domains) {
    if (!domain.parentDomainId) continue;
    const parent = domainById.get(domain.parentDomainId)!;
    if (parent.sourceOrdinal >= domain.sourceOrdinal) {
      throw new Error(`Domain ${domain.domainId} must follow parent ${parent.domainId} in source order`);
    }
  }
  for (const sense of senses) {
    if (!entryIds.has(sense.entryId)) throw new Error(`Sense ${sense.senseId} has missing entry ${sense.entryId}`);
    for (const domainRef of sense.domainRefs) {
      if (!domainIds.has(domainRef.domainId)) throw new Error(`Sense ${sense.senseId} has missing domain ${domainRef.domainId}`);
    }
  }
  for (const reference of references) {
    if (!senseIds.has(reference.senseId)) throw new Error(`Reference ${reference.evidenceId} has missing sense ${reference.senseId}`);
  }
}

function validateDomainCycles(domains: UbsSemanticDomain[]): void {
  const byId = new Map(domains.map(domain => [domain.domainId, domain]));
  const colors = new Map<string, 'gray' | 'black'>();
  const visit = (domainId: string): void => {
    const color = colors.get(domainId);
    if (color === 'gray') throw new Error(`Domain hierarchy contains a cycle at ${domainId}`);
    if (color === 'black') return;
    colors.set(domainId, 'gray');
    const parent = byId.get(domainId)?.parentDomainId;
    if (parent) visit(parent);
    colors.set(domainId, 'black');
  };
  for (const domain of domains) visit(domain.domainId);
}

function decodeUtf8(input: Uint8Array | string): string {
  if (typeof input === 'string') {
    if (input.charCodeAt(0) === 0xfeff) throw new Error('UBS semantic intermediate must be UTF-8 without a BOM');
    return input;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch (error) {
    throw new Error(`UBS semantic intermediate is not valid UTF-8: ${message(error)}`);
  }
  if (text.charCodeAt(0) === 0xfeff) throw new Error('UBS semantic intermediate must be UTF-8 without a BOM');
  return text;
}

function object(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as JsonObject;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}
function exactKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) throw new Error(`${path} contains unsupported field(s): ${extras.sort().join(', ')}`);
  const missing = allowed.filter(key => !(key in value));
  if (missing.length) throw new Error(`${path} is missing field(s): ${missing.join(', ')}`);
}
function cleanString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) throw new Error(`${path} must be a non-empty trimmed string`);
  if (THIRD_PARTY_TAG.test(value)) throw new Error(`${path} contains a prohibited third-party witness/note tag`);
  return value.normalize('NFC');
}
function optionalCleanString(value: unknown, path: string): string | undefined {
  if (value === null) return undefined;
  return cleanString(value, path);
}
function identifier(value: unknown, path: string): string {
  return patternString(value, ID, path);
}
function optionalIdentifier(value: unknown, path: string): string | undefined {
  if (value === null) return undefined;
  return identifier(value, path);
}
function patternString(value: unknown, pattern: RegExp, path: string): string {
  const parsed = cleanString(value, path);
  if (!pattern.test(parsed)) throw new Error(`${path} has an unsupported encoding`);
  return parsed;
}
function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => {
    if (typeof item !== 'string') throw new Error(`${path}[${index}] must be a string`);
    return item;
  });
}
function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${path} must be a positive safe integer`);
  return value as number;
}
function equalString<const T extends string>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new Error(`${path} must equal ${expected}`);
  return expected;
}
function equalBoolean<const T extends boolean>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new Error(`${path} must equal ${String(expected)}`);
  return expected;
}
function equalNumber<const T extends number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new Error(`${path} must equal ${String(expected)}`);
  return expected;
}
function oneOf<const T extends readonly string[]>(value: unknown, choices: T, path: string): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error(`${path} must be one of ${choices.join(', ')}`);
  return value as T[number];
}
function httpUrl(value: unknown, path: string): string {
  const text = cleanString(value, path);
  let url: URL;
  try { url = new URL(text); } catch { throw new Error(`${path} must be an absolute HTTPS URL`); }
  if (url.protocol !== 'https:') throw new Error(`${path} must be an absolute HTTPS URL`);
  return text;
}
function unique(values: Array<string | number>, label: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${String(value)}`);
    seen.add(value);
  }
}
function sortByOrdinal<T extends { sourceOrdinal: number }>(values: T[]): T[] {
  return [...values].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
}
function compareNestedOrdinal(
  a: { entryId?: string; senseId?: string; sourceOrdinal: number },
  b: { entryId?: string; senseId?: string; sourceOrdinal: number },
): number {
  return compareCodePoints(a.entryId ?? a.senseId ?? '', b.entryId ?? b.senseId ?? '') || a.sourceOrdinal - b.sourceOrdinal;
}
function compareCodePoints(left: string, right: string): number {
  const leftPoints = [...left].map(character => character.codePointAt(0)!);
  const rightPoints = [...right].map(character => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index++) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}
function sourceRoleOrder(role: UbsSemanticSourceProvenance['sourceRole']): number {
  return role === 'dictionary' ? 0 : 1;
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON does not permit non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error(`Canonical JSON does not permit ${typeof value}`);
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
