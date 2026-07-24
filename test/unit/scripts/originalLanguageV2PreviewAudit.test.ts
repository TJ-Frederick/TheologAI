import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  MAX_MCP_RESPONSE_BYTES,
  PINNED_PROVENANCE_SOURCES,
  canonicalJson,
  corruptCursor,
  readBoundedResponseBody,
  runPreviewAudit,
  validateFixture,
} from '../../../scripts/audit-original-language-v2-preview.js';
import { createOriginalLanguageStudyV2Cursor } from '../../../src/kernel/originalLanguageStudyV2Contract.js';
import { createUbsSemanticEvidenceBundleCursor } from '../../../src/kernel/ubsSemanticEvidenceBundle.js';
import {
  originalLanguageStudyV2InputSchema,
  originalLanguageStudyV2OutputSchema,
} from '../../../src/mcp/schemas/originalLanguageStudyV2.js';
import { presentOriginalLanguageStudy } from '../../../src/presenters/originalLanguageStudyStructured.js';
import { finalizeOriginalLanguageStudyV2Output } from '../../../src/presenters/originalLanguageStudyV2Structured.js';

const root = new URL('../../../', import.meta.url);
const fixtureUrl = new URL('test/fixtures/original-language-v2-preview-audit.json', root);
const runnerUrl = new URL('scripts/audit-original-language-v2-preview.ts', root);
const workflowUrl = new URL('.github/workflows/pr.yml', root);
const marker = '\n### Added Hebrew semantic layer';
const artifactIdentity = 'bd19fb99f7bbfd13ad68f2184aaded4a6e5587196ad76b68b0c22bf971fc90f6';

async function fixture(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as Record<string, unknown>;
}

