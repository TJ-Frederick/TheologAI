#!/usr/bin/env tsx
/** Pre-acquisition MACULA Gate-1. Synthetic fixtures and disposable local SQLite/Workerd only. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdtempSync, mkdirSync, openSync,
  readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { BIBLE_BOOKS } from '../src/kernel/books.js';
import { assertMaculaSourceAttribute } from './macula-source-contract.js';

export const MACULA_GATE1_PLAN_VERSION = 'theologai-macula-gate1-synthetic-plan.v2';
export const MACULA_GATE1_EVIDENCE_VERSION = 'theologai-macula-gate1-synthetic-evidence.v2';
export const MACULA_GATE1_PLAN_PATH = 'data/biblical-languages/macula/GATE1-SYNTHETIC-PLAN.json';
export const MACULA_GATE1_SCHEMA_PATH = 'scripts/macula-gate1/sidecar-schema.sql';
export const MACULA_GATE1_SCHEMA_SHA256 = 'b03a7d2812dc3a1babf66858ea4293237fa354ef7a3d7e25fe8fbda4398126ac';
export const MACULA_GATE1_CAPACITY_CEILING_BYTES = 350 * 1024 * 1024;
export const MACULA_GATE1_XML_MAX_BYTES = 1024 * 1024;
export const MACULA_GATE1_TABLES = [
  'source_file', 'reference_context', 'syntax_group', 'token', 'participant_ref', 'group_reference',
] as const;
export const MACULA_ALIGNMENT_CLASSIFICATIONS = [
  'validated_normalized_alignment', 'missing_runtime', 'ambiguous_runtime',
  'segmentation_conflict', 'text_conflict', 'runtime_only',
] as const;
export const MACULA_PARTICIPANT_TARGET_RESOLUTIONS = [
  'exact_token', 'orthographic_word', null, 'dangling',
] as const;

export type MaculaCorpus = 'greek' | 'hebrew';
export type MaculaAlignmentClassification = typeof MACULA_ALIGNMENT_CLASSIFICATIONS[number];
export type ParticipantTargetResolution = typeof MACULA_PARTICIPANT_TARGET_RESOLUTIONS[number];
type Row = Record<string, unknown>;
type TableName = typeof MACULA_GATE1_TABLES[number];

export interface CanonicalCoordinate {
  corpus: MaculaCorpus;
  book: number;
  chapter: number;
  verse: number;
  orthographicWordOrdinal: number;
}
export interface SourceAlignmentWord extends CanonicalCoordinate { sourceSegments: readonly string[] }
export interface RuntimeAlignmentWord extends CanonicalCoordinate { runtimeSegments: readonly string[] }
export interface AlignmentResult {
  classification: MaculaAlignmentClassification;
  sourceSegmentCount: number;
  runtimeSegmentCount: number | null;
  runtimeCandidateCount: number;
}
export interface ParsedMaculaToken extends CanonicalCoordinate {
  sourceTokenId: string;
  sourceMorphOrdinal: number;
  groupOrdinal: number;
  class: string | null;
  role: string | null;
  lang: 'H' | 'A' | null;
  /** Ephemeral alignment input. It is absent from every schema row and evidence object. */
  alignmentOnlyText: string;
}
export interface ParsedParticipantReference {
  sourceTokenId: string;
  relationship: 'referent' | 'subjref' | 'participantref';
  targetSourceId: string | null;
}
export interface ParsedMaculaFixture {
  corpus: MaculaCorpus;
  groups: Array<{ groupOrdinal: number; parentGroupOrdinal: number | null; class: string | null; role: string | null; rule: string | null; head: string | null }>;
  tokens: ParsedMaculaToken[];
  participantReferences: ParsedParticipantReference[];
}

const ID_PREFIX: Record<TableName, string> = {
  source_file: 'sf', reference_context: 'rc', syntax_group: 'sg', token: 'tk', participant_ref: 'pr', group_reference: 'gr',
};
const RIGHTS = {
  maculaGreek: 'Retain the pinned MACULA Greek attribution and CC BY 4.0 link; identify modifications; retain applicable notices; do not imply endorsement or add restrictions.',
  maculaHebrew: 'Retain the pinned MACULA Hebrew attribution and CC BY 4.0 link; identify modifications; retain applicable notices; do not imply endorsement or add restrictions.',
  sblgntDerivedGreek: 'Retain the SBLGNT source, link, license, copyright, and disclaimer notices; identify modifications; do not imply endorsement or add restrictions.',
  oshbDerivedLang: 'Retain supplied Open Scriptures Hebrew Bible attribution, notices, source URI, and CC BY 4.0 link; identify modifications; do not invent a replacement attribution phrase.',
} as const;

function fail(message: string): never { throw new Error(`[macula-gate1] ${message}`); }
function record(value: unknown, label: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Row;
}
function exactKeys(value: Row, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} has unknown or missing fields`);
}
function exact(value: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) fail(`${label} drifted`);
}
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function safePositive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive safe integer`);
}

export function deterministicMaculaId(table: TableName, parts: readonly (string | number)[]): string {
  const prefix = ID_PREFIX[table];
  if (!prefix) fail('unknown deterministic ID table');
  if (!parts.length || parts.some(part => String(part).length === 0)) fail('deterministic ID parts must be non-empty');
  const typedParts = parts.map(part => {
    if (typeof part === 'number') {
      if (!Number.isSafeInteger(part)) fail('numeric deterministic ID parts must be safe integers');
      return { type: 'number', value: part } as const;
    }
    return { type: 'string', value: part } as const;
  });
  return `${prefix}:${sha256(JSON.stringify({ table, parts: typedParts })).slice(0, 32)}`;
}

export function validateCanonicalCoordinate(value: CanonicalCoordinate): void {
  if (value.corpus !== 'hebrew' && value.corpus !== 'greek') fail('coordinate corpus is invalid');
  safePositive(value.book, 'book');
  if (value.book > 66) fail('book is outside the 66-book canon');
  if ((value.corpus === 'hebrew' && value.book > 39) || (value.corpus === 'greek' && value.book < 40)) fail('coordinate has cross-corpus book ownership');
  safePositive(value.chapter, 'chapter');
  if (!Number.isSafeInteger(value.verse) || value.verse < 0) fail('verse must be a non-negative safe integer');
  safePositive(value.orthographicWordOrdinal, 'orthographic word ordinal');
}
export function canonicalCoordinateKey(value: CanonicalCoordinate): string {
  validateCanonicalCoordinate(value);
  return `${value.corpus}:${String(value.book).padStart(2, '0')}:${String(value.chapter).padStart(3, '0')}:${String(value.verse).padStart(3, '0')}:${String(value.orthographicWordOrdinal).padStart(3, '0')}`;
}
function normalized(parts: readonly string[]): string { return parts.map(part => part.normalize('NFC').replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '')).join(''); }
function assertSegments(parts: readonly string[], label: string): void {
  if (!parts.length || parts.some(part => typeof part !== 'string' || normalized([part]).length === 0)) fail(`${label} must contain non-empty segments`);
}

