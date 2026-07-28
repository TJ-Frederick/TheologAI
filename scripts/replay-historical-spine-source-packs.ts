/**
 * Local-only deterministic replay for the inactive historical-spine packs.
 *
 * This intentionally has no network client and never writes a reviewed pack.
 * A caller supplies already-reviewed bytes outside the repository; this script
 * hashes and sizes every declared local input before parsing, renders
 * into a temporary directory, then requires byte-for-byte agreement with the
 * checked-in normalized packages and manifests.  The explicit receipt mode
 * writes only sanitized replay evidence after that exact-byte proof succeeds.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { compileEditionPackage } from '../src/kernel/editionProvenanceFoundation.js';
import {
  loadHistoricalSourcePacks,
  type HistoricalSourcePackRecord,
} from './historical-source-packs.js';

type XmlNode = {
  nodeName: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: XmlNode[];
};

type InputRole = 'authority' | 'comparator' | 'derived';
export interface SourceInput {
  editionId: string;
  role: InputRole;
  path: string;
  sha256: string;
  bytes: number;
}

interface PreparationManifest {
  schemaVersion: 'historical-source-preparation.v1';
  packId: string;
  status: 'inactive_local_preparation_only';
  sourceRootLayout: string;
  inputs: SourceInput[];
  normalizationGates: PascalPrefaceExclusionGate[];
}

/** A source-boundary rule, not a content redaction permission. */
interface PascalPrefaceExclusionGate {
  editionId: 'pascal-pensees-trotter-1910';
  kind: 'exclude_prefatory_contributor';
  contributor: 'T. S. Eliot';
  requiredIntroMarker: 'INTRODUCTION BY T. S. ELIOT';
  bodyStartMarker: 'SECTION I';
  bodyEndMarker: 'NOTES';
}

type ReplayStatus = 'completed' | 'pending_local_inputs';
type ActivationStatus = 'blocked_separate_transform11_release';

interface ReplayReceiptInput {
  editionId: string;
  role: InputRole;
  sha256: string;
  bytes: number;
}

interface ReplayReceiptOutput {
  editionId: string;
  packageSha256: string;
}

interface ReplayReceipt {
  schemaVersion: 'historical-source-replay-receipt.v1';
  packId: string;
  completedAt: string;
  script: {
    path: 'scripts/replay-historical-spine-source-packs.ts';
    sha256: string;
  };
  preparationManifestSha256: string;
  reviewedManifestSha256: string;
  inputs: ReplayReceiptInput[];
  outputs: ReplayReceiptOutput[];
}

interface ReplayReadiness {
  schemaVersion: 'historical-source-replay-readiness.v1';
  packId: string;
  normalizedPackageReview: {
    status: 'reviewed_normalized_package_only';
    manifestSha256: string;
  };
  authorityComparatorReplay: {
    status: ReplayStatus;
    receiptPath: 'replay-receipt.json' | null;
  };
  activation: {
    status: ActivationStatus;
  };
}

type PackName = 'early' | 'later';
interface PackDefinition {
  name: PackName;
  directory: string;
  expectedPackId: string;
}

interface StaticPackValidation {
  definition: PackDefinition;
  preparation: PreparationManifest;
  records: HistoricalSourcePackRecord[];
  readiness: ReplayReadiness;
}

interface RenderedSourceSection {
  heading: string;
  content: string;
  sectionKey?: string;
}

class LocalSourcePackReader {
  read(path: string): Buffer;
  read(path: string, encoding: BufferEncoding): string;
  read(path: string, encoding?: BufferEncoding): Buffer | string {
    const bytes = readFileSync(path);
    return encoding ? bytes.toString(encoding) : bytes;
  }
}

const PACKS: readonly PackDefinition[] = [
  { name: 'early', directory: 'data/historical-source-packs/historical-spine-early', expectedPackId: 'theologai-historical-spine-early' },
  { name: 'later', directory: 'data/historical-source-packs/historical-spine-later', expectedPackId: 'theologai-historical-spine-later' },
];

const EARLY_SECTIONS: Readonly<Record<string, { rootIds: string[]; mode: 'children' | 'self' | 'orations' | 'augustine' | 'origen' }>> = {
  'justin-martyr-apologies-dods-reith-anf1-1885': { rootIds: ['viii.ii', 'viii.iii'], mode: 'children' },
  'origen-de-principiis-crombie-anf4-1885': { rootIds: ['vi.v'], mode: 'origen' },
  'basil-on-the-holy-spirit-jackson-npnf2-v8-1895': { rootIds: ['vii.i', 'vii.ii', 'vii.iii', 'vii.iv', 'vii.v', 'vii.vi', 'vii.vii', 'vii.viii', 'vii.ix', 'vii.x', 'vii.xi', 'vii.xii', 'vii.xiii', 'vii.xiv', 'vii.xv', 'vii.xvi', 'vii.xvii', 'vii.xviii', 'vii.xix', 'vii.xx', 'vii.xxi', 'vii.xxii', 'vii.xxiii', 'vii.xxiv', 'vii.xxv', 'vii.xxvi', 'vii.xxvii', 'vii.xxviii', 'vii.xxix', 'vii.xxx'], mode: 'self' },
  'gregory-nazianzen-five-theological-orations-browne-swallow-npnf2-v7-1894': { rootIds: ['iii.xiii', 'iii.xiv', 'iii.xv', 'iii.xvi', 'iii.xvii'], mode: 'orations' },
  'augustine-on-christian-doctrine-shaw-npnf1-v2-1887': { rootIds: ['v.iii', 'v.iv', 'v.v', 'v.vi'], mode: 'augustine' },
  'gregory-nyssa-great-catechism-moore-wilson-npnf2-v5-1893': { rootIds: ['xi.ii'], mode: 'children' },
};

