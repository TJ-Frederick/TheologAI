#!/usr/bin/env tsx

/**
 * Offline-only compiler and verifier for the pinned EEBO-TCP A17662 source.
 *
 * This script has no network access and no runtime/catalog/database wiring.
 * It accepts only the vendored XML and source lock, rejects DTD/entity
 * declarations and other non-local XML constructs, and compiles through the
 * inactive PR62 edition-provenance contract.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileEditionPackage,
  EDITION_PROVENANCE_LIMITS,
  type CompiledEditionPackage,
  type EditionCompilationPackage,
} from '../src/kernel/editionProvenanceFoundation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = resolve(ROOT, 'data/historical-sources/eebo-tcp/A17662');
export const SOURCE_LOCK_PATH = resolve(SOURCE_DIR, 'SOURCE.json');
export const SOURCE_XML_PATH = resolve(SOURCE_DIR, 'A17662.xml');
export const SOURCE_RIGHTS_PATH = resolve(SOURCE_DIR, 'README.md');
export const NORMALIZED_PACKAGE_PATH = resolve(SOURCE_DIR, 'norton-1561.edition.json');
export const NORMALIZATION_REPORT_PATH = resolve(SOURCE_DIR, 'NORMALIZATION_REPORT.json');

const SOURCE_COMMIT = '32191150ad4a919dfd2c28c89b1dbc1c2396252a';
const SOURCE_XML_BLOB = '16a1c67eede080180fad5c8f7790eac811255fa6';
const SOURCE_RIGHTS_BLOB = '8acbc19251c8c4bbd3bbdc8a86d1c18a241f1d2a';
const SOURCE_XML_SHA256 = '90124aa3bf17f7dcb5cab40719ed362c91c0018194b7397884b58f6b10daf5a4';
const SOURCE_RIGHTS_SHA256 = '79287eb13717149ec5d3fdbf461b21ebd83aa211745c87c41b23260d5ff87b8a';
const SOURCE_XML_BYTES = 4_820_278;
const SOURCE_RIGHTS_BYTES = 32_260;
const TRANSFORM_VERSION = 1;
const ACQUIRED_AT = '2026-07-17T20:05:08Z';
const XML_LOCAL_PATH = 'data/historical-sources/eebo-tcp/A17662/A17662.xml';
const RIGHTS_LOCAL_PATH = 'data/historical-sources/eebo-tcp/A17662/README.md';
const PACKAGE_LOCAL_PATH = 'data/historical-sources/eebo-tcp/A17662/norton-1561.edition.json';
const REPORT_LOCAL_PATH = 'data/historical-sources/eebo-tcp/A17662/NORMALIZATION_REPORT.json';
const RIGHTS_SCOPE = 'The keyboarded and encoded EEBO-TCP Phase I transcription and XML only.';
const ATTRIBUTION_POLICY = 'Credit Text Creation Partnership, EEBO-TCP Phase I, and A17662 as project policy.';
const MODIFICATION_NOTE = 'TEI structure is converted to PR62 plain-text edition sections; archaic spelling is retained, line-end glyph markers are resolved without modernizing words, gaps, marginal notes, and book trailers remain explicit, page/facsimile pointers are omitted, and no image or CCEL content is included.';

type SourceArtifactRole = 'transcription_xml' | 'rights_and_provenance';

interface SourceArtifactLock {
  role: SourceArtifactRole;
  sourcePath: string;
  sourceUrl: string;
  localPath: string;
  gitBlobSha1: string;
  bytes: number;
  sha256: string;
}

export interface EeboSourceLock {
  schemaVersion: 'eebo-tcp-source-lock.v1';
  sourceId: 'eebo-tcp-a17662-norton-1561';
  repositoryUrl: string;
  sourceCommit: string;
  acquiredAt: string;
  artifacts: SourceArtifactLock[];
  rights: {
    status: 'public_domain_cc0_1_0';
    scope: string;
    instrumentUrl: string;
    tcpLicensingUrl: string;
    attributionPolicy: string;
    excluded: ['page_images', 'facsimiles', 'ccel_material'];
  };
  normalization: {
    transformVersion: 1;
    packagePath: string;
    reportPath: string;
    modificationNote: string;
  };
}

type XmlPart = string | XmlNode;

const LINE_END_JOIN = Symbol('eebo-tcp-line-end-join');
type RenderToken = string | typeof LINE_END_JOIN;

export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  parts: XmlPart[];
}

interface RenderCounters {
  gaps: number;
  marginalNotes: number;
  pageBreaksOmitted: number;
  lineEndHyphensResolved: number;
  lineEndUnhyphensResolved: number;
  unresolvedGlyphMarkers: number;
}

function emptyRenderCounters(): RenderCounters {
  return {
    gaps: 0,
    marginalNotes: 0,
    pageBreaksOmitted: 0,
    lineEndHyphensResolved: 0,
    lineEndUnhyphensResolved: 0,
    unresolvedGlyphMarkers: 0,
  };
}

function addRenderCounters(target: RenderCounters, source: RenderCounters): void {
  for (const key of Object.keys(target) as Array<keyof RenderCounters>) {
    target[key] += source[key];
  }
}

interface DraftSection {
  candidateKey: string;
  displayLabel: string;
  heading: string;
  content: string;
}

export interface NortonNormalizationReport {
  schemaVersion: 'eebo-tcp-normalization-report.v1';
  sourceId: EeboSourceLock['sourceId'];
  transformVersion: 1;
  source: {
    commit: string;
    xmlBlob: string;
    xmlBytes: number;
    xmlSha256: string;
    rightsBlob: string;
    rightsBytes: number;
    rightsSha256: string;
  };
  parser: {
    mode: 'offline_strict_xml_1_0_no_dtd_or_custom_entities';
    externalResolution: false;
    acceptedEntityReferences: ['amp', 'apos', 'gt', 'lt', 'quot', 'numeric_xml_1_0'];
  };
  sourceStructure: {
    books: number;
    chapters: number;
    bookTrailersPreserved: number;
    explicitMilestones: number;
    gaps: number;
    marginalNotes: number;
    pageBreaksOmitted: number;
    lineEndHyphensResolved: number;
    lineEndUnhyphensResolved: number;
    unresolvedGlyphMarkers: number;
  };
  bookChapterMilestoneKeyAssessment: {
    status: 'accepted' | 'rejected';
    candidate: 'book-{book}-chapter-{chapter}-milestone-{milestone}';
    reasons: string[];
    fallback: 'a17662-source-ordinal-{0001}';
    fallbackDisplayLabel: 'Source segment {1}';
  };
  exclusions: {
    imagesVendored: 0;
    facsimilesVendored: 0;
    ccelArtifactsVendored: 0;
    facsimilePointersInNormalizedPackage: 0;
  };
  package: {
    sectionCount: number;
    maxSectionContentUtf8Bytes: number;
    totalContentUtf8Bytes: number;
    compiledPackageUtf8Bytes: number;
    compiledPackageSha256: string;
    limits: {
      sections: number;
      sectionUtf8Bytes: number;
      packageContentUtf8Bytes: number;
      compiledPackageUtf8Bytes: number;
      sourceArtifactBytes: number;
    };
    headroom: {
      sections: number;
      maxSectionContentUtf8Bytes: number;
      packageContentUtf8Bytes: number;
      compiledPackageUtf8Bytes: number;
      sourceArtifactBytes: number;
    };
  };
  deterministic: {
    secondCompileSha256: string;
    byteIdentical: true;
  };
  modificationNote: string;
}

interface BuildResult {
  compiled: CompiledEditionPackage;
  report: NortonNormalizationReport;
}

function fail(message: string): never {
  throw new Error(`[eebo-norton-1561] ${message}`);
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha1(bytes: Buffer): string {
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.byteLength}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

function utf8Length(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    fail(`${label} must contain exactly: ${required.join(', ')}`);
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
  return value;
}

function integerValue(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label} must be a nonnegative safe integer`);
  return value as number;
}

export function parseSourceLock(input: unknown): EeboSourceLock {
  const root = objectValue(input, 'source lock');
  exactKeys(root, [
    'schemaVersion', 'sourceId', 'repositoryUrl', 'sourceCommit', 'acquiredAt',
    'artifacts', 'rights', 'normalization',
  ], 'source lock');
  if (root.schemaVersion !== 'eebo-tcp-source-lock.v1') fail('unsupported source-lock schema');
  if (root.sourceId !== 'eebo-tcp-a17662-norton-1561') fail('unexpected source ID');
  if (root.sourceCommit !== SOURCE_COMMIT) fail('source commit is not the reviewed pin');
  if (root.repositoryUrl !== 'https://github.com/textcreationpartnership/A17662') fail('source repository URL drift');
  const acquiredAt = stringValue(root.acquiredAt, 'source lock acquiredAt');
  if (acquiredAt !== ACQUIRED_AT) fail('source lock acquiredAt drifted from the reviewed acquisition instant');

  if (!Array.isArray(root.artifacts) || root.artifacts.length !== 2) fail('source lock must contain exactly two artifacts');
  const artifacts = root.artifacts.map((raw, index): SourceArtifactLock => {
    const artifact = objectValue(raw, `source artifact ${index + 1}`);
    exactKeys(artifact, ['role', 'sourcePath', 'sourceUrl', 'localPath', 'gitBlobSha1', 'bytes', 'sha256'], `source artifact ${index + 1}`);
    const role = stringValue(artifact.role, `source artifact ${index + 1} role`);
    if (role !== 'transcription_xml' && role !== 'rights_and_provenance') fail(`unknown source artifact role ${role}`);
    return {
      role,
      sourcePath: stringValue(artifact.sourcePath, `${role} sourcePath`),
      sourceUrl: stringValue(artifact.sourceUrl, `${role} sourceUrl`),
      localPath: stringValue(artifact.localPath, `${role} localPath`),
      gitBlobSha1: stringValue(artifact.gitBlobSha1, `${role} gitBlobSha1`),
      bytes: integerValue(artifact.bytes, `${role} bytes`),
      sha256: stringValue(artifact.sha256, `${role} sha256`),
    };
  });
  if (new Set(artifacts.map(artifact => artifact.role)).size !== 2) fail('source artifact roles must be unique');
  if (artifacts[0]!.role !== 'transcription_xml' || artifacts[1]!.role !== 'rights_and_provenance') {
    fail('source artifacts must retain their reviewed order');
  }

  const rights = objectValue(root.rights, 'source rights');
  exactKeys(rights, ['status', 'scope', 'instrumentUrl', 'tcpLicensingUrl', 'attributionPolicy', 'excluded'], 'source rights');
  if (rights.status !== 'public_domain_cc0_1_0') fail('exact transcription rights must remain CC0/public-domain');
  if (!Array.isArray(rights.excluded)
    || JSON.stringify(rights.excluded) !== JSON.stringify(['page_images', 'facsimiles', 'ccel_material'])) {
    fail('source exclusions must remain exact and ordered');
  }

  const normalization = objectValue(root.normalization, 'normalization lock');
  exactKeys(normalization, ['transformVersion', 'packagePath', 'reportPath', 'modificationNote'], 'normalization lock');
  if (normalization.transformVersion !== TRANSFORM_VERSION) fail('unsupported normalization transform');

  const parsed: EeboSourceLock = {
    schemaVersion: 'eebo-tcp-source-lock.v1',
    sourceId: 'eebo-tcp-a17662-norton-1561',
    repositoryUrl: 'https://github.com/textcreationpartnership/A17662',
    sourceCommit: SOURCE_COMMIT,
    acquiredAt,
    artifacts,
    rights: {
      status: 'public_domain_cc0_1_0',
      scope: stringValue(rights.scope, 'source rights scope'),
      instrumentUrl: stringValue(rights.instrumentUrl, 'source rights instrumentUrl'),
      tcpLicensingUrl: stringValue(rights.tcpLicensingUrl, 'source rights tcpLicensingUrl'),
      attributionPolicy: stringValue(rights.attributionPolicy, 'source attribution policy'),
      excluded: ['page_images', 'facsimiles', 'ccel_material'],
    },
    normalization: {
      transformVersion: 1,
      packagePath: stringValue(normalization.packagePath, 'normalization packagePath'),
      reportPath: stringValue(normalization.reportPath, 'normalization reportPath'),
      modificationNote: stringValue(normalization.modificationNote, 'normalization modificationNote'),
    },
  };
  assertReviewedSourceLock(parsed);
  return parsed;
}

function assertReviewedSourceLock(lock: EeboSourceLock): void {
  const xml = lock.artifacts.find(artifact => artifact.role === 'transcription_xml')!;
  const rights = lock.artifacts.find(artifact => artifact.role === 'rights_and_provenance')!;
  const expected = [
    [xml, 'A17662.xml', SOURCE_XML_BLOB, SOURCE_XML_BYTES, SOURCE_XML_SHA256],
    [rights, 'README.md', SOURCE_RIGHTS_BLOB, SOURCE_RIGHTS_BYTES, SOURCE_RIGHTS_SHA256],
  ] as const;
  for (const [artifact, sourcePath, blob, bytes, hash] of expected) {
    const localPath = artifact.role === 'transcription_xml' ? XML_LOCAL_PATH : RIGHTS_LOCAL_PATH;
    if (artifact.sourcePath !== sourcePath || artifact.gitBlobSha1 !== blob
      || artifact.bytes !== bytes || artifact.sha256 !== hash
      || artifact.localPath !== localPath
      || artifact.sourceUrl !== `https://raw.githubusercontent.com/textcreationpartnership/A17662/${SOURCE_COMMIT}/${sourcePath}`) {
      fail(`${artifact.role} does not match the reviewed upstream artifact`);
    }
  }
  if (lock.rights.instrumentUrl !== 'https://creativecommons.org/publicdomain/zero/1.0/'
    || lock.rights.tcpLicensingUrl !== 'https://textcreationpartnership.org/about-the-tcp/about-partner-libraries/licensing-and-access/'
    || lock.rights.scope !== RIGHTS_SCOPE
    || lock.rights.attributionPolicy !== ATTRIBUTION_POLICY) {
    fail('source rights fields drifted from the reviewed evidence');
  }
  if (lock.normalization.packagePath !== PACKAGE_LOCAL_PATH
    || lock.normalization.reportPath !== REPORT_LOCAL_PATH
    || lock.normalization.modificationNote !== MODIFICATION_NOTE) {
    fail('normalization fields drifted from the reviewed contract');
  }
}

function verifyArtifactBytes(bytes: Buffer, artifact: SourceArtifactLock): void {
  if (bytes.byteLength !== artifact.bytes) fail(`${artifact.role} byte drift`);
  if (sha256(bytes) !== artifact.sha256) fail(`${artifact.role} SHA-256 drift`);
  if (gitBlobSha1(bytes) !== artifact.gitBlobSha1) fail(`${artifact.role} Git blob drift`);
}

function isXmlWhitespace(character: string): boolean {
  return character === ' ' || character === '\t' || character === '\r' || character === '\n';
}

function isXml10CodePoint(codePoint: number): boolean {
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd
    || (codePoint >= 0x20 && codePoint <= 0xd7ff)
    || (codePoint >= 0xe000 && codePoint <= 0xfffd)
    || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function assertXml10Characters(input: string): void {
  for (const character of input) {
    const codePoint = character.codePointAt(0)!;
    if (!isXml10CodePoint(codePoint)) fail(`disallowed XML 1.0 code point U+${codePoint.toString(16).toUpperCase()}`);
  }
}

function decodeXmlReferences(value: string): string {
  let cursor = 0;
  let output = '';
  while (cursor < value.length) {
    const ampersand = value.indexOf('&', cursor);
    if (ampersand < 0) return output + value.slice(cursor);
    output += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(';', ampersand + 1);
    if (semicolon < 0) fail('unterminated XML character reference');
    const entity = value.slice(ampersand + 1, semicolon);
    const predefined: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };
    if (predefined[entity] !== undefined) output += predefined[entity];
    else {
      const hex = /^#x([0-9A-Fa-f]+)$/.exec(entity);
      const decimal = /^#([0-9]+)$/.exec(entity);
      if (!hex && !decimal) fail(`custom or malformed XML entity rejected: &${entity};`);
      const codePoint = Number.parseInt((hex?.[1] ?? decimal?.[1])!, hex ? 16 : 10);
      if (!Number.isSafeInteger(codePoint) || !isXml10CodePoint(codePoint)) {
        fail(`disallowed XML character reference: &${entity};`);
      }
      output += String.fromCodePoint(codePoint);
    }
    cursor = semicolon + 1;
  }
  return output;
}

/** Parse one local XML 1.0 document without DTD, custom, or external entities. */
export function parseStrictLocalXml(xml: string | Buffer): XmlNode {
  const input = Buffer.isBuffer(xml)
    ? new TextDecoder('utf-8', { fatal: true }).decode(xml)
    : xml;
  assertXml10Characters(input);
  if (input.includes('<!') || input.includes('<?')) {
    fail('DOCTYPE, entity declarations, comments, CDATA, and processing instructions are rejected');
  }
  let index = input.charCodeAt(0) === 0xfeff ? 1 : 0;

  const readName = (): string => {
    const start = index;
    if (!/[A-Za-z_]/.test(input[index] ?? '')) fail(`invalid XML name at offset ${index}`);
    index++;
    while (/[A-Za-z0-9_.:-]/.test(input[index] ?? '')) index++;
    return input.slice(start, index);
  };
  const skipWhitespace = (): void => {
    while (isXmlWhitespace(input[index] ?? '')) index++;
  };

  const parseElement = (): XmlNode => {
    if (input[index] !== '<') fail(`expected element at offset ${index}`);
    index++;
    if (input[index] === '/' || input[index] === '!' || input[index] === '?') fail(`unexpected XML token at offset ${index - 1}`);
    const name = readName();
    const attributes: Record<string, string> = {};
    skipWhitespace();
    while (input[index] !== '>' && !(input[index] === '/' && input[index + 1] === '>')) {
      if (input[index] == null) fail(`unterminated <${name}>`);
      const attributeName = readName();
      if (Object.hasOwn(attributes, attributeName)) fail(`duplicate attribute ${attributeName} on <${name}>`);
      skipWhitespace();
      if (input[index] !== '=') fail(`attribute ${attributeName} on <${name}> lacks equals`);
      index++;
      skipWhitespace();
      const quote = input[index];
      if (quote !== '"' && quote !== "'") fail(`attribute ${attributeName} on <${name}> must be quoted`);
      index++;
      const end = input.indexOf(quote, index);
      if (end < 0) fail(`unterminated attribute ${attributeName} on <${name}>`);
      const raw = input.slice(index, end);
      if (raw.includes('<')) fail(`attribute ${attributeName} contains a less-than sign`);
      attributes[attributeName] = decodeXmlReferences(raw);
      index = end + 1;
      skipWhitespace();
    }
    if (input.startsWith('/>', index)) {
      index += 2;
      return { name, attributes, parts: [] };
    }
    if (input[index] !== '>') fail(`unterminated start tag <${name}>`);
    index++;
    const parts: XmlPart[] = [];
    while (true) {
      if (index >= input.length) fail(`unterminated <${name}> element`);
      if (input.startsWith('</', index)) {
        index += 2;
        const closing = readName();
        skipWhitespace();
        if (input[index] !== '>') fail(`invalid closing tag for <${name}>`);
        index++;
        if (closing !== name) fail(`closing tag </${closing}> does not match <${name}>`);
        return { name, attributes, parts };
      }
      if (input[index] === '<') parts.push(parseElement());
      else {
        const end = input.indexOf('<', index);
        const next = end < 0 ? input.length : end;
        parts.push(decodeXmlReferences(input.slice(index, next)));
        index = next;
      }
    }
  };

  skipWhitespace();
  const root = parseElement();
  skipWhitespace();
  if (index !== input.length) fail(`unexpected content after XML root at offset ${index}`);
  return root;
}