export function classifyMaculaAlignment(source: SourceAlignmentWord | undefined, runtime: readonly RuntimeAlignmentWord[]): AlignmentResult {
  if (!source) {
    if (runtime.length !== 1) fail('runtime_only requires exactly one runtime candidate');
    validateCanonicalCoordinate(runtime[0]!); assertSegments(runtime[0]!.runtimeSegments, 'runtime');
    return { classification: 'runtime_only', sourceSegmentCount: 0, runtimeSegmentCount: runtime[0]!.runtimeSegments.length, runtimeCandidateCount: 1 };
  }
  validateCanonicalCoordinate(source); assertSegments(source.sourceSegments, 'source');
  for (const candidate of runtime) {
    validateCanonicalCoordinate(candidate); assertSegments(candidate.runtimeSegments, 'runtime');
    if (canonicalCoordinateKey(candidate) !== canonicalCoordinateKey(source)) fail('alignment candidates must have the same canonical coordinate');
  }
  if (!runtime.length) return { classification: 'missing_runtime', sourceSegmentCount: source.sourceSegments.length, runtimeSegmentCount: 0, runtimeCandidateCount: 0 };
  if (runtime.length > 1) return { classification: 'ambiguous_runtime', sourceSegmentCount: source.sourceSegments.length, runtimeSegmentCount: null, runtimeCandidateCount: runtime.length };
  const runtimeSegments = runtime[0]!.runtimeSegments;
  if (source.sourceSegments.length !== runtimeSegments.length) return { classification: 'segmentation_conflict', sourceSegmentCount: source.sourceSegments.length, runtimeSegmentCount: runtimeSegments.length, runtimeCandidateCount: 1 };
  if (normalized(source.sourceSegments) !== normalized(runtimeSegments)) return { classification: 'text_conflict', sourceSegmentCount: source.sourceSegments.length, runtimeSegmentCount: runtimeSegments.length, runtimeCandidateCount: 1 };
  return { classification: 'validated_normalized_alignment', sourceSegmentCount: source.sourceSegments.length, runtimeSegmentCount: runtimeSegments.length, runtimeCandidateCount: 1 };
}

export function validateMaculaBookAlignmentCoverage(rows: readonly { corpus: MaculaCorpus; book: number; classification: MaculaAlignmentClassification }[]): ReadonlyMap<number, MaculaAlignmentClassification> {
  if (rows.length !== 66) fail('alignment coverage must contain exactly 66 book rows');
  const result = new Map<number, MaculaAlignmentClassification>();
  for (const row of rows) {
    const expectedCorpus = row.book <= 39 ? 'hebrew' : 'greek';
    if (!Number.isSafeInteger(row.book) || row.book < 1 || row.book > 66 || result.has(row.book)) fail('alignment coverage has a duplicate or out-of-canon book');
    if (row.corpus !== expectedCorpus) fail('alignment coverage has cross-corpus book ownership');
    if (!MACULA_ALIGNMENT_CLASSIFICATIONS.includes(row.classification)) fail('alignment coverage has an unknown classification');
    result.set(row.book, row.classification);
  }
  if (BIBLE_BOOKS.some(book => !result.has(book.number))) fail('alignment coverage omits a canonical book');
  return result;
}

const BOOK_CODES = new Map<string, number>(BIBLE_BOOKS.flatMap(book => [
  [book.helloaoCode.toUpperCase(), book.number] as const,
  [book.abbreviation.toUpperCase(), book.number] as const,
  [book.stepbibleId.toUpperCase(), book.number] as const,
]));
function parseReference(value: string, corpus: MaculaCorpus): CanonicalCoordinate {
  const match = /^([A-Za-z0-9]+) ([1-9][0-9]*):([0-9]+)!([1-9][0-9]*)$/.exec(value);
  if (!match) fail(`invalid synthetic reference ${value}`);
  const book = BOOK_CODES.get(match[1]!.toUpperCase());
  if (!book) fail(`unknown synthetic book ${match[1]}`);
  const coordinate = { corpus, book, chapter: Number(match[2]), verse: Number(match[3]), orthographicWordOrdinal: Number(match[4]) };
  validateCanonicalCoordinate(coordinate);
  return coordinate;
}
function openSafeFixture(path: string, fixtureRoot: string): number {
  const requestedRoot = resolve(fixtureRoot);
  if (lstatSync(requestedRoot).isSymbolicLink()) fail('fixture root may not be a symlink');
  const root = realpathSync(requestedRoot); const requested = resolve(path); const rel = relative(requestedRoot, requested);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail('fixture path escapes the synthetic root');
  let cursor = requestedRoot;
  for (const segment of rel.split(sep)) { cursor = join(cursor, segment); if (lstatSync(cursor).isSymbolicLink()) fail('fixture paths may not contain symlinks'); }
  const actual = realpathSync(requested); const actualRel = relative(root, actual); const beforeOpen = lstatSync(requested);
  if (actualRel === '..' || actualRel.startsWith(`..${sep}`) || isAbsolute(actualRel) || !statSync(actual).isFile() || !beforeOpen.isFile()) fail('fixture must be a regular file inside the synthetic root');
  if (!basename(actual).endsWith('.synthetic.xml')) fail('only *.synthetic.xml fixtures are accepted');
  let fd: number;
  try { fd = openSync(requested, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('fixture could not be opened without following a symlink'); }
  const opened = fstatSync(fd!);
  if (!opened.isFile() || opened.dev !== beforeOpen.dev || opened.ino !== beforeOpen.ino) { closeSync(fd!); fail('fixture identity changed between validation and open'); }
  return fd!;
}
function assertXml10Characters(value: string, label: string): void {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint !== 0x9 && codePoint !== 0xA && codePoint !== 0xD
      && !(codePoint >= 0x20 && codePoint <= 0xD7FF)
      && !(codePoint >= 0xE000 && codePoint <= 0xFFFD)
      && !(codePoint >= 0x10000 && codePoint <= 0x10FFFF)) fail(`${label} contains an XML 1.0-prohibited character`);
  }
}
function parseAttributes(source: string): Record<string, string> {
  const result: Record<string, string> = {}; let rest = source.trim();
  while (rest) {
    const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')\s*/u.exec(rest);
    if (!match) fail('malformed or unquoted XML attribute');
    if (Object.hasOwn(result, match[1]!)) fail(`duplicate XML attribute ${match[1]}`);
    const value = match[2]!.slice(1, -1); assertXml10Characters(value, 'XML attribute'); if (value.includes('&')) fail('XML entities are prohibited'); if (value.includes('<')) fail('XML attribute values may not contain <');
    result[match[1]!] = value; rest = rest.slice(match[0].length);
  }
  return result;
}
function tagEnd(buffer: string): number {
  let quote: '"' | "'" | null = null;
  for (let i = 1; i < buffer.length; i += 1) { const c = buffer[i]!; if (quote) { if (c === quote) quote = null; } else if (c === '"' || c === "'") quote = c; else if (c === '>') return i; }
  return -1;
}

