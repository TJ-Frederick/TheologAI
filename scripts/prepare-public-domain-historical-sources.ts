#!/usr/bin/env tsx

/**
 * Offline-only, runtime-inert preparation for three Project Gutenberg
 * editions and one blocked Internet Archive candidate.
 *
 * This file deliberately has no database, manifest, seed, runtime, MCP, or
 * network imports. Raw acquisition locks and normalized section artifacts are
 * separate, and every normalized artifact is inactive/sectioned_only.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREP_DIR = resolve(ROOT, 'data/historical-sources/public-domain-prep');
export const SOURCE_LOCK_PATH = resolve(PREP_DIR, 'SOURCE_LOCK.json');
export const REPORT_PATH = resolve(PREP_DIR, 'NORMALIZATION_REPORT.json');

type Artifact = {
  role: string;
  sourceUrl: string;
  localPath: string;
  bytes: number;
  sha256: string;
};

const artifact = (role: string, sourceUrl: string, localPath: string, bytes: number, sha256: string): Artifact =>
  ({ role, sourceUrl, localPath, bytes, sha256 });

const PG_LICENSE = artifact('project_gutenberg_license', 'https://www.gutenberg.org/policy/license.html', 'data/historical-sources/project-gutenberg/shared/license.html', 32318, '3df0bb72fa6820227533369d85ccdfbfae8290a402dc553c6a969f52d7fbf6c9');

export const EXPECTED_SOURCE_LOCK = {
  schemaVersion: 'public-domain-source-lock.v1',
  acquiredOn: '2026-07-18',
  networkPolicy: 'acquisition_complete_normalization_offline',
  candidates: [
    {
      sourceId: 'gutenberg-pg45001-pg64392-john-allen-calvin',
      status: 'locked',
      edition: 'Sixth American Edition, Revised and Corrected; two volumes; John Allen translation',
      rights: { status: 'public_domain_in_usa', evidence: 'Both pinned RDF records state: Public domain in the USA.', territoryCaveat: 'Users outside the United States must check local law.' },
      artifacts: [
        artifact('volume_1_utf8_text', 'https://www.gutenberg.org/cache/epub/45001/pg45001.txt', 'data/historical-sources/project-gutenberg/pg45001/pg45001.txt', 1925334, '7318da7684a4b9e9cf55bd7d0eb0da19c16dec59117ff51cda2050f5f601f9e9'),
        artifact('volume_1_rdf_metadata', 'https://www.gutenberg.org/ebooks/45001.rdf', 'data/historical-sources/project-gutenberg/pg45001/pg45001.rdf', 19094, 'beb6186c2a011ab75ce5660b9167da1a9d3bfc14c39dac3c23cc4f22499f48f6'),
        artifact('volume_2_utf8_text', 'https://www.gutenberg.org/cache/epub/64392/pg64392.txt', 'data/historical-sources/project-gutenberg/pg64392/pg64392.txt', 2134847, 'a1e35c9f41d978f7b3257f9115b59acfd2a80c41ae11736628710b773cef1003'),
        artifact('volume_2_rdf_metadata', 'https://www.gutenberg.org/ebooks/64392.rdf', 'data/historical-sources/project-gutenberg/pg64392/pg64392.rdf', 17028, '8311cd8ff964f7625defb3b079a6afd76ef100226072953dffefadfe4db681d8'),
        PG_LICENSE,
      ],
    },
    {
      sourceId: 'gutenberg-pg19950-aquinas-tertia-pars-q73-q83',
      status: 'locked',
      edition: 'Benziger Brothers English Dominican Province translation as transformed in Project Gutenberg 19950',
      rights: { status: 'public_domain_in_usa', evidence: 'Pinned RDF record states: Public domain in the USA.', territoryCaveat: 'Users outside the United States must check local law.' },
      transformationNotice: 'The Gutenberg text says its earlier electronic edition was made available through CCEL, then corrected and supplemented by David McClamrock; it enumerates formatting, citation, footnote, transliteration, and correction changes. No CCEL artifact was acquired.',
      artifacts: [
        artifact('utf8_text', 'https://www.gutenberg.org/cache/epub/19950/pg19950.txt', 'data/historical-sources/project-gutenberg/pg19950/pg19950.txt', 2757535, '4adb238f7c98be1c4c7d71275d29d479d923d2c447d16a692365c79ada81cdb5'),
        artifact('rdf_metadata', 'https://www.gutenberg.org/ebooks/19950.rdf', 'data/historical-sources/project-gutenberg/pg19950/pg19950.rdf', 17764, 'c424168085c4d2b7445c37bf2745b5f3891890dce4ed71944acfb2bc717150aa'),
        PG_LICENSE,
      ],
    },
    {
      sourceId: 'gutenberg-pg3296-pusey-augustine-confessions',
      status: 'locked',
      edition: 'The Confessions of Saint Augustine, translated by E. B. Pusey (Edward Bouverie)',
      rights: { status: 'public_domain_in_usa', evidence: 'Pinned RDF record states: Public domain in the USA.', territoryCaveat: 'Users outside the United States must check local law.' },
      artifacts: [
        artifact('utf8_text', 'https://www.gutenberg.org/cache/epub/3296/pg3296.txt', 'data/historical-sources/project-gutenberg/pg3296/pg3296.txt', 632167, '5a036498dc7c546a98b9e7a31952e030ca74db7dd111b30029354efe12bcd691'),
        artifact('rdf_metadata', 'https://www.gutenberg.org/ebooks/3296.rdf', 'data/historical-sources/project-gutenberg/pg3296/pg3296.rdf', 20797, 'ff7a0b21049a9db1c398f563f68c95383e75e83d8de84366f90b634114647c16'),
        PG_LICENSE,
      ],
    },
    {
      sourceId: 'internet-archive-a566189200cypruoft-cyril-1839',
      status: 'blocked',
      edition: 'The Catechetical Lectures of S. Cyril, Archbishop of Jerusalem (Oxford/London, 1839)',
      rights: { status: 'public_domain_mark', evidence: 'Pinned item metadata licenseurl points to the Creative Commons public-domain instrument.', territoryCaveat: 'The item and edition evidence is retained; no broader jurisdictional warranty is made.' },
      blocker: 'The inspected title pages identify only “Translated by members of the English Church” and “Translated, with notes and indices.” Internet Archive metadata lists Richard William Church and John Henry Newman as untyped creators. The exact individual translator/editor roles cannot be established without inference, so normalization is hard-stopped.',
      boundaryAudit: { result: 'boundaries_clear_but_candidate_blocked_on_roles', djvuObjectPages: { lecture19: 312, lecture20: 317, lecture21: 321, lecture22: 324, lecture23: 327 } },
      artifacts: [
        artifact('item_metadata_json', 'https://archive.org/metadata/a566189200cypruoft', 'data/historical-sources/internet-archive/a566189200cypruoft/metadata.json', 8787, '3ec905f0a94c046702fc16d75b8ee21a0ca73034a45b8912b013961dd773a558'),
        artifact('djvu_text', 'https://archive.org/download/a566189200cypruoft/a566189200cypruoft_djvu.txt', 'data/historical-sources/internet-archive/a566189200cypruoft/a566189200cypruoft_djvu.txt', 919759, 'db70a6c3fb15f2114665729dfeae21d88e2ec40db58d0544079a701bf3c58179'),
        artifact('djvu_xml', 'https://archive.org/download/a566189200cypruoft/a566189200cypruoft_djvu.xml', 'data/historical-sources/internet-archive/a566189200cypruoft/a566189200cypruoft_djvu.xml', 8561307, '0621c0de6b332bf5f01422b168639a365a4cc1f25b179d0ced25748322bc4b8d'),
        artifact('marc_xml', 'https://archive.org/download/a566189200cypruoft/a566189200cypruoft_marc.xml', 'data/historical-sources/internet-archive/a566189200cypruoft/a566189200cypruoft_marc.xml', 3799, '6ef0f7f19b19cc59341b8418fe320acf468cc420f268573387ee62c9a76bbaf6'),
        artifact('item_meta_xml', 'https://archive.org/download/a566189200cypruoft/a566189200cypruoft_meta.xml', 'data/historical-sources/internet-archive/a566189200cypruoft/a566189200cypruoft_meta.xml', 2034, '8381f446240d2ec7fddbd1ad987d4234574a4d2960441b31fe13e61cd73fb6a5'),
        artifact('scandata_xml', 'https://archive.org/download/a566189200cypruoft/scandata.xml', 'data/historical-sources/internet-archive/a566189200cypruoft/scandata.xml', 200777, '1ffc3bd69f9819908f2e1481fdc03214506ad0f617981e339d4cbd9450281f4c'),
        artifact('public_domain_instrument', 'https://creativecommons.org/licenses/publicdomain/', 'data/historical-sources/internet-archive/a566189200cypruoft/publicdomain-license.html', 30419, '122cd2dba6c0edfe907f7853e06aa096ee0ba00cd8362f2d96b6bd781288d208'),
        artifact('series_title_page_image', 'https://archive.org/download/a566189200cypruoft/page/n6_w1600.jpg', 'data/historical-sources/internet-archive/a566189200cypruoft/page-audit/leaf-0007-series-title.jpg', 652660, '41cfae40f8615cd7938803fb23450dd3334d8005403dd0180884c018559b355c'),
        artifact('work_title_page_image', 'https://archive.org/download/a566189200cypruoft/page/n12_w1600.jpg', 'data/historical-sources/internet-archive/a566189200cypruoft/page-audit/leaf-0013-work-title.jpg', 602513, '68e8dc0929671531506382874b2d0747952c562fec7e6a5f937d13604f771d2d'),
      ],
    },
  ],
} as const;

export type SourceLock = typeof EXPECTED_SOURCE_LOCK;

export type PreparedSection = { key: string; heading: string; content: string; source: string };
export type PreparedArtifact = {
  schemaVersion: 'public-domain-section-prep.v1';
  sourceId: string;
  status: 'inactive';
  delivery: 'sectioned_only';
  edition: { author: string; translator: string; title: string; edition: string };
  scope: string;
  sourceLockSha256: string;
  transform: { version: 1; decoding: 'strict_utf8_fatal'; newlineChangeOnly: 'crlf_to_lf'; modernization: 'none'; wrapper: 'gutenberg_start_end_markers_and_adjacent_blank_lines_excluded' };
  sections: PreparedSection[];
};

function fail(message: string): never { throw new Error(`[public-domain-prep] ${message}`); }
export function sha256(bytes: Uint8Array | string): string { return createHash('sha256').update(bytes).digest('hex'); }

export function parseSourceLock(input: unknown): SourceLock {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('source lock must be an object');
  if (JSON.stringify(input) !== JSON.stringify(EXPECTED_SOURCE_LOCK)) fail('source lock does not exactly match the reviewed closed-schema lock');
  return input as SourceLock;
}

export function strictUtf8(bytes: Uint8Array, label: string): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail(`${label} must not contain a UTF-8 BOM`);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(`${label} is not strict UTF-8`); }
  if (text.includes('\0') || text.includes('\ufffd')) fail(`${label} contains a forbidden NUL or replacement character`);
  if (/\r(?!\n)/.test(text)) fail(`${label} contains a lone carriage return`);
  return text;
}

function readLocked(a: Artifact): string {
  const bytes = readFileSync(resolve(ROOT, a.localPath));
  if (bytes.byteLength !== a.bytes) fail(`${a.localPath} byte count drift`);
  if (sha256(bytes) !== a.sha256) fail(`${a.localPath} SHA-256 drift`);
  return strictUtf8(bytes, a.localPath);
}

function verifyAllLockedArtifacts(): void {
  for (const candidate of EXPECTED_SOURCE_LOCK.candidates) {
    for (const a of candidate.artifacts) {
      const bytes = readFileSync(resolve(ROOT, a.localPath));
      if (bytes.byteLength !== a.bytes) fail(`${a.localPath} byte count drift`);
      if (sha256(bytes) !== a.sha256) fail(`${a.localPath} SHA-256 drift`);
      if (!a.role.endsWith('_image')) strictUtf8(bytes, a.localPath);
      else if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) fail(`${a.localPath} is not a complete JPEG artifact`);
    }
  }
}

function decodeXmlArtifact(id: string, role: string): string {
  const xml = readLocked(textArtifact(id, role));
  if (/<!ENTITY\b|<!DOCTYPE\s+[^>]*(?:SYSTEM|PUBLIC)/i.test(xml)) fail(`${role} contains forbidden entity or external DTD resolution`);
  if (!xml.startsWith('<?xml') && !xml.startsWith('<book>')) fail(`${role} does not begin as reviewed XML`);
  return xml;
}

/**
 * A deliberately small, fail-closed XML subset parser.  It is sufficient for
 * the pinned Gutenberg RDF records, but it deliberately does not attempt to
 * become a general RDF/XML implementation.  The lock covers bytes; this
 * parser covers the semantic facts on which the acquisition decision relies.
 */