function childElements(node: XmlNode, name?: string): XmlNode[] {
  return node.parts.filter((part): part is XmlNode => typeof part !== 'string' && (name === undefined || part.name === name));
}

function oneChild(node: XmlNode, name: string): XmlNode {
  const matches = childElements(node, name);
  if (matches.length !== 1) fail(`<${node.name}> must contain exactly one <${name}>`);
  return matches[0]!;
}

function countNodes(node: XmlNode, predicate: (candidate: XmlNode) => boolean): number {
  let count = predicate(node) ? 1 : 0;
  for (const child of childElements(node)) count += countNodes(child, predicate);
  return count;
}

function normalizedText(value: string): string {
  return value.replace(/[\t\r\n ]+/g, ' ');
}

function cleanRendered(value: string): string {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .normalize('NFC');
}

function joinRenderedTokens(tokens: RenderToken[]): string {
  let rendered = '';
  let joinNextText = false;
  for (const token of tokens) {
    if (token === LINE_END_JOIN) {
      if (joinNextText) fail('adjacent line-end join markers are unsupported');
      rendered = rendered.replace(/\s+$/u, '');
      joinNextText = true;
      continue;
    }
    const text = joinNextText ? token.replace(/^\s+/u, '') : token;
    rendered += text;
    if (joinNextText && text.length > 0) joinNextText = false;
  }
  if (joinNextText) fail('line-end join marker has no following text');
  return rendered;
}

