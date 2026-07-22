/**
 * Inert compiler/auditor for the future large historical-work delivery
 * contract. It deliberately has no runtime registration, database writes,
 * network access, or source acquisition behavior.
 *
 * The only currently prepared target is the already-vendored EEBO-TCP A17662
 * Norton package. A later, separately approved transform 9 may consume this
 * reviewed plan only after transform 8 compatibility support is available.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileEditionPackage,
  type EditionCompilationPackage,
} from '../src/kernel/editionProvenanceFoundation.js';

export const HISTORICAL_SECTIONED_DELIVERY_SCHEMA_VERSION = 1 as const;
export const HISTORICAL_SECTIONED_DELIVERY_KIND = 'historical_sectioned_delivery_norton_transform9_preparation' as const;
export const HISTORICAL_SECTIONED_DELIVERY_CURSOR_VERSION = 'historical-sectioned-only-cursor-v1' as const;
export const NORTON_TRANSFORM9_PLAN_PATH = 'test/fixtures/historical-sectioned-delivery/norton-transform9-preparation.draft.json' as const;
export const NORTON_GATE1_PACKAGE_PATH = 'data/historical-sources/eebo-tcp/A17662/norton-1561.edition.json' as const;
export const NORTON_GATE1_PACKAGE_SHA256 = '3054f4446b2e92af87c1713ee1c44d6745bca42a32aed7c67890d25fedbdff33' as const;
export const NORTON_GATE1_PACKAGE_BYTES = 4_058_506 as const;
export const NORTON_WORK_ID = 'calvin-institutes-of-the-christian-religion' as const;
export const NORTON_EDITION_ID = 'calvin-institutes-norton-1561-eebo-tcp-a17662' as const;
export const NORTON_DOCUMENT_ID = NORTON_EDITION_ID;
export const NORTON_SECTION_COUNT = 1_250 as const;
export const NORTON_SECTION_KEY_PREFIX = 'a17662-source-ordinal-' as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR_BINDINGS = [
  'contractVersion',
  'documentId',
  'editionId',
  'immutableCorpusIdentity',
  'pageSize',
  'lastSourceOrdinal',
  'lastSectionKey',
] as const;
const BROWSE_ENTRY_FIELDS = [
  'sourceOrdinal',
  'sectionKey',
  'displayLabel',
  'heading',
  'resourceUri',
] as const;
const LANDING_FIELDS = [
  'workId',
  'editionId',
  'title',
  'language',
  'sectionCount',
  'browseContract',
] as const;

export interface HistoricalSectionedDeliveryPlan {
  schemaVersion: 1;
  kind: typeof HISTORICAL_SECTIONED_DELIVERY_KIND;
  runtimeStatus: 'inactive_until_transform_9';
  delivery: {
    mode: 'sectioned_only';
    wholeDocumentResource: {
      representation: 'bounded_landing_metadata_only';
      maxUtf8Bytes: 16_384;
      fields: typeof LANDING_FIELDS[number][];
      sectionDirectory: 'not_included';
      body: 'not_included';
    };
    browse: {
      maxSectionEntries: 32;
      entryFields: typeof BROWSE_ENTRY_FIELDS[number][];
      body: 'not_included';
      nativeResourceLinks: 'exact_section_only';
      cursor: {
        version: typeof HISTORICAL_SECTIONED_DELIVERY_CURSOR_VERSION;
        bindings: typeof CURSOR_BINDINGS[number][];
      };
    };
    exactSectionResource: {
      body: 'only_body_delivery_route';
    };
  };
  transform: {
    targetTransformVersion: 9;
    predecessor: {
      transformVersion: 8;
      scope: 'existing_17_historical_documents_only';
    };
    migrationStatus: 'not_authorized';
    dataManifestStatus: 'unchanged';
  };
  work: {
    workId: typeof NORTON_WORK_ID;
    title: 'Institutes of the Christian Religion';
    composition: {
      startYear: 1536;
      endYear: 1559;
      statement: 'successive Latin editions; final Latin edition 1559';
    };
    metadataProvenance: {
      authority: 'Bibliotheque nationale de France canonical work record';
      locator: 'https://catalogue.bnf.fr/ark:/12148/cb11963198n';
      reviewedAt: string;
    };
  };
  edition: {
    documentId: typeof NORTON_DOCUMENT_ID;
    editionId: typeof NORTON_EDITION_ID;
    workId: typeof NORTON_WORK_ID;
    language: 'en';
    publication: {
      year: 1561;
      statement: 'London: Reinolde Wolfe and Richarde Harison, 1561';
    };
    editionProvenance: {
      sourceId: 'eebo-tcp-a17662-norton-1561';
      sourceCommit: '32191150ad4a919dfd2c28c89b1dbc1c2396252a';
      reviewedAt: string;
      exactArtifactStatus: 'verified_with_uncertainty';
    };
  };
  gate1Package: {
    path: typeof NORTON_GATE1_PACKAGE_PATH;
    sha256: typeof NORTON_GATE1_PACKAGE_SHA256;
    bytes: typeof NORTON_GATE1_PACKAGE_BYTES;
    sectionCount: typeof NORTON_SECTION_COUNT;
    sectionKeys: {
      prefix: typeof NORTON_SECTION_KEY_PREFIX;
      first: 'a17662-source-ordinal-0001';
      last: 'a17662-source-ordinal-1250';
    };
  };
  genericAliasStatus: 'dormant_until_future_activation';
}

export interface NortonTransform9PreparationAudit {
  documentId: string;
  workId: string;
  editionId: string;
  sectionCount: number;
  packageSha256: string;
  packageBytes: number;
  firstSectionKey: string;
  lastSectionKey: string;
  browseMaxSectionEntries: number;
}

export class HistoricalSectionedDeliveryValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'HistoricalSectionedDeliveryValidationError';
  }
}

/**
 * Strictly parse the checked-in, inert contract. This deliberately accepts no
 * generic large-work configuration: its sole purpose is to freeze the reviewed
 * Norton transform-9 preparation before a later activation decision.
 */
