#!/usr/bin/env tsx

/** Compile the pinned UBS/Paratext XML snapshot into deterministic JSON. */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findBookByHelloaoCode,
  getBibleBookBounds,
  type BibleBook,
} from '../src/kernel/books.js';
import type {
  ParallelSourceProvenance as KernelParallelSourceProvenance,
  SourceAttestedParallelGroup as KernelSourceAttestedParallelGroup,
  SourceParallelAlignmentBasis,
  SourceParallelLanguageMarker,
  SourceParallelMember as KernelSourceParallelMember,
  SourceParallelReferenceSegment,
} from '../src/kernel/sourceAttestedParallels.js';

export const TRANSFORM_VERSION = 1;
export const LABEL = 'source_attested_parallel' as const;
export const DIRECTIONALITY = 'unspecified' as const;

export interface SourceMetadata {
  sourceId: string;
  title: string;
  publisher: string;
  copyright: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  sourcePath: string;
  sourceCommit: string;
  sourceCommitDate: string;
  sourceBlob: string;
  sourceBytes: number;
  sourceSha256: string;
  transformVersion: number;
}

export const PROVENANCE_FIELDS = [
  'sourceId',
  'title',
  'publisher',
  'copyright',
  'license',
  'licenseUrl',
  'sourceUrl',
  'sourcePath',
  'sourceCommit',
  'sourceCommitDate',
  'sourceBlob',
  'sourceBytes',
  'sourceSha256',
  'transformVersion',
] as const satisfies readonly (keyof SourceMetadata)[];

export function assertProvenanceMatches(left: SourceMetadata, right: SourceMetadata): void {
  const canonicalFields = [...PROVENANCE_FIELDS].sort();
  for (const [label, value] of [['left', left], ['right', right]] as const) {
    if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(canonicalFields)) {
      throw new Error(`[ubs-provenance] ${label} metadata contains noncanonical fields`);
    }
  }
  for (const field of PROVENANCE_FIELDS) {
    if (left[field] !== right[field]) {
      throw new Error(`[ubs-provenance] ${field} differs between canonical metadata records`);
    }
  }
}

export type ReferenceSegment = SourceParallelReferenceSegment;
export type LanguageMarker = SourceParallelLanguageMarker;
export type AlignmentBasis = SourceParallelAlignmentBasis;
export type SourceParallelMember = KernelSourceParallelMember;
export type ParallelSourceProvenance = KernelParallelSourceProvenance;
export type SourceAttestedParallelGroup = KernelSourceAttestedParallelGroup;

export interface ReferenceIndexEntry {
  groupId: string;
  memberOrder: number;
  segmentOrder: number;
  startVerse: number;
  endVerse: number;
}

export interface GeneratedUbsCorpus {
  schemaVersion: 'ubs-parallel-passages.v1';
  transformVersion: typeof TRANSFORM_VERSION;
  label: typeof LABEL;
  directionality: typeof DIRECTIONALITY;
  license: {
    name: 'CC BY-SA 4.0';
    url: string;
  };
  provenance: ParallelSourceProvenance;
  groups: SourceAttestedParallelGroup[];
  referenceIndex: Record<string, ReferenceIndexEntry[]>;
}

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  text: string;
  children: XmlNode[];
}

interface ParsedVerse {
  marker: LanguageMarker;
  alignmentRaw: string;
  sourceReference: string;
}