const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');

export function assertExactInput(label: string, bytes: Uint8Array, expected: Pick<SourceInput, 'sha256' | 'bytes'>): void {
  const actualHash = sha256(bytes);
  if (bytes.byteLength !== expected.bytes || actualHash !== expected.sha256) {
    throw new Error(`${label}: expected ${expected.bytes} bytes / ${expected.sha256}, got ${bytes.byteLength} bytes / ${actualHash}`);
  }
}

function assertKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${path}: unknown or missing fields`);
  }
}

function isCanonicalEditionId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

function isSafeLocalInputPath(value: unknown): value is string {
  return typeof value === 'string'
    && /^(?:authorities|comparators|derived)\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    && !value.includes('..');
}

function parseNormalizationGates(value: unknown, definition: PackDefinition): PascalPrefaceExclusionGate[] {
  if (definition.name === 'early') {
    if (value !== undefined) throw new Error(`${definition.directory}: early pack must not declare later normalization gates`);
    return [];
  }
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error(`${definition.directory}: later pack must declare exactly the Pascal preface-exclusion gate`);
  }
  const gate = value[0];
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) throw new Error(`${definition.directory}.normalizationGates[0]: invalid`);
  const record = gate as Record<string, unknown>;
  assertKeys(record, ['editionId', 'kind', 'contributor', 'requiredIntroMarker', 'bodyStartMarker', 'bodyEndMarker'], `${definition.directory}.normalizationGates[0]`);
  if (record.editionId !== 'pascal-pensees-trotter-1910'
    || record.kind !== 'exclude_prefatory_contributor'
    || record.contributor !== 'T. S. Eliot'
    || record.requiredIntroMarker !== 'INTRODUCTION BY T. S. ELIOT'
    || record.bodyStartMarker !== 'SECTION I'
    || record.bodyEndMarker !== 'NOTES') {
    throw new Error(`${definition.directory}.normalizationGates[0]: invalid fail-closed Pascal exclusion gate`);
  }
  return [record as unknown as PascalPrefaceExclusionGate];
}

function parsePreparationManifest(path: string, definition: PackDefinition): PreparationManifest {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${path}: invalid inactive source-preparation manifest`);
  }
  const root = raw as Record<string, unknown>;
  const expectedKeys = ['schemaVersion', 'packId', 'status', 'sourceRootLayout', 'inputs', ...(definition.name === 'later' ? ['normalizationGates'] : [])];
  assertKeys(root, expectedKeys, path);
  if (root.schemaVersion !== 'historical-source-preparation.v1'
    || root.packId !== definition.expectedPackId
    || root.status !== 'inactive_local_preparation_only'
    || typeof root.sourceRootLayout !== 'string'
    || !Array.isArray(root.inputs)) {
    throw new Error(`${path}: invalid inactive source-preparation manifest`);
  }
  const seen = new Set<string>();
  for (const input of root.inputs) {
    if (!input || typeof input !== 'object'
      || !isCanonicalEditionId(input.editionId)
      || (input.role !== 'authority' && input.role !== 'comparator' && input.role !== 'derived')
      || !isSafeLocalInputPath(input.path)
      || typeof input.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(input.sha256)
      || !Number.isSafeInteger(input.bytes) || input.bytes < 1) {
      throw new Error(`${path}: invalid source input`);
    }
    const key = `${input.editionId}:${input.role}`;
    if (seen.has(key)) throw new Error(`${path}: duplicate ${key}`);
    seen.add(key);
  }
  return {
    schemaVersion: 'historical-source-preparation.v1',
    packId: definition.expectedPackId,
    status: 'inactive_local_preparation_only',
    sourceRootLayout: root.sourceRootLayout,
    inputs: root.inputs as SourceInput[],
    normalizationGates: parseNormalizationGates(root.normalizationGates, definition),
  };
}

/**
 * Construct source-pack loader inputs without ever following a manifest path
 * until the shared strict parser has accepted its shape.  This is intentionally
 * narrower than the source-pack manifest grammar: these local-only packs may
 * contain only edition JSON siblings under their own known pack directory.
 */
