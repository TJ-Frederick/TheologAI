import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  MAX_AGGREGATE_MCP_RESPONSE_BYTES,
  MAX_MCP_RESPONSE_BYTES,
  PINNED_PROVENANCE_SOURCES,
  canonicalJson,
  corruptCursor,
  readBoundedResponseBody,
  runPreviewAudit,
  type AuditCase,
  type AuditFixture,
  validateFixture,
} from '../../../scripts/audit-original-language-v3-preview.js';
import { originalLanguageStudyV3InputSchema, originalLanguageStudyV3OutputSchema } from '../../../src/mcp/schemas/originalLanguageStudyV3.js';

const root = new URL('../../../', import.meta.url);
const fixtureUrl = new URL('test/fixtures/original-language-v3-preview-audit.json', root);

async function fixture(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(fixtureUrl, 'utf8')) as Record<string, unknown>;
}

describe('original-language v3 depth preview audit contract', () => {
  it('accepts only the fixed prompt and tool case matrix', async () => {
    const parsed = validateFixture(await fixture());
    expect(parsed.promptCases.map(item => item.id)).toEqual([
      'word-study-beginner', 'passage-exegesis-technical', 'compare-translations-default',
    ]);
    expect(parsed.cases.map(item => item.id)).toEqual([
      'greek-beginner', 'greek-default-intermediate', 'greek-technical',
      'hebrew-position-required', 'h0216-beginner', 'h3027-intermediate',
      'h3027-technical', 'semantic-continuation', 'occurrence-continuation',
      'h1961-unavailable', 'stale-v2-cursor', 'removed-detail',
      'cursor-wrong-depth', 'cursor-corrupt', 'forbidden-artifact-identity',
    ]);
  });

  it('rejects missing, extra, or weakened fixture fields before transport', async () => {
    const missing = structuredClone(await fixture()); delete missing.authorityAnchors;
    expect(() => validateFixture(missing)).toThrow(/fixture keys drifted/);
    const extra = structuredClone(await fixture()); extra.unreviewed = true;
    expect(() => validateFixture(extra)).toThrow(/fixture keys drifted/);
    const weakened = structuredClone(await fixture());
    ((weakened.cases as Array<Record<string, unknown>>)[10]!.arguments as Record<string, unknown>).cursor = 'olsv3c1_fresh';
    expect(() => validateFixture(weakened)).toThrow(/tool cases drifted/);
  });

  it('uses deterministic v3 corruption and canonical hashing helpers', () => {
    expect(corruptCursor('olsv3c1_abcA')).toBe('olsv3c1_abcB');
    expect(() => corruptCursor('olsv2c1_ab00')).toThrow(/v3 continuation/);
    expect(canonicalJson({ b: [{ z: 1, a: true }], a: null })).toBe('{"a":null,"b":[{"a":true,"z":1}]}');
  });

  it('keeps the active gate v3-only, bounded, receipt-bound, and fixed-endpoint', async () => {
    const [runner, pr, deploy, receipt, packageText, tsconfig] = await Promise.all([
      readFile(new URL('scripts/audit-original-language-v3-preview.ts', root), 'utf8'),
      readFile(new URL('.github/workflows/pr.yml', root), 'utf8'),
      readFile(new URL('.github/workflows/deploy.yml', root), 'utf8'),
      readFile(new URL('scripts/dual-era-preview-release-receipt.ts', root), 'utf8'),
      readFile(new URL('package.json', root), 'utf8'),
      readFile(new URL('tsconfig.release-scripts.json', root), 'utf8'),
    ]);
    expect(runner).toContain("const PREVIEW_ENDPOINT = 'https://preview-mcp.theologai.xyz/mcp';");
    expect(runner).toContain('const MAX_LOGICAL_OPERATIONS = 21;');
    expect(runner).toContain('const MAX_HTTP_EXCHANGES = 22;');
    expect(runner).toContain('MAX_AGGREGATE_MCP_RESPONSE_BYTES = 1024 * 1024');
    expect(runner).toContain("redirect: 'error'");
    expect(runner).not.toMatch(/--(?:url|endpoint|fixture)/);
    expect(pr).toContain('id: preview-original-language-v3-audit');
    expect(pr).toContain('--original-language-audit "$RUNNER_TEMP/original-language-v3-preview-audit.json"');
    expect(deploy.match(/--original-language-audit "\$RUNNER_TEMP\/protected-dual-era-preview\/original-language-v3-preview-audit.json"/g)).toHaveLength(2);
    expect(deploy).toContain('id: production-original-language-v3-audit');
    expect(receipt).toContain("schemaVersion: 'theologai-dual-era-preview-release-receipt.v2'");
    expect(receipt).toContain('originalLanguageAuditSha256');
    expect(packageText).toContain('"audit:original-language-v3-preview"');
    expect(packageText).toContain('"audit:original-language-v3-production"');
    expect(tsconfig).toContain('scripts/audit-original-language-v3-preview.ts');
  });

  it('runs the exact 21-operation/22-exchange audit through a deterministic fake transport', async () => {
    const parsed = validateFixture(await fixture());
    const calls: Array<Record<string, unknown>> = [];
    const semanticCursor = 'olsv3c1_PRIVATE_SEMANTIC_CURSOR_A';
    const occurrenceCursor = 'olsv3c1_PRIVATE_OCCURRENCE_CURSOR_A';
    let aggregateResponseBytes = 0;
    let toolIndex = 0;

    const respond = (value: unknown): Response => {
      const body = JSON.stringify(value);
      aggregateResponseBytes += utf8Bytes(body);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-length': String(utf8Bytes(body)),
        },
      });
    };
    const fakeFetch: typeof fetch = async (input, init) => {
      expect(String(input)).toBe('https://preview-mcp.theologai.xyz/mcp');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push(body);
      if (body.method === 'initialize') {
        return respond({
          jsonrpc: '2.0', id: body.id,
          result: {
            protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {}, prompts: {} },
            serverInfo: { name: 'theologai-bible-server', version: '4.0.0-preview' },
          },
        });
      }
      if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
      if (body.method === 'tools/list') {
        return respond({ jsonrpc: '2.0', id: body.id, result: { tools: fakeTools() } });
      }
      if (body.method === 'prompts/list') {
        return respond({ jsonrpc: '2.0', id: body.id, result: { prompts: fakePrompts() } });
      }
      if (body.method === 'prompts/get') {
        const params = body.params as Record<string, unknown>;
        const promptCase = parsed.promptCases.find(item => item.name === params.name)!;
        return respond({
          jsonrpc: '2.0', id: body.id,
          result: { messages: [{ role: 'user', content: { type: 'text', text: fakePromptText(promptCase.name, promptCase.expectedDepth) } }] },
        });
      }
      expect(body.method).toBe('tools/call');
      const auditCase = parsed.cases[toolIndex++]!;
      if (auditCase.mode !== 'success') {
        return respond({
          jsonrpc: '2.0', id: body.id,
          result: {
            isError: true,
            content: [{ type: 'text', text: fakeErrorText(auditCase.id) }],
          },
        });
      }
      return respond({
        jsonrpc: '2.0', id: body.id,
        result: {
          content: [{ type: 'text', text: `PRIVATE TOOL MARKDOWN ${auditCase.id}` }],
          structuredContent: fakeOutput(auditCase, parsed, semanticCursor, occurrenceCursor),
        },
      });
    };

    const evidence = await runPreviewAudit(parsed, fakeFetch);
    const methods = calls.map(call => call.method);
    expect(methods).toEqual([
      'initialize', 'notifications/initialized', 'tools/list', 'prompts/list',
      'prompts/get', 'prompts/get', 'prompts/get',
      ...Array.from({ length: 15 }, () => 'tools/call'),
    ]);
    expect(methods.filter(method => method !== 'notifications/initialized')).toHaveLength(21);
    expect(calls).toHaveLength(22);
    expect(toolIndex).toBe(15);

    const toolArguments = calls.filter(call => call.method === 'tools/call').map(call => {
      const params = call.params as Record<string, unknown>;
      return (params.arguments as Record<string, unknown>);
    });
    const argumentsByCase = new Map(parsed.cases.map((item, index) => [item.id, toolArguments[index]!]));
    expect(argumentsByCase.get('semantic-continuation')?.cursor).toBe(semanticCursor);
    expect(argumentsByCase.get('occurrence-continuation')?.cursor).toBe(occurrenceCursor);
    expect(argumentsByCase.get('cursor-wrong-depth')?.cursor).toBe(semanticCursor);
    expect(argumentsByCase.get('cursor-corrupt')?.cursor).toBe(corruptCursor(semanticCursor));
    expect(argumentsByCase.get('stale-v2-cursor')?.cursor).toBe('olsv2c1_7b7d');

    expect(Object.keys(evidence)).toEqual([
      'schemaVersion', 'audit', 'endpointClass', 'fixtureSha256', 'durationMs',
      'negotiated', 'schemas', 'promptRecords', 'budgets', 'records',
    ]);
    expect(evidence).toMatchObject({
      schemaVersion: 2, audit: 'original-language-v3-preview', endpointClass: 'preview-custom',
      negotiated: {
        protocolVersion: '2025-11-25', serverName: 'theologai-bible-server', serverVersion: '4.0.0-preview',
      },
    });
    expect(evidence.budgets).toEqual({
      logicalOperations: 21, maximumLogicalOperations: 21,
      httpExchanges: 22, maximumHttpExchanges: 22,
      aggregateMcpResponseBytes: aggregateResponseBytes,
      maximumAggregateMcpResponseBytes: MAX_AGGREGATE_MCP_RESPONSE_BYTES,
      retryCount: 0, perRequestMaximumDurationMs: 30_000,
      maximumDurationMs: 180_000, maximumMcpResponseBytes: MAX_MCP_RESPONSE_BYTES,
    });
    expect((evidence.promptRecords as Array<Record<string, unknown>>).map(record => [record.id, record.expectedDepth, record.passed])).toEqual([
      ['word-study-beginner', 'beginner', true],
      ['passage-exegesis-technical', 'technical', true],
      ['compare-translations-default', 'intermediate', true],
    ]);
    expect((evidence.records as Array<Record<string, unknown>>).map(record => [record.id, record.mode, record.passed])).toEqual(
      parsed.cases.map(item => [item.id, item.mode, true]),
    );
    expect((evidence.records as Array<Record<string, unknown>>).every(record => {
      const request = record.request as Record<string, unknown>;
      return !Object.hasOwn(request, 'cursor') && !Object.hasOwn(request, 'detail') && !Object.hasOwn(request, 'artifactIdentity');
    })).toBe(true);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('PRIVATE');
    expect(serialized).not.toContain(semanticCursor);
    expect(serialized).not.toContain(occurrenceCursor);
    expect(serialized).not.toContain(corruptCursor(semanticCursor));
    expect(aggregateResponseBytes).toBeLessThan(MAX_AGGREGATE_MCP_RESPONSE_BYTES);
  });

  it('aborts and cancels oversized declared and chunked response bodies', async () => {
    expect(MAX_AGGREGATE_MCP_RESPONSE_BYTES).toBe(1024 * 1024);
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

  it('pins the released v2 audit packet as historical reference evidence', async () => {
    const expected: Record<string, string> = {
      'scripts/audit-original-language-v2-preview.ts': 'ab9ea958202fd847f1902110ceb1741ec70da6b23b56a0e0fe1eb4c4cf4e6c08',
      'scripts/audit-original-language-v2-production.ts': '305ba9b145fd0b45610be2b8facc7e5b11f611e001f74b4d18b2e1f7494e2e35',
      'test/fixtures/original-language-v2-preview-audit.json': 'dabe124580904c411f11484d2c25fbd30452201f6c6f8927c94c0f3f294204a7',
      'test/unit/scripts/originalLanguageV2PreviewAudit.test.ts': '48f8cf6fdf5806d7831ca9ecf1ae86216734b27f2f0bde5f0ba3a7a94e80dbc0',
      'docs/ORIGINAL-LANGUAGE-V2-PREVIEW-AUDIT.md': '22ed9b65fb68f4a10e8862d9ff0e8255f13e4b09b31aac698ced10453910bc09',
    };
    for (const [path, digest] of Object.entries(expected)) {
      const text = await readFile(new URL(path, root), 'utf8');
      expect(createHash('sha256').update(text).digest('hex'), path).toBe(digest);
    }
  });
});

