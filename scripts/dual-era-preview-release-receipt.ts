import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DualEraMcpAudit } from './audit-dual-era-mcp-preview.js';

type JsonRecord = Record<string, unknown>;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const FUTURE_SKEW_MS = 5 * 60 * 1_000;
const PROTOCOLS = ['2025-11-25', '2026-07-28'] as const;

export interface DualEraPreviewReleaseReceipt {
  schemaVersion: 'theologai-dual-era-preview-release-receipt.v1';
  createdAt: string;
  repository: string;
  pullRequest: number;
  sourceCommit: string;
  sourceTree: string;
  endpoint: string;
  productProfile: '7';
  protocols: ['2025-11-25', '2026-07-28'];
  server: { name: 'theologai-bible-server'; version: string };
  counts: { tools: 11; prompts: 6; resourceTemplates: 2; staticResources: 3 };
  contractFingerprints: DualEraMcpAudit['eras'][number]['fingerprints'];
  auditSha256: string;
  worker: { deploymentId: string; versionId: string; versionNumber: number };
  d1: { databaseName: string; databaseId: string };
  d1ReadinessSha256: string;
}

function fail(message: string): never {
  throw new Error(`Dual-era preview release receipt refused: ${message}`);
}

function object(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, keys: readonly string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(`${label} keys are malformed`);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function parseJson(text: string, label: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { fail(`${label} is not valid JSON`); }
}

function parseAudit(text: string): DualEraMcpAudit {
  const audit = object(parseJson(text, 'dual-era audit'), 'dual-era audit');
  exactKeys(audit, ['schemaVersion', 'capturedAt', 'endpoint', 'productProfile', 'eras', 'crossEraContractSha256'], 'dual-era audit');
  if (audit.schemaVersion !== 'theologai-dual-era-mcp-preview-audit.v1'
    || audit.productProfile !== '7' || typeof audit.endpoint !== 'string'
    || typeof audit.capturedAt !== 'string' || !Number.isFinite(Date.parse(audit.capturedAt))
    || !Array.isArray(audit.eras) || audit.eras.length !== 2 || !isSha256(audit.crossEraContractSha256)) {
    fail('dual-era audit header is malformed');
  }
  for (const [index, protocol] of PROTOCOLS.entries()) {
    const era = object(audit.eras[index], `dual-era audit ${protocol}`);
    exactKeys(era, ['protocolVersion', 'serverName', 'serverVersion', 'counts', 'fingerprints'], `dual-era audit ${protocol}`);
    const counts = object(era.counts, `dual-era audit ${protocol} counts`);
    const fingerprints = object(era.fingerprints, `dual-era audit ${protocol} fingerprints`);
    exactKeys(counts, ['tools', 'prompts', 'resourceTemplates', 'staticResources'], `dual-era audit ${protocol} counts`);
    exactKeys(fingerprints, ['capabilities', 'tools', 'prompts', 'resourceTemplates', 'staticResources'], `dual-era audit ${protocol} fingerprints`);
    if (era.protocolVersion !== protocol || era.serverName !== 'theologai-bible-server'
      || typeof era.serverVersion !== 'string' || era.serverVersion.length === 0
      || counts.tools !== 11 || counts.prompts !== 6 || counts.resourceTemplates !== 2 || counts.staticResources !== 3
      || !Object.values(fingerprints).every(value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value))) {
      fail(`dual-era audit ${protocol} contract is malformed`);
    }
  }
  const [legacy, modern] = audit.eras as DualEraMcpAudit['eras'];
  if (JSON.stringify(legacy.fingerprints) !== JSON.stringify(modern.fingerprints)
    || legacy.serverVersion !== modern.serverVersion) fail('dual-era audit contracts differ');
  return audit as unknown as DualEraMcpAudit;
}