export function parseHistoricalSectionedDeliveryPlan(input: unknown): HistoricalSectionedDeliveryPlan {
  const root = objectAt(input, '$', [
    'schemaVersion', 'kind', 'runtimeStatus', 'delivery', 'transform', 'work',
    'edition', 'gate1Package', 'genericAliasStatus',
  ]);
  literalAt(root.schemaVersion, '$.schemaVersion', HISTORICAL_SECTIONED_DELIVERY_SCHEMA_VERSION);
  literalAt(root.kind, '$.kind', HISTORICAL_SECTIONED_DELIVERY_KIND);
  literalAt(root.runtimeStatus, '$.runtimeStatus', 'inactive_until_transform_9');
  literalAt(root.genericAliasStatus, '$.genericAliasStatus', 'dormant_until_future_activation');

  const delivery = parseDelivery(root.delivery);
  const transform = parseTransform(root.transform);
  const work = parseWork(root.work);
  const edition = parseEdition(root.edition);
  const gate1Package = parseGate1Package(root.gate1Package);

  if (edition.workId !== work.workId) fail('$.edition.workId', 'must exactly match $.work.workId');
  if (edition.editionId !== edition.documentId) {
    fail('$.edition.editionId', 'must be the edition-specific document identity while generic aliases remain dormant');
  }
  return {
    schemaVersion: HISTORICAL_SECTIONED_DELIVERY_SCHEMA_VERSION,
    kind: HISTORICAL_SECTIONED_DELIVERY_KIND,
    runtimeStatus: 'inactive_until_transform_9',
    delivery,
    transform,
    work,
    edition,
    gate1Package,
    genericAliasStatus: 'dormant_until_future_activation',
  };
}

