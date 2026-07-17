import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  originalLanguageStudyV2DraftInputSchema,
  originalLanguageStudyV2DraftOutputSchema,
} from '../../fixtures/original-language-study-v2/support/originalLanguageStudyV2DraftSchema.js';
import {
  syntheticCandidate,
  syntheticCoordinator,
  syntheticRequest,
} from '../../fixtures/original-language-study-v2/support/syntheticOriginalLanguageStudyV2Fixtures.js';

const ajv = new Ajv2020({ strict: true, strictTypes: false, allErrors: true });
const validateInput = ajv.compile(originalLanguageStudyV2DraftInputSchema);
const validateOutput = ajv.compile(originalLanguageStudyV2DraftOutputSchema);

describe('inactive original_language_study v2 design schema', () => {
  it('extends the current call without accepting caller source or verifier identities', () => {
    expect(Object.keys(originalLanguageStudyV2DraftInputSchema.properties)).toEqual([
      'reference', 'target', 'position', 'detail', 'cursor',
    ]);
    expect(JSON.stringify(originalLanguageStudyV2DraftInputSchema))
      .not.toMatch(/artifactIdentity|sourceIdentity|serverVerifiedAlignment|verifierVersion/);
  });

  it('closes every object boundary and fully discriminates detail, language, status, reason, and alignment branches', () => {
    const openPaths: string[] = [];
    visitSchema(originalLanguageStudyV2DraftOutputSchema, '$', openPaths);
    expect(openPaths).toEqual([]);
    const source = JSON.stringify(originalLanguageStudyV2DraftOutputSchema);
    for (const value of [
      'not_applicable', 'selected_token_required', 'no_usable_hebrew_identity', 'no_lexical_entry',
      'no_publishable_semantic_evidence', 'lexical_candidates', 'reference_aligned_source_candidate',
      'summary', 'detailed', 'omitted_response_byte_budget', 'dictionary', 'lexical_domains',
    ]) expect(source).toContain(value);
  });

  it('accepts coordinator outputs and rejects mismatched status/reason/detail relationships', async () => {
    for (const detail of ['summary', 'detailed'] as const) {
      const output = (await syntheticCoordinator([syntheticCandidate(1)]).coordinator
        .study(syntheticRequest(undefined, detail))).output;
      expect(validateOutput(output), JSON.stringify(validateOutput.errors)).toBe(true);
    }
    const output = (await syntheticCoordinator([syntheticCandidate(1)]).coordinator.study(syntheticRequest())).output;
    if (output.semanticEvidence.status !== 'lexical_candidates') throw new Error('expected candidate output');
    const invalid = structuredClone(output) as unknown as {
      semanticEvidence: { reason: string; candidates: { detailStatus: string }[] };
    };
    invalid.semanticEvidence.reason = 'no_lexical_entry';
    expect(validateOutput(invalid)).toBe(false);
    invalid.semanticEvidence.reason = 'reference_alignment_unproven';
    invalid.semanticEvidence.candidates[0].detailStatus = 'detailed';
    expect(validateOutput(invalid)).toBe(false);
  });

  it('keeps call fixtures unregistered and verifies the detailed cursor is a genuine generated canonical continuation', async () => {
    const fixtures = new URL('../../fixtures/original-language-study-v2/', import.meta.url);
    const prompt = readFileSync(new URL('prompt.draft.md', fixtures), 'utf8');
    expect(prompt).toContain('not a registered MCP prompt');
    const summary = readCall(new URL('call-summary.draft.json', fixtures));
    const detailed = readCall(new URL('call-detailed.draft.json', fixtures));
    expect(summary.tool).toBe('original_language_study');
    expect(detailed.tool).toBe('original_language_study');
    expect(validateInput(summary.arguments), JSON.stringify(validateInput.errors)).toBe(true);
    expect(validateInput(detailed.arguments), JSON.stringify(validateInput.errors)).toBe(true);
    for (const fixture of [summary, detailed]) {
      expect(Object.keys(fixture.arguments)).not.toContain('sourceIdentity');
      expect(Object.keys(fixture.arguments)).not.toContain('artifactIdentity');
      expect(Object.keys(fixture.arguments)).not.toContain('verifierVersion');
    }
    const values = Array.from({ length: 10 }, (_, index) => syntheticCandidate(index + 1));
    const generated = (await syntheticCoordinator(values).coordinator
      .study(syntheticRequest(undefined, 'detailed'))).output;
    if (!('resultWindow' in generated.semanticEvidence) || !generated.semanticEvidence.resultWindow.continuation) {
      throw new Error('synthetic generated fixture must continue');
    }
    expect(detailed.arguments.cursor).toBe(generated.semanticEvidence.resultWindow.continuation.cursor);
    const continued = await syntheticCoordinator(values).coordinator.study(detailed.arguments);
    if (!('resultWindow' in continued.output.semanticEvidence)) throw new Error('expected continued repository output');
    expect(continued.output.semanticEvidence.resultWindow).toMatchObject({ priorCount: 8, returnedCount: 2 });
  });
});

function visitSchema(value: unknown, path: string, openPaths: string[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitSchema(item, `${path}[${index}]`, openPaths));
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.type === 'object' && record.additionalProperties !== false) openPaths.push(path);
  for (const [key, child] of Object.entries(record)) visitSchema(child, `${path}.${key}`, openPaths);
}

function readCall(url: URL): { tool: string; arguments: Record<string, unknown> } {
  return JSON.parse(readFileSync(url, 'utf8')) as { tool: string; arguments: Record<string, unknown> };
}