function safeReviewedPackInputs(definition: PackDefinition): string[] {
  const manifestPath = join(definition.directory, 'manifest.json');
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${manifestPath}: invalid reviewed manifest before strict validation`);
  }
  const members = (raw as Record<string, unknown>).members;
  if (!Array.isArray(members) || members.length < 1) {
    throw new Error(`${manifestPath}: invalid reviewed members before strict validation`);
  }
  const memberPaths = members.map((member, index) => {
    const sourcePath = member && typeof member === 'object' && !Array.isArray(member)
      ? (member as Record<string, unknown>).sourcePath
      : undefined;
    if (typeof sourcePath !== 'string' || !/^editions\/[a-z][a-z0-9._-]*\.json$/.test(sourcePath)) {
      throw new Error(`${manifestPath}.members[${index}].sourcePath is unsafe before strict validation`);
    }
    const absolute = resolve(definition.directory, sourcePath);
    const root = resolve(definition.directory);
    if (relative(root, absolute).startsWith(`..${sep}`) || relative(root, absolute) === '..') {
      throw new Error(`${manifestPath}.members[${index}].sourcePath escapes the reviewed pack`);
    }
    return join(definition.directory, sourcePath);
  });
  return [manifestPath, join(definition.directory, 'manifest.sha256'), ...memberPaths];
}

function loadStrictReviewedPack(definition: PackDefinition): HistoricalSourcePackRecord[] {
  const records = loadHistoricalSourcePacks(
    safeReviewedPackInputs(definition),
    new LocalSourcePackReader(),
  );
  if (records.length === 0 || records.some(record => record.packId !== definition.expectedPackId)) {
    throw new Error(`${definition.directory}: strict reviewed source-pack identity mismatch`);
  }
  return records;
}

function sameInputs(left: readonly ReplayReceiptInput[], right: readonly ReplayReceiptInput[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function currentScriptSha256(): string {
  return sha256(readFileSync(fileURLToPath(import.meta.url)));
}

function parseReplayReadiness(
  path: string,
  definition: PackDefinition,
  preparation: PreparationManifest,
  records: readonly HistoricalSourcePackRecord[],
): ReplayReadiness {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${path}: invalid replay readiness`);
  const root = raw as Record<string, unknown>;
  assertKeys(root, ['schemaVersion', 'packId', 'normalizedPackageReview', 'authorityComparatorReplay', 'activation'], path);
  if (root.schemaVersion !== 'historical-source-replay-readiness.v1' || root.packId !== definition.expectedPackId) {
    throw new Error(`${path}: invalid replay readiness identity`);
  }
  const normalized = root.normalizedPackageReview;
  const replay = root.authorityComparatorReplay;
  const activation = root.activation;
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)
    || !replay || typeof replay !== 'object' || Array.isArray(replay)
    || !activation || typeof activation !== 'object' || Array.isArray(activation)) {
    throw new Error(`${path}: invalid replay readiness sections`);
  }
  const normalizedRecord = normalized as Record<string, unknown>;
  const replayRecord = replay as Record<string, unknown>;
  const activationRecord = activation as Record<string, unknown>;
  assertKeys(normalizedRecord, ['status', 'manifestSha256'], `${path}.normalizedPackageReview`);
  assertKeys(replayRecord, ['status', 'receiptPath'], `${path}.authorityComparatorReplay`);
  assertKeys(activationRecord, ['status'], `${path}.activation`);
  const manifestSha256 = records[0]?.manifestSha256;
  if (typeof manifestSha256 !== 'string') throw new Error(`${path}: reviewed manifest identity is unavailable`);
  if (normalizedRecord.status !== 'reviewed_normalized_package_only'
    || normalizedRecord.manifestSha256 !== manifestSha256
    || activationRecord.status !== 'blocked_separate_transform11_release'
    || (replayRecord.status !== 'completed' && replayRecord.status !== 'pending_local_inputs')
    || (replayRecord.status === 'completed' && replayRecord.receiptPath !== 'replay-receipt.json')
    || (replayRecord.status === 'pending_local_inputs' && replayRecord.receiptPath !== null)) {
    throw new Error(`${path}: invalid or overclaimed replay readiness`);
  }
  const readiness: ReplayReadiness = {
    schemaVersion: 'historical-source-replay-readiness.v1',
    packId: definition.expectedPackId,
    normalizedPackageReview: {
      status: 'reviewed_normalized_package_only',
      manifestSha256: normalizedRecord.manifestSha256 as string,
    },
    authorityComparatorReplay: {
      status: replayRecord.status as ReplayStatus,
      receiptPath: replayRecord.receiptPath as 'replay-receipt.json' | null,
    },
    activation: { status: 'blocked_separate_transform11_release' },
  };
  if (readiness.authorityComparatorReplay.status === 'completed') {
    assertReplayReceipt(join(definition.directory, readiness.authorityComparatorReplay.receiptPath!), definition, preparation, records);
  }
  return readiness;
}

function assertReplayReceipt(
  path: string,
  definition: PackDefinition,
  preparation: PreparationManifest,
  records: readonly HistoricalSourcePackRecord[],
): ReplayReceipt {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${path}: invalid replay receipt`);
  const root = raw as Record<string, unknown>;
  assertKeys(root, ['schemaVersion', 'packId', 'completedAt', 'script', 'preparationManifestSha256', 'reviewedManifestSha256', 'inputs', 'outputs'], path);
  const script = root.script;
  if (!script || typeof script !== 'object' || Array.isArray(script) || !Array.isArray(root.inputs) || !Array.isArray(root.outputs)) {
    throw new Error(`${path}: invalid replay receipt structure`);
  }
  const scriptRecord = script as Record<string, unknown>;
  assertKeys(scriptRecord, ['path', 'sha256'], `${path}.script`);
  const expectedInputs: ReplayReceiptInput[] = preparation.inputs.map(input => ({
    editionId: input.editionId, role: input.role, sha256: input.sha256, bytes: input.bytes,
  }));
  const receiptInputs = root.inputs.map((input, index) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${path}.inputs[${index}]: invalid`);
    const value = input as Record<string, unknown>;
    assertKeys(value, ['editionId', 'role', 'sha256', 'bytes'], `${path}.inputs[${index}]`);
    if (!isCanonicalEditionId(value.editionId)
      || (value.role !== 'authority' && value.role !== 'comparator' && value.role !== 'derived')
      || typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)
      || typeof value.bytes !== 'number' || !Number.isSafeInteger(value.bytes) || value.bytes < 1) {
      throw new Error(`${path}.inputs[${index}]: invalid identity`);
    }
    return {
      editionId: value.editionId,
      role: value.role,
      sha256: value.sha256,
      bytes: value.bytes,
    } satisfies ReplayReceiptInput;
  });
  const expectedOutputs: ReplayReceiptOutput[] = records.map(record => ({
    editionId: record.compiled.package.edition.editionId,
    packageSha256: record.compiled.sha256,
  }));
  const receiptOutputs = root.outputs.map((output, index) => {
    if (!output || typeof output !== 'object' || Array.isArray(output)) throw new Error(`${path}.outputs[${index}]: invalid`);
    const value = output as Record<string, unknown>;
    assertKeys(value, ['editionId', 'packageSha256'], `${path}.outputs[${index}]`);
    if (!isCanonicalEditionId(value.editionId) || typeof value.packageSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.packageSha256)) {
      throw new Error(`${path}.outputs[${index}]: invalid identity`);
    }
    return {
      editionId: value.editionId,
      packageSha256: value.packageSha256,
    } satisfies ReplayReceiptOutput;
  });
  const preparationManifestSha256 = sha256(readFileSync(join(definition.directory, 'source-preparation.json')));
  const reviewedManifestSha256 = records[0]?.manifestSha256;
  if (typeof reviewedManifestSha256 !== 'string') throw new Error(`${path}: reviewed manifest identity is unavailable`);
  if (root.schemaVersion !== 'historical-source-replay-receipt.v1'
    || root.packId !== definition.expectedPackId
    || typeof root.completedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(root.completedAt)
    || scriptRecord.path !== 'scripts/replay-historical-spine-source-packs.ts'
    || scriptRecord.sha256 !== currentScriptSha256()
    || root.preparationManifestSha256 !== preparationManifestSha256
    || root.reviewedManifestSha256 !== reviewedManifestSha256
    || !sameInputs(receiptInputs, expectedInputs)
    || JSON.stringify(receiptOutputs) !== JSON.stringify(expectedOutputs)) {
    throw new Error(`${path}: stale, incomplete, or mismatched replay receipt`);
  }
  return {
    schemaVersion: 'historical-source-replay-receipt.v1',
    packId: definition.expectedPackId,
    completedAt: root.completedAt,
    script: {
      path: 'scripts/replay-historical-spine-source-packs.ts',
      sha256: scriptRecord.sha256,
    },
    preparationManifestSha256,
    reviewedManifestSha256,
    inputs: receiptInputs,
    outputs: receiptOutputs,
  };
}

