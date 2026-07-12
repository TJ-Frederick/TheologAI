/**
 * Strict, runtime-neutral repository for the generated UBS/Paratext artifact.
 *
 * This module deliberately has no Node APIs and accepts injected data, so the
 * same validated lookup implementation can be used with a Node file loader or
 * a Worker JSON-module import.
 */

import { findBookByHelloaoCode, findBookByNumber, getBibleBookBounds } from '../../kernel/books.js';
import { parseSourceAttestedLookupReference } from '../../kernel/sourceAttestedReference.js';
import {
  computeUbsParallelArtifactIdentity,
  deriveUbsParallelGroupId,
  UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY,
  UBS_PARALLEL_PASSAGE_PROVENANCE,
} from '../../kernel/ubsParallelSource.js';
import type {
  ISourceAttestedParallelRepository,
  ParallelSourceProvenance,
  SourceAttestedParallelGroup,
  SourceParallelMember,
  SourceParallelReferenceSegment,
} from '../../kernel/sourceAttestedParallels.js';

interface ReferenceIndexEntry {
  groupId: string;
  memberOrder: number;
  segmentOrder: number;
  startVerse: number;
  endVerse: number;
}

export interface ValidatedUbsCorpus {
  schemaVersion: 'ubs-parallel-passages.v2';
  transformVersion: 2;
  artifactIdentity: string;
  label: 'source_attested_parallel';
  directionality: 'unspecified';
  license: { name: string; url: string };
  provenance: ParallelSourceProvenance;
  groups: SourceAttestedParallelGroup[];
  referenceIndex: Record<string, ReferenceIndexEntry[]>;
}

const TOP_LEVEL_KEYS = [
  'schemaVersion', 'transformVersion', 'artifactIdentity', 'label', 'directionality',
  'license', 'provenance', 'groups', 'referenceIndex',
] as const;
const PROVENANCE_KEYS = [
  'sourceId', 'title', 'publisher', 'copyright', 'license', 'licenseUrl',
  'sourceUrl', 'sourcePath', 'sourceCommit', 'sourceCommitDate', 'sourceBlob',
  'sourceBytes', 'sourceSha256', 'transformVersion', 'modified', 'modificationNote',
] as const;
const GROUP_KEYS = ['groupId', 'sourceOrdinal', 'label', 'directionality', 'members', 'provenance'] as const;
const MEMBER_KEYS = [
  'sourceOrder', 'sourceReference', 'normalizedReference', 'segments',
  'languageMarker', 'alignmentBasis', 'alignmentRaw',
] as const;
const SEGMENT_KEYS = ['bookNumber', 'chapter', 'startVerse', 'endVerse'] as const;
const INDEX_KEYS = ['groupId', 'memberOrder', 'segmentOrder', 'startVerse', 'endVerse'] as const;

export class UbsParallelPassageRepository implements ISourceAttestedParallelRepository {
  private readonly provenance: Readonly<ParallelSourceProvenance>;
  private readonly groupsById = new Map<string, SourceAttestedParallelGroup>();
  private readonly referenceIndex: Readonly<Record<string, readonly ReferenceIndexEntry[]>>;

  constructor(artifact: unknown, expectedArtifactIdentity = UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY) {
    const corpus = validateUbsParallelArtifact(artifact, expectedArtifactIdentity);
    this.provenance = Object.freeze({ ...corpus.provenance });
    for (const group of corpus.groups) this.groupsById.set(group.groupId, deepFreezeGroup(group));
    this.referenceIndex = corpus.referenceIndex;
  }

  findGroups(reference: string, maxGroups = Number.POSITIVE_INFINITY): readonly SourceAttestedParallelGroup[] {
    if (maxGroups !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(maxGroups) || maxGroups < 1)) {
      throw new Error('maxGroups must be a positive safe integer');
    }
    const parsed = parseSourceAttestedLookupReference(reference);
    if (parsed.segments.length > 8) throw new Error('reference exceeds the reviewed 8-segment query bound');
    const groupIds = new Set<string>();
    for (const segment of parsed.segments) {
      const entries = this.referenceIndex[`${segment.bookNumber}:${segment.chapter}`] ?? [];
      for (const entry of entries) {
        if (entry.startVerse <= segment.endVerse && segment.startVerse <= entry.endVerse) groupIds.add(entry.groupId);
      }
    }
    return [...groupIds]
      .map(groupId => this.groupsById.get(groupId)!)
      .sort((left, right) => left.sourceOrdinal - right.sourceOrdinal)
      .slice(0, maxGroups);
  }

  getProvenance(): Readonly<ParallelSourceProvenance> {
    return this.provenance;
  }
}