export async function parseSyntheticMaculaXml(path: string, fixtureRoot: string, corpus: MaculaCorpus): Promise<ParsedMaculaFixture> {
  const fd = openSafeFixture(path, fixtureRoot);
  try {
  const groups: ParsedMaculaFixture['groups'] = []; const tokens: ParsedMaculaToken[] = []; const participantReferences: ParsedParticipantReference[] = [];
  const stack: Array<{ name: 'sentence' | 'wg' | 'w'; groupOrdinal?: number; tokenIndex?: number }> = [];
  const coordinateCounts = new Map<string, number>(); let rootSeen = false; let declarationSeen = false; let bytes = 0; let buffer = ''; let textDelimiterTail = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const onText = (value: string) => { assertXml10Characters(value, 'XML text'); const delimiterWindow=`${textDelimiterTail}${value}`; if(delimiterWindow.includes(']]>'))fail('literal ]]> is prohibited in XML text'); textDelimiterTail=delimiterWindow.slice(-2); if (value.includes('&')) fail('XML entities are prohibited'); const current = stack.at(-1); if (current?.name === 'w') tokens[current.tokenIndex!]!.alignmentOnlyText += value; else if (value.trim()) fail('text is allowed only directly inside w'); };
  const close = (name: string) => { const current = stack.pop(); if (!current || current.name !== name) fail(`mismatched closing element ${name}`); if (name === 'w' && !tokens[current.tokenIndex!]!.alignmentOnlyText.normalize('NFC').trim()) fail('word text must be non-empty'); };
  const open = (name: string, attrs: Record<string, string>, selfClosing: boolean) => {
    if (name !== 'sentence' && name !== 'wg' && name !== 'w') fail(`unknown XML element ${name}`);
    if (name === 'sentence') { if (rootSeen || stack.length || Object.keys(attrs).length) fail('sentence must be the sole attribute-free root'); rootSeen = true; stack.push({ name }); }
    else if (name === 'wg') {
      if (!rootSeen || !stack.length || stack.at(-1)?.name === 'w') fail('wg has an invalid direct parent');
      Object.keys(attrs).forEach(attribute => assertMaculaSourceAttribute(corpus, 'group', attribute));
      const parent = stack.at(-1)?.name === 'wg' ? stack.at(-1) : undefined; const groupOrdinal = groups.length + 1;
      groups.push({ groupOrdinal, parentGroupOrdinal: parent?.groupOrdinal ?? null, class: attrs.class ?? null, role: attrs.role ?? null, rule: attrs.rule ?? attrs.Rule ?? null, head: attrs.head ?? null }); stack.push({ name, groupOrdinal });
    } else {
      const parent = stack.at(-1); if (parent?.name !== 'wg' || !parent.groupOrdinal) fail('w must have wg as its direct parent');
      Object.keys(attrs).forEach(attribute => assertMaculaSourceAttribute(corpus, ['referent', 'subjref', 'participantref'].includes(attribute) ? 'participant' : 'word', attribute));
      if (!attrs['xml:id'] || !attrs.ref) fail('w requires xml:id and ref'); if (!/^[A-Za-z_][A-Za-z0-9._-]*$/.test(attrs['xml:id'])) fail('xml:id must be a conservative NCName'); const coordinate = parseReference(attrs.ref, corpus); const key = canonicalCoordinateKey(coordinate); const sourceMorphOrdinal = (coordinateCounts.get(key) ?? 0) + 1; coordinateCounts.set(key, sourceMorphOrdinal);
      const lang = attrs.lang ?? null; if (lang !== null && lang !== 'H' && lang !== 'A') fail('Hebrew lang must be H or A');
      const tokenIndex = tokens.length; tokens.push({ ...coordinate, sourceTokenId: attrs['xml:id'], sourceMorphOrdinal, groupOrdinal: parent.groupOrdinal, class: attrs.class ?? null, role: attrs.role ?? null, lang, alignmentOnlyText: '' });
      for (const relationship of ['referent', 'subjref', 'participantref'] as const) if (attrs[relationship]) for (const targetSourceId of attrs[relationship].split(/\s+/u).filter(Boolean)) participantReferences.push({ sourceTokenId: attrs['xml:id'], relationship, targetSourceId });
      stack.push({ name, tokenIndex });
    }
    if (selfClosing) close(name);
  };
  const inputBuffer=Buffer.allocUnsafe(64*1024);
  while(true) {
    const bytesRead=readSync(fd,inputBuffer,0,inputBuffer.length,null); if(bytesRead===0)break; const chunk=inputBuffer.subarray(0,bytesRead);
    bytes += bytesRead; if (bytes > MACULA_GATE1_XML_MAX_BYTES) fail('synthetic XML exceeds the 1 MiB byte ceiling');
    try { buffer += decoder.decode(chunk, { stream: true }); } catch { fail('synthetic XML is not valid UTF-8'); }
    while (true) {
      const start = buffer.indexOf('<'); if (start < 0) { if (buffer.length > 4096) { onText(buffer.slice(0, -1024)); buffer = buffer.slice(-1024); } break; }
      if (start > 0) { onText(buffer.slice(0, start)); buffer = buffer.slice(start); }
      const end = tagEnd(buffer); if (end < 0) break; const rawInterior=buffer.slice(1,end); assertXml10Characters(rawInterior,'XML tag'); if(/^\s/u.test(rawInterior))fail('whitespace immediately after < is prohibited'); if(/^\/\s/u.test(rawInterior))fail('whitespace immediately after </ is prohibited'); if(/^\?\s/u.test(rawInterior))fail('whitespace immediately after <? is prohibited'); if(rawInterior.startsWith('?')&&rawInterior!=='?xml version="1.0" encoding="UTF-8"?')fail('only one exact reviewed XML declaration is allowed before the root'); if(/\/\s+$/u.test(rawInterior))fail('whitespace between / and > is prohibited'); const raw = rawInterior.trim(); buffer = buffer.slice(end + 1); textDelimiterTail='';
      if (raw.startsWith('?')) { if (raw !== '?xml version="1.0" encoding="UTF-8"?' || declarationSeen || rootSeen) fail('only one exact reviewed XML declaration is allowed before the root'); declarationSeen = true; continue; }
      if (raw.startsWith('!')) fail('DTD, entity, comment, CDATA, and declaration nodes are prohibited');
      if (raw.startsWith('/')) { const name = raw.slice(1).trim(); if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(name)) fail('malformed closing XML tag'); close(name); continue; }
      const selfClosing = raw.endsWith('/'); const body = selfClosing ? raw.slice(0, -1).trimEnd() : raw; const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)(?:\s+([\s\S]*))?$/u.exec(body); if (!match) fail('malformed opening XML tag'); open(match[1]!, parseAttributes(match[2] ?? ''), selfClosing);
    }
  }
  try { buffer += decoder.decode(); } catch { fail('synthetic XML is not valid UTF-8'); }
  onText(buffer); if (!rootSeen || stack.length) fail('synthetic XML is incomplete'); const ids = new Set<string>(); for (const token of tokens) { if (ids.has(token.sourceTokenId)) fail('duplicate source token ID'); ids.add(token.sourceTokenId); }
  return { corpus, groups, tokens, participantReferences };
  } finally { closeSync(fd); }
}

export function assessMaculaGate1Capacity(bytes: number): { bytes: number; ceilingBytes: number; scope: 'project_planning_policy_not_a_cloudflare_limit'; pass: true } {
  if (!Number.isSafeInteger(bytes) || bytes < 0) fail('capacity bytes must be a non-negative safe integer');
  if (bytes > MACULA_GATE1_CAPACITY_CEILING_BYTES) fail('candidate exceeds the project-only 350 MiB planning ceiling (not a Cloudflare limit)');
  return { bytes, ceilingBytes: MACULA_GATE1_CAPACITY_CEILING_BYTES, scope: 'project_planning_policy_not_a_cloudflare_limit', pass: true };
}

export const SEAL_TRIGGER_SQL = MACULA_GATE1_TABLES.flatMap(table => (['INSERT', 'UPDATE', 'DELETE'] as const).map(action =>
  `CREATE TRIGGER seal_${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT, 'macula sidecar sealed'); END;`,
)).join('\n');