function inputFor(inputs: readonly SourceInput[], editionId: string, role: InputRole): SourceInput {
  const input = inputs.find(candidate => candidate.editionId === editionId && candidate.role === role);
  if (!input) throw new Error(`missing ${role} preapproval for ${editionId}`);
  return input;
}

/**
 * Proves the checked-in normalized package, its approved input inventory, and
 * its durable replay state agree before any caller-controlled input root is
 * touched.  This deliberately does not make a pack runtime- or D1-ready.
 */
export function validateHistoricalSpineStaticPack(name: PackName): StaticPackValidation {
  const definition = PACKS.find(candidate => candidate.name === name);
  if (!definition) throw new Error(`unknown historical-spine pack ${name}`);
  const preparation = parsePreparationManifest(join(definition.directory, 'source-preparation.json'), definition);
  const records = loadStrictReviewedPack(definition);
  assertManifestArtifacts(records, preparation);
  const readiness = parseReplayReadiness(join(definition.directory, 'replay-readiness.json'), definition, preparation, records);
  return { definition, preparation, records, readiness };
}

/**
 * This is the future activation boundary for source-preparation evidence.  It
 * remains intentionally blocked even after a successful local replay until a
 * separate Transform 11 release changes the explicit authorization state.
 */
export function assertHistoricalSpineActivationReady(name: PackName): never {
  const pack = validateHistoricalSpineStaticPack(name);
  if (pack.readiness.authorityComparatorReplay.status !== 'completed') {
    throw new Error(`${pack.definition.expectedPackId}: authority/comparator replay is not completed`);
  }
  throw new Error(`${pack.definition.expectedPackId}: activation is blocked pending a separately reviewed Transform 11 release`);
}