export function createDualEraPreviewReleaseReceipt(input: {
  repository: string;
  pullRequest: number;
  sourceCommit: string;
  sourceTree: string;
  auditText: string;
  workerIdentityText: string;
  cutoverText: string;
  d1ReadinessText: string;
}): DualEraPreviewReleaseReceipt {
  const audit = parseAudit(input.auditText);
  const identity = object(parseJson(input.workerIdentityText, 'Worker identity'), 'Worker identity');
  const cutover = object(parseJson(input.cutoverText, 'cutover record'), 'cutover record');
  const candidateD1 = object(cutover.candidateD1, 'cutover candidate D1');
  const observedD1 = object(cutover.observedActiveD1, 'cutover observed D1');
  const readiness = object(parseJson(input.d1ReadinessText, 'D1 readiness receipt'), 'D1 readiness receipt');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository)
    || !Number.isSafeInteger(input.pullRequest) || input.pullRequest <= 0
    || !/^[0-9a-f]{40}$/.test(input.sourceCommit) || !/^[0-9a-f]{40}$/.test(input.sourceTree)) fail('source identity is malformed');
  if (identity.schemaVersion !== 2 || identity.worker !== 'theologai-preview'
    || !isUuid(identity.deploymentId) || !isUuid(identity.deployedVersionId)
    || !Number.isSafeInteger(identity.deployedVersionNumber) || (identity.deployedVersionNumber as number) <= 0) fail('Worker identity is malformed');
  if (cutover.worker !== 'theologai-preview' || cutover.candidateBindingMatches !== true
    || cutover.observedActiveDeploymentId !== identity.deploymentId
    || cutover.observedActiveVersionId !== identity.deployedVersionId
    || candidateD1.binding !== 'THEOLOGAI_DB' || observedD1.binding !== 'THEOLOGAI_DB'
    || typeof candidateD1.databaseName !== 'string' || !isUuid(candidateD1.databaseId)
    || observedD1.databaseId !== candidateD1.databaseId) fail('cutover identity does not match the audited Worker and D1');
  if (readiness.schemaVersion !== 'theologai-remote-d1-readiness-receipt.v1'
    || readiness.environment !== 'preview' || readiness.database !== candidateD1.databaseName) fail('D1 readiness does not match the audited candidate');
  const first = audit.eras[0]!;
  return {
    schemaVersion: 'theologai-dual-era-preview-release-receipt.v1',
    createdAt: audit.capturedAt,
    repository: input.repository,
    pullRequest: input.pullRequest,
    sourceCommit: input.sourceCommit,
    sourceTree: input.sourceTree,
    endpoint: audit.endpoint,
    productProfile: '7',
    protocols: [...PROTOCOLS],
    server: { name: 'theologai-bible-server', version: first.serverVersion },
    counts: first.counts,
    contractFingerprints: first.fingerprints,
    auditSha256: sha256(input.auditText),
    worker: {
      deploymentId: identity.deploymentId,
      versionId: identity.deployedVersionId,
      versionNumber: identity.deployedVersionNumber as number,
    },
    d1: { databaseName: candidateD1.databaseName, databaseId: candidateD1.databaseId },
    d1ReadinessSha256: sha256(input.d1ReadinessText),
  };
}