const TRANSPARENT_TEXT_ELEMENTS = new Set([
  'am', 'bibl', 'closer', 'date', 'dateline', 'epigraph', 'ex', 'expan',
  'hi', 'label', 'q', 'ref', 'seg', 'signed', 'trailer',
]);
const BLOCK_TEXT_ELEMENTS = new Set(['div', 'head', 'item', 'l', 'list', 'p']);

function renderNode(
  node: XmlNode,
  parts: RenderToken[],
  counters: RenderCounters,
  onMilestone?: (node: XmlNode) => RenderToken[],
): RenderToken[] {
  if (node.name === 'pb') {
    counters.pageBreaksOmitted++;
    return parts;
  }
  if (node.name === 'milestone') {
    if (!onMilestone) fail('milestone occurred outside a reviewed chapter renderer');
    return onMilestone(node);
  }
  if (node.name === 'gap') {
    const reason = node.attributes.reason ?? 'unspecified';
    const extent = node.attributes.extent ?? 'unspecified extent';
    const descriptionNodes = childElements(node, 'desc');
    const unsupportedGapChildren = childElements(node).filter(child => child.name !== 'desc');
    if (descriptionNodes.length !== 1 || unsupportedGapChildren.length > 0) {
      fail('gap must contain exactly one reviewed <desc> child');
    }
    const description = cleanRendered(renderParts(descriptionNodes[0]!.parts, counters));
    parts.push(` ⟦gap: ${reason}; ${extent}${description ? `; marker ${description}` : ''}⟧ `);
    counters.gaps++;
    return parts;
  }
  if (node.name === 'note') {
    if (node.attributes.place !== 'margin') fail('only explicitly marked margin notes are supported');
    const note = cleanRendered(renderParts(node.parts, counters));
    if (!note) fail('empty margin note');
    parts.push(` ⟦margin note: ${note}⟧ `);
    counters.marginalNotes++;
    return parts;
  }
  if (node.name === 'g') {
    const reference = node.attributes.ref;
    if (reference === 'char:EOLhyphen') {
      parts.push(LINE_END_JOIN);
      counters.lineEndHyphensResolved++;
    } else if (reference === 'char:EOLunhyphen') {
      parts.push(LINE_END_JOIN);
      counters.lineEndUnhyphensResolved++;
    } else if (reference === 'char:cmbAbbrStroke' || reference === 'char:punc') {
      for (const part of node.parts) parts = renderPart(part, parts, counters, onMilestone);
    } else if (reference === 'char:abque' && node.parts.length === 0) {
      parts.push(' ⟦unresolved glyph: char:abque⟧ ');
      counters.unresolvedGlyphMarkers++;
    } else {
      fail(`unsupported TEI glyph reference ${JSON.stringify(reference)}`);
    }
    return parts;
  }
  if (!TRANSPARENT_TEXT_ELEMENTS.has(node.name) && !BLOCK_TEXT_ELEMENTS.has(node.name)) {
    fail(`unsupported TEI text element <${node.name}>`);
  }
  const block = BLOCK_TEXT_ELEMENTS.has(node.name);
  if (block) parts.push('\n\n');
  for (const part of node.parts) parts = renderPart(part, parts, counters, onMilestone);
  if (block) parts.push('\n\n');
  return parts;
}

