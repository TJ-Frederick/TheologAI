import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface AuditCase {
  name: string;
  arguments: Record<string, unknown>;
  assert: string[];
}

export interface ToolEvidence {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
}

type StructuredResult = {
  schemaVersion?: string;
  corpora?: string[];
  sourceAttestedGroups?: Array<{ members?: Array<Record<string, unknown>> }>;
  sourceAttestedResultWindow?: {
    requestedLimit?: number;
    returnedGroupCount?: number;
    additionalMatchStatus?: string;
  };
  legacyParallels?: Array<Record<string, unknown>>;
  openBibleCrossReferences?: Array<Record<string, unknown>>;
  provenance?: Array<Record<string, unknown>>;
};

const assertions: Record<string, (result: ToolEvidence) => boolean> = {
  success: result => result.isError !== true,
  toolError: result => result.isError === true,
  noUbsGroups: result => structured(result).sourceAttestedGroups?.length === 0,
  bothCorpora: result => ['ubs_source_attested', 'theologai_legacy'].every(c => structured(result).corpora?.includes(c)),
  ubsGroupsPresent: result => (structured(result).sourceAttestedGroups?.length ?? 0) > 0,
  legacyParallelsPresent: result => (structured(result).legacyParallels?.length ?? 0) > 0,
  alignmentPresent: result => members(result).length > 0 && members(result).every(m => m.alignmentBasis && m.alignmentRaw),
  memberTextPresent: result => members(result).length > 0 && members(result).every(m => m.text && m.translation),
  textAttributionPresent: result => members(result).length > 0
    && members(result).every(m => m.translation === 'WEB')
    && members(result).every(m => Array.isArray(m.provenanceIds) && m.provenanceIds.length > 0)
    && (structured(result).provenance?.some(p => p.kind === 'translation') ?? false)
    && /\(WEB(?:;|\))/.test(text(result)),
  excerptsBounded: result => {
    const ubsTexts = members(result).flatMap(member => [
      ...(typeof member.text === 'string' ? [member.text] : []),
      ...(Array.isArray(member.excerpts)
        ? member.excerpts.flatMap(excerpt => typeof excerpt === 'object' && excerpt !== null
          && 'text' in excerpt && typeof excerpt.text === 'string' ? [excerpt.text] : [])
        : []),
    ]);
    const legacyTexts = (structured(result).legacyParallels ?? [])
      .flatMap(item => typeof item.text === 'string' ? [item.text] : []);
    const storedTexts = [...ubsTexts, ...legacyTexts];
    return storedTexts.length > 0 && storedTexts.every(value => Array.from(value).length <= 200);
  },
  openBibleSeparate: result => (structured(result).openBibleCrossReferences?.length ?? 0) > 0
    && /OpenBible\.info cross references/.test(text(result)),
  openBibleAttribution: result => /OpenBible\.info.*CC BY/i.test(text(result)),
  conflictMessage: result => /conflict/i.test(text(result)),
  explicitLegacyInstruction: result => /require corpora.*theologai_legacy/i.test(text(result)),
  defaultsAccepted: result => result.isError !== true
    && structured(result).corpora?.length === 1
    && structured(result).corpora[0] === 'ubs_source_attested',
  v2AdditionalDefaultWindow: result => structured(result).schemaVersion === '2'
    && structured(result).sourceAttestedGroups?.length === 5
    && structured(result).sourceAttestedResultWindow?.requestedLimit === 5
    && structured(result).sourceAttestedResultWindow?.returnedGroupCount === 5
    && structured(result).sourceAttestedResultWindow?.additionalMatchStatus === 'additional_match_observed'
    && /Raise `maxGroups` \(up to 10\) or narrow the reference/.test(text(result)),
  v2MaximumObservedWindow: result => structured(result).schemaVersion === '2'
    && structured(result).sourceAttestedGroups?.length === 7
    && structured(result).sourceAttestedResultWindow?.requestedLimit === 10
    && structured(result).sourceAttestedResultWindow?.returnedGroupCount === 7
    && structured(result).sourceAttestedResultWindow?.additionalMatchStatus === 'no_additional_match_observed',
  completeKingsChroniclesIsaiahGroup: result => structured(result).sourceAttestedGroups?.some(group => {
    const references = group.members?.map(member => member.normalizedReference);
    return ['2 Kings 18:13', '2 Chronicles 32:1', 'Isaiah 36:1'].every(reference => references?.includes(reference));
  }) ?? false,
  distinctMatthewGroups: result => {
    const groups = structured(result).sourceAttestedGroups ?? [];
    const identities = groups.map(group => group.members?.map(member => member.normalizedReference).join('|'));
    return groups.length === 2
      && groups.every(group => group.members?.some(member => member.normalizedReference === 'Matthew 3:3'))
      && new Set(identities).size === 2;
  },
  ubsNotEvaluated: result => structured(result).sourceAttestedGroups?.length === 0
    && structured(result).sourceAttestedResultWindow?.requestedLimit === 5
    && structured(result).sourceAttestedResultWindow?.returnedGroupCount === 0
    && structured(result).sourceAttestedResultWindow?.additionalMatchStatus === 'not_evaluated',
};