type XmlText = { kind: 'text'; value: string };
type XmlElement = { kind: 'element'; name: string; attributes: Readonly<Record<string, string>>; children: XmlNode[] };
type XmlNode = XmlText | XmlElement;

const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/;
const XML_ENTITY = /&(amp|apos|quot|lt|gt|#x[0-9A-Fa-f]+|#[0-9]+);/g;

function decodeXmlText(value: string, label: string): string {
  if (/&(?!(?:amp|apos|quot|lt|gt|#x[0-9A-Fa-f]+|#[0-9]+);)/.test(value)) fail(`${label} contains an unsupported or unterminated XML entity`);
  return value.replace(XML_ENTITY, (_entity, named: string) => {
    if (named === 'amp') return '&';
    if (named === 'apos') return "'";
    if (named === 'quot') return '"';
    if (named === 'lt') return '<';
    if (named === 'gt') return '>';
    const codePoint = named.startsWith('#x') ? Number.parseInt(named.slice(2), 16) : Number.parseInt(named.slice(1), 10);
    if (!Number.isSafeInteger(codePoint) || codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) fail(`${label} contains an invalid XML numeric entity`);
    return String.fromCodePoint(codePoint);
  });
}

function parseXmlAttributes(input: string, label: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  let cursor = 0;
  while (cursor < input.length) {
    const whitespace = /^\s+/.exec(input.slice(cursor));
    if (!whitespace) fail(`${label} has malformed XML attributes`);
    cursor += whitespace[0].length;
    if (cursor === input.length) break;
    const attribute = /^([A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?)\s*=\s*(["'])([\s\S]*?)\2/.exec(input.slice(cursor));
    if (!attribute || !XML_NAME.test(attribute[1])) fail(`${label} has malformed XML attribute syntax`);
    if (Object.hasOwn(attributes, attribute[1])) fail(`${label} repeats XML attribute ${attribute[1]}`);
    attributes[attribute[1]] = decodeXmlText(attribute[3], label);
    cursor += attribute[0].length;
  }
  return attributes;
}

export function parseStrictXmlSubset(xml: string, label: string): XmlElement {
  if (!xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')) fail(`${label} must begin with the reviewed UTF-8 XML declaration`);
  if (/<!DOCTYPE\b|<!ENTITY\b|<!\[CDATA\[/i.test(xml)) fail(`${label} uses a forbidden XML construct`);
  const token = /<!--[\s\S]*?-->|<\?xml\s+version="1\.0"\s+encoding="utf-8"\s*\?>|<\/[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?\s*>|<[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?(?:\s+[\s\S]*?)?\/?>|[^<]+/g;
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let offset = 0;
  for (const match of xml.matchAll(token)) {
    if (match.index !== offset) fail(`${label} contains malformed or unsupported XML near byte ${offset}`);
    const value = match[0];
    offset += value.length;
    if (value.startsWith('<?xml')) {
      if (match.index !== 0) fail(`${label} has an XML declaration outside the document start`);
      continue;
    }
    if (value.startsWith('<!--')) {
      if (!value.endsWith('-->') || value.includes('--', 4)) fail(`${label} has malformed XML comment`);
      continue;
    }
    if (value.startsWith('</')) {
      const name = value.slice(2, -1).trim();
      const current = stack.pop();
      if (!current || current.name !== name) fail(`${label} has an unmatched XML close tag ${name}`);
      continue;
    }
    if (value.startsWith('<')) {
      const selfClosing = /\/>$/.test(value);
      const raw = value.slice(1, selfClosing ? -2 : -1);
      const name = /^([A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?)/.exec(raw)?.[1];
      if (!name || !XML_NAME.test(name)) fail(`${label} has malformed XML element name`);
      const attributes = parseXmlAttributes(raw.slice(name.length), label);
      const element: XmlElement = { kind: 'element', name, attributes, children: [] };
      if (stack.length > 0) stack.at(-1)!.children.push(element);
      else if (root) fail(`${label} has more than one XML root element`);
      else root = element;
      if (!selfClosing) stack.push(element);
      continue;
    }
    if (stack.length === 0 && value.trim() !== '') fail(`${label} has non-whitespace text outside its root element`);
    if (stack.length > 0) stack.at(-1)!.children.push({ kind: 'text', value: decodeXmlText(value, label) });
  }
  if (offset !== xml.length || !root || stack.length !== 0) fail(`${label} is not a complete, well-formed XML document`);
  return root;
}

function elementChildren(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child): child is XmlElement => child.kind === 'element' && child.name === name);
}

function textContent(element: XmlElement): string {
  return element.children.map(child => child.kind === 'text' ? child.value : textContent(child)).join('').replace(/\s+/g, ' ').trim();
}

const GUTENBERG_NAMESPACE_BINDINGS = {
  'xmlns:pgterms': 'http://www.gutenberg.org/2009/pgterms/',
  'xmlns:dcterms': 'http://purl.org/dc/terms/',
  'xmlns:rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
  'xmlns:dcam': 'http://purl.org/dc/dcam/',
  'xmlns:rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'xmlns:cc': 'http://web.resource.org/cc/',
  'xmlns:marcrel': 'http://id.loc.gov/vocabulary/relators/',
} as const;

const DCTERMS_RFC4646 = 'http://purl.org/dc/terms/RFC4646';
const DCTERMS_IMT = 'http://purl.org/dc/terms/IMT';

function directElementChildren(element: XmlElement): XmlElement[] {
  return element.children.filter((child): child is XmlElement => child.kind === 'element');
}

function assertExactDirectElementChildren(element: XmlElement, expectedNames: readonly string[], label: string): void {
  const actualNames = directElementChildren(element).map(child => child.name);
  if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
    fail(`${label} has an unexpected direct RDF/XML container shape`);
  }
}

function exactOneDirectElement(element: XmlElement, name: string, label: string): XmlElement {
  const values = elementChildren(element, name);
  if (values.length !== 1) fail(`${label} must contain exactly one direct ${name} element`);
  return values[0];
}

function assertExactAttributes(element: XmlElement, expected: Readonly<Record<string, string>>, label: string): void {
  const actual = Object.entries(element.attributes);
  const expectedEntries = Object.entries(expected);
  if (
    actual.length !== expectedEntries.length
    || actual.some(([name, value]) => expected[name] !== value)
  ) fail(`${label} has unexpected RDF/XML attributes`);
}

function directLiteral(element: XmlElement, expected: string, label: string): void {
  if (directElementChildren(element).length !== 0 || Object.keys(element.attributes).length !== 0 || textContent(element) !== expected) {
    fail(`${label} must be the reviewed direct literal`);
  }
}

function directTypedLiteral(element: XmlElement, expected: string, datatype: string, label: string): void {
  if (
    directElementChildren(element).length !== 0
    || Object.keys(element.attributes).length !== 1
    || element.attributes['rdf:datatype'] !== datatype
    || textContent(element) !== expected
  ) fail(`${label} must be the reviewed direct typed literal`);
}

function assertExactGutenbergNamespaceBindings(root: XmlElement, includesTranslator: boolean, label: string): void {
  const expectedBindings = Object.fromEntries(Object.entries(GUTENBERG_NAMESPACE_BINDINGS)
    .filter(([name]) => includesTranslator || name !== 'xmlns:marcrel'));
  const expectedRootAttributes = new Set(['xml:base', ...Object.keys(expectedBindings)]);
  if (
    root.attributes['xml:base'] !== 'http://www.gutenberg.org/'
    || Object.keys(root.attributes).length !== expectedRootAttributes.size
    || Object.keys(root.attributes).some(name => !expectedRootAttributes.has(name))
    || Object.entries(expectedBindings).some(([name, uri]) => root.attributes[name] !== uri)
  ) fail(`${label} has unexpected reviewed namespace bindings or RDF root attributes`);

  const assertNoNestedNamespaceDeclarations = (element: XmlElement): void => {
    for (const child of directElementChildren(element)) {
      if (Object.keys(child.attributes).some(name => name === 'xmlns' || name.startsWith('xmlns:'))) {
        fail(`${label} redeclares a namespace below the reviewed RDF root`);
      }
      assertNoNestedNamespaceDeclarations(child);
    }
  };
  assertNoNestedNamespaceDeclarations(root);
}

type GutenbergRdfExpectation = {
  ebookId: number;
  title: string;
  languageDescriptionNodeId: string;
  utf8FormatDescriptionNodeId: string;
  contributor: { kind: 'translator'; name: string; agentAbout: string } | { kind: 'production_credit'; text: string };
};

export const GUTENBERG_RDF_EXPECTATIONS: readonly GutenbergRdfExpectation[] = [
  { ebookId: 45001, title: 'Institutes of the Christian Religion (Vol. 1 of 2)', languageDescriptionNodeId: 'Nab7d4d8347574dc78c2911fcfbc1f730', utf8FormatDescriptionNodeId: 'N5a13d351bbf4400f9c96b4e09793a59a', contributor: { kind: 'translator', name: 'Allen, John', agentAbout: '2009/agents/47365' } },
  { ebookId: 64392, title: 'Institutes of the Christian Religion (Vol. 2 of 2)', languageDescriptionNodeId: 'N0f4b37aea85a4b659e2980fa718342bb', utf8FormatDescriptionNodeId: 'Nf80f7315c22945759e1a6eb7e9673459', contributor: { kind: 'translator', name: 'Allen, John', agentAbout: '2009/agents/47365' } },
  { ebookId: 19950, title: 'Summa Theologica, Part III (Tertia Pars) From the Complete American Edition', languageDescriptionNodeId: 'N143f548ec49a404a96cf8bcb94e1c33e', utf8FormatDescriptionNodeId: 'N71d550e4bcab49a7a5609076688d9cdf', contributor: { kind: 'production_credit', text: 'Produced by Sandra K. Perry, with corrections and supplementation by David McClamrock' } },
  { ebookId: 3296, title: 'The Confessions of St. Augustine', languageDescriptionNodeId: 'N5b9ab4364b974f8eb07c9343b88e4808', utf8FormatDescriptionNodeId: 'Ne19b446b90e940f8a04f675369b673d2', contributor: { kind: 'translator', name: 'Pusey, E. B. (Edward Bouverie)', agentAbout: '2009/agents/1157' } },
] as const;

export function assertGutenbergRdfMetadata(xml: string, expectation: GutenbergRdfExpectation): void {
  const label = `Project Gutenberg RDF ${expectation.ebookId}`;
  const root = parseStrictXmlSubset(xml, label);
  if (root.name !== 'rdf:RDF') fail(`${label} has an unexpected RDF root`);
  assertExactGutenbergNamespaceBindings(root, expectation.contributor.kind === 'translator', label);
  const ebooks = elementChildren(root, 'pgterms:ebook');
  if (ebooks.length !== 1) fail(`${label} ebook identity drift`);
  const ebook = ebooks[0];
  assertExactAttributes(ebook, { 'rdf:about': `ebooks/${expectation.ebookId}` }, `${label} ebook identity drift`);
  const exactOneDirectLiteral = (name: string, expected: string, description: string) => {
    const value = exactOneDirectElement(ebook, name, `${label} ${description}`);
    directLiteral(value, expected, `${label} ${description}`);
  };
  exactOneDirectLiteral('dcterms:title', expectation.title, 'title');
  exactOneDirectLiteral('dcterms:rights', 'Public domain in the USA.', 'rights assertion');

  const language = exactOneDirectElement(ebook, 'dcterms:language', `${label} English language assertion`);
  assertExactAttributes(language, {}, `${label} English language assertion`);
  assertExactDirectElementChildren(language, ['rdf:Description'], `${label} English language assertion`);
  const languageDescription = exactOneDirectElement(language, 'rdf:Description', `${label} English language assertion`);
  assertExactAttributes(languageDescription, { 'rdf:nodeID': expectation.languageDescriptionNodeId }, `${label} English language assertion`);
  assertExactDirectElementChildren(languageDescription, ['rdf:value'], `${label} English language assertion`);
  directTypedLiteral(exactOneDirectElement(languageDescription, 'rdf:value', `${label} English language assertion`), 'en', DCTERMS_RFC4646, `${label} English language assertion`);

  if (expectation.contributor.kind === 'translator') {
    const translator = exactOneDirectElement(ebook, 'marcrel:trl', `${label} translator role/name`);
    assertExactAttributes(translator, {}, `${label} translator role/name`);
    assertExactDirectElementChildren(translator, ['pgterms:agent'], `${label} translator role/name`);
    const agent = exactOneDirectElement(translator, 'pgterms:agent', `${label} translator role/name`);
    assertExactAttributes(agent, { 'rdf:about': expectation.contributor.agentAbout }, `${label} translator agent identity`);
    directLiteral(exactOneDirectElement(agent, 'pgterms:name', `${label} translator role/name`), expectation.contributor.name, `${label} translator role/name`);
  } else {
    exactOneDirectLiteral('pgterms:marc508', expectation.contributor.text, 'production contributor credit');
  }

  const utf8Containers = elementChildren(ebook, 'dcterms:hasFormat').filter(container => elementChildren(container, 'pgterms:file')
    .some(file => file.attributes['rdf:about'] === `https://www.gutenberg.org/ebooks/${expectation.ebookId}.txt.utf-8`));
  if (utf8Containers.length !== 1) fail(`${label} must contain exactly one pinned UTF-8 text format`);
  const utf8Container = utf8Containers[0];
  assertExactAttributes(utf8Container, {}, `${label} pinned UTF-8 text format`);
  assertExactDirectElementChildren(utf8Container, ['pgterms:file'], `${label} pinned UTF-8 text format`);
  const utf8File = exactOneDirectElement(utf8Container, 'pgterms:file', `${label} pinned UTF-8 text format`);
  assertExactAttributes(utf8File, { 'rdf:about': `https://www.gutenberg.org/ebooks/${expectation.ebookId}.txt.utf-8` }, `${label} pinned UTF-8 text format identity`);
  const formatOf = exactOneDirectElement(utf8File, 'dcterms:isFormatOf', `${label} pinned UTF-8 text format`);
  if (directElementChildren(formatOf).length !== 0 || textContent(formatOf) !== '' || Object.keys(formatOf.attributes).length !== 1 || formatOf.attributes['rdf:resource'] !== `ebooks/${expectation.ebookId}`) fail(`${label} pinned UTF-8 text isFormatOf semantics drift`);
  const format = exactOneDirectElement(utf8File, 'dcterms:format', `${label} pinned UTF-8 text format`);
  assertExactAttributes(format, {}, `${label} pinned UTF-8 text format`);
  assertExactDirectElementChildren(format, ['rdf:Description'], `${label} pinned UTF-8 text format`);
  const formatDescription = exactOneDirectElement(format, 'rdf:Description', `${label} pinned UTF-8 text format`);
  assertExactAttributes(formatDescription, { 'rdf:nodeID': expectation.utf8FormatDescriptionNodeId }, `${label} pinned UTF-8 text format`);
  assertExactDirectElementChildren(formatDescription, ['dcam:memberOf', 'rdf:value'], `${label} pinned UTF-8 text format`);
  const memberOf = exactOneDirectElement(formatDescription, 'dcam:memberOf', `${label} pinned UTF-8 text format`);
  if (directElementChildren(memberOf).length !== 0 || textContent(memberOf) !== '' || Object.keys(memberOf.attributes).length !== 1 || memberOf.attributes['rdf:resource'] !== DCTERMS_IMT) fail(`${label} pinned UTF-8 text IMT membership drift`);
  directTypedLiteral(exactOneDirectElement(formatDescription, 'rdf:value', `${label} pinned UTF-8 text format`), 'text/plain; charset=utf-8', DCTERMS_IMT, `${label} pinned UTF-8 text format`);
}

export function auditCyrilBlockedCandidate() {
  const id = 'internet-archive-a566189200cypruoft-cyril-1839';
  const metadataText = readLocked(textArtifact(id, 'item_metadata_json'));
  let metadata: any;
  try { metadata = JSON.parse(metadataText); } catch { fail('Cyril metadata is not strict JSON'); }
  if (metadata.metadata?.identifier !== 'a566189200cypruoft' || metadata.metadata?.date !== '1839' || metadata.metadata?.licenseurl !== 'http://creativecommons.org/licenses/publicdomain/') fail('Cyril item identity/date/license drift');
  const creators = metadata.metadata?.creator;
  if (!Array.isArray(creators) || !creators.includes('Church, Richard William, 1815-1890') || !creators.includes('Newman, John Henry, 1801-1890')) fail('Cyril untyped creator metadata drift');

  const scandata = decodeXmlArtifact(id, 'scandata_xml');
  if (!/<leafCount>406<\/leafCount>/.test(scandata) || !/<page leafNum="13">[\s\S]*?<pageType>Title Page<\/pageType>/.test(scandata)) fail('Cyril title-page scandata drift');
  const djvu = decodeXmlArtifact(id, 'djvu_xml');
  const objects = [...djvu.matchAll(/<OBJECT\b[\s\S]*?<\/OBJECT>/g)].map(match => match[0]);
  if (objects.length !== 402) fail('Cyril DjVuXML must contain exactly 402 OCR objects');
  const words = (object: string) => [...object.matchAll(/<WORD[^>]*>([\s\S]*?)<\/WORD>/g)].map(match => match[1]).join(' ');
  const seriesTitle = words(objects[6]);
  const workTitle = words(objects[12]);
  if (!seriesTitle.includes('TRANSLATED BY MEMBERS OF THE ENGLISH CHURCH') || !workTitle.includes('TRANSLATED, WITH NOTES AND INDICES')) fail('Cyril title-page role evidence drift');
  const expected = [[312, 'LECTURE XIX.'], [317, 'LECTURE XX.'], [321, 'LECTURE XXI.'], [324, 'LECTURE XXII.'], [327, 'LECTURE XXIII.']] as const;
  for (const [page, marker] of expected) if (!words(objects[page - 1]).includes(marker)) fail(`Cyril ${marker} OCR boundary drift at object ${page}`);
  return { ocrObjects: 402, scandataLeafCount: 406, titlePageLeaf: 13, lectureObjectPages: Object.fromEntries(expected.map(([page, marker]) => [marker.replace(/\W/g, '').toLowerCase(), page])), roleConclusion: 'blocked_untyped_collective_credit' as const };
}

export function auditGutenbergEditionEvidence() {
  const checks = [
    { id: 'gutenberg-pg45001-pg64392-john-allen-calvin', textRoles: ['volume_1_utf8_text', 'volume_2_utf8_text'], rdfRoles: ['volume_1_rdf_metadata', 'volume_2_rdf_metadata'], markers: ['John Allen', 'Sixth American Edition', 'In Two Volumes'] },
    { id: 'gutenberg-pg19950-aquinas-tertia-pars-q73-q83', textRoles: ['utf8_text'], rdfRoles: ['rdf_metadata'], markers: ['Fathers of the English Dominican Province', 'Classics Ethereal Library <http://www.ccel.org>', 'unnecessary formatting in the text', 'corrected some errors in'] },
    { id: 'gutenberg-pg3296-pusey-augustine-confessions', textRoles: ['utf8_text'], rdfRoles: ['rdf_metadata'], markers: ['Translated by E. B. Pusey (Edward Bouverie)'] },
  ];
  for (const check of checks) {
    const texts = check.textRoles.map(role => readLocked(textArtifact(check.id, role))).join('\n');
    for (const marker of check.markers) if (!texts.toLowerCase().includes(marker.toLowerCase())) fail(`${check.id} edition/transformation evidence drift: ${marker}`);
    for (const role of check.rdfRoles) {
      const rdf = decodeXmlArtifact(check.id, role);
      const artifactPath = textArtifact(check.id, role).localPath;
      const ebookId = Number(/\/pg(\d+)\//.exec(artifactPath)?.[1] ?? '');
      const expectation = GUTENBERG_RDF_EXPECTATIONS.find(item => item.ebookId === ebookId);
      if (!expectation) fail(`${check.id} lacks a reviewed RDF semantic expectation for ${role}`);
      assertGutenbergRdfMetadata(rdf, expectation);
    }
  }
  return { rdfPublicDomainAssertions: 4, rdfSemanticAssertions: 4, calvinVolumes: 2, aquinasTransformationNoticeAudited: true, directCcelArtifacts: 0, augustineTranslatorAudited: true };
}

function gutenbergBody(a: Artifact): string {
  const raw = readLocked(a);
  if ((raw.match(/\r\n/g) ?? []).length === 0) fail(`${a.localPath} must retain the acquired CRLF representation`);
  const text = raw.replace(/\r\n/g, '\n');
  const start = /^\*\*\* START OF THE PROJECT GUTENBERG EBOOK .* \*\*\*$/m.exec(text);
  const end = /^\*\*\* END OF THE PROJECT GUTENBERG EBOOK .* \*\*\*$/m.exec(text);
  if (!start || !end || start.index >= end.index) fail(`${a.localPath} must contain exactly ordered Gutenberg START/END markers`);
  if ((text.match(/^\*\*\* START OF THE PROJECT GUTENBERG EBOOK .* \*\*\*$/gm) ?? []).length !== 1 || (text.match(/^\*\*\* END OF THE PROJECT GUTENBERG EBOOK .* \*\*\*$/gm) ?? []).length !== 1) fail(`${a.localPath} has ambiguous Gutenberg markers`);
  return text.slice(start.index + start[0].length, end.index).replace(/^\n+|\n+$/g, '');
}

function candidate(id: string) {
  const found = EXPECTED_SOURCE_LOCK.candidates.find(c => c.sourceId === id);
  if (!found) fail(`unknown source ${id}`);
  return found;
}

function textArtifact(id: string, role: string): Artifact {
  const found = candidate(id).artifacts.find(a => a.role === role);
  if (!found) fail(`${id} lacks ${role}`);
  return found;
}

function headingAt(lines: string[], start: number): string {
  const heading: string[] = [];
  for (let i = start; i < lines.length && lines[i].trim() !== ''; i++) heading.push(lines[i].trim());
  return heading.join(' ');
}

function splitAtMatches(text: string, matches: Array<{ index: number; key: string; heading: string; source: string }>, end = text.length): PreparedSection[] {
  return matches.map((match, i) => ({
    key: match.key,
    heading: match.heading,
    source: match.source,
    content: text.slice(match.index, matches[i + 1]?.index ?? end),
  }));
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
function romanNumber(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i++) result += (ROMAN[value[i]] ?? 0) < (ROMAN[value[i + 1]] ?? 0) ? -(ROMAN[value[i]] ?? 0) : (ROMAN[value[i]] ?? 0);
  if (result < 1) fail(`invalid Roman numeral ${value}`);
  return result;
}

const CALVIN_VOLUME_II_BACK_MATTER = [
  { marker: 'Footnote 1404:', key: 'book-4-chapter-20-footnotes', heading: 'Book IV, Chapter XX footnotes' },
  { marker: 'INDEX OF THE PRINCIPAL MATTERS.', key: 'index-of-principal-matters', heading: 'Index of the principal matters' },
  { marker: 'SCRIPTURE INDEX TO CALVIN’S INSTITUTES.', key: 'scripture-index-to-calvins-institutes', heading: 'Scripture index to Calvin’s Institutes' },
  { marker: '● Transcriber’s Notes:', key: 'transcribers-notes', heading: 'Transcriber’s notes' },
] as const;

function exactCalvinVolumeIIMarker(body: string, marker: string): number {
  const matches = [...body.matchAll(new RegExp(`^\\s*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gm'))];
  if (matches.length !== 1 || matches[0].index === undefined) fail(`Calvin volume II reviewed back-matter marker drift: ${marker}`);
  const markerOffset = matches[0][0].indexOf(marker);
  if (markerOffset < 0) fail(`Calvin volume II marker extraction drift: ${marker}`);
  return matches[0].index + markerOffset;
}

function assertCalvinBackMatterTopology(sections: readonly PreparedSection[]): void {
  const keys = sections.map(section => section.key);
  const chapter = keys.indexOf('book-4-chapter-20');
  const expected = CALVIN_VOLUME_II_BACK_MATTER.map(item => item.key);
  if (chapter < 0 || JSON.stringify(keys.slice(chapter, chapter + expected.length + 1)) !== JSON.stringify(['book-4-chapter-20', ...expected])) fail('Calvin volume II back matter must follow book 4 chapter 20 in its reviewed order');
  if (sections.length !== 91 || new Set(keys).size !== 91) fail('Calvin must compile as exactly 80 unique chapters, seven edition/book boundaries, and four reviewed back-matter sections');
  const [chapter20, footnotes, principalIndex, scriptureIndex, transcriberNotes] = sections.slice(chapter, chapter + 5);
  if (!chapter20.content.includes('END OF THE INSTITUTES.') || chapter20.content.includes('Footnote 1404:')) fail('Calvin book 4 chapter 20 must end before its separately labeled footnotes');
  if (!footnotes.content.startsWith('Footnote 1404:') || !footnotes.content.includes('Footnote 1490:') || footnotes.content.includes('INDEX OF THE PRINCIPAL MATTERS.')) fail('Calvin chapter 20 footnote back matter drift');
  if (!principalIndex.content.startsWith('INDEX OF THE PRINCIPAL MATTERS.') || !principalIndex.content.includes('THE END') || principalIndex.content.includes('SCRIPTURE INDEX TO CALVIN’S INSTITUTES.')) fail('Calvin principal-index back matter drift');
  if (!scriptureIndex.content.startsWith('SCRIPTURE INDEX TO CALVIN’S INSTITUTES.') || scriptureIndex.content.includes('● Transcriber’s Notes:')) fail('Calvin scripture-index back matter drift');
  if (!transcriberNotes.content.startsWith('● Transcriber’s Notes:') || !transcriberNotes.content.includes('Footnotes have been moved to follow the chapters')) fail('Calvin transcriber-notes back matter drift');
}

export function compileCalvin(sourceLockSha256: string): PreparedArtifact {
  const id = 'gutenberg-pg45001-pg64392-john-allen-calvin';
  const volumes = [
    { role: 'volume_1_utf8_text', label: 'pg45001', initialBook: 0 },
    { role: 'volume_2_utf8_text', label: 'pg64392', initialBook: 3 },
  ];
  const sections: PreparedSection[] = [];
  const normalizedBodies: string[] = [];
  for (const volume of volumes) {
    const body = gutenbergBody(textArtifact(id, volume.role));
    normalizedBodies.push(body);
    const lines = body.split('\n');
    let offset = 0;
    let book = volume.initialBook;
    const matches: Array<{ index: number; key: string; heading: string; source: string }> = [];
    let sawBook = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bookMatch = /^\s*BOOK (I|II|III|IV)\./.exec(line);
      if (bookMatch) {
        if (!sawBook && offset > 0) matches.push({ index: 0, key: `volume-${volume.label === 'pg45001' ? 1 : 2}-front-matter`, heading: `Volume ${volume.label === 'pg45001' ? 'I' : 'II'} front matter`, source: volume.label });
        book = romanNumber(bookMatch[1]);
        matches.push({ index: offset, key: volume.label === 'pg64392' && book === 3 ? 'book-3-volume-2-continuation' : `book-${book}-preface`, heading: headingAt(lines, i), source: volume.label });
        sawBook = true;
      }
      const chapterMatch = /^(?:Chapter|\s*CHAPTER) ([IVXLCDM]+)\./.exec(line);
      if (chapterMatch) {
        if (book < 1 || book > 4) fail(`${volume.label} chapter lacks a reviewed book boundary`);
        const chapter = romanNumber(chapterMatch[1]);
        matches.push({ index: offset, key: `book-${book}-chapter-${chapter}`, heading: headingAt(lines, i), source: volume.label });
      }
      offset += line.length + 1;
    }
    if (!sawBook) fail(`${volume.label} has no book boundary`);
    if (volume.label === 'pg64392') {
      const reviewedMarkers = CALVIN_VOLUME_II_BACK_MATTER.map(item => ({ ...item, index: exactCalvinVolumeIIMarker(body, item.marker) }));
      if (reviewedMarkers.some((item, index) => index > 0 && item.index <= reviewedMarkers[index - 1].index)) fail('Calvin volume II reviewed back-matter markers are out of order');
      const chapter20 = matches.find(match => match.key === 'book-4-chapter-20');
      if (!chapter20 || chapter20.index >= reviewedMarkers[0].index) fail('Calvin volume II chapter 20/back-matter boundary drift');
      matches.push(...reviewedMarkers.map(item => ({ index: item.index, key: item.key, heading: item.heading, source: volume.label })));
      matches.sort((left, right) => left.index - right.index);
    }
    sections.push(...splitAtMatches(body, matches));
  }
  const chapters = sections.filter(section => /-chapter-\d+$/.test(section.key));
  if (chapters.length !== 80) fail('Calvin must compile as exactly 80 unique chapters');
  assertCalvinBackMatterTopology(sections);
  if (sections.map(section => section.content).join('') !== normalizedBodies.join('')) fail('Calvin section boundaries do not preserve the complete two-volume normalized body');
  return prepared(id, sourceLockSha256, { author: 'John Calvin', translator: 'John Allen', title: 'Institutes of the Christian Religion', edition: 'Sixth American Edition, Revised and Corrected, in two volumes' }, 'Complete four-book work from PG45001 and PG64392, locked as one edition.', sections);
}

export const AQUINAS_ARTICLE_VECTOR = [6, 8, 8, 8, 8, 6, 8, 12, 4, 10, 6] as const;

function expectedAquinasKeys(): string[] {
  return AQUINAS_ARTICLE_VECTOR.flatMap((count, index) => {
    const question = index + 73;
    return [`question-${question}-preface`, ...Array.from({ length: count }, (_, article) => `question-${question}-article-${article + 1}`)];
  });
}

export function assertAquinasTopology(sections: readonly PreparedSection[]): void {
  const expected = expectedAquinasKeys();
  const actual = sections.map(section => section.key);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`Aquinas q73-q83 topology drift; expected exact question/article vector ${AQUINAS_ARTICLE_VECTOR.join(',')}`);
  const perQuestion = AQUINAS_ARTICLE_VECTOR.map((count, index) => sections.filter(section => section.key.startsWith(`question-${index + 73}-article-`)).length);
  if (perQuestion.some((count, index) => count !== AQUINAS_ARTICLE_VECTOR[index])) fail('Aquinas q73-q83 per-question article counts drift');
}

export function compileAquinas(sourceLockSha256: string): PreparedArtifact {
  const id = 'gutenberg-pg19950-aquinas-tertia-pars-q73-q83';
  const body = gutenbergBody(textArtifact(id, 'utf8_text'));
  const start = body.search(/^QUESTION 73$/m);
  const end = body.search(/^QUESTION 84$/m);
  if (start < 0 || end <= start) fail('Aquinas q73-q83 scope boundaries are missing');
  const scope = body.slice(start, end).replace(/\n+$/g, '');
  const boundary = /^(QUESTION (7[3-9]|8[0-3])|([A-Z]+) ARTICLE \[III, Q\. (7[3-9]|8[0-3]), Art\. ([0-9]+)\])$/gm;
  const matches: Array<{ index: number; key: string; heading: string; source: string }> = [];
  for (const match of scope.matchAll(boundary)) {
    if (match.index === undefined) fail('Aquinas boundary lacks an index');
    const question = Number(match[2] ?? match[4]);
    const articleNumber = match[5] ? Number(match[5]) : undefined;
    matches.push({ index: match.index, key: articleNumber ? `question-${question}-article-${articleNumber}` : `question-${question}-preface`, heading: match[1], source: 'pg19950' });
  }
  const sections = splitAtMatches(scope, matches);
  const prefaces = sections.filter(s => s.key.endsWith('-preface'));
  const articles = sections.filter(s => !s.key.endsWith('-preface'));
  if (prefaces.length !== 11 || articles.length !== 84 || sections.length !== 95) fail('Aquinas scope must contain 11 question prefaces and 84 articles');
  assertAquinasTopology(sections);
  if (sections.map(section => section.content).join('') !== scope) fail('Aquinas section boundaries do not preserve the complete q73-q83 normalized scope');
  for (const section of articles) {
    for (const marker of ['Objection 1:', '_I answer that,_']) if (!section.content.includes(marker)) fail(`${section.key} does not preserve ${marker}`);
    if (!/(?:_On the contrary,_|On the contrary is)/.test(section.content)) fail(`${section.key} does not preserve its sed contra`);
    if (!section.content.includes('Reply Obj. 1:') && !/answer to the Objections is manifest/i.test(section.content)) fail(`${section.key} does not preserve explicit replies or the source's collective reply`);
  }
  return prepared(id, sourceLockSha256, { author: 'Thomas Aquinas', translator: 'Fathers of the English Dominican Province', title: 'Summa Theologica, Part III (Tertia Pars)', edition: 'Benziger Brothers translation as transformed in Project Gutenberg 19950' }, 'Tertia Pars questions 73 through 83 only; question 84 is excluded.', sections);
}

export function compileAugustine(sourceLockSha256: string): PreparedArtifact {
  const id = 'gutenberg-pg3296-pusey-augustine-confessions';
  const body = gutenbergBody(textArtifact(id, 'utf8_text'));
  const matches: Array<{ index: number; key: string; heading: string; source: string }> = [];
  matches.push({ index: 0, key: 'front-matter', heading: 'Edition front matter', source: 'pg3296' });
  for (const match of body.matchAll(/^BOOK (I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII)$/gm)) {
    if (match.index === undefined) fail('Augustine book boundary lacks an index');
    matches.push({ index: match.index, key: `book-${romanNumber(match[1])}`, heading: match[0], source: 'pg3296' });
  }
  const sections = splitAtMatches(body, matches);
  if (sections.length !== 14 || sections[1].key !== 'book-1' || sections[13].key !== 'book-13') fail('Augustine must contain edition front matter and exactly books I-XIII');
  if (sections.map(section => section.content).join('') !== body) fail('Augustine section boundaries do not preserve the complete normalized body');
  return prepared(id, sourceLockSha256, { author: 'Augustine of Hippo', translator: 'E. B. Pusey (Edward Bouverie)', title: 'The Confessions of Saint Augustine', edition: 'Project Gutenberg 3296 Pusey text' }, 'Complete books I through XIII.', sections);
}

function prepared(sourceId: string, sourceLockSha256: string, edition: PreparedArtifact['edition'], scope: string, sections: PreparedSection[]): PreparedArtifact {
  return { schemaVersion: 'public-domain-section-prep.v1', sourceId, status: 'inactive', delivery: 'sectioned_only', edition, scope, sourceLockSha256, transform: { version: 1, decoding: 'strict_utf8_fatal', newlineChangeOnly: 'crlf_to_lf', modernization: 'none', wrapper: 'gutenberg_start_end_markers_and_adjacent_blank_lines_excluded' }, sections };
}

export function buildAll() {
  verifyAllLockedArtifacts();
  const cyrilAudit = auditCyrilBlockedCandidate();
  const gutenbergAudit = auditGutenbergEditionEvidence();
  const lockBytes = `${JSON.stringify(EXPECTED_SOURCE_LOCK, null, 2)}\n`;
  const lockHash = sha256(lockBytes);
  const artifacts = [compileCalvin(lockHash), compileAquinas(lockHash), compileAugustine(lockHash)];
  return { lockBytes, lockHash, artifacts, cyrilAudit, gutenbergAudit };
}

export function serializeArtifact(value: PreparedArtifact): string { return `${JSON.stringify(value, null, 2)}\n`; }

export function writeAll(): void {
  const { lockBytes, lockHash, artifacts, cyrilAudit, gutenbergAudit } = buildAll();
  writeFileSync(SOURCE_LOCK_PATH, lockBytes);
  const files = ['calvin-john-allen-sixth-american.sections.json', 'aquinas-tertia-pars-q73-q83.sections.json', 'augustine-confessions-pusey.sections.json'];
  const generated = artifacts.map((value, index) => {
    const bytes = serializeArtifact(value);
    writeFileSync(resolve(PREP_DIR, files[index]), bytes);
    return { sourceId: value.sourceId, path: `data/historical-sources/public-domain-prep/${files[index]}`, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes), sections: value.sections.length, contentUtf8Bytes: value.sections.reduce((sum, s) => sum + Buffer.byteLength(s.content), 0) };
  });
  const report = {
    schemaVersion: 'public-domain-normalization-report.v1',
    sourceLock: { path: 'data/historical-sources/public-domain-prep/SOURCE_LOCK.json', bytes: Buffer.byteLength(lockBytes), sha256: lockHash },
    parser: { networkAccess: false, decoder: 'TextDecoder utf-8 fatal; BOM/NUL/replacement/lone-CR rejected', lineEndingTransformation: 'CRLF to LF only', wrapperTransformation: 'Gutenberg START/END marker lines and adjacent wrapper blank lines excluded', sectionBoundaryWhitespace: 'preserved verbatim', modernization: 'none' },
    evidenceAudit: gutenbergAudit,
    structuralAudit: {
      calvinVolumeII: {
        reviewedMarkers: CALVIN_VOLUME_II_BACK_MATTER.map(item => item.marker),
        orderedSectionKeys: ['book-4-chapter-20', ...CALVIN_VOLUME_II_BACK_MATTER.map(item => item.key)],
        totalCalvinSections: artifacts[0].sections.length,
      },
      aquinasQ73ToQ83: {
        questionOrder: Array.from({ length: AQUINAS_ARTICLE_VECTOR.length }, (_, index) => index + 73),
        articleVector: AQUINAS_ARTICLE_VECTOR,
        totalSections: artifacts[1].sections.length,
      },
    },
    generated,
    blocked: [{ sourceId: 'internet-archive-a566189200cypruoft-cyril-1839', reason: EXPECTED_SOURCE_LOCK.candidates[3].blocker, normalizedArtifacts: 0, audit: cyrilAudit }],
    exclusions: { ccelArtifacts: 0, unofficialPdfs: 0, migrations: 0, manifests: 0, d1Seeds: 0, runtimeWiring: 0 },
  };
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) writeAll();