function graphCycleCount(database: Database.Database): number {
  return Number((database.prepare(`WITH RECURSIVE walk(source_file_id,corpus,start_id,node_id,path,cycle) AS (
    SELECT source_file_id,corpus,syntax_group_id,syntax_group_id,','||syntax_group_id||',',0 FROM syntax_group
    UNION ALL SELECT w.source_file_id,w.corpus,w.start_id,g.parent_syntax_group_id,w.path||g.parent_syntax_group_id||',',instr(w.path,','||g.parent_syntax_group_id||',')>0
    FROM walk w JOIN syntax_group g ON g.syntax_group_id=w.node_id AND g.source_file_id=w.source_file_id AND g.corpus=w.corpus
    WHERE g.parent_syntax_group_id IS NOT NULL AND w.cycle=0
  ) SELECT count(*) AS count FROM walk WHERE cycle=1`).get() as { count: number }).count);
}
export function validateMaculaContextTokenInvariant(database: Database.Database): 0 {
  const violations = database.prepare(`SELECT c.reference_context_id,c.corpus,c.source_segment_count,count(t.token_id) AS token_count
    FROM reference_context c LEFT JOIN token t ON t.reference_context_id=c.reference_context_id AND t.corpus=c.corpus
    GROUP BY c.reference_context_id,c.corpus,c.source_segment_count HAVING count(t.token_id)<>c.source_segment_count
    ORDER BY c.corpus,c.reference_context_id`).all() as Array<{ reference_context_id:string; corpus:string; source_segment_count:number; token_count:number }>;
  if (violations.length) fail(`context-token invariant failed: ${violations.map(row=>`${row.corpus}/${row.reference_context_id} expected ${row.source_segment_count} got ${row.token_count}`).join('; ')}`);
  return 0;
}
export function validateMaculaGraph(database: Database.Database): { foreignKeyViolations: 0; parentCycles: 0; orphanGroups: 0; contextTokenViolations: 0 } {
  const fk = database.pragma('foreign_key_check') as unknown[]; if (fk.length) fail('sidecar has foreign-key violations');
  const cycles = graphCycleCount(database); if (cycles) fail('sidecar syntax graph contains a parent cycle');
  const orphan = Number((database.prepare(`SELECT count(*) AS count FROM syntax_group child LEFT JOIN syntax_group parent
    ON parent.syntax_group_id=child.parent_syntax_group_id AND parent.source_file_id=child.source_file_id AND parent.corpus=child.corpus
    WHERE child.parent_syntax_group_id IS NOT NULL AND parent.syntax_group_id IS NULL`).get() as { count: number }).count);
  if (orphan) fail('sidecar syntax graph contains an orphan');
  validateMaculaContextTokenInvariant(database);
  return { foreignKeyViolations: 0, parentCycles: 0, orphanGroups: 0, contextTokenViolations: 0 };
}
export function sealMaculaSidecar(database: Database.Database): void {
  validateMaculaGraph(database); database.exec(SEAL_TRIGGER_SQL);
  const triggerNames = (database.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name);
  if (triggerNames.length !== 18) fail('sidecar sealing trigger inventory drifted');
  database.pragma('query_only = ON');
  if (database.pragma('query_only', { simple: true }) !== 1) fail('active verifier connection did not enter query_only mode');
}