function renderPart(
  part: XmlPart,
  parts: RenderToken[],
  counters: RenderCounters,
  onMilestone?: (node: XmlNode) => RenderToken[],
): RenderToken[] {
  if (typeof part === 'string') {
    parts.push(normalizedText(part));
    return parts;
  }
  return renderNode(part, parts, counters, onMilestone);
}

function renderParts(partsToRender: XmlPart[], counters: RenderCounters): string {
  let parts: RenderToken[] = [];
  for (const part of partsToRender) parts = renderPart(part, parts, counters);
  return cleanRendered(joinRenderedTokens(parts));
}

function directHead(node: XmlNode, counters: RenderCounters): string {
  const head = childElements(node, 'head');
  if (head.length === 0) return '';
  if (head.length > 2
    || (head.length === 2 && head[1]!.attributes.type !== 'sub')) {
    fail(`<${node.name}> contains an unsupported direct-heading structure`);
  }
  return head
    .map(heading => cleanRendered(renderParts(heading.parts, counters)))
    .join(' — ');
}

function withoutDirectHead(node: XmlNode): XmlPart[] {
  return node.parts.filter(part => typeof part === 'string' || part.name !== 'head');
}

function titleCaseIdentifier(value: string): string {
  return value.split('_').map(word => word ? word[0]!.toUpperCase() + word.slice(1) : word).join(' ');
}

