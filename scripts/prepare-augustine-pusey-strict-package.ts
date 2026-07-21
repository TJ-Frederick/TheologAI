#!/usr/bin/env tsx

/**
 * Offline-only strict preparation for Project Gutenberg 3296's English Pusey
 * Confessions text.  This compiler intentionally does not register a corpus,
 * write a manifest/seed/database, or import any runtime surface.
 *
 * The body is a faithful, plain-text package: strict UTF-8 decoding, CRLF to
 * LF, and removal of only Gutenberg's START/END wrappers and their adjacent
 * blank lines.  It makes no network requests and no editorial modernization.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileEditionPackage,
  type CompiledEditionPackage,
  type EditionCompilationPackage,
} from '../src/kernel/editionProvenanceFoundation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIRECTORY = 'data/historical-sources/project-gutenberg/pg3296';
const PACKAGE_PATH = resolve(ROOT, PACKAGE_DIRECTORY, 'augustine-pusey.strict-edition-package.json');
const REPORT_PATH = resolve(ROOT, PACKAGE_DIRECTORY, 'augustine-pusey.strict-normalization-report.json');

const TEXT_PATH = 'data/historical-sources/project-gutenberg/pg3296/pg3296.txt';
const RDF_PATH = 'data/historical-sources/project-gutenberg/pg3296/pg3296.rdf';
const LICENSE_PATH = 'data/historical-sources/project-gutenberg/shared/license.html';

export const AUGUSTINE_PUSEY_STRICT_PATHS = Object.freeze({
  package: `${PACKAGE_DIRECTORY}/augustine-pusey.strict-edition-package.json`,
  report: `${PACKAGE_DIRECTORY}/augustine-pusey.strict-normalization-report.json`,
  text: TEXT_PATH,
  rdf: RDF_PATH,
  license: LICENSE_PATH,
} as const);

export const AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS = Object.freeze([
  {
    role: 'utf8_text',
    sourceUrl: 'https://www.gutenberg.org/cache/epub/3296/pg3296.txt',
    localPath: TEXT_PATH,
    bytes: 632_167,
    sha256: '5a036498dc7c546a98b9e7a31952e030ca74db7dd111b30029354efe12bcd691',
  },
  {
    role: 'rdf_metadata',
    sourceUrl: 'https://www.gutenberg.org/ebooks/3296.rdf',
    localPath: RDF_PATH,
    bytes: 20_797,
    sha256: 'ff7a0b21049a9db1c398f563f68c95383e75e83d8de84366f90b634114647c16',
  },
  {
    role: 'project_gutenberg_license_reference',
    sourceUrl: 'https://www.gutenberg.org/policy/license.html',
    localPath: LICENSE_PATH,
    bytes: 32_318,
    sha256: '3df0bb72fa6820227533369d85ccdfbfae8290a402dc553c6a969f52d7fbf6c9',
  },
] as const);

/** The acquisition evidence establishes a day, not a time of day. */
export const AUGUSTINE_PUSEY_STRICT_ACQUIRED_ON = '2026-07-18';
export const AUGUSTINE_PUSEY_STRICT_CONTENT_UTF8_BYTES = 602_961;
export const AUGUSTINE_PUSEY_STRICT_MAX_SECTION_UTF8_BYTES = 86_537;
export const AUGUSTINE_PUSEY_STRICT_SECTION_KEYS = Object.freeze([
  'front-matter',
  ...Array.from({ length: 13 }, (_, index) => `book-${index + 1}`),
] as const);

/** Pinned deterministic local compilation; changing it requires review. */
export const AUGUSTINE_PUSEY_STRICT_PREPARED_SHA256 = 'bd0fb78a6a1c004b634f2924292b25894f9ec0525981a7372eeeb0167655212b';

type StrictSection = {
  sourceOrdinal: number;
  sectionKey: string;
  displayLabel: string;
  heading: string;
  content: string;
};