function fakeTools(): Array<Record<string, unknown>> {
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
  return [
    'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup',
    'classic_text_lookup', 'primary_source_search', 'original_language_lookup',
    'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
  ].map(name => name === 'original_language_study'
    ? {
      name, annotations,
      inputSchema: structuredClone(originalLanguageStudyV3InputSchema),
      outputSchema: structuredClone(originalLanguageStudyV3OutputSchema),
    }
    : { name, annotations });
}

function fakePrompts(): Array<Record<string, unknown>> {
  const depth = {
    name: 'depth', required: false,
    description: 'Choose beginner, intermediate, or technical; default is intermediate.',
  };
  return [
    'word-study', 'passage-exegesis', 'compare-translations',
    'confession-study', 'primary-source-research', 'donate',
  ].map(name => ({
    name,
    arguments: ['word-study', 'passage-exegesis', 'compare-translations'].includes(name) ? [depth] : [],
  }));
}

function fakePromptText(name: string, depth: string): string {
  const common = `PRIVATE ${name} calls original_language_study with depth: ${depth}.`;
  if (name === 'word-study') {
    return `${common} Use an evidence-label and interpret separately. Continue with corpusOccurrences.resultWindow.continuation.cursor.`;
  }
  if (name === 'passage-exegesis') {
    return `${common} Inspect raw source evidence and corpusOccurrences. Do not select meaning or issue a contextual verdict.`;
  }
  return common;
}

