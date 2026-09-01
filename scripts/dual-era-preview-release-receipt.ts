import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DualEraMcpAudit } from './audit-dual-era-mcp-preview.js';

type JsonRecord = Record<string, unknown>;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const FUTURE_SKEW_MS = 5 * 60 * 1_000;
const PROTOCOLS = ['2025-11-25', '2026-07-28'] as const;
const ORIGINAL_LANGUAGE_FIXTURE_SHA256 = '85cc334e1980d9959521b3a59f316d8fa0373407f7aa12e822160be75d5acfc5';
const ORIGINAL_LANGUAGE_SCHEMA_SHA256 = {
  inputSchemaSha256: '4e8d3406f59d9f4bd488a4ac7b22148b186b1b57268ec4382e3f3193dd4249c0',
  outputSchemaSha256: '5560dc82255ed7eb2847c783884ae57d8d08ff8038d9775eff3cc9063bf1a35d',
  promptsSha256: '5cdaaed864d234e0ac04fd66c7cb1bb44d3d7bb8ee601abcc4726e62c4406d63',
} as const;
const ORIGINAL_LANGUAGE_PROMPTS = [
  ['word-study-beginner', 'beginner'],
  ['passage-exegesis-technical', 'technical'],
  ['compare-translations-default', 'intermediate'],
] as const;
const ORIGINAL_LANGUAGE_CASES = [
  ['greek-beginner', 'success'], ['greek-default-intermediate', 'success'],
  ['greek-technical', 'success'], ['hebrew-position-required', 'success'],
  ['h0216-beginner', 'success'], ['h3027-intermediate', 'success'],
  ['h3027-technical', 'success'], ['semantic-continuation', 'success'],
  ['occurrence-continuation', 'success'], ['h1961-unavailable', 'success'],
  ['stale-v2-cursor', 'safe-error'], ['removed-detail', 'input-error'],
  ['cursor-wrong-depth', 'safe-error'], ['cursor-corrupt', 'safe-error'],
  ['forbidden-artifact-identity', 'input-error'],
] as const;