describe('original-language v2 preview audit contract', () => {
  it('accepts only the immutable eleven-case fixture', async () => {
    const value = await fixture();
    const parsed = validateFixture(value);

    expect(parsed.cases.map(item => item.id)).toEqual([
      'greek-not-applicable', 'h0216-position-required', 'h0216-summary', 'h3027-summary',
      'h3027-detailed', 'h3027-continuation', 'cursor-wrong-reference', 'cursor-wrong-detail',
      'h1961-unavailable', 'forbidden-artifact-identity', 'cursor-corrupt',
    ]);
    expect(parsed.baseline.cleanMainCommit).toBe('7974b15');
  });

  it('rejects missing, extra, and weakened fixture fields before any transport exists', async () => {
    const missing = structuredClone(await fixture());
    delete missing.baseline;
    expect(() => validateFixture(missing)).toThrow(/fixture keys drifted/);

    const extra = structuredClone(await fixture());
    extra.unreviewed = true;
    expect(() => validateFixture(extra)).toThrow(/fixture keys drifted/);

    const widened = structuredClone(await fixture());
    const first = (widened.cases as Array<Record<string, unknown>>)[0]!;
    (first.arguments as Record<string, unknown>).detail = 'detailed';
    expect(() => validateFixture(widened)).toThrow(/arguments drifted/);
  });

  it('uses deterministic, opaque-safe cursor corruption and canonical nested-v1 hashing', () => {
    const cursor = 'olsv2c1_ab00';
    expect(corruptCursor(cursor)).toBe('olsv2c1_ab01');
    expect(() => corruptCursor('not-a-cursor')).toThrow(/encoding drifted/);
    expect(canonicalJson({ b: [{ z: 1, a: true }], a: null })).toBe('{"a":null,"b":[{"a":true,"z":1}]}');
  });

  it('keeps the runner fixed to preview, with bounded no-retry release-gate semantics', async () => {
    const [runner, workflow] = await Promise.all([readFile(runnerUrl, 'utf8'), readFile(workflowUrl, 'utf8')]);

    expect(runner).toContain("const PREVIEW_ENDPOINT = 'https://preview-mcp.theologai.xyz/mcp';");
    expect(runner).toContain('const MAX_LOGICAL_OPERATIONS = 13;');
    expect(runner).toContain('const MAX_HTTP_EXCHANGES = 14;');
    expect(runner).toContain('const MAX_REQUEST_DURATION_MS = 30_000;');
    expect(runner).toContain('readBoundedResponseBody(response, controller, label)');
    expect(runner).toContain("redirect: 'error'");
    expect(runner).not.toMatch(/--(?:url|endpoint|fixture)/);
    expect(runner).not.toContain('theologai.tjfrederick.workers.dev');

    const deploy = workflow.indexOf('- name: Deploy to Cloudflare Workers (preview)');
    const preAuditIdentity = workflow.indexOf('- name: Verify exact active preview Worker version (read-only)');
    const audit = workflow.indexOf('- name: Audit original-language v2 contract on preview');
    const postAuditIdentity = workflow.indexOf('- name: Verify preview Worker remained active through audit (read-only)');
    const comment = workflow.indexOf('- name: Comment preview URL on PR');
    expect(deploy).toBeGreaterThan(-1);
    expect(preAuditIdentity).toBeGreaterThan(deploy);
    expect(audit).toBeGreaterThan(preAuditIdentity);
    expect(postAuditIdentity).toBeGreaterThan(audit);
    expect(comment).toBeGreaterThan(postAuditIdentity);
    expect(workflow).toContain('group: theologai-shared-preview-deploy-and-audit');
    expect(workflow).toContain('Verify exact active preview Worker version (read-only)');
    expect(workflow).toContain('wrangler deployments list --env preview --json > "$RUNNER_TEMP/preview-worker-deployments-post-audit.json"');
    expect(workflow).toContain('Upload protected preview audit evidence');
  });

  it('runs the fixed 14-exchange protocol through a representative fake transport without retaining private bodies or cursors', async () => {
    const parsed = validateFixture(await fixture());
    const outputs = new Map(parsed.cases.map(item => [item.id, fakeOutput(item.arguments, item.id === 'h3027-continuation')]));
    const baselineForCase: Record<string, string> = {
      'greek-not-applicable': 'greek',
      'h0216-position-required': 'h0216-unpositioned',
      'h0216-summary': 'h0216',
      'h3027-summary': 'h3027',
      'h3027-detailed': 'h3027',
      'h3027-continuation': 'h3027',
      'h1961-unavailable': 'h1961',
    };
    const fakeFixture = structuredClone(parsed);
    for (const [caseId, baselineName] of Object.entries(baselineForCase)) {
      const output = outputs.get(caseId)!;
      const prefix = fakeMarkdown(baselineName);
      fakeFixture.baseline.v1[baselineName] = {
        prefixUtf8Bytes: new TextEncoder().encode(prefix).byteLength,
        prefixSha256: sha256(prefix),
        canonicalStudySha256: sha256(canonicalJson(output.study)),
      };
    }
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    let toolIndex = 0;
    const fakeFetch: typeof fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(input), body });
      if (body.method === 'initialize') return jsonResponse({
        jsonrpc: '2.0', id: body.id,
        result: {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: 'theologai-bible-server', version: '3.6.0-preview' },
        },
      });
      if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
      if (body.method === 'tools/list') return jsonResponse({
        jsonrpc: '2.0', id: body.id,
        result: { tools: fakeTools() },
      });
      const auditCase = fakeFixture.cases[toolIndex++]!;
      if (auditCase.mode !== 'success') return jsonResponse({
        jsonrpc: '2.0', id: body.id,
        result: {
          isError: true,
          content: [{ type: 'text', text: auditCase.id === 'forbidden-artifact-identity'
            ? 'artifactIdentity is not accepted.' : 'The continuation cannot be used for this request.' }],
        },
      });
      const output = outputs.get(auditCase.id)!;
      return jsonResponse({
        jsonrpc: '2.0', id: body.id,
        result: {
          content: [{ type: 'text', text: `${fakeMarkdown(baselineForCase[auditCase.id]!)}${marker}\nPRIVATE SEMANTIC TEXT` }],
          structuredContent: output,
        },
      });
    };

    const evidence = await runPreviewAudit(fakeFixture, fakeFetch);
    expect(calls).toHaveLength(14);
    expect(calls.every(call => call.url === 'https://preview-mcp.theologai.xyz/mcp')).toBe(true);
    expect((evidence.budgets as Record<string, unknown>)).toMatchObject({
      logicalOperations: 13, maximumLogicalOperations: 13,
      httpExchanges: 14, maximumHttpExchanges: 14, retryCount: 0,
      maximumMcpResponseBytes: MAX_MCP_RESPONSE_BYTES,
    });
    const summaryCursor = continuationCursor(outputs.get('h3027-summary')!);
    const submittedCorrupt = ((calls.at(-1)!.body.params as Record<string, unknown>).arguments as Record<string, unknown>).cursor;
    expect(submittedCorrupt).toBe(corruptCursor(summaryCursor));
    const serialized = JSON.stringify(evidence);
    expect(evidence.negotiated).toEqual({
      protocolVersion: '2025-11-25',
      serverName: 'theologai-bible-server',
      serverVersion: '3.6.0-preview',
    });
    expect(serialized).not.toContain('PRIVATE');
    expect(serialized).not.toContain(summaryCursor);
    expect(serialized).not.toContain(String(submittedCorrupt));
  });

  it('rejects a changed advertised schema before the fake transport can execute tool calls', async () => {
    const parsed = validateFixture(await fixture());
    let calls = 0;
    const fakeFetch: typeof fetch = async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.method === 'initialize') return jsonResponse({
        jsonrpc: '2.0', id: body.id,
        result: {
          protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {}, prompts: {} },
          serverInfo: { name: 'theologai-bible-server', version: '3.6.0-preview' },
        },
      });
      if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
      const tools = fakeTools();
      const target = tools.find(tool => tool.name === 'original_language_study')!;
      (target.inputSchema as Record<string, unknown>).additionalProperties = true;
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { tools } });
    };
    await expect(runPreviewAudit(parsed, fakeFetch)).rejects.toThrow('advertised v2 input schema');
    expect(calls).toBe(3);
  });

  it('aborts and cancels both oversized declared and chunked response bodies', async () => {
    const declared = new AbortController();
    await expect(readBoundedResponseBody(new Response('x', {
      headers: { 'content-length': String(MAX_MCP_RESPONSE_BYTES + 1) },
    }), declared, 'declared')).rejects.toThrow('ceiling');
    expect(declared.signal.aborted).toBe(true);

    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_MCP_RESPONSE_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() { cancelled = true; },
    });
    const chunked = new AbortController();
    await expect(readBoundedResponseBody(new Response(body), chunked, 'chunked')).rejects.toThrow('ceiling');
    expect(chunked.signal.aborted).toBe(true);
    expect(cancelled).toBe(true);
  });
});

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function jsonResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': String(new TextEncoder().encode(body).byteLength) },
  });
}