function fakeErrorText(id: string): string {
  if (id === 'stale-v2-cursor') return 'Unsupported stale schema version 2 continuation.';
  if (id === 'removed-detail') return 'detail is not accepted by this input schema.';
  if (id === 'forbidden-artifact-identity') return 'artifactIdentity is not accepted by this input schema.';
  return 'The continuation cannot be used for this request.';
}

function fakeOutput(
  item: AuditCase,
  fixtureValue: AuditFixture,
  semanticCursor: string,
  occurrenceCursor: string,
): Record<string, unknown> {
  const depth = item.arguments.depth === 'beginner' || item.arguments.depth === 'technical'
    ? item.arguments.depth
    : 'intermediate';
  const language = String(item.arguments.target).startsWith('G') ? 'Greek' : 'Hebrew';
  const output: Record<string, unknown> = {
    schemaVersion: '3', kind: 'original_language_study', depth,
    request: {
      reference: item.arguments.reference, target: item.arguments.target,
      ...(item.arguments.position === undefined ? {} : { position: item.arguments.position }),
    },
    study: { status: 'PRIVATE' },
    lexicalRange: { status: 'unavailable', scope: 'source_attested_non_exhaustive' },
    englishTranslationComparison: { status: 'not_performed', responsibility: 'guided_prompt' },
    contextualInterpretation: { status: 'not_performed', responsibility: 'guided_prompt' },
    semanticEvidence: fakeSemanticEvidence(item, fixtureValue, language, semanticCursor),
    ...(depth === 'technical'
      ? { corpusOccurrences: fakeCorpusOccurrences(item.id, fixtureValue, occurrenceCursor) }
      : {}),
    responseWindow: { unit: 'utf8_bytes', maximum: 32 * 1024, used: 0, truncated: false },
  };
  makeResponseWindowTruthful(output);
  return output;
}