export interface DualEraPreviewReleaseReceipt {
  schemaVersion: 'theologai-dual-era-preview-release-receipt.v2';
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
  originalLanguageAuditSha256: string;
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

function parseOriginalLanguageAudit(text: string): JsonRecord {
  const audit = object(parseJson(text, 'original-language audit'), 'original-language audit');
  exactKeys(audit, [
    'schemaVersion', 'audit', 'endpointClass', 'fixtureSha256', 'durationMs', 'negotiated',
    'schemas', 'promptRecords', 'budgets', 'records',
  ], 'original-language audit');
  const negotiated = object(audit.negotiated, 'original-language audit negotiated identity');
  exactKeys(negotiated, ['protocolVersion', 'serverName', 'serverVersion'], 'original-language audit negotiated identity');
  const schemas = object(audit.schemas, 'original-language audit schemas');
  exactKeys(schemas, ['inputSchemaSha256', 'outputSchemaSha256', 'promptsSha256'], 'original-language audit schemas');
  const budgets = object(audit.budgets, 'original-language audit budgets');
  exactKeys(budgets, [
    'logicalOperations', 'maximumLogicalOperations', 'httpExchanges', 'maximumHttpExchanges',
    'aggregateMcpResponseBytes', 'maximumAggregateMcpResponseBytes', 'retryCount',
    'perRequestMaximumDurationMs', 'maximumDurationMs', 'maximumMcpResponseBytes',
  ], 'original-language audit budgets');
  const promptRecords = Array.isArray(audit.promptRecords) ? audit.promptRecords.map((item, index) => object(item, `original-language prompt record ${index}`)) : [];
  const records = Array.isArray(audit.records) ? audit.records.map((item, index) => object(item, `original-language tool record ${index}`)) : [];
  if (audit.schemaVersion !== 2 || audit.audit !== 'original-language-v3-preview'
    || audit.endpointClass !== 'preview-custom' || audit.fixtureSha256 !== ORIGINAL_LANGUAGE_FIXTURE_SHA256
    || typeof audit.durationMs !== 'number' || audit.durationMs < 0 || audit.durationMs > 180_000
    || negotiated.protocolVersion !== '2025-11-25' || negotiated.serverName !== 'theologai-bible-server'
    || typeof negotiated.serverVersion !== 'string' || negotiated.serverVersion.length === 0
    || Object.entries(ORIGINAL_LANGUAGE_SCHEMA_SHA256).some(([key, digest]) => schemas[key] !== digest)
    || promptRecords.length !== ORIGINAL_LANGUAGE_PROMPTS.length
    || promptRecords.some((record, index) => {
      const expected = ORIGINAL_LANGUAGE_PROMPTS[index]!;
      return record.id !== expected[0] || record.expectedDepth !== expected[1]
        || record.passed !== true || !isSha256(record.generatedPromptSha256);
    })
    || records.length !== ORIGINAL_LANGUAGE_CASES.length
    || records.some((record, index) => {
      const expected = ORIGINAL_LANGUAGE_CASES[index]!;
      return record.id !== expected[0] || record.mode !== expected[1] || record.passed !== true
        || typeof record.durationMs !== 'number' || record.durationMs < 0 || record.durationMs > 180_000;
    })
    || budgets.logicalOperations !== 21 || budgets.maximumLogicalOperations !== 21
    || budgets.httpExchanges !== 22 || budgets.maximumHttpExchanges !== 22
    || budgets.retryCount !== 0 || budgets.maximumAggregateMcpResponseBytes !== 1024 * 1024
    || budgets.perRequestMaximumDurationMs !== 30_000 || budgets.maximumDurationMs !== 180_000
    || budgets.maximumMcpResponseBytes !== 256 * 1024
    || typeof budgets.aggregateMcpResponseBytes !== 'number'
    || budgets.aggregateMcpResponseBytes < 0
    || budgets.aggregateMcpResponseBytes > budgets.maximumAggregateMcpResponseBytes) {
    fail('original-language audit is malformed or incomplete');
  }
  return audit;
}

export function createDualEraPreviewReleaseReceipt(input: {
  repository: string;
  pullRequest: number;
  sourceCommit: string;
  sourceTree: string;
  auditText: string;
  originalLanguageAuditText: string;
  workerIdentityText: string;
  cutoverText: string;
  d1ReadinessText: string;
}): DualEraPreviewReleaseReceipt {
  const audit = parseAudit(input.auditText);
  const originalLanguageAudit = parseOriginalLanguageAudit(input.originalLanguageAuditText);
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
  const originalLanguageNegotiated = object(originalLanguageAudit.negotiated, 'original-language negotiated identity');
  if (originalLanguageNegotiated.serverVersion !== first.serverVersion) {
    fail('original-language and dual-era audits observed different server versions');
  }
  return {
    schemaVersion: 'theologai-dual-era-preview-release-receipt.v2',
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
    originalLanguageAuditSha256: sha256(input.originalLanguageAuditText),
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
  repository: string; sourceCommit: string; sourceTree: string; serverVersion: string;
  originalLanguageAuditText: string; now?: Date;
}): DualEraPreviewReleaseReceipt {
  const value = object(receipt, 'receipt');
  exactKeys(value, [
    'schemaVersion', 'createdAt', 'repository', 'pullRequest', 'sourceCommit', 'sourceTree', 'endpoint',
    'productProfile', 'protocols', 'server', 'counts', 'contractFingerprints', 'auditSha256',
    'originalLanguageAuditSha256', 'worker', 'd1',
    'd1ReadinessSha256',
  ], 'receipt');
  const created = typeof value.createdAt === 'string' ? Date.parse(value.createdAt) : Number.NaN;
  const now = (expected.now ?? new Date()).getTime();
  if (value.schemaVersion !== 'theologai-dual-era-preview-release-receipt.v2'
    || value.repository !== expected.repository || value.sourceCommit !== expected.sourceCommit
    || value.sourceTree !== expected.sourceTree || value.productProfile !== '7'
    || JSON.stringify(value.protocols) !== JSON.stringify(PROTOCOLS)
    || !Number.isFinite(created) || created > now + FUTURE_SKEW_MS || now - created > MAX_AGE_MS) fail('receipt identity or seven-day freshness gate failed');
  const server = object(value.server, 'receipt server');
  const counts = object(value.counts, 'receipt counts');
  const fingerprints = object(value.contractFingerprints, 'receipt fingerprints');
  const worker = object(value.worker, 'receipt Worker');
  const d1 = object(value.d1, 'receipt D1');
  const originalLanguageAudit = parseOriginalLanguageAudit(expected.originalLanguageAuditText);
  const originalLanguageNegotiated = object(originalLanguageAudit.negotiated, 'original-language negotiated identity');
  exactKeys(server, ['name', 'version'], 'receipt server');
  exactKeys(counts, ['tools', 'prompts', 'resourceTemplates', 'staticResources'], 'receipt counts');
  exactKeys(fingerprints, ['capabilities', 'tools', 'prompts', 'resourceTemplates', 'staticResources'], 'receipt fingerprints');
  exactKeys(worker, ['deploymentId', 'versionId', 'versionNumber'], 'receipt Worker');
  exactKeys(d1, ['databaseName', 'databaseId'], 'receipt D1');
  if (server.name !== 'theologai-bible-server' || server.version !== expected.serverVersion
    || value.endpoint !== 'https://preview-mcp.theologai.xyz/mcp'
    || counts.tools !== 11 || counts.prompts !== 6 || counts.resourceTemplates !== 2 || counts.staticResources !== 3
    || !Object.values(fingerprints).every(item => typeof item === 'string' && /^[0-9a-f]{64}$/.test(item))
    || originalLanguageNegotiated.serverVersion !== expected.serverVersion
    || !isSha256(value.auditSha256) || !isSha256(value.originalLanguageAuditSha256)
    || value.originalLanguageAuditSha256 !== sha256(expected.originalLanguageAuditText)
    || !isSha256(value.d1ReadinessSha256)
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
      auditText: await requiredFile(options, '--audit'),
      originalLanguageAuditText: await requiredFile(options, '--original-language-audit'),
      workerIdentityText: await requiredFile(options, '--worker-identity'),
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
      originalLanguageAuditText: await requiredFile(options, '--original-language-audit'),
    });
    process.stdout.write(`${JSON.stringify({ pullRequest: verified.pullRequest, worker: verified.worker, d1: verified.d1 })}\n`);
    return;
  }
  fail('command must be create or verify');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