interface ParsedPassage {
  verses: ParsedVerse[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
export const DEFAULT_SOURCE_PATH = join(ROOT, 'data/parallel-passages/ubs-paratext/ParallelPassages.xml');
export const DEFAULT_METADATA_PATH = join(ROOT, 'data/parallel-passages/ubs-paratext/SOURCE.json');
export const DEFAULT_OUTPUT_PATH = join(ROOT, 'src/data/ubs-parallel-passages.generated.json');

const MODIFICATION_NOTE =
  'References and alignment metadata normalized for local lookup; UBS group membership and member order preserved.';

function fail(message: string): never {
  throw new Error(`[ubs-compiler] ${message}`);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha(bytes: Buffer): string {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return createHash('sha1').update(Buffer.concat([header, bytes])).digest('hex');
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\r' || char === '\n';
}

function isXml10CodePoint(codePoint: number): boolean {
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd
    || (codePoint >= 0x20 && codePoint <= 0xd7ff)
    || (codePoint >= 0xe000 && codePoint <= 0xfffd)
    || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function assertXml10Characters(input: string): void {
  let offset = 0;
  for (const character of input) {
    const codePoint = character.codePointAt(0)!;
    if (!isXml10CodePoint(codePoint)) {
      fail(`disallowed XML 1.0 literal character U+${codePoint.toString(16).toUpperCase().padStart(4, '0')} at offset ${offset}`);
    }
    offset += character.length;
  }
}

function isXmlWhitespaceOnly(value: string): boolean {
  for (const character of value) {
    if (!isWhitespace(character)) return false;
  }
  return true;
}

function decodeXmlEntities(value: string): string {
  if (!value.includes('&')) return value;

  let cursor = 0;
  let decoded = '';
  while (cursor < value.length) {
    const ampersand = value.indexOf('&', cursor);
    if (ampersand < 0) {
      decoded += value.slice(cursor);
      break;
    }
    decoded += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(';', ampersand + 1);
    if (semicolon < 0) fail('unterminated XML entity');
    const entity = value.slice(ampersand + 1, semicolon);
    if (entity.includes('&')) fail(`invalid XML entity &${entity};`);

    if (entity === 'amp') decoded += '&';
    else if (entity === 'lt') decoded += '<';
    else if (entity === 'gt') decoded += '>';
    else if (entity === 'apos') decoded += "'";
    else if (entity === 'quot') decoded += '"';
    else {
      const hexadecimal = /^#x([0-9A-Fa-f]+)$/.exec(entity);
      const decimal = /^#([0-9]+)$/.exec(entity);
      if (!hexadecimal && !decimal) fail(`invalid XML entity &${entity};`);
      const digits = hexadecimal?.[1] ?? decimal?.[1] ?? '';
      const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
      if (!Number.isSafeInteger(codePoint) || !isXml10CodePoint(codePoint)) {
        fail(`disallowed XML 1.0 character entity &${entity};`);
      }
      decoded += String.fromCodePoint(codePoint);
    }
    cursor = semicolon + 1;
  }
  return decoded;
}

function parseXmlDocument(input: string): XmlNode {
  assertXml10Characters(input);
  if (input.includes('<!')) fail('unsafe XML construct rejected (DOCTYPE, entity declaration, comment, or CDATA)');

  let index = input.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (!input.startsWith('<?xml', index)) fail('XML declaration is required');
  const declarationEnd = input.indexOf('?>', index + 5);
  if (declarationEnd < 0) fail('unterminated XML declaration');
  const declaration = input.slice(index, declarationEnd + 2);
  if (!/^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*["']1\.0["'][ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*["']utf-8["'][ \t\r\n]*\?>$/.test(declaration)) {
    fail('XML declaration must specify version 1.0 and UTF-8 encoding');
  }
  index = declarationEnd + 2;

  const readName = (): string => {
    const start = index;
    if (!/[A-Za-z_]/.test(input[index] ?? '')) fail(`invalid XML name at offset ${index}`);
    index++;
    while (/[A-Za-z0-9_.:-]/.test(input[index] ?? '')) index++;
    return input.slice(start, index);
  };

  const skipWhitespace = (): void => {
    while (isWhitespace(input[index] ?? '')) index++;
  };

  const parseElement = (): XmlNode => {
    if (input[index] !== '<') fail(`expected '<' at offset ${index}`);
    index++;
    if (input[index] === '/' || input[index] === '?' || input[index] === '!') {
      fail(`unexpected XML token at offset ${index - 1}`);
    }

    const name = readName();
    const attributes: Record<string, string> = {};
    skipWhitespace();
    while (input[index] !== '>') {
      if (input[index] === '/' || input[index] == null) fail(`self-closing or unterminated <${name}> is not allowed`);
      const attributeName = readName();
      if (attributes[attributeName] !== undefined) fail(`duplicate attribute ${attributeName} on <${name}>`);
      skipWhitespace();
      if (input[index] !== '=') fail(`attribute ${attributeName} on <${name}> lacks '='`);
      index++;
      skipWhitespace();
      const quote = input[index];
      if (quote !== '"' && quote !== "'") fail(`attribute ${attributeName} on <${name}> must be quoted`);
      index++;
      const valueStart = index;
      const valueEnd = input.indexOf(quote, index);
      if (valueEnd < 0) fail(`unterminated attribute ${attributeName} on <${name}>`);
      const rawValue = input.slice(valueStart, valueEnd);
      if (rawValue.includes('<')) fail(`'<\u003c' is not allowed in attribute ${attributeName}`);
      attributes[attributeName] = decodeXmlEntities(rawValue);
      index = valueEnd + 1;
      skipWhitespace();
    }
    index++;

    const textParts: string[] = [];
    const children: XmlNode[] = [];
    while (true) {
      if (index >= input.length) fail(`unterminated <${name}> element`);
      if (input.startsWith('</', index)) {
        index += 2;
        const closingName = readName();
        skipWhitespace();
        if (input[index] !== '>') fail(`invalid closing tag for <${name}>`);
        index++;
        if (closingName !== name) fail(`closing tag </${closingName}> does not match <${name}>`);
        return { name, attributes, text: textParts.join(''), children };
      }
      if (input[index] === '<') {
        children.push(parseElement());
      } else {
        const textStart = index;
        const nextTag = input.indexOf('<', index);
        index = nextTag < 0 ? input.length : nextTag;
        textParts.push(decodeXmlEntities(input.slice(textStart, index)));
      }
    }
  };

  while (isWhitespace(input[index] ?? '')) index++;
  const root = parseElement();
  while (isWhitespace(input[index] ?? '')) index++;
  if (index !== input.length) fail(`unexpected content after root at offset ${index}`);
  return root;
}

export function parseUbsXml(xml: string | Buffer): ParsedPassage[] {
  const input = Buffer.isBuffer(xml) ? new TextDecoder('utf-8', { fatal: true }).decode(xml) : xml;
  const root = parseXmlDocument(input);
  if (root.name !== 'Passages' || Object.keys(root.attributes).length !== 0 || !isXmlWhitespaceOnly(root.text)) {
    fail('XML must contain exactly one empty-text <Passages> root');
  }

  return root.children.map((passage, passageIndex) => {
    if (passage.name !== 'Passage' || Object.keys(passage.attributes).length !== 0 || !isXmlWhitespaceOnly(passage.text)) {
      fail(`passage ${passageIndex + 1} has an unexpected element or attribute`);
    }
    if (passage.children.length < 2) fail(`passage ${passageIndex + 1} must contain at least two Verse members`);
    return {
      verses: passage.children.map((verse, verseIndex) => {
        if (verse.name !== 'Verse' || verse.children.length !== 0 || verse.text.length === 0) {
          fail(`passage ${passageIndex + 1} member ${verseIndex + 1} is not a nonempty Verse`);
        }
        const attributes = Object.entries(verse.attributes);
        if (attributes.length !== 1 || (attributes[0][0] !== 'HEB' && attributes[0][0] !== 'GRK')) {
          fail(`passage ${passageIndex + 1} member ${verseIndex + 1} must have exactly one HEB or GRK attribute`);
        }
        const [marker, alignmentRaw] = attributes[0] as [LanguageMarker, string];
        if (!alignmentRaw || !/^[0-8]+$/.test(alignmentRaw)) {
          fail(`passage ${passageIndex + 1} member ${verseIndex + 1} has invalid alignment digits`);
        }
        return { marker, alignmentRaw, sourceReference: verse.text };
      }),
    };
  });
}

function assertSourceMetadata(metadata: SourceMetadata): void {
  if (metadata.transformVersion !== TRANSFORM_VERSION) fail(`unsupported transform version ${metadata.transformVersion}`);
  if (!/^[0-9a-f]{40}$/.test(metadata.sourceCommit) || !/^[0-9a-f]{40}$/.test(metadata.sourceBlob)) {
    fail('source commit and blob must be lowercase SHA-1 values');
  }
  if (!/^https:\/\//.test(metadata.sourceUrl) || metadata.license !== 'CC BY-SA 4.0') {
    fail('source metadata must retain the pinned HTTPS source and CC BY-SA 4.0 license');
  }
}

function verifySourceBytes(bytes: Buffer, metadata: SourceMetadata): void {
  assertSourceMetadata(metadata);
  if (bytes.length !== metadata.sourceBytes) fail(`source byte size drift: expected ${metadata.sourceBytes}, received ${bytes.length}`);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== metadata.sourceSha256) fail(`source SHA-256 drift: expected ${metadata.sourceSha256}, received ${actualSha256}`);
  const actualBlob = gitBlobSha(bytes);
  if (actualBlob !== metadata.sourceBlob) fail(`source Git blob drift: expected ${metadata.sourceBlob}, received ${actualBlob}`);
}

function validateBounds(book: BibleBook, chapter: number, startVerse: number, endVerse: number): void {
  const bounds = getBibleBookBounds(book).maxVerseByChapter;
  if (!Number.isSafeInteger(chapter) || !bounds[chapter - 1]) fail(`reference uses out-of-range chapter ${book.name} ${chapter}`);
  // UBS locators use their source-language versification. Do not apply the
  // current translation-oriented verse maxima here (for example, UBS has
  // Psalm 18:51 where this repository's English bounds stop at 18:50).
  if (!Number.isSafeInteger(startVerse) || !Number.isSafeInteger(endVerse)
    || startVerse < 1 || endVerse < startVerse) {
    fail(`reference uses out-of-range verse ${book.name} ${chapter}:${startVerse}-${endVerse}`);
  }
}

function parseSafeInteger(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail(`${label} is outside the safe integer range`);
  return value;
}

function parseVersePart(part: string, label: string): { startVerse: number; endVerse: number } {
  const match = /^(\d+)(?:-(\d+))?$/.exec(part);
  if (!match) fail(`invalid ${label} verse segment ${JSON.stringify(part)}`);
  const startVerse = parseSafeInteger(match[1], `${label} start verse`);
  const endVerse = match[2] ? parseSafeInteger(match[2], `${label} end verse`) : startVerse;
  return { startVerse, endVerse };
}

function parseSourceReference(sourceReference: string): { book: BibleBook; segments: ReferenceSegment[]; normalizedReference: string } {
  if (!sourceReference || isWhitespace(sourceReference[0]) || isWhitespace(sourceReference.at(-1)!)
    || !/^[A-Z0-9]{3} [^ \t\r\n].*$/.test(sourceReference)) {
    fail(`reference is not losslessly normalized: ${JSON.stringify(sourceReference)}`);
  }
  const match = /^([A-Z0-9]{3}) (.+)$/.exec(sourceReference);
  if (!match) fail(`invalid UBS reference ${JSON.stringify(sourceReference)}`);
  const [, code, body] = match;
  const book = findBookByHelloaoCode(code);
  if (!book) fail(`unknown UBS book code ${code}`);
  const parts = body.split(',');
  const first = /^(\d+):(\d+(?:-\d+)?)$/.exec(parts[0]);
  if (!first) fail(`invalid UBS reference ${JSON.stringify(sourceReference)}`);
  const firstChapter = parseSafeInteger(first[1], 'reference chapter');
  const firstVerse = parseVersePart(first[2], 'reference');
  const segments: ReferenceSegment[] = [{
    bookNumber: book.number,
    chapter: firstChapter,
    startVerse: firstVerse.startVerse,
    endVerse: firstVerse.endVerse,
  }];
  validateBounds(book, firstChapter, firstVerse.startVerse, firstVerse.endVerse);

  for (const [index, part] of parts.slice(1).entries()) {
    const full = /^(\d+):(\d+(?:-\d+)?)$/.exec(part);
    const chapter = full ? parseSafeInteger(full[1], 'discontinuous segment chapter') : firstChapter;
    const verse = parseVersePart(full ? full[2] : part, `discontinuous segment ${index + 2}`);
    validateBounds(book, chapter, verse.startVerse, verse.endVerse);
    segments.push({ bookNumber: book.number, chapter, startVerse: verse.startVerse, endVerse: verse.endVerse });
  }

  const normalizedParts = segments.map((segment, index) => {
    const verse = segment.startVerse === segment.endVerse
      ? String(segment.startVerse)
      : `${segment.startVerse}-${segment.endVerse}`;
    if (index === 0) return `${book.name} ${segment.chapter}:${verse}`;
    return segment.chapter === segments[0].chapter ? verse : `${segment.chapter}:${verse}`;
  });
  return { book, segments, normalizedReference: normalizedParts.join(',') };
}

function provenance(metadata: SourceMetadata): ParallelSourceProvenance {
  return { ...metadata, modified: true, modificationNote: MODIFICATION_NOTE };
}

export function compileUbsParallelPassages(xml: string | Buffer, metadata: SourceMetadata): string {
  const bytes = Buffer.isBuffer(xml) ? xml : Buffer.from(xml, 'utf8');
  verifySourceBytes(bytes, metadata);
  const parsed = parseUbsXml(bytes);
  const sourceProvenance = provenance(metadata);
  const seenGroups = new Set<string>();
  const groups: SourceAttestedParallelGroup[] = [];
  const index = new Map<string, ReferenceIndexEntry[]>();

  parsed.forEach((passage, passageIndex) => {
    const markers = new Set(passage.verses.map(verse => verse.marker));
    const mixed = markers.size === 2;
    const canonicalMembers = passage.verses.map(verse => [verse.marker, verse.sourceReference, verse.alignmentRaw]);
    const canonical = JSON.stringify(canonicalMembers);
    const groupId = `ubs-pp-${sha256(Buffer.from(canonical, 'utf8'))}`;
    if (seenGroups.has(canonical) || seenGroups.has(groupId)) fail(`duplicate UBS group at source ordinal ${passageIndex + 1}`);
    seenGroups.add(canonical);
    seenGroups.add(groupId);

    const members = passage.verses.map((verse, verseIndex): SourceParallelMember => {
      const parsedReference = parseSourceReference(verse.sourceReference);
      const alignmentBasis: AlignmentBasis = mixed
        ? verse.marker === 'HEB' ? 'LXX' : 'UBSGNT5'
        : verse.marker === 'HEB' ? 'BHS' : 'UBSGNT5';
      parsedReference.segments.forEach((segment, segmentIndex) => {
        const key = `${segment.bookNumber}:${segment.chapter}`;
        const entries = index.get(key) ?? [];
        entries.push({
          groupId,
          memberOrder: verseIndex + 1,
          segmentOrder: segmentIndex + 1,
          startVerse: segment.startVerse,
          endVerse: segment.endVerse,
        });
        index.set(key, entries);
      });
      return {
        sourceOrder: verseIndex + 1,
        sourceReference: verse.sourceReference,
        normalizedReference: parsedReference.normalizedReference,
        segments: parsedReference.segments,
        languageMarker: verse.marker,
        alignmentBasis,
        alignmentRaw: verse.alignmentRaw,
      };
    });

    groups.push({
      groupId,
      sourceOrdinal: passageIndex + 1,
      label: LABEL,
      directionality: DIRECTIONALITY,
      members,
      provenance: sourceProvenance,
    });
  });

  const referenceIndex: Record<string, ReferenceIndexEntry[]> = {};
  for (const key of [...index.keys()].sort()) referenceIndex[key] = index.get(key)!;

  const output: GeneratedUbsCorpus = {
    schemaVersion: 'ubs-parallel-passages.v1',
    transformVersion: TRANSFORM_VERSION,
    label: LABEL,
    directionality: DIRECTIONALITY,
    license: { name: 'CC BY-SA 4.0', url: metadata.licenseUrl },
    provenance: sourceProvenance,
    groups,
    referenceIndex,
  };
  // Object insertion order is fixed above; compact output keeps the shared
  // Node/Worker artifact practical without changing its deterministic bytes.
  return `${JSON.stringify(output)}\n`;
}

function readMetadata(path: string): SourceMetadata {
  return JSON.parse(readFileSync(path, 'utf8')) as SourceMetadata;
}

function main(): void {
  const args = process.argv.slice(2);
  const valueFor = (name: string, fallback: string): string => {
    const equals = args.find(arg => arg.startsWith(`${name}=`));
    if (equals) return equals.slice(name.length + 1);
    const position = args.indexOf(name);
    return position >= 0 && args[position + 1] ? args[position + 1] : fallback;
  };
  const inputPath = resolve(ROOT, valueFor('--input', DEFAULT_SOURCE_PATH));
  const metadataPath = resolve(ROOT, valueFor('--metadata', DEFAULT_METADATA_PATH));
  const outputPath = resolve(ROOT, valueFor('--output', DEFAULT_OUTPUT_PATH));
  const output = compileUbsParallelPassages(readFileSync(inputPath), readMetadata(metadataPath));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, 'utf8');
  console.error(`[ubs-compiler] wrote ${outputPath} (${Buffer.byteLength(output, 'utf8')} bytes)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