/** Reads every required non-derived local input only after static validation. */
export function loadVerifiedInputs(
  sourceRoot: string,
  definition: PackDefinition,
  staticPack: Pick<StaticPackValidation, 'preparation'> = validateHistoricalSpineStaticPack(definition.name),
): { preparation: PreparationManifest; bytes: Map<string, Buffer> } {
  const preparation = staticPack.preparation;
  const base = resolve(sourceRoot, `historical-spine-${definition.name}`);
  const missing: string[] = [];
  const bytes = new Map<string, Buffer>();
  for (const input of preparation.inputs.filter(candidate => candidate.role !== 'derived')) {
    const path = resolve(base, input.path);
    if (relative(base, path).startsWith(`..${sep}`) || relative(base, path) === '..') {
      throw new Error(`${input.editionId}: reviewed input path escapes the provided source root`);
    }
    try {
      if (!statSync(path).isFile()) throw new Error('not a file');
      const raw = readFileSync(path);
      assertExactInput(path, raw, input);
      bytes.set(`${input.editionId}:${input.role}`, raw);
    } catch (error) {
      if (error instanceof Error && /expected \d+ bytes/.test(error.message)) throw error;
      missing.push(`${path} (${input.role} for ${input.editionId})`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`missing reviewed local inputs; no replay was attempted:\n${missing.map(path => `- ${path}`).join('\n')}`);
  }
  return { preparation, bytes };
}

function attr(node: XmlNode, name: string): string | undefined {
  return node.attrs?.find(attribute => attribute.name === name)?.value;
}
function walk(node: XmlNode, visit: (candidate: XmlNode) => void): void {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
}
function descendants(node: XmlNode, predicate: (candidate: XmlNode) => boolean): XmlNode[] {
  const result: XmlNode[] = [];
  walk(node, candidate => { if (candidate !== node && predicate(candidate)) result.push(candidate); });
  return result;
}
function byId(document: XmlNode, id: string): XmlNode {
  let found: XmlNode | undefined;
  walk(document, node => { if (attr(node, 'id') === id) found = node; });
  if (!found) throw new Error(`missing source section ${id}`);
  return found;
}
function sourceElement(raw: string, id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opening = new RegExp(`<(?<tag>div[234])\\b[^>]*\\bid="${escaped}"[^>]*>`, 'i').exec(raw);
  if (!opening?.groups?.tag || opening.index === undefined) throw new Error(`missing raw source element ${id}`);
  const tag = opening.groups.tag;
  const tokens = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'ig');
  tokens.lastIndex = opening.index;
  let depth = 0;
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(raw))) {
    depth += token[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return raw.slice(opening.index, tokens.lastIndex);
  }
  throw new Error(`unclosed raw source element ${id}`);
}
function normalize(text: string): string {
  return text.replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function rawXmlText(raw: string, id: string): string {
  const fragment = sourceElement(raw, id)
    .replace(/<note\b[\s\S]*?<\/note>/gi, '')
    .replace(/<pb\b[^>]*\/?\s*>/gi, '')
    .replace(/<index\b[\s\S]*?<\/index>/gi, '');
  return fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&[lr]squo;/gi, '’')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, value: string) => String.fromCodePoint(value.startsWith('x') ? Number.parseInt(value.slice(1), 16) : Number.parseInt(value, 10)))
    .replace(/\p{Cf}/gu, character => (character === '\u200c' || character === '\u200d') ? character : '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function sectionKey(label: string, ordinal: number): string {
  const stem = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52).replace(/-+$/g, '');
  return `section-${stem || 'untitled'}-${String(ordinal).padStart(3, '0')}`;
}
function earlySections(editionId: string, raw: string): Array<RenderedSourceSection & { sectionKey: string }> {
  const config = EARLY_SECTIONS[editionId];
  if (!config) throw new Error(`no early parser for ${editionId}`);
  const document = parse(raw) as unknown as XmlNode;
  const roots = config.rootIds.map(id => byId(document, id));
  let nodes: XmlNode[];
  if (config.mode === 'self' || config.mode === 'orations') nodes = roots;
  else if (config.mode === 'children') {
    nodes = roots.flatMap(root => {
      const rootId = attr(root, 'id');
      if (!rootId) throw new Error('source root lacks stable id');
      return descendants(document, candidate => candidate.nodeName === 'div3' && (attr(candidate, 'id') ?? '').startsWith(`${rootId}.`));
    });
  } else if (config.mode === 'origen') nodes = descendants(roots[0]!, candidate => candidate.nodeName === 'div4');
  else {
    nodes = roots.flatMap(root => {
      const rootId = attr(root, 'id');
      return rootId === 'v.iii' ? [root] : descendants(document, candidate => candidate.nodeName === 'div3' && (attr(candidate, 'id') ?? '').startsWith(`${rootId}.`));
    });
  }
  return nodes.map((node, index) => {
    const id = attr(node, 'id');
    if (!id) throw new Error(`${editionId}: selected source node lacks id`);
    const heading = attr(node, 'title') ?? `Section ${index + 1}`;
    const content = rawXmlText(raw, id);
    if (content.length < 80) throw new Error(`${editionId}: thin section ${heading}`);
    return { sourceOrdinal: index + 1, sectionKey: sectionKey(heading, index + 1), displayLabel: heading, heading, content };
  });
}