export function validateUbsParallelArtifact(input: unknown, expectedArtifactIdentity = UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY): ValidatedUbsCorpus {
  const corpus = record(input, 'artifact');
  exactKeys(corpus, TOP_LEVEL_KEYS, 'artifact');
  equal(corpus.schemaVersion, 'ubs-parallel-passages.v2', 'artifact.schemaVersion');
  equal(corpus.transformVersion, 2, 'artifact.transformVersion');
  const artifactIdentity = string(corpus.artifactIdentity, 'artifact.artifactIdentity');
  if (!/^[0-9a-f]{64}$/.test(expectedArtifactIdentity)) fail('expected artifact identity is invalid');
  equal(artifactIdentity, expectedArtifactIdentity, 'artifact.artifactIdentity pin');
  const { artifactIdentity: _excludedIdentity, ...identityProjection } = corpus;
  equal(artifactIdentity, computeUbsParallelArtifactIdentity(identityProjection), 'artifact.artifactIdentity derivation');
  equal(corpus.label, 'source_attested_parallel', 'artifact.label');
  equal(corpus.directionality, 'unspecified', 'artifact.directionality');
  const license = record(corpus.license, 'artifact.license');
  exactKeys(license, ['name', 'url'], 'artifact.license');
  equal(license.name, 'CC BY-SA 4.0', 'artifact.license.name');
  equal(license.url, 'https://creativecommons.org/licenses/by-sa/4.0/', 'artifact.license.url');
  const provenance = validateProvenance(corpus.provenance, 'artifact.provenance');
  if (canonicalJson(provenance) !== canonicalJson(UBS_PARALLEL_PASSAGE_PROVENANCE)) {
    fail('artifact.provenance differs from the reviewed UBS source descriptor');
  }
  equal(provenance.license, license.name, 'artifact provenance/license');
  equal(provenance.licenseUrl, license.url, 'artifact provenance/licenseUrl');
  equal(provenance.transformVersion, corpus.transformVersion, 'artifact provenance/transformVersion');

  if (!Array.isArray(corpus.groups) || corpus.groups.length === 0) fail('artifact.groups must be a non-empty array');
  const groups = corpus.groups.map((group, index) => validateUbsParallelGroup(group, index + 1, provenance));
  const groupIds = new Set<string>();
  for (const group of groups) {
    if (groupIds.has(group.groupId)) fail(`duplicate group ID ${group.groupId}`);
    groupIds.add(group.groupId);
  }

  const referenceIndex = validateIndex(corpus.referenceIndex, groups);
  return {
    schemaVersion: 'ubs-parallel-passages.v2', transformVersion: 2, artifactIdentity,
    label: 'source_attested_parallel', directionality: 'unspecified',
    license: { name: license.name as string, url: license.url as string },
    provenance, groups, referenceIndex,
  };
}

/**
 * Strictly attest one reconstructed UBS group against the same invariants used
 * for the reviewed generated artifact. This is intentionally runtime-neutral
 * so storage adapters cannot return merely well-shaped but semantically
 * corrupted rows.
 */
export function validateUbsParallelGroup(
  input: unknown,
  expectedOrdinal: number,
  provenance: ParallelSourceProvenance,
): SourceAttestedParallelGroup {
  const group = record(input, `group ${expectedOrdinal}`);
  exactKeys(group, GROUP_KEYS, `group ${expectedOrdinal}`);
  const groupId = string(group.groupId, `group ${expectedOrdinal}.groupId`);
  if (!/^ubs-pp-[0-9a-f]{64}$/.test(groupId)) fail(`group ${expectedOrdinal}.groupId is invalid`);
  integer(group.sourceOrdinal, `group ${expectedOrdinal}.sourceOrdinal`, 1);
  equal(group.sourceOrdinal, expectedOrdinal, `group ${expectedOrdinal}.sourceOrdinal`);
  equal(group.label, 'source_attested_parallel', `group ${expectedOrdinal}.label`);
  equal(group.directionality, 'unspecified', `group ${expectedOrdinal}.directionality`);
  const groupProvenance = validateProvenance(group.provenance, `group ${expectedOrdinal}.provenance`);
  if (canonicalJson(groupProvenance) !== canonicalJson(provenance)) fail(`group ${expectedOrdinal} provenance differs from corpus provenance`);
  if (!Array.isArray(group.members) || group.members.length < 2) fail(`group ${expectedOrdinal}.members must contain at least two members`);
  const members = group.members.map((member, index) => validateMember(member, index + 1, expectedOrdinal));
  equal(groupId, deriveUbsParallelGroupId(members), `group ${expectedOrdinal}.groupId derivation`);
  const mixed = new Set(members.map(member => member.languageMarker)).size === 2;
  for (const member of members) {
    const expectedBasis = member.languageMarker === 'GRK' ? 'UBSGNT5' : mixed ? 'LXX' : 'BHS';
    if (member.alignmentBasis !== expectedBasis) fail(`group ${expectedOrdinal}.member ${member.sourceOrder} alignment basis conflicts with group composition`);
  }
  return {
    groupId,
    sourceOrdinal: expectedOrdinal,
    label: 'source_attested_parallel',
    directionality: 'unspecified',
    members,
    provenance: groupProvenance,
  };
}