/**
 * Audit the existing Gate 1 package against the inert plan. It reads only
 * local, already-vendored bytes and has no write, network, database, or
 * runtime-registration side effect.
 */
export function verifyNortonTransform9Preparation(
  rootDirectory = fileURLToPath(new URL('../', import.meta.url)),
  rawPlan: unknown = readJsonAt(rootDirectory, NORTON_TRANSFORM9_PLAN_PATH),
): NortonTransform9PreparationAudit {
  const plan = parseHistoricalSectionedDeliveryPlan(rawPlan);
  const bytes = readFileSync(resolve(rootDirectory, plan.gate1Package.path));
  if (bytes.byteLength !== plan.gate1Package.bytes) {
    fail('$.gate1Package.bytes', `does not match local Gate 1 byte count ${bytes.byteLength}`);
  }
  const rawSha256 = sha256(bytes);
  if (rawSha256 !== plan.gate1Package.sha256) {
    fail('$.gate1Package.sha256', 'does not match the local Gate 1 package bytes');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('$.gate1Package.path', 'does not contain JSON');
  }
  const compiled = compileEditionPackage(parsed);
  if (compiled.sha256 !== plan.gate1Package.sha256) {
    fail('$.gate1Package.sha256', 'does not match the canonical Gate 1 package identity');
  }
  if (!bytes.equals(Buffer.from(compiled.utf8))) {
    fail('$.gate1Package.path', 'must remain the exact canonical Gate 1 package bytes');
  }
  verifyPackageIdentity(plan, compiled.package);

  return {
    documentId: plan.edition.documentId,
    workId: plan.work.workId,
    editionId: plan.edition.editionId,
    sectionCount: compiled.package.sections.length,
    packageSha256: compiled.sha256,
    packageBytes: bytes.byteLength,
    firstSectionKey: compiled.package.sections[0]!.sectionKey,
    lastSectionKey: compiled.package.sections.at(-1)!.sectionKey,
    browseMaxSectionEntries: plan.delivery.browse.maxSectionEntries,
  };
}

function parseDelivery(input: unknown): HistoricalSectionedDeliveryPlan['delivery'] {
  const path = '$.delivery';
  const root = objectAt(input, path, ['mode', 'wholeDocumentResource', 'browse', 'exactSectionResource']);
  literalAt(root.mode, `${path}.mode`, 'sectioned_only');

  const whole = objectAt(root.wholeDocumentResource, `${path}.wholeDocumentResource`, [
    'representation', 'maxUtf8Bytes', 'fields', 'sectionDirectory', 'body',
  ]);
  literalAt(whole.representation, `${path}.wholeDocumentResource.representation`, 'bounded_landing_metadata_only');
  literalAt(whole.maxUtf8Bytes, `${path}.wholeDocumentResource.maxUtf8Bytes`, 16_384);
  literalArrayAt(whole.fields, `${path}.wholeDocumentResource.fields`, LANDING_FIELDS);
  literalAt(whole.sectionDirectory, `${path}.wholeDocumentResource.sectionDirectory`, 'not_included');
  literalAt(whole.body, `${path}.wholeDocumentResource.body`, 'not_included');

  const browse = objectAt(root.browse, `${path}.browse`, [
    'maxSectionEntries', 'entryFields', 'body', 'nativeResourceLinks', 'cursor',
  ]);
  literalAt(browse.maxSectionEntries, `${path}.browse.maxSectionEntries`, 32);
  literalArrayAt(browse.entryFields, `${path}.browse.entryFields`, BROWSE_ENTRY_FIELDS);
  literalAt(browse.body, `${path}.browse.body`, 'not_included');
  literalAt(browse.nativeResourceLinks, `${path}.browse.nativeResourceLinks`, 'exact_section_only');
  const cursor = objectAt(browse.cursor, `${path}.browse.cursor`, ['version', 'bindings']);
  literalAt(cursor.version, `${path}.browse.cursor.version`, HISTORICAL_SECTIONED_DELIVERY_CURSOR_VERSION);
  literalArrayAt(cursor.bindings, `${path}.browse.cursor.bindings`, CURSOR_BINDINGS);

  const exact = objectAt(root.exactSectionResource, `${path}.exactSectionResource`, ['body']);
  literalAt(exact.body, `${path}.exactSectionResource.body`, 'only_body_delivery_route');

  return {
    mode: 'sectioned_only',
    wholeDocumentResource: {
      representation: 'bounded_landing_metadata_only',
      maxUtf8Bytes: 16_384,
      fields: [...LANDING_FIELDS],
      sectionDirectory: 'not_included',
      body: 'not_included',
    },
    browse: {
      maxSectionEntries: 32,
      entryFields: [...BROWSE_ENTRY_FIELDS],
      body: 'not_included',
      nativeResourceLinks: 'exact_section_only',
      cursor: { version: HISTORICAL_SECTIONED_DELIVERY_CURSOR_VERSION, bindings: [...CURSOR_BINDINGS] },
    },
    exactSectionResource: { body: 'only_body_delivery_route' },
  };
}