export type AugustinePuseyStrictReport = {
  schemaVersion: 'augustine-pusey-strict-normalization-report.v1';
  status: 'inactive_local_preparation';
  sourceArtifacts: readonly {
    role: string;
    sourceUrl: string;
    localPath: string;
    bytes: number;
    sha256: string;
  }[];
  provenance: {
    acquisition: { value: string; precision: 'day'; noInventedTime: true };
    electronicTranscription: {
      releaseDate: '2002-06-01';
      updatedDate: '2023-05-05';
      untypedSourceColophonCredit: string;
      status: 'verified_with_uncertainty';
    };
  };
  rights: {
    status: 'public_domain_in_usa';
    nonUsCaveat: string;
    projectGutenbergPolicyReference: {
      localPath: string;
      sourceUrl: string;
      separateFromDeliveredBody: true;
    };
  };
  normalization: {
    decoder: 'strict_utf8_fatal';
    lineEndingTransformation: 'crlf_to_lf';
    wrapperTransformation: 'gutenberg_start_end_markers_and_adjacent_blank_lines_excluded';
    modernization: 'none';
    contentSha256: string;
    sectionKeys: readonly string[];
    sectionContentUtf8Bytes: readonly number[];
    totalContentUtf8Bytes: number;
    maxSectionUtf8Bytes: number;
  };
  package: {
    path: string;
    schemaVersion: 'edition-provenance-foundation.v1';
    sectionCount: number;
    compiledPackageUtf8Bytes: number;
    compiledPackageSha256: string;
  };
  deterministic: {
    secondCompileSha256: string;
    byteIdentical: true;
  };
  inertness: {
    migration: false;
    transform: false;
    databaseOrD1Seed: false;
    runtimeOrMcpRegistration: false;
    manifestOrCatalog: false;
    deploymentOrWorkflow: false;
  };
};

function fail(message: string): never {
  throw new Error(`[augustine-pusey-strict-package] ${message}`);
}