function fakeTools(): Array<Record<string, unknown>> {
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
  return [
    'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup',
    'classic_text_lookup', 'primary_source_search', 'original_language_lookup',
    'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
  ].map(name => name === 'original_language_study'
    ? { name, annotations, inputSchema: structuredClone(originalLanguageStudyV2InputSchema), outputSchema: structuredClone(originalLanguageStudyV2OutputSchema) }
    : { name, annotations });
}

function fakeMarkdown(baseline: string): string {
  return `PRIVATE V1 MARKDOWN FOR ${baseline}`;
}

function fakeOutput(argumentsValue: Record<string, unknown>, continuation = false): Record<string, unknown> {
  const reference = argumentsValue.reference as string;
  const target = argumentsValue.target as string;
  const position = argumentsValue.position as number | undefined;
  const detail = argumentsValue.detail === 'detailed' ? 'detailed' : 'summary';
  const isGreek = target.startsWith('G');
  const study = target === 'H0216' && position === undefined
    ? presentOriginalLanguageStudy({
      status: 'needs_disambiguation', reference, language: 'Hebrew', target,
      candidates: [studyToken(4, 'H216'), studyToken(6, 'H216')], warnings: [],
    }, undefined)
    : presentOriginalLanguageStudy({
      status: 'complete', reference, language: isGreek ? 'Greek' : 'Hebrew', target,
      selectedToken: studyToken(position ?? 1, isGreek ? 'G3056' : publicStrongs(target)),
      identity: {
        publicStrongs: isGreek ? 'G3056' : publicStrongs(target), morphologyKey: isGreek ? 'G3056' : target,
        sourceStrongs: isGreek ? 'G3056' : publicStrongs(target), lemma: 'PRIVATE LEMMA', joinKind: 'exact',
      }, warnings: [],
    }, position);
  const semanticEvidence = isGreek
    ? { language: 'Greek', status: 'not_applicable', reason: 'hebrew_semantic_evidence_not_applicable', plainLanguage: 'PRIVATE' }
    : target === 'H0216' && position === undefined
      ? { language: 'Hebrew', status: 'unavailable', reason: 'selected_token_required', plainLanguage: 'PRIVATE' }
      : fakeHebrewEvidence({ reference, target, position: position!, detail, study, continuation });
  return finalizeOriginalLanguageStudyV2Output({
    schemaVersion: '2', kind: 'original_language_study', detail,
    request: { reference, target, ...(position === undefined ? {} : { position }) },
    study, semanticEvidence, responseWindow: { unit: 'utf8_bytes', maximum: 32 * 1024, used: 0, truncated: false },
  } as never).output as Record<string, unknown>;
}