function parseTransform(input: unknown): HistoricalSectionedDeliveryPlan['transform'] {
  const root = objectAt(input, '$.transform', [
    'targetTransformVersion', 'predecessor', 'migrationStatus', 'dataManifestStatus',
  ]);
  literalAt(root.targetTransformVersion, '$.transform.targetTransformVersion', 9);
  const predecessor = objectAt(root.predecessor, '$.transform.predecessor', ['transformVersion', 'scope']);
  literalAt(predecessor.transformVersion, '$.transform.predecessor.transformVersion', 8);
  literalAt(predecessor.scope, '$.transform.predecessor.scope', 'existing_17_historical_documents_only');
  literalAt(root.migrationStatus, '$.transform.migrationStatus', 'not_authorized');
  literalAt(root.dataManifestStatus, '$.transform.dataManifestStatus', 'unchanged');
  return {
    targetTransformVersion: 9,
    predecessor: { transformVersion: 8, scope: 'existing_17_historical_documents_only' },
    migrationStatus: 'not_authorized',
    dataManifestStatus: 'unchanged',
  };
}

function parseWork(input: unknown): HistoricalSectionedDeliveryPlan['work'] {
  const root = objectAt(input, '$.work', ['workId', 'title', 'composition', 'metadataProvenance']);
  literalAt(root.workId, '$.work.workId', NORTON_WORK_ID);
  literalAt(root.title, '$.work.title', 'Institutes of the Christian Religion');
  const composition = objectAt(root.composition, '$.work.composition', ['startYear', 'endYear', 'statement']);
  literalAt(composition.startYear, '$.work.composition.startYear', 1536);
  literalAt(composition.endYear, '$.work.composition.endYear', 1559);
  literalAt(composition.statement, '$.work.composition.statement', 'successive Latin editions; final Latin edition 1559');
  const provenance = objectAt(root.metadataProvenance, '$.work.metadataProvenance', ['authority', 'locator', 'reviewedAt']);
  literalAt(provenance.authority, '$.work.metadataProvenance.authority', 'Bibliotheque nationale de France canonical work record');
  literalAt(provenance.locator, '$.work.metadataProvenance.locator', 'https://catalogue.bnf.fr/ark:/12148/cb11963198n');
  return {
    workId: NORTON_WORK_ID,
    title: 'Institutes of the Christian Religion',
    composition: { startYear: 1536, endYear: 1559, statement: 'successive Latin editions; final Latin edition 1559' },
    metadataProvenance: {
      authority: 'Bibliotheque nationale de France canonical work record',
      locator: 'https://catalogue.bnf.fr/ark:/12148/cb11963198n',
      reviewedAt: dateAt(provenance.reviewedAt, '$.work.metadataProvenance.reviewedAt'),
    },
  };
}