function structuralSection(node: XmlNode, context: string, counters: RenderCounters): DraftSection {
  const type = node.attributes.type;
  if (!type) fail(`${context} division lacks type`);
  const heading = directHead(node, counters) || titleCaseIdentifier(type);
  const content = renderParts(withoutDirectHead(node), counters);
  if (!content) fail(`${context} division has no normalizable content`);
  return {
    candidateKey: context,
    displayLabel: context,
    heading,
    content,
  };
}

function renderChapterSegments(
  chapter: XmlNode,
  bookNumber: string,
  chapterNumber: string,
  bookHeading: string,
  counters: RenderCounters,
  assessmentReasons: string[],
): DraftSection[] {
  const milestoneValues: string[] = [];
  const segmentParts: RenderToken[][] = [[]];
  const onMilestone = (milestone: XmlNode): RenderToken[] => {
    const keys = Object.keys(milestone.attributes).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['n', 'type', 'unit'])) {
      assessmentReasons.push(`book ${bookNumber} chapter ${chapterNumber} has a milestone with unexpected attributes`);
    }
    if (milestone.attributes.type !== 'tcpmilestone' || milestone.attributes.unit !== 'unspecified') {
      assessmentReasons.push(`book ${bookNumber} chapter ${chapterNumber} has a non-TCP milestone`);
    }
    const value = milestone.attributes.n ?? '';
    milestoneValues.push(value);
    const nextSegment: string[] = [];
    segmentParts.push(nextSegment);
    return nextSegment;
  };
  let activeParts = segmentParts[0]!;
  for (const part of withoutDirectHead(chapter)) {
    activeParts = renderPart(part, activeParts, counters, onMilestone);
  }
  milestoneValues.forEach((value, index) => {
    const expected = String(index + 2);
    if (value !== expected) {
      assessmentReasons.push(`book ${bookNumber} chapter ${chapterNumber} milestone ${index + 2} is encoded as ${JSON.stringify(value)}`);
    }
  });
  if (new Set(milestoneValues).size !== milestoneValues.length) {
    assessmentReasons.push(`book ${bookNumber} chapter ${chapterNumber} repeats a milestone identifier`);
  }

  const chapterHeading = directHead(chapter, counters) || `Chapter ${chapterNumber}`;
  return segmentParts.flatMap((rawParts, index) => {
    const prefix = index === 0 && bookHeading ? `${bookHeading}\n\n` : '';
    const content = cleanRendered(prefix + joinRenderedTokens(rawParts));
    if (!content) {
      assessmentReasons.push(`book ${bookNumber} chapter ${chapterNumber} milestone segment ${index + 1} is empty`);
      return [];
    }
    return [{
      candidateKey: `book-${bookNumber}-chapter-${chapterNumber}-milestone-${index + 1}`,
      displayLabel: `Book ${bookNumber}, Chapter ${chapterNumber}, § ${index + 1}`,
      heading: chapterHeading,
      content,
    }];
  });
}

interface ReviewedBookChildren {
  chapters: XmlNode[];
  trailer?: XmlNode;
}

export function reviewedBookChildren(book: XmlNode, bookNumber: string): ReviewedBookChildren {
  const children = childElements(book);
  const chapters: XmlNode[] = [];
  let trailer: XmlNode | undefined;
  let stage: 'prefix' | 'chapters' | 'suffix' = 'prefix';
  let headSeen = false;

  for (const part of book.parts) {
    if (typeof part === 'string') {
      if (part.trim()) fail(`book ${bookNumber} contains unreviewed direct text`);
      continue;
    }
    if (!['pb', 'head', 'div', 'trailer'].includes(part.name)) {
      fail(`book ${bookNumber} contains unreviewed book-level <${part.name}>`);
    }
  }

  for (const child of children) {
    if (stage === 'prefix' && child.name === 'pb') continue;
    if (stage === 'prefix' && child.name === 'head' && !headSeen) {
      headSeen = true;
      stage = 'chapters';
      continue;
    }
    if (stage === 'chapters' && child.name === 'div') {
      chapters.push(child);
      continue;
    }
    if (stage === 'chapters' && child.name === 'trailer' && chapters.length > 0) {
      if (Object.keys(child.attributes).length !== 0) {
        fail(`book ${bookNumber} trailer has unreviewed attributes`);
      }
      trailer = child;
      stage = 'suffix';
      continue;
    }
    if (stage === 'suffix' && child.name === 'pb') continue;
    fail(`book ${bookNumber} has unreviewed book-level order at <${child.name}>`);
  }
  if (!headSeen || chapters.length === 0) {
    fail(`book ${bookNumber} must contain one heading followed by chapters`);
  }
  return { chapters, trailer };
}