function studyToken(position: number, strongsNumber: string) {
  return {
    position, text: 'PRIVATE TOKEN', lemma: 'PRIVATE LEMMA', strongsNumber,
    morphologyCode: 'HNcmsa', gloss: 'PRIVATE GLOSS',
  };
}

function publicStrongs(target: string): string {
  return `H${Number(target.slice(1))}`;
}

function fakeHebrewEvidence(input: {
  reference: string; target: string; position: number; detail: 'summary' | 'detailed'; study: Record<string, unknown>; continuation: boolean;
}): Record<string, unknown> {
  const sourceIdentity = input.target;
  const publicIdentity = publicStrongs(input.target);
  const h3027 = input.target === 'H3027';
  const h0216 = input.target === 'H0216';
  const h1961 = input.target === 'H1961';
  const ids = h3027
    ? (!input.continuation
      ? Array.from({ length: 8 }, (_, index) => `ubs-sense-00279100100${index + 1}000`)
      : Array.from({ length: 8 }, (_, index) => `ubs-sense-0027910010${String(index + 9).padStart(2, '0')}000`))
    : h0216 ? ['ubs-sense-000206001001000'] : [];
  const continuationPage = h3027 && input.continuation;
  const prior = h3027 && continuationPage ? 8 : 0;
  const candidates = ids.map((senseId, index) => fakeCandidate(senseId, input.detail, h0216 ? 2 : 1, input.reference, index));
  const hasMore = h3027;
  const consumed = prior + candidates.length;
  const common = {
    language: 'Hebrew', identity: { publicStrongs: publicIdentity, sourceIdentity }, normalizedReference: input.reference,
    resultWindow: {
      priorCount: prior, returnedCount: candidates.length, consumedCount: consumed,
      totalCount: h3027 ? 78 : h0216 ? 1 : 0, hasMore,
      ...(hasMore ? { continuation: { cursor: fakeCursor(input, sourceIdentity, publicIdentity, consumed, ids.at(-1)!), operation: 'original_language_study_semantic_candidates' } } : {}),
    },
    provenance: {
      artifactIdentity,
      sources: PINNED_PROVENANCE_SOURCES.map(source => ({ ...source })),
    },
    withheldEvidence: [
      { source: 'TBESH', field: 'Meaning', status: 'withheld_rights_boundary' },
      { source: 'UBS Hebrew dictionary', field: 'A#### lexical identities', status: 'withheld_public_v2_scope' },
    ],
  };
  if (h1961) return {
    ...common, status: 'unavailable', reason: 'no_lexical_entry', plainLanguage: 'PRIVATE',
    candidates: [], resultWindow: { ...common.resultWindow, totalCount: 0, hasMore: false },
  };
  return {
    ...common, status: 'lexical_candidates',
    reason: h0216 ? 'ambiguous_reference_alignment' : 'reference_alignment_unproven',
    plainLanguage: 'PRIVATE', candidates,
  };
}