function parseEdition(input: unknown): HistoricalSectionedDeliveryPlan['edition'] {
  const root = objectAt(input, '$.edition', [
    'documentId', 'editionId', 'workId', 'language', 'publication', 'editionProvenance',
  ]);
  literalAt(root.documentId, '$.edition.documentId', NORTON_DOCUMENT_ID);
  literalAt(root.editionId, '$.edition.editionId', NORTON_EDITION_ID);
  literalAt(root.workId, '$.edition.workId', NORTON_WORK_ID);
  literalAt(root.language, '$.edition.language', 'en');
  const publication = objectAt(root.publication, '$.edition.publication', ['year', 'statement']);
  literalAt(publication.year, '$.edition.publication.year', 1561);
  literalAt(publication.statement, '$.edition.publication.statement', 'London: Reinolde Wolfe and Richarde Harison, 1561');
  const provenance = objectAt(root.editionProvenance, '$.edition.editionProvenance', [
    'sourceId', 'sourceCommit', 'reviewedAt', 'exactArtifactStatus',
  ]);
  literalAt(provenance.sourceId, '$.edition.editionProvenance.sourceId', 'eebo-tcp-a17662-norton-1561');
  literalAt(provenance.sourceCommit, '$.edition.editionProvenance.sourceCommit', '32191150ad4a919dfd2c28c89b1dbc1c2396252a');
  literalAt(provenance.exactArtifactStatus, '$.edition.editionProvenance.exactArtifactStatus', 'verified_with_uncertainty');
  return {
    documentId: NORTON_DOCUMENT_ID,
    editionId: NORTON_EDITION_ID,
    workId: NORTON_WORK_ID,
    language: 'en',
    publication: { year: 1561, statement: 'London: Reinolde Wolfe and Richarde Harison, 1561' },
    editionProvenance: {
      sourceId: 'eebo-tcp-a17662-norton-1561',
      sourceCommit: '32191150ad4a919dfd2c28c89b1dbc1c2396252a',
      reviewedAt: dateAt(provenance.reviewedAt, '$.edition.editionProvenance.reviewedAt'),
      exactArtifactStatus: 'verified_with_uncertainty',
    },
  };
}

function parseGate1Package(input: unknown): HistoricalSectionedDeliveryPlan['gate1Package'] {
  const root = objectAt(input, '$.gate1Package', ['path', 'sha256', 'bytes', 'sectionCount', 'sectionKeys']);
  literalAt(root.path, '$.gate1Package.path', NORTON_GATE1_PACKAGE_PATH);
  literalAt(root.sha256, '$.gate1Package.sha256', NORTON_GATE1_PACKAGE_SHA256);
  literalAt(root.bytes, '$.gate1Package.bytes', NORTON_GATE1_PACKAGE_BYTES);
  literalAt(root.sectionCount, '$.gate1Package.sectionCount', NORTON_SECTION_COUNT);
  const sectionKeys = objectAt(root.sectionKeys, '$.gate1Package.sectionKeys', ['prefix', 'first', 'last']);
  literalAt(sectionKeys.prefix, '$.gate1Package.sectionKeys.prefix', NORTON_SECTION_KEY_PREFIX);
  literalAt(sectionKeys.first, '$.gate1Package.sectionKeys.first', sectionKeyForOrdinal(1));
  literalAt(sectionKeys.last, '$.gate1Package.sectionKeys.last', sectionKeyForOrdinal(NORTON_SECTION_COUNT));
  return {
    path: NORTON_GATE1_PACKAGE_PATH,
    sha256: NORTON_GATE1_PACKAGE_SHA256,
    bytes: NORTON_GATE1_PACKAGE_BYTES,
    sectionCount: NORTON_SECTION_COUNT,
    sectionKeys: {
      prefix: NORTON_SECTION_KEY_PREFIX,
      first: 'a17662-source-ordinal-0001',
      last: 'a17662-source-ordinal-1250',
    },
  };
}