function gutenbergBody(raw: string): string {
  const start = raw.indexOf('*** START OF THE PROJECT GUTENBERG EBOOK');
  const end = raw.indexOf('*** END OF THE PROJECT GUTENBERG EBOOK');
  if (start < 0 || end < 0) throw new Error('missing Gutenberg wrapper');
  return normalize(raw.slice(raw.indexOf('\n', start) + 1, end));
}
function between(raw: string, start: RegExp, end: RegExp): string {
  const startMatch = start.exec(raw);
  if (!startMatch || startMatch.index === undefined) throw new Error(`missing start ${start}`);
  const afterStart = startMatch.index + startMatch[0].length;
  const endMatch = end.exec(raw.slice(afterStart));
  if (!endMatch || endMatch.index === undefined) throw new Error(`missing end ${end}`);
  return normalize(raw.slice(startMatch.index, afterStart + endMatch.index));
}
function from(raw: string, start: RegExp): string {
  const match = start.exec(raw);
  if (!match || match.index === undefined) throw new Error(`missing start ${start}`);
  return normalize(raw.slice(match.index));
}
function splitOnHeadings(text: string, heading: RegExp): Array<{ heading: string; content: string }> {
  const matches = [...text.matchAll(heading)];
  if (matches.length < 2) throw new Error(`expected multiple headings for ${heading}`);
  return matches.map((match, index) => {
    const next = matches[index + 1];
    return { heading: normalize(match[0]).replace(/\n+/g, ' '), content: normalize(text.slice(match.index, next?.index)) };
  }).filter(section => section.content.length >= 120);
}
function numberedChunks(text: string, prefix: string, maxChars = 22_000): Array<{ heading: string; content: string }> {
  const sections: Array<{ heading: string; content: string }> = [];
  let bucket: string[] = [];
  let size = 0;
  for (const paragraph of normalize(text).split(/\n\n+/)) {
    if (size > 0 && size + paragraph.length > maxChars) {
      sections.push({ heading: `${prefix} ${String(sections.length + 1).padStart(2, '0')}`, content: normalize(bucket.join('\n\n')) });
      bucket = []; size = 0;
    }
    bucket.push(paragraph); size += paragraph.length + 2;
  }
  if (bucket.length) sections.push({ heading: `${prefix} ${String(sections.length + 1).padStart(2, '0')}`, content: normalize(bucket.join('\n\n')) });
  return sections;
}
function boundedSections(sections: Array<{ heading: string; content: string }>): Array<{ heading: string; content: string }> {
  return sections.flatMap(section => section.content.length <= 110_000 ? [section] : numberedChunks(section.content, section.heading, 100_000));
}
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, value: string) => {
      const codePoint = value[0]!.toLowerCase() === 'x' ? Number.parseInt(value.slice(1), 16) : Number.parseInt(value, 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    })
    .replace(/&(?:#x2019|rsquo);/gi, '’')
    .replace(/&(?:#x201c|ldquo);/gi, '“')
    .replace(/&(?:#x201d|rdquo);/gi, '”')
    .replace(/&amp;/gi, '&');
}

function normalizeEvidenceText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function deriveHookerBookOne(epub: Buffer): string {
  const temp = mkdtempSync(join(tmpdir(), 'theologai-hooker-local-'));
  try {
    const archive = join(temp, 'hooker.epub');
    writeFileSync(archive, epub);
    const html = execFileSync('unzip', ['-p', archive, 'Hooker_0172-01.html'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const bookOne = between(html, /<h2[^>]*>\s*THE FIRST BOOK\.[\s\S]*?<\/h2>/i, /<h2[^>]*>\s*THE SECOND BOOK\./i);
    return normalize(decodeHtmlEntities(bookOne
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<\/(?:p|h[1-6]|div)>/gi, '\n\n')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/Edition:\s*(?:current|1888);\s*Page:\s*\[\s*[^\]]+\s*\]/gi, '')));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
function hookerSections(raw: string): Array<{ heading: string; content: string }> {
  const pieces = splitOnHeadings(raw, /BOOK I\. Ch\. [ivxlcdm]+\./gi);
  const chapters: Array<{ heading: string; content: string }> = [];
  for (const piece of pieces) {
    const chapter = /BOOK I\. Ch\. ([ivxlcdm]+)\./i.exec(piece.heading)?.[1]?.toUpperCase();
    if (!chapter) throw new Error(`unrecognized Hooker heading ${piece.heading}`);
    const prior = chapters.at(-1);
    if (prior?.heading === `Book I, Chapter ${chapter}`) prior.content = normalize(`${prior.content}\n\n${piece.content}`);
    else chapters.push({ heading: `Book I, Chapter ${chapter}`, content: piece.content });
  }
  if (chapters.length !== 16) throw new Error(`expected Hooker Book I chapters I–XVI, got ${chapters.length}`);
  return chapters;
}
/** Parse only the bounded Pensées body after proving the Eliot preface boundary. */
export function parsePascalSections(raw: string, gate: PascalPrefaceExclusionGate): Array<{ heading: string; content: string }> {
  const body = gutenbergBody(raw);
  const normalizedMarker = gate.requiredIntroMarker.toUpperCase();
  const introIndex = body.toUpperCase().indexOf(normalizedMarker);
  if (introIndex < 0) throw new Error(`${gate.editionId}: required ${gate.contributor} introduction marker is absent`);
  const sectionStart = [...body.matchAll(/^SECTION I\s*$/gmi)].find(match => (match.index ?? -1) > introIndex);
  if (!sectionStart || sectionStart.index === undefined) {
    throw new Error(`${gate.editionId}: body start marker does not follow the excluded ${gate.contributor} introduction`);
  }
  const afterStart = sectionStart.index + sectionStart[0].length;
  const notes = /^\s*NOTES\s*$/gmi.exec(body.slice(afterStart));
  if (!notes || notes.index === undefined) throw new Error(`${gate.editionId}: required terminal notes boundary is absent`);
  const selected = normalize(body.slice(sectionStart.index, afterStart + notes.index));
  if (normalizeEvidenceText(selected).includes(normalizeEvidenceText(gate.contributor))) {
    throw new Error(`${gate.editionId}: excluded ${gate.contributor} preface leaked into the selected body`);
  }
  const sections = splitOnHeadings(selected, /^SECTION\s+[IVXLCDM]+\s*$/gmi)
    .map(section => ({ ...section, content: normalize(section.content.replace(/\[\d+\]/g, '')) }));
  if (sections[0]?.heading !== gate.bodyStartMarker) {
    throw new Error(`${gate.editionId}: selected body does not begin at ${gate.bodyStartMarker}`);
  }
  return sections;
}

function laterSections(
  editionId: string,
  raw: string,
  hookerDerived?: string,
  pascalGate?: PascalPrefaceExclusionGate,
): Array<{ heading: string; content: string }> {
  if (editionId === 'kempis-imitation-of-christ-benham-gutenberg') return splitOnHeadings(from(gutenbergBody(raw), /\nTHE FIRST BOOK\s*\n/), /^CHAPTER\s+[IVXLCDM]+\s*$/gmi);
  if (editionId === 'hooker-laws-of-ecclesiastical-polity-book-1-keble-1888') return hookerSections(hookerDerived ?? '');
  if (editionId === 'julian-revelations-of-divine-love-warrack-1901-gutenberg') return splitOnHeadings(between(gutenbergBody(raw), /REVELATIONS OF DIVINE LOVE\s*\n\s*CHAPTER I/i, /^\s*GLOSSARY\s*$/mi), /^\s*CHAPTER\s+[IVXLCDM]+\s*$/gmi);
  if (editionId === 'pascal-pensees-trotter-1910') {
    if (!pascalGate) throw new Error(`${editionId}: missing required preface-exclusion gate`);
    return parsePascalSections(raw, pascalGate);
  }
  throw new Error(`no later parser for ${editionId}`);
}
function renderSections(
  pack: PackName,
  editionId: string,
  raw: Buffer,
  derived?: string,
  pascalGate?: PascalPrefaceExclusionGate,
): Array<Record<string, unknown>> {
  const basic: RenderedSourceSection[] = pack === 'early'
    ? earlySections(editionId, raw.toString('utf8'))
    : boundedSections(laterSections(editionId, raw.toString('utf8'), derived, pascalGate));
  return basic.map((section, index) => {
    if (section.content.length < (pack === 'early' ? 80 : 120)) throw new Error(`${editionId}: invalid section boundary`);
    let sectionKey: string;
    if (pack === 'early') {
      if (!section.sectionKey) throw new Error(`${editionId}: early section lacks a reviewed key`);
      sectionKey = section.sectionKey;
    } else {
      sectionKey = `section-${String(index + 1).padStart(3, '0')}`;
    }
    return { sourceOrdinal: index + 1, sectionKey, displayLabel: section.heading, heading: section.heading, content: section.content };
  });
}

function setSourceToInput(packageJson: Record<string, unknown>, input: SourceInput): void {
  const edition = packageJson.edition as Record<string, unknown>;
  edition.source = {
    locator: `urn:sha256:${input.sha256}`,
    pin: { kind: 'sha256', value: input.sha256 },
    sha256: input.sha256,
    bytes: input.bytes,
    acquiredAt: '2026-07-27T00:00:00Z',
  };
}
function ensureHookerProvenance(packageJson: Record<string, unknown>, derived: SourceInput): void {
  const edition = packageJson.edition as Record<string, unknown>;
  const provenance = edition.provenance as Record<string, unknown>;
  const disclosure = ` The normalized Book I extraction is derived from the pinned EPUB; derived Book I text SHA-256 ${derived.sha256} (${derived.bytes} bytes) is verified before section parsing.`;
  const uncertainty = String(provenance.uncertainty).replace(/ The normalized Book I extraction is derived from the pinned EPUB; derived Book I text SHA-256 [0-9a-f]{64} \(\d+ bytes\) is verified before section parsing\./, '');
  provenance.uncertainty = `${uncertainty}${disclosure}`;
}
function assertManifestArtifacts(records: readonly HistoricalSourcePackRecord[], preparation: PreparationManifest): void {
  const editionIds = records.map(record => record.compiled.package.edition.editionId);
  const uniqueEditionIds = new Set(editionIds);
  if (uniqueEditionIds.size !== records.length) throw new Error('reviewed manifest has duplicate edition identities');

  const externalInputs = preparation.inputs.filter(input => input.role === 'authority' || input.role === 'comparator');
  const inputEditionIds = new Set(externalInputs.map(input => input.editionId));
  if (inputEditionIds.size !== records.length
    || editionIds.some(editionId => !inputEditionIds.has(editionId))
    || [...inputEditionIds].some(editionId => !uniqueEditionIds.has(editionId))) {
    throw new Error('reviewed manifest and source-preparation inputs do not have an exact edition bijection');
  }

  for (const record of records) {
    const editionId = record.compiled.package.edition.editionId;
    const expectedInputs = externalInputs.filter(input => input.editionId === editionId);
    const artifactRoles = record.artifacts.map(artifact => artifact.role).sort();
    const inputRoles = expectedInputs.map(input => input.role).sort();
    if (expectedInputs.length < 1 || new Set(inputRoles).size !== inputRoles.length
      || JSON.stringify(inputRoles) !== JSON.stringify(artifactRoles)) {
      throw new Error(`${editionId}: source preparation must pin exactly the reviewed artifact roles`);
    }
    for (const role of inputRoles) {
      const expected = inputFor(preparation.inputs, editionId, role);
      const artifacts = record.artifacts.filter(artifact => artifact.role === role);
      if (artifacts.length !== 1 || artifacts[0]!.sha256 !== expected.sha256 || artifacts[0]!.bytes !== expected.bytes) {
        throw new Error(`${editionId}: reviewed manifest does not pin the preapproved ${role} bytes`);
      }
    }
    const sourceInputs = expectedInputs.filter(input => record.compiled.package.edition.source.sha256 === input.sha256
      && record.compiled.package.edition.source.bytes === input.bytes);
    if (sourceInputs.length !== 1) {
      throw new Error(`${editionId}: reviewed package source must equal exactly one approved source input`);
    }
  }

  const derived = preparation.inputs.filter(input => input.role === 'derived');
  if (derived.some(input => input.editionId !== 'hooker-laws-of-ecclesiastical-polity-book-1-keble-1888') || derived.length > 1) {
    throw new Error('only the explicit Hooker Book I derivation may be a non-external source-preparation input');
  }
  for (const gate of preparation.normalizationGates) {
    if (!uniqueEditionIds.has(gate.editionId)) throw new Error(`${gate.editionId}: normalization gate lacks a reviewed package`);
    inputFor(preparation.inputs, gate.editionId, 'comparator');
  }
}

function sourceInputForPackage(preparation: PreparationManifest, editionId: string, packageJson: Record<string, unknown>): SourceInput {
  const edition = packageJson.edition as { source?: { sha256?: unknown; bytes?: unknown } };
  const source = edition.source;
  if (!source || typeof source.sha256 !== 'string' || typeof source.bytes !== 'number') {
    throw new Error(`${editionId}: normalized package does not declare a source identity`);
  }
  const matches = preparation.inputs.filter(input => input.editionId === editionId
    && input.role !== 'derived' && input.sha256 === source.sha256 && input.bytes === source.bytes);
  if (matches.length !== 1) throw new Error(`${editionId}: source identity must select exactly one approved local input`);
  return matches[0]!;
}

function buildOutputs(definition: PackDefinition, preparation: PreparationManifest, bytes: Map<string, Buffer>): Map<string, string> {
  const packRoot = definition.directory;
  const reviewedManifest = JSON.parse(readFileSync(join(packRoot, 'manifest.json'), 'utf8')) as { members: Array<Record<string, unknown>> };
  const outputs = new Map<string, string>();
  const manifest = structuredClone(reviewedManifest);
  for (const member of manifest.members) {
    const editionId = String(member.id);
    const relativePath = String(member.sourcePath);
    const packageJson = JSON.parse(readFileSync(join(packRoot, relativePath), 'utf8')) as Record<string, unknown>;
    const sourceInput = sourceInputForPackage(preparation, editionId, packageJson);
    const raw = bytes.get(`${editionId}:${sourceInput.role}`);
    if (!raw) throw new Error(`${editionId}: verified normalized source input unavailable`);
    let derived: string | undefined;
    if (editionId.startsWith('hooker-')) {
      const expectation = inputFor(preparation.inputs, editionId, 'derived');
      derived = deriveHookerBookOne(raw);
      assertExactInput(`${editionId} derived Book I`, Buffer.from(derived), expectation);
    }
    setSourceToInput(packageJson, sourceInput);
    if (editionId.startsWith('hooker-')) ensureHookerProvenance(packageJson, inputFor(preparation.inputs, editionId, 'derived'));
    const pascalGate = preparation.normalizationGates.find(gate => gate.editionId === editionId);
    packageJson.sections = renderSections(definition.name, editionId, raw, derived, pascalGate);
    const compiled = compileEditionPackage(packageJson);
    member.packageSha256 = compiled.sha256;
    outputs.set(join(packRoot, relativePath), `${JSON.stringify(packageJson, null, 2)}\n`);
  }
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  outputs.set(join(packRoot, 'manifest.json'), manifestText);
  outputs.set(join(packRoot, 'manifest.sha256'), `${sha256(manifestText)}  manifest.json\n`);
  return outputs;
}
function compareTemporaryOutputs(outputs: ReadonlyMap<string, string>): void {
  const temp = mkdtempSync(join(tmpdir(), 'theologai-historical-spine-replay-'));
  try {
    for (const [target, content] of outputs) {
      const temporary = join(temp, target);
      mkdirSync(dirname(temporary), { recursive: true });
      writeFileSync(temporary, content, 'utf8');
      const reviewed = readFileSync(target);
      const generated = readFileSync(temporary);
      if (!reviewed.equals(generated)) {
        throw new Error(`replay drift: ${target} differs from its reviewed normalized output`);
      }
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function freshReplayReceipt(
  definition: PackDefinition,
  preparation: PreparationManifest,
  records: readonly HistoricalSourcePackRecord[],
): ReplayReceipt {
  const reviewedManifestSha256 = records[0]?.manifestSha256;
  if (typeof reviewedManifestSha256 !== 'string') throw new Error(`${definition.expectedPackId}: reviewed manifest identity is unavailable`);
  return {
    schemaVersion: 'historical-source-replay-receipt.v1',
    packId: definition.expectedPackId,
    completedAt: new Date().toISOString(),
    script: {
      path: 'scripts/replay-historical-spine-source-packs.ts',
      sha256: currentScriptSha256(),
    },
    preparationManifestSha256: sha256(readFileSync(join(definition.directory, 'source-preparation.json'))),
    reviewedManifestSha256,
    inputs: preparation.inputs.map(input => ({
      editionId: input.editionId,
      role: input.role,
      sha256: input.sha256,
      bytes: input.bytes,
    })),
    outputs: records.map(record => ({
      editionId: record.compiled.package.edition.editionId,
      packageSha256: record.compiled.sha256,
    })),
  };
}

function writeFreshReplayEvidence(
  definition: PackDefinition,
  preparation: PreparationManifest,
  records: readonly HistoricalSourcePackRecord[],
): void {
  const receipt = freshReplayReceipt(definition, preparation, records);
  const receiptPath = join(definition.directory, 'replay-receipt.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  const readinessPath = join(definition.directory, 'replay-readiness.json');
  const readiness = JSON.parse(readFileSync(readinessPath, 'utf8')) as Record<string, unknown>;
  readiness.authorityComparatorReplay = { status: 'completed', receiptPath: 'replay-receipt.json' };
  writeFileSync(readinessPath, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
}

interface ReplayOptions {
  writeReceipts?: boolean;
}

export function replayHistoricalSpineSourcePacks(
  sourceRoot: string,
  names: readonly PackName[] = ['early', 'later'],
  options: ReplayOptions = {},
): void {
  for (const definition of PACKS.filter(candidate => names.includes(candidate.name))) {
    // The local manifest/preparation/readiness proof runs before the provided
    // source root is even resolved or stat'ed.  A missing later artifact must
    // never hide malformed checked-in declarations.
    const staticPack = validateHistoricalSpineStaticPack(definition.name);
    const { preparation, bytes } = loadVerifiedInputs(sourceRoot, definition, staticPack);
    compareTemporaryOutputs(buildOutputs(definition, preparation, bytes));
    if (options.writeReceipts) writeFreshReplayEvidence(definition, preparation, staticPack.records);
  }
}

function parseCli(argv: readonly string[]): { sourceRoot: string; names: PackName[]; writeReceipts: boolean } {
  let sourceRoot: string | undefined;
  let pack: 'all' | PackName = 'all';
  let writeReceipts = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--source-root') sourceRoot = argv[++index];
    else if (argv[index] === '--pack' && (argv[index + 1] === 'all' || argv[index + 1] === 'early' || argv[index + 1] === 'later')) pack = argv[++index] as 'all' | PackName;
    else if (argv[index] === '--write-receipts') writeReceipts = true;
    else throw new Error('usage: replay-historical-spine-source-packs --source-root <reviewed-local-inputs> [--pack early|later|all] [--write-receipts]');
  }
  if (!sourceRoot) throw new Error('usage: replay-historical-spine-source-packs --source-root <reviewed-local-inputs> [--pack early|later|all] [--write-receipts]');
  return { sourceRoot: resolve(sourceRoot), names: pack === 'all' ? ['early', 'later'] : [pack], writeReceipts };
}

const entrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (entrypoint) {
  const { sourceRoot, names, writeReceipts } = parseCli(process.argv.slice(2));
  replayHistoricalSpineSourcePacks(sourceRoot, names, { writeReceipts });
  process.stdout.write(`verified inactive local replay for ${names.join(', ')} historical-spine pack(s)\n`);
}