function collectDraftSections(text: XmlNode, counters: RenderCounters): {
  drafts: DraftSection[];
  books: number;
  chapters: number;
  bookTrailersPreserved: number;
  explicitMilestones: number;
  assessmentReasons: string[];
} {
  const front = oneChild(text, 'front');
  const body = oneChild(text, 'body');
  const back = oneChild(text, 'back');
  const drafts: DraftSection[] = [];
  const assessmentReasons: string[] = [];

  for (const division of childElements(front, 'div')) {
    drafts.push(structuralSection(division, `front-${division.attributes.type ?? 'unknown'}`, counters));
  }

  const books = childElements(body, 'div');
  let bookTrailersPreserved = 0;
  books.forEach((book, bookIndex) => {
    const bookNumber = book.attributes.n ?? '';
    if (book.attributes.type !== 'book' || bookNumber !== String(bookIndex + 1)) {
      assessmentReasons.push(`body book ${bookIndex + 1} has noncanonical type or n`);
    }
    const bookHeading = directHead(book, counters);
    const reviewed = reviewedBookChildren(book, bookNumber || String(bookIndex + 1));
    const chapters = reviewed.chapters;
    const bookDraftStart = drafts.length;
    chapters.forEach((chapter, chapterIndex) => {
      const chapterNumber = chapter.attributes.n ?? '';
      if (chapter.attributes.type !== 'chapter' || chapterNumber !== String(chapterIndex + 1)) {
        assessmentReasons.push(`book ${bookNumber || bookIndex + 1} chapter ${chapterIndex + 1} has noncanonical type or n`);
      }
      drafts.push(...renderChapterSegments(
        chapter,
        bookNumber || String(bookIndex + 1),
        chapterNumber || String(chapterIndex + 1),
        chapterIndex === 0 ? bookHeading : '',
        counters,
        assessmentReasons,
      ));
    });
    const expectedTrailer = bookNumber === '1'
      ? 'The ende of the fyrst booke.'
      : bookNumber === '3'
        ? 'The ende of the third Boke.'
        : undefined;
    if (Boolean(reviewed.trailer) !== Boolean(expectedTrailer)) {
      fail(`book ${bookNumber || bookIndex + 1} trailer presence drifted from the reviewed source`);
    }
    if (reviewed.trailer) {
      const trailerText = renderParts(reviewed.trailer.parts, counters);
      if (trailerText !== expectedTrailer) {
        fail(`book ${bookNumber || bookIndex + 1} trailer text drifted from the reviewed source`);
      }
      const finalDraft = drafts.at(-1);
      if (!finalDraft || drafts.length === bookDraftStart) {
        fail(`book ${bookNumber || bookIndex + 1} trailer has no preceding chapter segment`);
      }
      finalDraft.content = cleanRendered(`${finalDraft.content}\n\n${trailerText}`);
      bookTrailersPreserved++;
    }
  });

  for (const division of childElements(back, 'div')) {
    const context = `back-${division.attributes.type ?? 'unknown'}`;
    const speculativeCounters = emptyRenderCounters();
    const whole = structuralSection(division, context, speculativeCounters);
    if (utf8Length(whole.content) <= EDITION_PROVENANCE_LIMITS.sectionUtf8Bytes) {
      addRenderCounters(counters, speculativeCounters);
      drafts.push(whole);
      continue;
    }
    const nested = childElements(division, 'div');
    if (nested.length === 0) fail(`${context} exceeds the section cap and has no reviewed structural split`);
    const prefix = renderParts(division.parts.filter(part =>
      typeof part === 'string' || (part.name !== 'head' && part.name !== 'div')), counters);
    if (prefix) {
      drafts.push({
        candidateKey: `${context}-preface`,
        displayLabel: `${context}-preface`,
        heading: whole.heading,
        content: prefix,
      });
    }
    nested.forEach((child, index) => {
      drafts.push(structuralSection(child, `${context}-${child.attributes.n ?? index + 1}`, counters));
    });
  }

  const chapterCount = books.reduce((total, book) => total + childElements(book, 'div').length, 0);
  const explicitMilestones = countNodes(body, node => node.name === 'milestone');
  return {
    drafts,
    books: books.length,
    chapters: chapterCount,
    bookTrailersPreserved,
    explicitMilestones,
    assessmentReasons,
  };
}