export function evaluateCase(testCase: AuditCase, result: ToolEvidence) {
  return testCase.assert.map(id => ({
    id,
    passed: assertions[id]?.(result) ?? false,
    detail: assertions[id] ? undefined : `Unknown assertion: ${id}`,
  }));
}

function structured(result: ToolEvidence): StructuredResult {
  return (result.structuredContent ?? {}) as StructuredResult;
}

function members(result: ToolEvidence): Array<Record<string, unknown>> {
  return structured(result).sourceAttestedGroups?.flatMap(group => group.members ?? []) ?? [];
}

function text(result: ToolEvidence): string {
  return result.content?.filter(item => item.type === 'text').map(item => item.text ?? '').join('\n') ?? '';
}

export async function runAudit(url: URL, cases: AuditCase[], timeoutMs = 30_000) {
  const client = new Client({ name: 'theologai-parallel-preview-audit', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(url);
  const startedAt = new Date().toISOString();
  const records: Array<Record<string, unknown>> = [];
  try {
    await withTimeout(client.connect(transport), timeoutMs, 'MCP initialize');
    for (const testCase of cases) {
      const started = Date.now();
      try {
        const response = await withTimeout(client.callTool({
          name: 'parallel_passages',
          arguments: testCase.arguments,
        }), timeoutMs, testCase.name) as ToolEvidence;
        const checks = evaluateCase(testCase, response);
        records.push({
          ...testCase,
          durationMs: Date.now() - started,
          passed: checks.every(c => c.passed),
          checks,
          response: sanitizeEvidence(response),
        });
      } catch (error) {
        records.push({ ...testCase, durationMs: Date.now() - started, passed: false, checks: [], transportError: String(error) });
      }
    }
  } finally {
    await client.close().catch(() => undefined);
  }
  return {
    schemaVersion: '1', audit: 'parallel-passages-preview', endpoint: url.toString(), startedAt,
    finishedAt: new Date().toISOString(), passed: records.every(record => record.passed), records,
  };
}

/** Never persist an unbounded provider or Markdown text field in audit evidence. */
export function sanitizeEvidence<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => sanitizeEvidence(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key === 'text' && typeof item === 'string' ? boundEvidenceText(item) : sanitizeEvidence(item),
    ])) as T;
  }
  return value;
}

function boundEvidenceText(value: string): string {
  const codePoints = Array.from(value);
  return codePoints.length <= 200 ? value : `${codePoints.slice(0, 199).join('')}…`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixture = JSON.parse(await readFile(options.fixture, 'utf8')) as { cases: AuditCase[] };
  const evidence = await runAudit(new URL(options.url), fixture.cases, options.timeoutMs);
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`${evidence.passed ? 'PASS' : 'FAIL'}: ${evidence.records.filter(record => record.passed).length}/${evidence.records.length} cases; evidence: ${options.output}`);
  if (!evidence.passed) process.exitCode = 1;
}

function parseArgs(args: string[]) {
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  if (args.includes('--help')) {
    console.log('Usage: npm run audit:parallel-preview -- --url https://host.example/mcp [--output path] [--fixture path] [--timeout-ms 30000]');
    process.exit(0);
  }
  const url = value('--url');
  if (!url) {
    console.log('Usage: npm run audit:parallel-preview -- --url https://host.example/mcp [--output path] [--fixture path] [--timeout-ms 30000]');
    process.exit(2);
  }
  const timeoutMs = Number(value('--timeout-ms') ?? 30_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('--timeout-ms must be a positive number.');
  return {
    url,
    fixture: resolve(value('--fixture') ?? 'test/fixtures/parallel-passages-preview-audit.json'),
    output: resolve(value('--output') ?? `test-output/parallel-preview-audit-${new Date().toISOString().replaceAll(':', '-')}.json`),
    timeoutMs,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