function validateMember(input: unknown, expectedOrder: number, groupOrdinal: number): SourceParallelMember {
  const path = `group ${groupOrdinal}.member ${expectedOrder}`;
  const member = record(input, path);
  exactKeys(member, MEMBER_KEYS, path);
  integer(member.sourceOrder, `${path}.sourceOrder`, 1);
  equal(member.sourceOrder, expectedOrder, `${path}.sourceOrder`);
  const sourceReference = string(member.sourceReference, `${path}.sourceReference`);
  if (sourceReference !== sourceReference.trim()) fail(`${path}.sourceReference must preserve a canonical source locator without outer whitespace`);
  const normalizedReference = string(member.normalizedReference, `${path}.normalizedReference`);
  if (!Array.isArray(member.segments) || member.segments.length === 0) fail(`${path}.segments must be non-empty`);
  const segments = member.segments.map((segment, index) => validateSegment(segment, `${path}.segment ${index + 1}`));
  const sourceMatch = /^([A-Z0-9]{3}) ([^\s].*)$/.exec(sourceReference);
  const sourceBook = sourceMatch ? findBookByHelloaoCode(sourceMatch[1]) : undefined;
  if (!sourceMatch || !sourceBook) fail(`${path}.sourceReference is invalid`);
  let parsedSource;
  try {
    parsedSource = parseSourceAttestedLookupReference(`${sourceBook.name} ${sourceMatch[2]}`);
  } catch {
    fail(`${path}.sourceReference is invalid`);
  }
  if (parsedSource.normalizedReference !== normalizedReference || canonicalJson(parsedSource.segments) !== canonicalJson(segments)) {
    fail(`${path} source and normalized reference segments differ`);
  }
  equal(member.languageMarker === 'HEB' || member.languageMarker === 'GRK', true, `${path}.languageMarker`);
  equal(['BHS', 'LXX', 'UBSGNT5'].includes(member.alignmentBasis as string), true, `${path}.alignmentBasis`);
  if (member.languageMarker === 'GRK' && member.alignmentBasis !== 'UBSGNT5') fail(`${path} has an invalid Greek alignment basis`);
  if (member.languageMarker === 'HEB' && !['BHS', 'LXX'].includes(member.alignmentBasis as string)) fail(`${path} has an invalid Hebrew alignment basis`);
  const alignmentRaw = string(member.alignmentRaw, `${path}.alignmentRaw`);
  if (!/^[0-8]+$/.test(alignmentRaw)) fail(`${path}.alignmentRaw contains an undocumented code`);
  return {
    sourceOrder: expectedOrder,
    sourceReference,
    normalizedReference,
    segments,
    languageMarker: member.languageMarker as 'HEB' | 'GRK',
    alignmentBasis: member.alignmentBasis as 'BHS' | 'LXX' | 'UBSGNT5',
    alignmentRaw,
  };
}

function validateSegment(input: unknown, path: string): SourceParallelReferenceSegment {
  const segment = record(input, path);
  exactKeys(segment, SEGMENT_KEYS, path);
  const bookNumber = integer(segment.bookNumber, `${path}.bookNumber`, 1);
  const book = findBookByNumber(bookNumber);
  if (!book) fail(`${path}.bookNumber is outside the canonical 66-book registry`);
  const chapter = integer(segment.chapter, `${path}.chapter`, 1);
  const startVerse = integer(segment.startVerse, `${path}.startVerse`, 1);
  const endVerse = integer(segment.endVerse, `${path}.endVerse`, startVerse);
  const bounds = getBibleBookBounds(book);
  // UBS locators retain source-language versification, which can exceed the
  // English-oriented verse maxima (for example Psalm 18:51). Chapter bounds
  // remain canonical, while positive source verse numbers are preserved.
  if (chapter > bounds.maxVerseByChapter.length) fail(`${path} is outside canonical chapter bounds`);
  return { bookNumber, chapter, startVerse, endVerse };
}