export interface SyntheticIds { source: string; otherSource: string; contexts: string[]; groups: string[]; tokens: string[]; participants: string[]; groupReferences: string[] }
export function insertSyntheticMaculaRows(database: Database.Database): SyntheticIds {
  const source = deterministicMaculaId('source_file', ['synthetic-hebrew-primary']); const otherSource = deterministicMaculaId('source_file', ['synthetic-hebrew-other']);
  database.prepare('INSERT INTO source_file VALUES (?,?,?,?,?)').run(source, 'hebrew', 'hebrew.synthetic.xml', '0'.repeat(64), 1);
  database.prepare('INSERT INTO source_file VALUES (?,?,?,?,?)').run(otherSource, 'hebrew', 'other.synthetic.xml', '1'.repeat(64), 1);
  const specs: Array<[number, number | null, number, MaculaAlignmentClassification]> = [
    [1,1,1,'validated_normalized_alignment'], [1,0,0,'missing_runtime'], [1,null,2,'ambiguous_runtime'],
    [2,1,1,'segmentation_conflict'], [1,1,1,'text_conflict'], [0,1,1,'runtime_only'], [1,1,1,'validated_normalized_alignment'],
  ];
  const contexts = specs.map((spec, index) => {
    const id = deterministicMaculaId('reference_context', ['hebrew', 1, 1, 1, index + 1]);
    database.prepare('INSERT INTO reference_context VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, 'hebrew', 1, 1, 1, index + 1, ...spec);
    return id;
  });
  const rootGroup = deterministicMaculaId('syntax_group', [source, 1]); const childGroup = deterministicMaculaId('syntax_group', [source, 2]); const otherGroup = deterministicMaculaId('syntax_group', [otherSource, 1]);
  const groupInsert = database.prepare('INSERT INTO syntax_group VALUES (?,?,?,?,?,?,?,?,?,?)');
  groupInsert.run(rootGroup, source, 'hebrew', null, 'synthetic-root', 1, null, null, null, null);
  groupInsert.run(childGroup, source, 'hebrew', rootGroup, 'synthetic-child', 2, null, null, null, null);
  groupInsert.run(otherGroup, otherSource, 'hebrew', null, 'synthetic-other', 1, null, null, null, null);
  const tokens: string[] = []; const tokenInsert = database.prepare('INSERT INTO token VALUES (?,?,?,?,?,?,?,?,?,?)');
  const tokenContexts = [0,1,2,3,3,4];
  tokenContexts.forEach((contextIndex, index) => { const id = deterministicMaculaId('token', [source, index + 1]); tokens.push(id); tokenInsert.run(id, source, 'hebrew', childGroup, contexts[contextIndex], `source-${index + 1}`, contextIndex === 3 ? (index === 3 ? 1 : 2) : 1, null, null, 'H'); });
  const otherToken = deterministicMaculaId('token', [otherSource, 1]); tokens.push(otherToken); tokenInsert.run(otherToken, otherSource, 'hebrew', otherGroup, contexts[6], 'other-1', 1, null, null, 'H');
  const participantInsert = database.prepare('INSERT INTO participant_ref VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'); const participants: string[] = [];
  const addParticipant = (ordinal: number, resolution: ParticipantTargetResolution, raw: string | null, targetToken: string | null, targetContext: string | null) => {
    const id = deterministicMaculaId('participant_ref', [source, ordinal]); participants.push(id);
    participantInsert.run(id, source, 'hebrew', tokens[0], ordinal === 4 ? 'participantref' : 'subjref', raw, resolution, targetToken, targetToken ? source : null, targetToken ? 'hebrew' : null, targetContext, targetContext ? 'hebrew' : null);
  };
  addParticipant(1, 'exact_token', 'source-2', tokens[1]!, null); addParticipant(2, 'orthographic_word', 'GEN 1:1!2', null, contexts[1]!); addParticipant(3, null, null, null, null); addParticipant(4, 'dangling', 'missing-synthetic', null, null);
  const groupReferences: string[] = []; const grInsert = database.prepare('INSERT INTO group_reference VALUES (?,?,?,?,?,?)');
  contexts.slice(0,6).forEach((context, index) => { const id = deterministicMaculaId('group_reference', [source, index + 1]); groupReferences.push(id); grInsert.run(id, source, 'hebrew', rootGroup, context, index + 1); });
  const otherGr = deterministicMaculaId('group_reference', [otherSource, 1]); groupReferences.push(otherGr); grInsert.run(otherGr, otherSource, 'hebrew', otherGroup, contexts[6], 1);
  return { source, otherSource, contexts, groups: [rootGroup, childGroup, otherGroup], tokens, participants, groupReferences };
}

function expectSqlFailure(run: () => unknown, label: string, expectedReason?: string): void {
  try { run(); } catch(error) { if(expectedReason&&!String(error).includes(expectedReason))fail(`${label} failed for the wrong reason: ${String(error)}`); return; }
  fail(`${label} unexpectedly succeeded`);
}
export function proveMaculaSidecarSchema(root: string): { schemaSha256: string; counts: Row; publicResolvedRows: number; contextTokenInvariantViolations: 0; contextTokenNegativeProofDetected: true; sealedTriggerCount: 18 } {
  const schema = readFileSync(join(root, MACULA_GATE1_SCHEMA_PATH)); if (sha256(schema) !== MACULA_GATE1_SCHEMA_SHA256) fail('sidecar schema bytes differ from the closed SHA-256');
  const db = new Database(':memory:');
  try {
    db.exec(schema.toString('utf8'));
    const tables = (db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name); exact(tables, [...MACULA_GATE1_TABLES].sort(), 'schema table inventory');
    const views = (db.prepare("SELECT name FROM sqlite_schema WHERE type='view' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name); exact(views, ['public_resolved_participant_ref','public_validated_reference_context'], 'schema view inventory');
    const indexes = (db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name); exact(indexes, ['group_reference_context_lookup','participant_ref_private_resolution','reference_context_coordinate_lookup','token_context_lookup'], 'schema index inventory');
    for (const table of ['syntax_group','token','participant_ref','group_reference']) if (!(db.pragma(`foreign_key_list(${table})`) as unknown[]).length) fail(`${table} foreign keys are missing`);
    const ids = insertSyntheticMaculaRows(db); validateMaculaGraph(db);
    const counts = Object.fromEntries(MACULA_GATE1_TABLES.map(table => [table, Number((db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count)]));
    exact(counts, { source_file: 2, reference_context: 7, syntax_group: 3, token: 7, participant_ref: 4, group_reference: 7 }, 'synthetic proof counts');
    const classes = (db.prepare('SELECT alignment_classification,count(*) AS count FROM reference_context GROUP BY alignment_classification ORDER BY alignment_classification').all() as Array<{alignment_classification:string}>).map(row => row.alignment_classification).sort(); exact(classes, [...MACULA_ALIGNMENT_CLASSIFICATIONS].sort(), 'synthetic alignment class inventory');
    const states = db.prepare(`SELECT coalesce(target_resolution,'null') AS state,count(*) AS count FROM participant_ref GROUP BY target_resolution ORDER BY state`).all(); exact(states, [{state:'dangling',count:1},{state:'exact_token',count:1},{state:'null',count:1},{state:'orthographic_word',count:1}], 'synthetic participant states');
    const publicRows = Number((db.prepare('SELECT count(*) AS count FROM public_resolved_participant_ref').get() as {count:number}).count); if (publicRows !== 2) fail('public participant exclusion drifted');
    if (Number((db.prepare(`SELECT count(*) AS count FROM public_resolved_participant_ref WHERE target_resolution IS NULL OR target_resolution='dangling'`).get() as {count:number}).count)) fail('public participant view leaked private states');
    if (Number((db.prepare('SELECT count(*) AS count FROM public_validated_reference_context').get() as {count:number}).count) !== 2) fail('validated context view drifted');
    const invariantToken=deterministicMaculaId('token',['context-invariant-negative']); db.prepare('INSERT INTO token VALUES (?,?,?,?,?,?,?,?,?,?)').run(invariantToken,ids.source,'hebrew',ids.groups[1],ids.contexts[0],'invariant-extra',2,null,null,'H'); expectSqlFailure(()=>validateMaculaContextTokenInvariant(db),'context-token invariant negative proof','context-token invariant failed'); db.prepare('DELETE FROM token WHERE token_id=? AND source_file_id=? AND corpus=?').run(invariantToken,ids.source,'hebrew'); validateMaculaContextTokenInvariant(db);
    expectSqlFailure(() => db.prepare('INSERT INTO token VALUES (?,?,?,?,?,?,?,?,?,?)').run(deterministicMaculaId('token',['cross']), ids.source, 'hebrew', ids.groups[2], ids.contexts[0], 'cross', 9, null,null,'H'), 'cross-source token-group FK');
    expectSqlFailure(() => db.prepare('UPDATE syntax_group SET parent_syntax_group_id=? WHERE syntax_group_id=? AND source_file_id=?').run(ids.groups[2], ids.groups[1], ids.source), 'cross-source parent-group FK');
    expectSqlFailure(() => db.prepare('INSERT INTO syntax_group VALUES (?,?,?,?,?,?,?,?,?,?)').run(deterministicMaculaId('syntax_group',['duplicate']),ids.source,'hebrew',null,'synthetic-root',99,null,null,null,null), 'duplicate source group');
    expectSqlFailure(() => db.prepare('INSERT INTO token VALUES (?,?,?,?,?,?,?,?,?,?)').run(deterministicMaculaId('token',['duplicate']),ids.source,'hebrew',ids.groups[1],ids.contexts[4],'source-1',9,null,null,'H'), 'duplicate source token');
    expectSqlFailure(() => db.prepare('INSERT INTO participant_ref VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(deterministicMaculaId('participant_ref',['cross']),ids.source,'hebrew',ids.tokens[0],'subjref','other-1','exact_token',ids.tokens[6],ids.otherSource,'hebrew',null,null), 'cross-source participant target');
    expectSqlFailure(() => db.prepare('INSERT INTO participant_ref VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(deterministicMaculaId('participant_ref',['state']),ids.source,'hebrew',ids.tokens[0],'subjref',null,'unreviewed',null,null,null,null,null), 'unknown participant target state');
    expectSqlFailure(() => db.prepare('INSERT INTO group_reference VALUES (?,?,?,?,?,?)').run(deterministicMaculaId('group_reference',['cross']),ids.source,'hebrew',ids.groups[2],ids.contexts[0],99), 'cross-source group reference');
    expectSqlFailure(() => db.prepare('INSERT INTO reference_context VALUES (?,?,?,?,?,?,?,?,?,?)').run(deterministicMaculaId('reference_context',['invalid']),'hebrew',1,1,1,99,2,1,1,'validated_normalized_alignment'), 'invalid alignment cardinality');
    // The cycle update itself is FK-valid; graph validation must reject it, then rollback.
    db.exec('BEGIN'); db.prepare('UPDATE syntax_group SET parent_syntax_group_id=? WHERE syntax_group_id=?').run(ids.groups[1], ids.groups[0]); expectSqlFailure(() => validateMaculaGraph(db), 'cycle validation'); db.exec('ROLLBACK');
    sealMaculaSidecar(db); db.pragma('query_only = OFF'); expectSqlFailure(() => db.prepare('DELETE FROM participant_ref').run(), 'sealed mutation'); db.pragma('query_only = ON');
    return { schemaSha256: MACULA_GATE1_SCHEMA_SHA256, counts, publicResolvedRows: publicRows, contextTokenInvariantViolations:0, contextTokenNegativeProofDetected:true, sealedTriggerCount: 18 };
  } finally { db.close(); }
}

export function publicParticipantAggregate(): { counts: readonly [{relationship:'participantref';count:4},{relationship:'subjref';count:5}]; releaseEligible:false } {
  return { counts: [{ relationship:'participantref', count:4 },{ relationship:'subjref', count:5 }], releaseEligible:false };
}

export function parseMaculaGate1Plan(value: unknown): Row {
  const plan = record(value,'plan'); exactKeys(plan,['schemaVersion','status','schema','tables','canonicalCoordinates','alignmentClassifications','displayTextJoinPolicy','ambiguousRuntimeSegmentCountPolicy','contextTokenInvariant','participantTargetResolutions','danglingParticipantPolicy','capacityPolicy','rightsTemplates','futureReproductionLocks','inertness'],'plan');
  if (plan.schemaVersion !== MACULA_GATE1_PLAN_VERSION || plan.status !== 'pre_acquisition_synthetic_local_only') fail('plan identity drifted');
  exact(plan.schema,{ path:MACULA_GATE1_SCHEMA_PATH, sha256:MACULA_GATE1_SCHEMA_SHA256 },'schema lock'); exact(plan.tables,MACULA_GATE1_TABLES,'table contract');
  exact(plan.canonicalCoordinates,['corpus','book','chapter','verse','orthographic_word_ordinal','source_morph_ordinal'],'coordinate contract'); exact(plan.alignmentClassifications,MACULA_ALIGNMENT_CLASSIFICATIONS,'alignment contract');
  if (plan.displayTextJoinPolicy !== 'validated_normalized_alignment_context_only_no_text_stored') fail('display-text policy drifted'); if(plan.ambiguousRuntimeSegmentCountPolicy!=='null_until_one_runtime_candidate_is_selected')fail('ambiguous runtime cardinality policy drifted'); if(plan.contextTokenInvariant!=='pre_seal_token_count_equals_source_segment_count_for_every_context')fail('context-token invariant policy drifted'); exact(plan.participantTargetResolutions,MACULA_PARTICIPANT_TARGET_RESOLUTIONS,'participant resolution contract');
  exact(plan.danglingParticipantPolicy,{ privateRetention:true,publicRowPolicy:'exact_token_or_orthographic_word_only',aggregateOnly:[{relationship:'participantref',count:4},{relationship:'subjref',count:5}],releaseEligible:false,guessedTargets:'prohibited',futureAuthoritativeTotals:{exact_token:144418,orthographic_word:2380,null:6,dangling:9,reproductionStatus:'future_only_not_claimed_by_synthetic_evidence'} },'participant policy');
  exact(plan.capacityPolicy,{ceilingBytes:MACULA_GATE1_CAPACITY_CEILING_BYTES,ceilingMiB:350,scope:'project_planning_policy_not_a_cloudflare_limit',onExceed:'fail'},'capacity policy'); exact(plan.rightsTemplates,RIGHTS,'rights templates');
  exact(plan.futureReproductionLocks,{historicalAuditIdentity:'2d5e770ee05260fbbf4f6810153f815e55b86b602ca301e30b7274c3637124b7',projectionSha256:'c5a61cf047e662a6d2238093edefa7dc540ce8f2b2bbeb49115cb94329fab414',execution:'not_executed_or_opened_by_gate1'},'future locks');
  exact(plan.inertness,{fixtures:'synthetic_only',network:'prohibited',repositoryCorpusArtifacts:'prohibited',canonicalMigrationOrManifest:'prohibited',runtimeOrPublicSurfaceActivation:'prohibited',remoteD1OrCloudflare:'prohibited'},'inertness'); return plan;
}
export function readMaculaGate1Plan(root:string):Row { try { return parseMaculaGate1Plan(JSON.parse(readFileSync(join(root,MACULA_GATE1_PLAN_PATH),'utf8'))); } catch(error) { if(error instanceof SyntaxError) fail('plan is invalid JSON'); throw error; } }

const WORKER_QUERY = 'SELECT alignment_classification,count(*) AS count FROM reference_context GROUP BY alignment_classification ORDER BY alignment_classification';
const PRIVATE_QUERY = "SELECT coalesce(target_resolution,'null') AS state,count(*) AS count FROM participant_ref GROUP BY target_resolution ORDER BY state";
const PUBLIC_QUERY = 'SELECT target_resolution,count(*) AS count FROM public_resolved_participant_ref GROUP BY target_resolution ORDER BY target_resolution';
const TABLE_COUNT_QUERY = 'SELECT (SELECT count(*) FROM source_file) AS source_file,(SELECT count(*) FROM reference_context) AS reference_context,(SELECT count(*) FROM syntax_group) AS syntax_group,(SELECT count(*) FROM token) AS token,(SELECT count(*) FROM participant_ref) AS participant_ref,(SELECT count(*) FROM group_reference) AS group_reference';
const RUNTIME_ONLY_QUERY = "SELECT count(*) AS count FROM reference_context c LEFT JOIN token t ON t.reference_context_id=c.reference_context_id AND t.corpus=c.corpus WHERE c.alignment_classification='runtime_only' AND t.token_id IS NULL";
const CONTEXT_TOKEN_INVARIANT_QUERY = 'SELECT c.reference_context_id,c.source_segment_count,count(t.token_id) AS token_count FROM reference_context c LEFT JOIN token t ON t.reference_context_id=c.reference_context_id AND t.corpus=c.corpus GROUP BY c.reference_context_id,c.source_segment_count HAVING count(t.token_id)<>c.source_segment_count ORDER BY c.reference_context_id';
const WORKER_INVARIANT_TOKEN_ID = deterministicMaculaId('token',['workerd-context-invariant-negative']);
const INVARIANT_INSERT_QUERY = `INSERT INTO token VALUES ('${WORKER_INVARIANT_TOKEN_ID}',(SELECT source_file_id FROM source_file WHERE synthetic_path='hebrew.synthetic.xml'),'hebrew',(SELECT g.syntax_group_id FROM syntax_group g JOIN source_file s ON s.source_file_id=g.source_file_id AND s.corpus=g.corpus WHERE s.synthetic_path='hebrew.synthetic.xml' AND g.group_ordinal=2),(SELECT reference_context_id FROM reference_context WHERE corpus='hebrew' AND book=1 AND chapter=1 AND verse=1 AND orthographic_word_ordinal=1),'workerd-invariant-extra',2,NULL,NULL,'H')`;
const INVARIANT_DELETE_QUERY = `DELETE FROM token WHERE token_id='${WORKER_INVARIANT_TOKEN_ID}'`;
const MUTATION_QUERY = "DELETE FROM participant_ref WHERE target_resolution='dangling'";
const CROSS_SOURCE_QUERY = "INSERT INTO token VALUES ('tk:00000000000000000000000000000000',(SELECT source_file_id FROM source_file WHERE synthetic_path='hebrew.synthetic.xml'),'hebrew',(SELECT g.syntax_group_id FROM syntax_group g JOIN source_file s ON s.source_file_id=g.source_file_id AND s.corpus=g.corpus WHERE s.synthetic_path='other.synthetic.xml' LIMIT 1),(SELECT reference_context_id FROM reference_context ORDER BY reference_context_id LIMIT 1),'cross-workerd',99,NULL,NULL,'H')";
const APPROVED_COMMANDS = new Set([WORKER_QUERY,PRIVATE_QUERY,PUBLIC_QUERY,TABLE_COUNT_QUERY,RUNTIME_ONLY_QUERY,CONTEXT_TOKEN_INVARIANT_QUERY,INVARIANT_INSERT_QUERY,INVARIANT_DELETE_QUERY,MUTATION_QUERY,CROSS_SOURCE_QUERY,'PRAGMA foreign_key_check','SELECT count(*) AS count FROM public_validated_reference_context']);
function operationRelative(root:string,path:string):void { const realRoot=realpathSync(root); const real=realpathSync(path); const rel=relative(realRoot,real); if(!rel||rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel)) fail('Workerd path is outside the fresh operation root'); }
export function syntheticWorkerdConfig(root:string):string { return `name = "macula-gate1-synthetic"\nmain = "${join(root,'worker.mjs')}"\ncompatibility_date = "2026-08-01"\n[[d1_databases]]\nbinding = "MACULA_SYNTHETIC_DB"\ndatabase_name = "macula-gate1-synthetic"\ndatabase_id = "00000000-0000-0000-0000-000000000001"\n`; }
export function validateSyntheticWorkerdConfig(text:string,root:string):void { if(text!==syntheticWorkerdConfig(root)) fail('Workerd config differs from the exact single-binding synthetic config'); }
export function validateSyntheticWorkerdArgv(argv:readonly string[],root:string):void {
  const common=['d1','execute','MACULA_SYNTHETIC_DB','--local','--persist-to',join(root,'state'),'--config',join(root,'wrangler.toml')];
  if(argv.length!==common.length+3 || !common.every((value,index)=>argv[index]===value) || argv.at(-1)!=='--json') fail('Workerd argv differs from the exact ordered local grammar');
  const mode=argv[common.length]; const value=argv[common.length+1]; if(mode==='--file') operationRelative(root,String(value)); else if(mode==='--command') { if(!APPROVED_COMMANDS.has(String(value))) fail('Workerd command is not in the closed query grammar'); } else fail('Workerd argv requires exactly one file or approved command');
  operationRelative(root,join(root,'state')); operationRelative(root,join(root,'wrangler.toml'));
}
export function syntheticWorkerdEnvironment(root:string):NodeJS.ProcessEnv { return { HOME:join(root,'home'),XDG_CONFIG_HOME:join(root,'xdg'),TMPDIR:join(root,'tmp'),WRANGLER_LOG_PATH:join(root,'wrangler.log'),WRANGLER_SEND_METRICS:'false',NO_COLOR:'1' }; }
interface WranglerPage { results?:Row[]; meta?:Row }
function pages(text:string):WranglerPage[] { const parsed=JSON.parse(text) as unknown; if(!Array.isArray(parsed)) fail('Wrangler output is not a page array'); return parsed.map(page=>record(page,'Wrangler page')); }
function sqlLiteral(value:unknown):string { if(value===null)return 'NULL'; if(typeof value==='number')return String(value); return `'${String(value).replaceAll("'","''")}'`; }
function databaseSeed(database:Database.Database):string {
  const order:Record<TableName,string>={source_file:'corpus,synthetic_path',reference_context:'corpus,book,chapter,verse,orthographic_word_ordinal',syntax_group:'source_file_id,group_ordinal',token:'source_file_id,source_token_id',participant_ref:'source_file_id,participant_ref_id',group_reference:'source_file_id,reference_ordinal'};
  return MACULA_GATE1_TABLES.map(table=>{const rows=database.prepare(`SELECT * FROM ${table} ORDER BY ${order[table]}`).all() as Row[];return rows.map(row=>`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(sqlLiteral).join(',')});`).join('\n');}).join('\n');
}
export function runSyntheticMaculaWorkerdProof(root:string):Row {
  const op=mkdtempSync(join(realpathSync(tmpdir()),'theologai-macula-gate1-'));
  try {
    for(const dir of ['state','home','xdg','tmp'])mkdirSync(join(op,dir),{recursive:true,mode:0o700}); const worker=join(op,'worker.mjs'); const config=join(op,'wrangler.toml'); const schema=join(op,'schema.sql'); const seed=join(op,'seed.sql'); const seal=join(op,'seal.sql');
    writeFileSync(worker,'export default { fetch(){ return new Response("synthetic local only"); } };\n',{mode:0o600}); writeFileSync(config,syntheticWorkerdConfig(op),{mode:0o600}); validateSyntheticWorkerdConfig(readFileSync(config,'utf8'),op); writeFileSync(schema,readFileSync(join(root,MACULA_GATE1_SCHEMA_PATH)),{mode:0o600});
    const native=new Database(':memory:'); native.exec(readFileSync(schema,'utf8')); insertSyntheticMaculaRows(native); writeFileSync(seed,databaseSeed(native),{mode:0o600}); native.close(); writeFileSync(seal,SEAL_TRIGGER_SQL,{mode:0o600});
    const wrangler=join(root,'node_modules','wrangler','bin','wrangler.js'); const env=syntheticWorkerdEnvironment(op);
    const run=(mode:'--file'|'--command',value:string,expectedFailure?:string)=>{
      const argv=['d1','execute','MACULA_SYNTHETIC_DB','--local','--persist-to',join(op,'state'),'--config',config,mode,value,'--json']; validateSyntheticWorkerdArgv(argv,op); const started=performance.now();
      try {
        const output=execFileSync(process.execPath,[wrangler,...argv],{cwd:op,encoding:'utf8',env,stdio:['ignore','pipe','pipe']});
        if(expectedFailure)fail(`expected Workerd failure containing ${expectedFailure}`);
        return {elapsedMs:Math.round((performance.now()-started)*1000)/1000,pages:pages(output)};
      } catch(error) {
        if(error instanceof Error&&error.message.startsWith('[macula-gate1] expected Workerd failure'))throw error;
        const detail=error as {stderr?:unknown;stdout?:unknown;message?:string}; const diagnostic=String(detail.stderr??'').trim()||String(detail.stdout??'').trim()||detail.message||String(error);
        if(expectedFailure){if(!diagnostic.includes(expectedFailure))fail(`Workerd failed for the wrong reason: ${diagnostic}`);return {elapsedMs:Math.round((performance.now()-started)*1000)/1000,pages:[]};}
        fail(`local Workerd command failed: ${diagnostic}`);
      }
    };
    run('--file',schema); run('--file',seed); const alignment=run('--command',WORKER_QUERY); const privateRows=run('--command',PRIVATE_QUERY); const publicRows=run('--command',PUBLIC_QUERY); const tableRows=run('--command',TABLE_COUNT_QUERY); const runtimeOnly=run('--command',RUNTIME_ONLY_QUERY); const validated=run('--command','SELECT count(*) AS count FROM public_validated_reference_context'); const invariantInitial=run('--command',CONTEXT_TOKEN_INVARIANT_QUERY); run('--command',INVARIANT_INSERT_QUERY); const invariantNegative=run('--command',CONTEXT_TOKEN_INVARIANT_QUERY); run('--command',INVARIANT_DELETE_QUERY); const invariantFinal=run('--command',CONTEXT_TOKEN_INVARIANT_QUERY); const foreignKeys=run('--command','PRAGMA foreign_key_check'); run('--command',CROSS_SOURCE_QUERY,'FOREIGN KEY constraint failed'); run('--file',seal); run('--command',MUTATION_QUERY,'macula sidecar sealed');
    const allPages=[...alignment.pages,...privateRows.pages,...publicRows.pages,...tableRows.pages,...runtimeOnly.pages,...validated.pages,...invariantInitial.pages,...invariantNegative.pages,...invariantFinal.pages,...foreignKeys.pages]; const reported=allPages.map(page=>page.meta?.rows_read); const rowsRead=reported.every(value=>Number.isSafeInteger(value)&&Number(value)>=0)?reported.reduce<number>((sum,value)=>sum+Number(value),0):null; const observation=rowsRead===null?'not_reported_by_local_wrangler_d1_meta':'reported_by_local_wrangler_d1_meta';
    exact(alignment.pages.flatMap(page=>page.results??[]),[{alignment_classification:'ambiguous_runtime',count:1},{alignment_classification:'missing_runtime',count:1},{alignment_classification:'runtime_only',count:1},{alignment_classification:'segmentation_conflict',count:1},{alignment_classification:'text_conflict',count:1},{alignment_classification:'validated_normalized_alignment',count:2}],'Workerd alignment proof'); exact(privateRows.pages.flatMap(page=>page.results??[]),[{state:'dangling',count:1},{state:'exact_token',count:1},{state:'null',count:1},{state:'orthographic_word',count:1}],'Workerd private participant proof'); exact(publicRows.pages.flatMap(page=>page.results??[]),[{target_resolution:'exact_token',count:1},{target_resolution:'orthographic_word',count:1}],'Workerd public participant proof');
    const tableCounts=tableRows.pages.flatMap(page=>page.results??[])[0]; exact(tableCounts,{source_file:2,reference_context:7,syntax_group:3,token:7,participant_ref:4,group_reference:7},'Workerd table counts'); exact(runtimeOnly.pages.flatMap(page=>page.results??[]),[{count:1}],'Workerd runtime-only proof'); exact(validated.pages.flatMap(page=>page.results??[]),[{count:2}],'Workerd validated-context proof'); exact(invariantInitial.pages.flatMap(page=>page.results??[]),[],'Workerd initial context-token invariant'); exact(invariantNegative.pages.flatMap(page=>page.results??[]),[{reference_context_id:deterministicMaculaId('reference_context',['hebrew',1,1,1,1]),source_segment_count:1,token_count:2}],'Workerd context-token negative proof'); exact(invariantFinal.pages.flatMap(page=>page.results??[]),[],'Workerd final context-token invariant'); if(foreignKeys.pages.flatMap(page=>page.results??[]).length)fail('Workerd foreign-key check failed');
    const observedMetadataKeys=[...new Set(allPages.flatMap(page=>Object.keys(page.meta??{})))].sort();
    return {status:'synthetic_local_workerd_proof_passed',schemaSha256:MACULA_GATE1_SCHEMA_SHA256,tableCounts,alignmentClassCount:6,validatedContextRows:2,privateParticipantStateCount:4,publicResolvedRows:2,runtimeOnlyContextWithoutSourceToken:true,contextTokenInvariantNegativeDetected:true,contextTokenInvariantFinalViolations:0,crossSourceFailure:true,postSealMutationFailure:true,rowsRead,rowsReadObservation:observation,observedMetadataKeys};
  } finally { rmSync(op,{recursive:true,force:true}); }
}

export function parseMaculaGate1Evidence(value:unknown):Row {
  const evidence=record(value,'evidence'); exactKeys(evidence,['schemaVersion','status','schemaProof','fixtures','alignment','contextTokenInvariant','participantPublic','capacityPolicy','workerd','inertness'],'evidence'); if(evidence.schemaVersion!==MACULA_GATE1_EVIDENCE_VERSION||evidence.status!=='synthetic_local_only_pass')fail('evidence identity drifted');
  const schemaProof=record(evidence.schemaProof,'schema proof'); exact(schemaProof,{schemaSha256:MACULA_GATE1_SCHEMA_SHA256,counts:{source_file:2,reference_context:7,syntax_group:3,token:7,participant_ref:4,group_reference:7},publicResolvedRows:2,contextTokenInvariantViolations:0,contextTokenNegativeProofDetected:true,sealedTriggerCount:18},'schema proof');
  exact(evidence.fixtures,[{corpus:'greek',source:'greek.synthetic.xml',groups:1,tokens:2},{corpus:'hebrew',source:'hebrew.synthetic.xml',groups:1,tokens:2}],'fixture proof'); exact(evidence.alignment,{canonicalBooks:66,hebrewBooks:39,greekBooks:27,classifications:MACULA_ALIGNMENT_CLASSIFICATIONS,ambiguousRuntimeSegmentCount:null,displayTextJoin:'validated_context_only_no_text_stored'},'alignment proof'); exact(evidence.contextTokenInvariant,{policy:'token_count_equals_source_segment_count_pre_seal',nativeViolations:0,nativeNegativeProofDetected:true},'context-token invariant proof'); exact(evidence.participantPublic,publicParticipantAggregate(),'participant public proof'); exact(evidence.capacityPolicy,{ceilingBytes:MACULA_GATE1_CAPACITY_CEILING_BYTES,scope:'project_planning_policy_not_a_cloudflare_limit',onExceed:'fail'},'capacity proof');
  const workerd=record(evidence.workerd,'Workerd evidence'); if(workerd.status==='not_run')exact(workerd,{status:'not_run',reason:'optional_local_only_probe_not_requested'},'Workerd evidence'); else {
    exactKeys(workerd,['status','schemaSha256','tableCounts','alignmentClassCount','validatedContextRows','privateParticipantStateCount','publicResolvedRows','runtimeOnlyContextWithoutSourceToken','contextTokenInvariantNegativeDetected','contextTokenInvariantFinalViolations','crossSourceFailure','postSealMutationFailure','rowsRead','rowsReadObservation','observedMetadataKeys'],'Workerd evidence');
    if(workerd.status!=='synthetic_local_workerd_proof_passed'||workerd.schemaSha256!==MACULA_GATE1_SCHEMA_SHA256||JSON.stringify(workerd.tableCounts)!==JSON.stringify({source_file:2,reference_context:7,syntax_group:3,token:7,participant_ref:4,group_reference:7})||workerd.alignmentClassCount!==6||workerd.validatedContextRows!==2||workerd.privateParticipantStateCount!==4||workerd.publicResolvedRows!==2||workerd.runtimeOnlyContextWithoutSourceToken!==true||workerd.contextTokenInvariantNegativeDetected!==true||workerd.contextTokenInvariantFinalViolations!==0||workerd.crossSourceFailure!==true||workerd.postSealMutationFailure!==true)fail('Workerd evidence drifted');
    const validRowsRead=workerd.rowsRead===null||(Number.isSafeInteger(workerd.rowsRead)&&Number(workerd.rowsRead)>=0); if(!validRowsRead)fail('Workerd rowsRead must be null or a nonnegative safe integer');
    if(!['not_reported_by_local_wrangler_d1_meta','reported_by_local_wrangler_d1_meta'].includes(String(workerd.rowsReadObservation))||(workerd.rowsRead===null)!==(workerd.rowsReadObservation==='not_reported_by_local_wrangler_d1_meta'))fail('rows-read observation contradicts rowsRead');
    if(!Array.isArray(workerd.observedMetadataKeys)||workerd.observedMetadataKeys.length>16||workerd.observedMetadataKeys.some(key=>typeof key!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key))||JSON.stringify(workerd.observedMetadataKeys)!==JSON.stringify([...new Set(workerd.observedMetadataKeys)].sort()))fail('observed metadata keys must be bounded, string-only, sorted, and unique');
  }
  exact(evidence.inertness,{sourceBytes:'synthetic_fixtures_only',historicalAuditOpened:false,corpusAcquired:false,runtimeActivated:false,releaseEligible:false},'evidence inertness'); return evidence;
}
export async function buildMaculaGate1SyntheticEvidence(root:string,includeWorkerd=false):Promise<Row> {
  readMaculaGate1Plan(root); const schemaProof=proveMaculaSidecarSchema(root); const fixtureRoot=join(root,'test/fixtures/macula-gate1'); const fixtures=[]; for(const corpus of ['greek','hebrew'] as const){const source=`${corpus}.synthetic.xml`;const parsed=await parseSyntheticMaculaXml(join(fixtureRoot,source),fixtureRoot,corpus);fixtures.push({corpus,source,groups:parsed.groups.length,tokens:parsed.tokens.length});}
  validateMaculaBookAlignmentCoverage(BIBLE_BOOKS.map((book,index)=>({book:book.number,corpus:(book.number<=39?'hebrew':'greek') as MaculaCorpus,classification:MACULA_ALIGNMENT_CLASSIFICATIONS[index%6]!}))); assessMaculaGate1Capacity(0);
  return parseMaculaGate1Evidence({schemaVersion:MACULA_GATE1_EVIDENCE_VERSION,status:'synthetic_local_only_pass',schemaProof,fixtures,alignment:{canonicalBooks:66,hebrewBooks:39,greekBooks:27,classifications:MACULA_ALIGNMENT_CLASSIFICATIONS,ambiguousRuntimeSegmentCount:null,displayTextJoin:'validated_context_only_no_text_stored'},contextTokenInvariant:{policy:'token_count_equals_source_segment_count_pre_seal',nativeViolations:0,nativeNegativeProofDetected:true},participantPublic:publicParticipantAggregate(),capacityPolicy:{ceilingBytes:MACULA_GATE1_CAPACITY_CEILING_BYTES,scope:'project_planning_policy_not_a_cloudflare_limit',onExceed:'fail'},workerd:includeWorkerd?runSyntheticMaculaWorkerdProof(root):{status:'not_run',reason:'optional_local_only_probe_not_requested'},inertness:{sourceBytes:'synthetic_fixtures_only',historicalAuditOpened:false,corpusAcquired:false,runtimeActivated:false,releaseEligible:false}});
}
export function parseMaculaGate1CliArgs(args:readonly string[]):{workerd:boolean}{if(!args.length)return{workerd:false};if(args.length===1&&args[0]==='--workerd')return{workerd:true};fail('usage: tsx scripts/macula-gate1.ts [--workerd]');}

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const options=parseMaculaGate1CliArgs(process.argv.slice(2));void buildMaculaGate1SyntheticEvidence(ROOT,options.workerd).then(evidence=>{console.error('[macula-gate1] Verified closed synthetic plan/evidence, exact schema proof, parser, graph sealing, and inertness.');process.stdout.write(`${JSON.stringify(evidence)}\n`);}).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});}