function fakeSemanticEvidence(
  item: AuditCase,
  fixtureValue: AuditFixture,
  language: 'Greek' | 'Hebrew',
  semanticCursor: string,
): Record<string, unknown> {
  if (language === 'Greek') {
    return { language, status: 'not_applicable', reason: 'hebrew_semantic_evidence_not_applicable', plainLanguage: 'PRIVATE' };
  }
  if (item.id === 'hebrew-position-required') {
    return { language, status: 'unavailable', reason: 'selected_token_required', plainLanguage: 'PRIVATE' };
  }
  if (item.id === 'h1961-unavailable') {
    return { language, status: 'unavailable', reason: 'no_lexical_entry', plainLanguage: 'PRIVATE', candidates: [] };
  }
  const semanticContinuation = item.id === 'semantic-continuation';
  const h3027 = String(item.arguments.target) === 'H3027';
  const candidates = item.id === 'h0216-beginner'
    ? [{ senseId: fixtureValue.authorityAnchors.h0216SenseId }]
    : h3027
      ? (semanticContinuation ? [{ senseId: 'PRIVATE-SENSE-3' }] : [{ senseId: 'PRIVATE-SENSE-1' }, { senseId: 'PRIVATE-SENSE-2' }])
      : [];
  const priorCount = semanticContinuation ? 2 : 0;
  const totalCount = h3027 ? fixtureValue.authorityAnchors.h3027SenseCount : candidates.length;
  const consumedCount = priorCount + candidates.length;
  return {
    language, status: 'lexical_candidates', plainLanguage: 'PRIVATE', candidates,
    provenance: {
      artifactIdentity: fixtureValue.authorityAnchors.semanticArtifactIdentity,
      sources: PINNED_PROVENANCE_SOURCES.map(source => ({ ...source })),
    },
    resultWindow: {
      priorCount, returnedCount: candidates.length, consumedCount, totalCount,
      hasMore: consumedCount < totalCount,
      ...(item.id === 'h3027-intermediate'
        ? { continuation: { cursor: semanticCursor, operation: 'original_language_study_semantic_candidates' } }
        : {}),
    },
  };
}