export function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function strictUtf8(bytes: Uint8Array, label: string): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    fail(`${label} must not contain a UTF-8 BOM`);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} is not strict UTF-8`);
  }
  if (text.includes('\0') || text.includes('\ufffd')) fail(`${label} contains a forbidden NUL or replacement character`);
  if (/\r(?!\n)/.test(text)) fail(`${label} contains a lone carriage return`);
  return text;
}

export function verifyPinnedArtifact(
  artifact: (typeof AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS)[number],
  bytes: Uint8Array,
): string {
  if (bytes.byteLength !== artifact.bytes) fail(`${artifact.localPath} byte count drift`);
  if (sha256(bytes) !== artifact.sha256) fail(`${artifact.localPath} SHA-256 drift`);
  return strictUtf8(bytes, artifact.localPath);
}

function readPinnedArtifact(role: (typeof AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS)[number]['role']): string {
  const artifact = AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS.find(candidate => candidate.role === role);
  if (!artifact) fail(`reviewed ${role} artifact is missing`);
  return verifyPinnedArtifact(artifact, readFileSync(resolve(ROOT, artifact.localPath)));
}

/** Pinning is primary; these facts make the reviewed meaning explicit as well. */
export function verifyPinnedMetadataEvidence(rdf: string, license: string, sourceText: string): void {
  for (const fragment of [
    '<pgterms:ebook rdf:about="ebooks/3296">',
    '<dcterms:rights>Public domain in the USA.</dcterms:rights>',
    '<dcterms:issued rdf:datatype="http://www.w3.org/2001/XMLSchema#date">2002-06-01</dcterms:issued>',
    '<pgterms:name>Pusey, E. B. (Edward Bouverie)</pgterms:name>',
    '<pgterms:marc508>Robert S. Munday</pgterms:marc508>',
    '<rdf:value rdf:datatype="http://purl.org/dc/terms/RFC4646">en</rdf:value>',
    '<pgterms:file rdf:about="https://www.gutenberg.org/ebooks/3296.txt.utf-8">',
  ]) {
    if (!rdf.includes(fragment)) fail(`pinned RDF metadata lacks reviewed evidence: ${fragment}`);
  }
  for (const fragment of [
    'Release date: June 1, 2002 [eBook #3296]',
    'Most recently updated: May 5, 2023',
    'Credits: Robert S. Munday',
  ]) {
    if (!sourceText.includes(fragment)) fail(`pinned text lacks reviewed colophon evidence: ${fragment}`);
  }
  if (!license.includes('Project Gutenberg')) fail('pinned Project Gutenberg policy reference is not recognizable');
}

const START_MARKER = '*** START OF THE PROJECT GUTENBERG EBOOK THE CONFESSIONS OF ST. AUGUSTINE ***';
const END_MARKER = '*** END OF THE PROJECT GUTENBERG EBOOK THE CONFESSIONS OF ST. AUGUSTINE ***';
const ROMAN_TO_ARABIC: Readonly<Record<string, number>> = Object.freeze({
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13,
});

/**
 * This is deliberately the only body transformation boundary.  It preserves
 * all text between the two exact markers after normalizing CRLF to LF and
 * removing only the wrapper-adjacent blank lines.
 */
export function extractNormalizedGutenbergBody(raw: string): string {
  if ((raw.match(/\r\n/g) ?? []).length === 0) fail('pinned UTF-8 text must retain its acquired CRLF representation');
  const text = raw.replace(/\r\n/g, '\n');
  if ((text.match(new RegExp(`^${escapeRegExp(START_MARKER)}$`, 'gm')) ?? []).length !== 1) {
    fail('expected exactly one Project Gutenberg START marker');
  }
  if ((text.match(new RegExp(`^${escapeRegExp(END_MARKER)}$`, 'gm')) ?? []).length !== 1) {
    fail('expected exactly one Project Gutenberg END marker');
  }
  const start = text.indexOf(START_MARKER);
  const end = text.indexOf(END_MARKER);
  if (start < 0 || end <= start) fail('Project Gutenberg wrappers are missing or unordered');
  return text.slice(start + START_MARKER.length, end).replace(/^\n+|\n+$/g, '');
}

export function splitFrozenAugustineSections(body: string): StrictSection[] {
  const boundaries: Array<{ index: number; sectionKey: string; displayLabel: string; heading: string }> = [
    { index: 0, sectionKey: 'front-matter', displayLabel: 'Edition front matter', heading: 'Edition front matter' },
  ];
  for (const match of body.matchAll(/^BOOK (I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII)$/gm)) {
    if (match.index === undefined) fail('book boundary lacks an index');
    const number = ROMAN_TO_ARABIC[match[1]!];
    if (!number) fail(`unreviewed Roman book number: ${match[1]}`);
    boundaries.push({ index: match.index, sectionKey: `book-${number}`, displayLabel: `Book ${match[1]}`, heading: match[0] });
  }
  const sections = boundaries.map((boundary, index) => ({
    sourceOrdinal: index + 1,
    sectionKey: boundary.sectionKey,
    displayLabel: boundary.displayLabel,
    heading: boundary.heading,
    content: body.slice(boundary.index, boundaries[index + 1]?.index ?? body.length),
  }));
  if (sections.length !== 14) fail(`expected exactly 14 frozen sections, received ${sections.length}`);
  if (sections.map(section => section.sectionKey).join('\0') !== AUGUSTINE_PUSEY_STRICT_SECTION_KEYS.join('\0')) {
    fail('frozen front-matter/book-1..book-13 topology drift');
  }
  if (sections.map(section => section.content).join('') !== body) fail('frozen section boundaries must preserve the complete normalized body');
  return sections;
}

export function buildAugustinePuseyStrictPackage(): CompiledEditionPackage {
  const sourceText = readPinnedArtifact('utf8_text');
  const rdf = readPinnedArtifact('rdf_metadata');
  const license = readPinnedArtifact('project_gutenberg_license_reference');
  verifyPinnedMetadataEvidence(rdf, license, sourceText);
  const body = extractNormalizedGutenbergBody(sourceText);
  const sections = splitFrozenAugustineSections(body);
  const totalContentUtf8Bytes = Buffer.byteLength(body);
  const maxSectionUtf8Bytes = Math.max(...sections.map(section => Buffer.byteLength(section.content)));
  if (totalContentUtf8Bytes !== AUGUSTINE_PUSEY_STRICT_CONTENT_UTF8_BYTES) {
    fail(`normalized content byte count drift: expected ${AUGUSTINE_PUSEY_STRICT_CONTENT_UTF8_BYTES}, received ${totalContentUtf8Bytes}`);
  }
  if (maxSectionUtf8Bytes !== AUGUSTINE_PUSEY_STRICT_MAX_SECTION_UTF8_BYTES) {
    fail(`maximum section byte count drift: expected ${AUGUSTINE_PUSEY_STRICT_MAX_SECTION_UTF8_BYTES}, received ${maxSectionUtf8Bytes}`);
  }

  const packageValue: EditionCompilationPackage = {
    schemaVersion: 'edition-provenance-foundation.v1',
    sectionKeyPolicy: 'frozen_reviewed_v1',
    contentFormat: 'plain_text',
    work: {
      workId: 'augustine-confessions',
      title: 'The Confessions of Saint Augustine',
      creatorMetadataStatus: 'reviewed',
      creators: [{ name: 'Augustine of Hippo', role: 'author' }],
    },
    edition: {
      editionId: 'project-gutenberg-3296-pusey-english',
      workId: 'augustine-confessions',
      language: 'en',
      contributorGroups: {
        translation: {
          metadataStatus: 'reviewed',
          contributors: [{ name: 'E. B. Pusey (Edward Bouverie)', role: 'translator' }],
        },
        editing: { metadataStatus: 'unknown', contributors: [] },
        revision: { metadataStatus: 'unknown', contributors: [] },
      },
      publication: 'Project Gutenberg is the evidenced artifact publisher/provider for eBook 3296. The electronic transcription was released 2002-06-01 and updated 2023-05-05. Untyped source-colophon credit: Robert S. Munday. No contributor role is asserted for that credit.',
      version: 'project-gutenberg-3296-2023-05-05',
      source: {
        locator: 'https://www.gutenberg.org/cache/epub/3296/pg3296.txt',
        pin: { kind: 'sha256', value: AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS[0].sha256 },
        sha256: AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS[0].sha256,
        bytes: AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS[0].bytes,
        acquiredAt: AUGUSTINE_PUSEY_STRICT_ACQUIRED_ON,
      },
      underlyingWorkRights: {
        status: 'public_domain',
        basis: 'Augustine’s historical work predates modern copyright terms; this preparation records the reviewed Project Gutenberg USA public-domain evidence separately for the exact electronic artifact.',
        jurisdiction: 'United States',
        evidenceInstrument: {
          instrumentId: 'project-gutenberg-3296-rdf-public-domain-statement',
          kind: 'public_domain_statement',
          label: 'Pinned Project Gutenberg 3296 RDF public-domain statement',
          url: 'https://www.gutenberg.org/ebooks/3296.rdf',
        },
        reviewedAt: '2026-07-20',
      },
      exactArtifactRights: {
        status: 'public_domain',
        basis: 'Pinned Project Gutenberg 3296 RDF states “Public domain in the USA.” The delivered body removes Project Gutenberg wrappers and references; the separate policy reference remains recorded for release review.',
        jurisdiction: 'United States',
        territorialScope: 'United States; users outside the United States must check local law before use or redistribution.',
        rightsInstrument: {
          instrumentId: 'project-gutenberg-3296-rdf-public-domain-statement',
          kind: 'public_domain_statement',
          label: 'Pinned Project Gutenberg 3296 RDF public-domain statement',
          url: 'https://www.gutenberg.org/ebooks/3296.rdf',
        },
        attributionNotice: 'Project Gutenberg policy/reference is retained in the adjacent preparation report and is separate from the delivered body.',
        attributionRequirement: 'project_policy',
        shareAlike: 'not_required',
        modifications: 'permitted',
        modificationTerms: 'This strict preparation changes only CRLF to LF and removes Gutenberg START/END wrappers with adjacent blank lines; no modernization is performed.',
        redistributionApproved: true,
        redistributionApprovedAsOf: '2026-07-20',
        reviewedAt: '2026-07-20',
      },
      provenance: {
        status: 'verified_with_uncertainty',
        uncertainty: 'The pinned source verifies Pusey as translator and identifies the electronic transcription as released in 2002 and updated in 2023. The exact relationship between the historic print edition and this electronic transcription is not independently established. Robert S. Munday is preserved only as an untyped source-colophon credit, without an invented contributor role.',
        reviewedAt: '2026-07-20',
      },
    },
    sections,
  };
  return compileEditionPackage(packageValue);
}

export function buildAugustinePuseyStrictReport(compiled: CompiledEditionPackage): AugustinePuseyStrictReport {
  const second = buildAugustinePuseyStrictPackage();
  if (second.sha256 !== compiled.sha256 || Buffer.compare(Buffer.from(second.utf8), Buffer.from(compiled.utf8)) !== 0) {
    fail('a second offline compilation was not byte-identical');
  }
  const content = compiled.package.sections.map(section => section.content).join('');
  return {
    schemaVersion: 'augustine-pusey-strict-normalization-report.v1',
    status: 'inactive_local_preparation',
    sourceArtifacts: AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS.map(artifact => ({ ...artifact })),
    provenance: {
      acquisition: { value: AUGUSTINE_PUSEY_STRICT_ACQUIRED_ON, precision: 'day', noInventedTime: true },
      electronicTranscription: {
        releaseDate: '2002-06-01',
        updatedDate: '2023-05-05',
        untypedSourceColophonCredit: 'Robert S. Munday; copied from the Project Gutenberg source Credits line with no contributor role asserted.',
        status: 'verified_with_uncertainty',
      },
    },
    rights: {
      status: 'public_domain_in_usa',
      nonUsCaveat: 'Users outside the United States must check local law before use or redistribution.',
      projectGutenbergPolicyReference: {
        localPath: LICENSE_PATH,
        sourceUrl: 'https://www.gutenberg.org/policy/license.html',
        separateFromDeliveredBody: true,
      },
    },
    normalization: {
      decoder: 'strict_utf8_fatal',
      lineEndingTransformation: 'crlf_to_lf',
      wrapperTransformation: 'gutenberg_start_end_markers_and_adjacent_blank_lines_excluded',
      modernization: 'none',
      contentSha256: sha256(content),
      sectionKeys: compiled.package.sections.map(section => section.sectionKey),
      sectionContentUtf8Bytes: compiled.package.sections.map(section => Buffer.byteLength(section.content)),
      totalContentUtf8Bytes: Buffer.byteLength(content),
      maxSectionUtf8Bytes: Math.max(...compiled.package.sections.map(section => Buffer.byteLength(section.content))),
    },
    package: {
      path: AUGUSTINE_PUSEY_STRICT_PATHS.package,
      schemaVersion: 'edition-provenance-foundation.v1',
      sectionCount: compiled.package.sections.length,
      compiledPackageUtf8Bytes: compiled.utf8.byteLength,
      compiledPackageSha256: compiled.sha256,
    },
    deterministic: { secondCompileSha256: second.sha256, byteIdentical: true },
    inertness: {
      migration: false,
      transform: false,
      databaseOrD1Seed: false,
      runtimeOrMcpRegistration: false,
      manifestOrCatalog: false,
      deploymentOrWorkflow: false,
    },
  };
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function verifyCheckedInAugustinePuseyStrictPackage(): {
  compiled: CompiledEditionPackage;
  report: AugustinePuseyStrictReport;
} {
  const compiled = buildAugustinePuseyStrictPackage();
  if (!AUGUSTINE_PUSEY_STRICT_PREPARED_SHA256) fail('prepared SHA-256 has not been pinned');
  if (compiled.sha256 !== AUGUSTINE_PUSEY_STRICT_PREPARED_SHA256) {
    fail(`prepared package SHA-256 drift: expected ${AUGUSTINE_PUSEY_STRICT_PREPARED_SHA256}, received ${compiled.sha256}`);
  }
  const report = buildAugustinePuseyStrictReport(compiled);
  const checkedPackage = strictUtf8(readFileSync(PACKAGE_PATH), AUGUSTINE_PUSEY_STRICT_PATHS.package);
  const checkedReport = strictUtf8(readFileSync(REPORT_PATH), AUGUSTINE_PUSEY_STRICT_PATHS.report);
  if (checkedPackage !== serialize(compiled.package)) fail('checked-in strict package is not the exact deterministic prepared package');
  if (checkedReport !== serialize(report)) fail('checked-in strict normalization report is not the exact deterministic report');
  return { compiled, report };
}

export function writeAugustinePuseyStrictPackage(): {
  compiled: CompiledEditionPackage;
  report: AugustinePuseyStrictReport;
} {
  const compiled = buildAugustinePuseyStrictPackage();
  const report = buildAugustinePuseyStrictReport(compiled);
  writeFileSync(PACKAGE_PATH, serialize(compiled.package));
  writeFileSync(REPORT_PATH, serialize(report));
  return { compiled, report };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === '--verify')) {
    const { compiled } = verifyCheckedInAugustinePuseyStrictPackage();
    process.stdout.write(`verified Augustine/Pusey strict package ${compiled.sha256}\n`);
  } else if (args.length === 1 && args[0] === '--write') {
    const { compiled } = writeAugustinePuseyStrictPackage();
    process.stdout.write(`wrote Augustine/Pusey strict package ${compiled.sha256}\n`);
  } else {
    fail('usage: npx tsx scripts/prepare-augustine-pusey-strict-package.ts [--verify|--write]');
  }
}