function compilationPackage(
  lock: EeboSourceLock,
  drafts: DraftSection[],
  milestoneKeysAccepted: boolean,
): EditionCompilationPackage {
  const xmlArtifact = lock.artifacts.find(artifact => artifact.role === 'transcription_xml')!;
  return {
    schemaVersion: 'edition-provenance-foundation.v1',
    sectionKeyPolicy: 'frozen_reviewed_v1',
    contentFormat: 'plain_text',
    work: {
      workId: 'calvin-institutes-of-the-christian-religion',
      title: 'Institutes of the Christian Religion',
      creatorMetadataStatus: 'reviewed',
      creators: [{ name: 'Jean Calvin (1509–1564)', role: 'author' }],
    },
    edition: {
      editionId: 'calvin-institutes-norton-1561-eebo-tcp-a17662',
      workId: 'calvin-institutes-of-the-christian-religion',
      language: 'en',
      contributorGroups: {
        translation: {
          metadataStatus: 'reviewed',
          contributors: [{ name: 'Thomas Norton (1532–1584)', role: 'translator' }],
        },
        editing: {
          metadataStatus: 'collective',
          contributors: [{ name: 'Text Creation Partnership', role: 'editorial_body' }],
        },
        revision: { metadataStatus: 'none', contributors: [] },
      },
      publication: 'Imprinted at London by Reinolde Wolfe and Richarde Harison, 1561; keyboarded and encoded by Text Creation Partnership, EEBO-TCP Phase I, 2003.',
      version: `A17662 at Git commit ${SOURCE_COMMIT}; normalization transform ${TRANSFORM_VERSION}`,
      source: {
        locator: xmlArtifact.sourceUrl,
        pin: { kind: 'git_commit', value: lock.sourceCommit },
        sha256: xmlArtifact.sha256,
        bytes: xmlArtifact.bytes,
        acquiredAt: lock.acquiredAt,
      },
      underlyingWorkRights: {
        status: 'public_domain',
        basis: 'The source work and this English translation were published in 1561, centuries before the current United States public-domain cutoff for published works.',
        jurisdiction: 'United States',
        evidenceInstrument: {
          instrumentId: 'us-copyright-office-public-domain-duration',
          kind: 'public_domain_statement',
          label: 'U.S. Copyright Office — What is Copyright?',
          url: 'https://www.copyright.gov/what-is-copyright/',
        },
        reviewedAt: '2026-07-17',
      },
      exactArtifactRights: {
        status: 'public_domain',
        basis: 'The pinned per-work EEBO-TCP README states that this Phase I keyboarded and encoded text is available under CC0 1.0 Universal. This approval covers the transcription and XML, not page images or facsimiles.',
        jurisdiction: 'United States',
        territorialScope: 'Worldwide under the CC0 1.0 Universal public-domain dedication and fallback terms',
        rightsInstrument: {
          instrumentId: 'creative-commons-cc0-1.0',
          kind: 'public_domain_statement',
          label: 'Creative Commons CC0 1.0 Universal',
          url: lock.rights.instrumentUrl,
        },
        attributionNotice: 'Text Creation Partnership, EEBO-TCP Phase I, A17662; derived normalization by TheologAI.',
        attributionRequirement: 'project_policy',
        shareAlike: 'not_required',
        modifications: 'permitted',
        modificationTerms: lock.normalization.modificationNote,
        redistributionApproved: true,
        redistributionApprovedAsOf: '2026-07-17',
        reviewedAt: '2026-07-17',
      },
      provenance: {
        status: 'verified_with_uncertainty',
        uncertainty: 'The pinned XML identifies the 1561 Norton translation and its source copy, but page images were deliberately not acquired or rechecked. EEBO-TCP reports light-touch diplomatic transcription, remaining transcription errors, and explicit illegible gaps.',
        reviewedAt: '2026-07-17',
      },
    },
    sections: drafts.map((draft, index) => ({
      sourceOrdinal: index + 1,
      sectionKey: milestoneKeysAccepted
        ? draft.candidateKey
        : `a17662-source-ordinal-${String(index + 1).padStart(4, '0')}`,
      displayLabel: milestoneKeysAccepted ? draft.displayLabel : `Source segment ${index + 1}`,
      heading: draft.heading,
      content: draft.content,
    })),
  };
}