function validateIndex(input: unknown, groups: SourceAttestedParallelGroup[]): Record<string, ReferenceIndexEntry[]> {
  const actual = record(input, 'artifact.referenceIndex');
  const expected: Record<string, ReferenceIndexEntry[]> = {};
  for (const group of groups) {
    for (const member of group.members) {
      member.segments.forEach((segment, segmentIndex) => {
        const key = `${segment.bookNumber}:${segment.chapter}`;
        (expected[key] ??= []).push({
          groupId: group.groupId,
          memberOrder: member.sourceOrder,
          segmentOrder: segmentIndex + 1,
          startVerse: segment.startVerse,
          endVerse: segment.endVerse,
        });
      });
    }
  }
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected).sort();
  if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) fail('artifact.referenceIndex keys or source ordering are invalid');
  const validated: Record<string, ReferenceIndexEntry[]> = {};
  for (const key of expectedKeys) {
    if (!/^([1-9]|[1-5]\d|6[0-6]):[1-9]\d*$/.test(key)) fail(`invalid reference index key ${key}`);
    const entries = actual[key];
    if (!Array.isArray(entries)) fail(`reference index ${key} must be an array`);
    validated[key] = entries.map((entry, index) => {
      const path = `reference index ${key}[${index}]`;
      const row = record(entry, path);
      exactKeys(row, INDEX_KEYS, path);
      return {
        groupId: string(row.groupId, `${path}.groupId`),
        memberOrder: integer(row.memberOrder, `${path}.memberOrder`, 1),
        segmentOrder: integer(row.segmentOrder, `${path}.segmentOrder`, 1),
        startVerse: integer(row.startVerse, `${path}.startVerse`, 1),
        endVerse: integer(row.endVerse, `${path}.endVerse`, 1),
      };
    });
    if (canonicalJson(validated[key]) !== canonicalJson(expected[key])) fail(`reference index ${key} does not exactly represent group segments`);
    Object.freeze(validated[key]);
  }
  return Object.freeze(validated);
}

function validateProvenance(input: unknown, path: string): ParallelSourceProvenance {
  const value = record(input, path);
  exactKeys(value, PROVENANCE_KEYS, path);
  const result = Object.fromEntries(PROVENANCE_KEYS.map(key => [key, value[key]])) as unknown as ParallelSourceProvenance;
  for (const key of PROVENANCE_KEYS) {
    if (key === 'sourceBytes' || key === 'transformVersion') integer(result[key], `${path}.${key}`, 1);
    else if (key === 'modified') equal(result.modified, true, `${path}.modified`);
    else string(result[key], `${path}.${key}`);
  }
  if (!/^[0-9a-f]{40}$/.test(result.sourceCommit)) fail(`${path}.sourceCommit is invalid`);
  if (!/^[0-9a-f]{40}$/.test(result.sourceBlob)) fail(`${path}.sourceBlob is invalid`);
  if (!/^[0-9a-f]{64}$/.test(result.sourceSha256)) fail(`${path}.sourceSha256 is invalid`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.sourceCommitDate)) fail(`${path}.sourceCommitDate is invalid`);
  return result;
}

function deepFreezeGroup(group: SourceAttestedParallelGroup): SourceAttestedParallelGroup {
  Object.freeze(group.provenance);
  for (const member of group.members) {
    for (const segment of member.segments) Object.freeze(segment);
    Object.freeze(member.segments);
    Object.freeze(member);
  }
  Object.freeze(group.members);
  return Object.freeze(group);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) fail(`${path} contains missing or unknown fields`);
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${path} must be a non-empty string`);
  return value;
}

function integer(value: unknown, path: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(`${path} must be a safe integer >= ${minimum}`);
  return value as number;
}

function equal(actual: unknown, expected: unknown, path: string): void {
  if (actual !== expected) fail(`${path} is invalid`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function fail(message: string): never {
  throw new Error(`[ubs-repository] ${message}`);
}