function fakeCorpusOccurrences(id: string, fixtureValue: AuditFixture, occurrenceCursor: string): Record<string, unknown> {
  if (id !== 'greek-technical' && id !== 'occurrence-continuation') {
    return { status: 'unavailable', reason: 'no_usable_strongs_identity', plainLanguage: 'PRIVATE' };
  }
  const continuation = id === 'occurrence-continuation';
  const occurrences = [{
    canonicalOrder: 43, chapter: 1, verse: continuation ? 2 : 1, position: 5,
    sourceForm: continuation ? 'PRIVATE-BETA' : 'PRIVATE-ALPHA',
  }];
  return {
    status: 'available', corpusIdentity: fixtureValue.authorityAnchors.morphologyUsageIdentity,
    occurrences,
    resultWindow: {
      returnedCount: occurrences.length, maximumReturned: 20, hasMore: !continuation,
      ...(!continuation
        ? { continuation: { cursor: occurrenceCursor, operation: 'original_language_study_corpus_occurrences' } }
        : {}),
    },
  };
}

function makeResponseWindowTruthful(output: Record<string, unknown>): void {
  const responseWindow = output.responseWindow as Record<string, unknown>;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = utf8Bytes(JSON.stringify(output));
    if (responseWindow.used === bytes) return;
    responseWindow.used = bytes;
  }
  throw new Error('fake response byte accounting did not stabilize');
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