export function buildNortonNormalization(
  sourceXmlBytes: Buffer,
  rightsBytes: Buffer,
  lockInput: unknown,
): BuildResult {
  const lock = parseSourceLock(lockInput);
  verifyArtifactBytes(sourceXmlBytes, lock.artifacts.find(artifact => artifact.role === 'transcription_xml')!);
  verifyArtifactBytes(rightsBytes, lock.artifacts.find(artifact => artifact.role === 'rights_and_provenance')!);
  const rightsText = new TextDecoder('utf-8', { fatal: true }).decode(rightsBytes);
  const normalizedRightsText = normalizedText(rightsText);
  if (!normalizedRightsText.includes('Creative Commons 0 1.0 Universal')
    || !normalizedRightsText.includes('all without asking permission')) {
    fail('vendored rights artifact does not contain the reviewed CC0 grant');
  }

  const root = parseStrictLocalXml(sourceXmlBytes);
  if (root.name !== 'TEI' || root.attributes.xmlns !== 'http://www.tei-c.org/ns/1.0'
    || Object.keys(root.attributes).length !== 1) {
    fail('source must be the expected TEI namespace root');
  }
  oneChild(root, 'teiHeader');
  const text = oneChild(root, 'text');
  if (text.attributes['xml:lang'] !== 'eng' || Object.keys(text.attributes).length !== 1) {
    fail('TEI text must retain the reviewed English language marker');
  }
  const counters = emptyRenderCounters();
  const collected = collectDraftSections(text, counters);
  const sourcePageBreaks = countNodes(text, node => node.name === 'pb');
  if (counters.pageBreaksOmitted > sourcePageBreaks) {
    fail('normalization counted more omitted page breaks than the source contains');
  }
  // Seven page-break markers sit on structural wrappers outside the rendered
  // section bodies. They are still source facsimile pointers deliberately
  // omitted from the normalized package, so the report records the source total.
  counters.pageBreaksOmitted = sourcePageBreaks;
  const sourceMilestones = countNodes(text, node => node.name === 'milestone');
  if (sourceMilestones !== collected.explicitMilestones) {
    collected.assessmentReasons.push(`${sourceMilestones - collected.explicitMilestones} milestone(s) occur outside body chapters`);
  }
  const milestoneKeysAccepted = collected.assessmentReasons.length === 0;
  const packageInput = compilationPackage(lock, collected.drafts, milestoneKeysAccepted);
  const compiled = compileEditionPackage(packageInput);
  const second = compileEditionPackage(packageInput);
  if (compiled.canonicalJson !== second.canonicalJson || compiled.sha256 !== second.sha256) {
    fail('normalization is not byte-deterministic');
  }
  if (compiled.canonicalJson.includes('tcp:7550:') || compiled.canonicalJson.includes('facs=')) {
    fail('normalized package retained a facsimile pointer');
  }
  if (compiled.package.sections.some(section => /ccel/i.test(
    `${section.displayLabel}\n${section.heading}\n${section.content}`,
  ))) fail('normalized section content contains CCEL material');
  if (counters.gaps !== 1_999 || counters.marginalNotes !== 3_203
    || counters.pageBreaksOmitted !== 1_044 || counters.lineEndHyphensResolved !== 10_424
    || counters.lineEndUnhyphensResolved !== 115 || counters.unresolvedGlyphMarkers !== 2
    || collected.bookTrailersPreserved !== 2) {
    fail(`reviewed TEI preservation/omission counts drifted: ${JSON.stringify({
      ...counters,
      bookTrailersPreserved: collected.bookTrailersPreserved,
    })}`);
  }

  const sectionBytes = compiled.package.sections.map(section => utf8Length(section.content));
  const totalContentBytes = sectionBytes.reduce((total, bytes) => total + bytes, 0);
  const maxSectionBytes = Math.max(...sectionBytes);
  const report: NortonNormalizationReport = {
    schemaVersion: 'eebo-tcp-normalization-report.v1',
    sourceId: lock.sourceId,
    transformVersion: 1,
    source: {
      commit: lock.sourceCommit,
      xmlBlob: SOURCE_XML_BLOB,
      xmlBytes: sourceXmlBytes.byteLength,
      xmlSha256: sha256(sourceXmlBytes),
      rightsBlob: SOURCE_RIGHTS_BLOB,
      rightsBytes: rightsBytes.byteLength,
      rightsSha256: sha256(rightsBytes),
    },
    parser: {
      mode: 'offline_strict_xml_1_0_no_dtd_or_custom_entities',
      externalResolution: false,
      acceptedEntityReferences: ['amp', 'apos', 'gt', 'lt', 'quot', 'numeric_xml_1_0'],
    },
    sourceStructure: {
      books: collected.books,
      chapters: collected.chapters,
      bookTrailersPreserved: collected.bookTrailersPreserved,
      explicitMilestones: collected.explicitMilestones,
      ...counters,
    },
    bookChapterMilestoneKeyAssessment: {
      status: milestoneKeysAccepted ? 'accepted' : 'rejected',
      candidate: 'book-{book}-chapter-{chapter}-milestone-{milestone}',
      reasons: [...new Set(collected.assessmentReasons)].sort(),
      fallback: 'a17662-source-ordinal-{0001}',
      fallbackDisplayLabel: 'Source segment {1}',
    },
    exclusions: {
      imagesVendored: 0,
      facsimilesVendored: 0,
      ccelArtifactsVendored: 0,
      facsimilePointersInNormalizedPackage: 0,
    },
    package: {
      sectionCount: compiled.package.sections.length,
      maxSectionContentUtf8Bytes: maxSectionBytes,
      totalContentUtf8Bytes: totalContentBytes,
      compiledPackageUtf8Bytes: compiled.utf8.byteLength,
      compiledPackageSha256: compiled.sha256,
      limits: {
        sections: EDITION_PROVENANCE_LIMITS.sections,
        sectionUtf8Bytes: EDITION_PROVENANCE_LIMITS.sectionUtf8Bytes,
        packageContentUtf8Bytes: EDITION_PROVENANCE_LIMITS.packageContentUtf8Bytes,
        compiledPackageUtf8Bytes: EDITION_PROVENANCE_LIMITS.compiledPackageUtf8Bytes,
        sourceArtifactBytes: EDITION_PROVENANCE_LIMITS.sourceArtifactBytes,
      },
      headroom: {
        sections: EDITION_PROVENANCE_LIMITS.sections - compiled.package.sections.length,
        maxSectionContentUtf8Bytes: EDITION_PROVENANCE_LIMITS.sectionUtf8Bytes - maxSectionBytes,
        packageContentUtf8Bytes: EDITION_PROVENANCE_LIMITS.packageContentUtf8Bytes - totalContentBytes,
        compiledPackageUtf8Bytes: EDITION_PROVENANCE_LIMITS.compiledPackageUtf8Bytes - compiled.utf8.byteLength,
        sourceArtifactBytes: EDITION_PROVENANCE_LIMITS.sourceArtifactBytes - sourceXmlBytes.byteLength,
      },
    },
    deterministic: {
      secondCompileSha256: second.sha256,
      byteIdentical: true,
    },
    modificationNote: lock.normalization.modificationNote,
  };
  return { compiled, report };
}

function stableReportJson(report: NortonNormalizationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function writeNortonNormalization(): BuildResult {
  const lockInput = JSON.parse(readFileSync(SOURCE_LOCK_PATH, 'utf8')) as unknown;
  const result = buildNortonNormalization(
    readFileSync(SOURCE_XML_PATH),
    readFileSync(SOURCE_RIGHTS_PATH),
    lockInput,
  );
  mkdirSync(dirname(NORMALIZED_PACKAGE_PATH), { recursive: true });
  writeFileSync(NORMALIZED_PACKAGE_PATH, result.compiled.canonicalJson, 'utf8');
  writeFileSync(NORMALIZATION_REPORT_PATH, stableReportJson(result.report), 'utf8');
  return result;
}

export function verifyCheckedInNortonNormalization(): BuildResult {
  const lockInput = JSON.parse(readFileSync(SOURCE_LOCK_PATH, 'utf8')) as unknown;
  const result = buildNortonNormalization(
    readFileSync(SOURCE_XML_PATH),
    readFileSync(SOURCE_RIGHTS_PATH),
    lockInput,
  );
  const packageBytes = readFileSync(NORMALIZED_PACKAGE_PATH);
  const reportBytes = readFileSync(NORMALIZATION_REPORT_PATH, 'utf8');
  if (!packageBytes.equals(Buffer.from(result.compiled.canonicalJson, 'utf8'))) {
    fail('checked-in normalized package is not byte-identical to offline compilation');
  }
  if (reportBytes !== stableReportJson(result.report)) {
    fail('checked-in normalization report is not byte-identical to offline inspection');
  }
  return result;
}

function main(): void {
  const command = process.argv[2] ?? '--verify';
  const result = command === '--write'
    ? writeNortonNormalization()
    : command === '--verify'
      ? verifyCheckedInNortonNormalization()
      : fail('usage: normalize-eebo-tcp-norton-1561.ts [--write|--verify]');
  console.error(
    `[eebo-norton-1561] ${command === '--write' ? 'wrote' : 'verified'} `
    + `${result.report.package.sectionCount} sections; `
    + `${result.report.package.totalContentUtf8Bytes} content bytes; `
    + `${result.report.package.compiledPackageUtf8Bytes} package bytes; `
    + `milestone keys ${result.report.bookChapterMilestoneKeyAssessment.status}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