function fakeCandidate(
  senseId: string,
  detail: 'summary' | 'detailed',
  referenceCount: number,
  normalizedReference: string,
  index: number,
): Record<string, unknown> {
  const references = senseId === 'ubs-sense-000206001001000'
    ? ['ubs-reference-000206001001000-00001', 'ubs-reference-000206001001000-00002']
    : [`private-reference-${index}`];
  const identity = {
    sourceId: PINNED_PROVENANCE_SOURCES[0].sourceId, sourceRole: 'dictionary',
    entryId: `private-entry-${index}`, senseId, sourceAttestedReferenceCount: referenceCount,
    referenceEvidenceIds: references,
  };
  if (detail === 'summary') return { ...identity, detailStatus: 'summary' };
  return {
    ...identity, detailStatus: 'detailed', lemma: 'PRIVATE', definitionStatus: 'published',
    definition: 'PRIVATE', definitionExclusionReasons: [], glosses: ['PRIVATE'],
    domains: [{ sourceId: PINNED_PROVENANCE_SOURCES[1].sourceId, sourceRole: 'lexical_domains', domainId: 'private-domain', label: 'PRIVATE' }],
    domainTotal: 1,
    referenceEvidence: references.map(evidenceId => ({
      sourceId: PINNED_PROVENANCE_SOURCES[0].sourceId, sourceRole: 'dictionary', senseId, evidenceId,
      sourceReference: normalizedReference, normalizedReference, kind: 'source_attested_sense_reference',
    })),
    referenceEvidenceTotal: referenceCount,
  };
}

function fakeCursor(
  input: { reference: string; target: string; position: number; detail: 'summary' | 'detailed' },
  sourceIdentity: string,
  publicIdentity: string,
  consumed: number,
  senseId: string,
): string {
  const query = { artifactIdentity, sourceIdentity, normalizedReference: input.reference };
  const row = {
    entry: { sourceId: PINNED_PROVENANCE_SOURCES[0].sourceId, sourceOrdinal: 1, entryId: 'private-entry', lemma: 'PRIVATE', lexicalIdentities: [sourceIdentity] },
    sense: { sourceId: PINNED_PROVENANCE_SOURCES[0].sourceId, sourceOrdinal: 1, entryId: 'private-entry', senseId, definitionStatus: 'published', definition: 'PRIVATE', definitionExclusionReasons: [], glosses: ['PRIVATE'], domainRefs: [] },
    domains: [], domainTotal: 0, matchingReferences: [], matchingReferenceTotal: 0,
  };
  const repositoryCursor = createUbsSemanticEvidenceBundleCursor(query as never, row as never, consumed);
  return createOriginalLanguageStudyV2Cursor(repositoryCursor, {
    requestReference: input.reference, requestTarget: input.target, requestPosition: input.position,
    detail: input.detail, canonicalReference: input.reference,
    selectedToken: studyToken(input.position, publicIdentity), publicStrongs: publicIdentity,
    sourceIdentity, normalizedReference: input.reference, artifactIdentity,
  } as never);
}

function continuationCursor(output: Record<string, unknown>): string {
  const evidence = output.semanticEvidence as Record<string, unknown>;
  const window = evidence.resultWindow as Record<string, unknown>;
  return ((window.continuation as Record<string, unknown>).cursor as string);
}