function verifyPackageIdentity(plan: HistoricalSectionedDeliveryPlan, packageValue: EditionCompilationPackage): void {
  if (packageValue.work.workId !== plan.work.workId) fail('$.work.workId', 'does not match the Gate 1 package');
  if (packageValue.work.title !== plan.work.title) fail('$.work.title', 'does not match the Gate 1 package');
  if (packageValue.edition.editionId !== plan.edition.editionId) fail('$.edition.editionId', 'does not match the Gate 1 package');
  if (packageValue.edition.workId !== plan.edition.workId) fail('$.edition.workId', 'does not match the Gate 1 package');
  if (packageValue.edition.language !== plan.edition.language) fail('$.edition.language', 'does not match the Gate 1 package');
  if (packageValue.edition.source.pin.value !== plan.edition.editionProvenance.sourceCommit) {
    fail('$.edition.editionProvenance.sourceCommit', 'does not match the Gate 1 package source pin');
  }
  if (packageValue.edition.provenance.status !== plan.edition.editionProvenance.exactArtifactStatus) {
    fail('$.edition.editionProvenance.exactArtifactStatus', 'does not match the Gate 1 provenance status');
  }
  if (packageValue.sections.length !== plan.gate1Package.sectionCount) {
    fail('$.gate1Package.sectionCount', `does not match the Gate 1 section count ${packageValue.sections.length}`);
  }
  for (const [index, section] of packageValue.sections.entries()) {
    const ordinal = index + 1;
    if (section.sourceOrdinal !== ordinal) fail(`$.sections[${index}].sourceOrdinal`, 'does not preserve the frozen source order');
    const expected = sectionKeyForOrdinal(ordinal);
    if (section.sectionKey !== expected) fail(`$.sections[${index}].sectionKey`, `must be ${expected}`);
  }
}

export function sectionKeyForOrdinal(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > NORTON_SECTION_COUNT) {
    throw new RangeError(`Norton source ordinal must be an integer from 1 through ${NORTON_SECTION_COUNT}`);
  }
  return `${NORTON_SECTION_KEY_PREFIX}${String(ordinal).padStart(4, '0')}`;
}

function readJsonAt(rootDirectory: string, path: string): unknown {
  try {
    return JSON.parse(readFileSync(resolve(rootDirectory, path), 'utf8'));
  } catch (error) {
    throw new HistoricalSectionedDeliveryValidationError(path, error instanceof Error ? error.message : 'cannot read JSON');
  }
}

function objectAt(input: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail(path, 'must be an object');
  const actual = Object.keys(input).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(path, `must contain exactly: ${expected.join(', ')}`);
  }
  return input as Record<string, unknown>;
}

function literalAt(input: unknown, path: string, expected: string | number): void {
  if (input !== expected) fail(path, `must be ${JSON.stringify(expected)}`);
}

function literalArrayAt(input: unknown, path: string, expected: readonly string[]): void {
  if (!Array.isArray(input) || input.length !== expected.length || input.some((value, index) => value !== expected[index])) {
    fail(path, `must be exactly [${expected.map(value => JSON.stringify(value)).join(', ')}]`);
  }
}

function dateAt(input: unknown, path: string): string {
  if (typeof input !== 'string' || !ISO_DATE.test(input)) fail(path, 'must be an ISO calendar date');
  const [year, month, day] = input.split('-').map(Number) as [number, number, number];
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]!) {
    fail(path, 'must be a real UTC calendar date');
  }
  return input;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function fail(path: string, message: string): never {
  throw new HistoricalSectionedDeliveryValidationError(path, message);
}

const invokedPath = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedPath) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== '--verify') {
    throw new Error('usage: historical-sectioned-delivery.ts --verify');
  }
  process.stdout.write(`${JSON.stringify(verifyNortonTransform9Preparation())}\n`);
}