export function verifyDualEraPreviewReleaseReceipt(receipt: unknown, expected: {
  repository: string; sourceCommit: string; sourceTree: string; serverVersion: string; now?: Date;
}): DualEraPreviewReleaseReceipt {
  const value = object(receipt, 'receipt');
  exactKeys(value, [
    'schemaVersion', 'createdAt', 'repository', 'pullRequest', 'sourceCommit', 'sourceTree', 'endpoint',
    'productProfile', 'protocols', 'server', 'counts', 'contractFingerprints', 'auditSha256', 'worker', 'd1',
    'd1ReadinessSha256',
  ], 'receipt');
  const created = typeof value.createdAt === 'string' ? Date.parse(value.createdAt) : Number.NaN;
  const now = (expected.now ?? new Date()).getTime();
  if (value.schemaVersion !== 'theologai-dual-era-preview-release-receipt.v1'
    || value.repository !== expected.repository || value.sourceCommit !== expected.sourceCommit
    || value.sourceTree !== expected.sourceTree || value.productProfile !== '7'
    || JSON.stringify(value.protocols) !== JSON.stringify(PROTOCOLS)
    || !Number.isFinite(created) || created > now + FUTURE_SKEW_MS || now - created > MAX_AGE_MS) fail('receipt identity or seven-day freshness gate failed');
  const server = object(value.server, 'receipt server');
  const counts = object(value.counts, 'receipt counts');
  const fingerprints = object(value.contractFingerprints, 'receipt fingerprints');
  const worker = object(value.worker, 'receipt Worker');
  const d1 = object(value.d1, 'receipt D1');
  exactKeys(server, ['name', 'version'], 'receipt server');
  exactKeys(counts, ['tools', 'prompts', 'resourceTemplates', 'staticResources'], 'receipt counts');
  exactKeys(fingerprints, ['capabilities', 'tools', 'prompts', 'resourceTemplates', 'staticResources'], 'receipt fingerprints');
  exactKeys(worker, ['deploymentId', 'versionId', 'versionNumber'], 'receipt Worker');
  exactKeys(d1, ['databaseName', 'databaseId'], 'receipt D1');
  if (server.name !== 'theologai-bible-server' || server.version !== expected.serverVersion
    || value.endpoint !== 'https://preview-mcp.theologai.xyz/mcp'
    || counts.tools !== 11 || counts.prompts !== 6 || counts.resourceTemplates !== 2 || counts.staticResources !== 3
    || !Object.values(fingerprints).every(item => typeof item === 'string' && /^[0-9a-f]{64}$/.test(item))
    || !isSha256(value.auditSha256) || !isSha256(value.d1ReadinessSha256)
    || !isUuid(worker.deploymentId) || !isUuid(worker.versionId)
    || !Number.isSafeInteger(worker.versionNumber) || (worker.versionNumber as number) <= 0
    || typeof d1.databaseName !== 'string' || !isUuid(d1.databaseId)
    || typeof value.pullRequest !== 'number' || !Number.isSafeInteger(value.pullRequest) || value.pullRequest <= 0) fail('receipt contract evidence is malformed');
  return value as unknown as DualEraPreviewReleaseReceipt;
}

function args(argv: string[]): Map<string, string> {
  if (argv.length % 2 !== 0) fail('arguments must be --option value pairs');
  const output = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || output.has(key)) fail('arguments are malformed');
    output.set(key, value);
  }
  return output;
}

async function requiredFile(options: Map<string, string>, name: string): Promise<string> {
  const path = options.get(name); if (!path) fail(`${name} is required`); return await readFile(resolve(path), 'utf8');
}

async function main(): Promise<void> {
  const command = process.argv[2]; const options = args(process.argv.slice(3));
  if (command === 'create') {
    const output = options.get('--output'); if (!output) fail('--output is required');
    const receipt = createDualEraPreviewReleaseReceipt({
      repository: options.get('--repository') ?? '', pullRequest: Number(options.get('--pull-request')),
      sourceCommit: options.get('--source-commit') ?? '', sourceTree: options.get('--source-tree') ?? '',
      auditText: await requiredFile(options, '--audit'), workerIdentityText: await requiredFile(options, '--worker-identity'),
      cutoverText: await requiredFile(options, '--cutover'), d1ReadinessText: await requiredFile(options, '--d1-readiness'),
    });
    await writeFile(resolve(output), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return;
  }
  if (command === 'verify') {
    const receipt = parseJson(await requiredFile(options, '--receipt'), 'receipt');
    const verified = verifyDualEraPreviewReleaseReceipt(receipt, {
      repository: options.get('--expected-repository') ?? '', sourceCommit: options.get('--expected-source-commit') ?? '',
      sourceTree: options.get('--expected-source-tree') ?? '', serverVersion: options.get('--expected-server-version') ?? '',
    });
    process.stdout.write(`${JSON.stringify({ pullRequest: verified.pullRequest, worker: verified.worker, d1: verified.d1 })}\n`);
    return;
  }
  fail('command must be create or verify');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
