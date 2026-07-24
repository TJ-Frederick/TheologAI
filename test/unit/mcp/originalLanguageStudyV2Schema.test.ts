import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  originalLanguageStudyV2InputSchema,
  originalLanguageStudyV2OutputSchema,
} from '../../../src/mcp/schemas/originalLanguageStudyV2.js';
import {
  productionCandidate,
  productionCoordinator,
  productionRequest,
} from '../../helpers/originalLanguageStudyV2ProductionFixtures.js';

const ajv = new Ajv2020({ strict: true, strictTypes: false, allErrors: true });
const validateInput = ajv.compile(originalLanguageStudyV2InputSchema);
const validateOutput = ajv.compile(originalLanguageStudyV2OutputSchema);

describe('production original_language_study v2 schema', () => {
  it('accepts only the call boundary and omits all server-owned semantic identities', () => {
    expect(Object.keys(originalLanguageStudyV2InputSchema.properties)).toEqual([
      'reference', 'target', 'position', 'detail', 'cursor',
    ]);
    expect(JSON.stringify(originalLanguageStudyV2InputSchema))
      .not.toMatch(/artifactIdentity|sourceIdentity|serverVerifiedAlignment|verifierVersion/);
    expect(validateInput(productionRequest()), JSON.stringify(validateInput.errors)).toBe(true);
    expect(validateInput({ ...productionRequest(), artifactIdentity: 'forged' })).toBe(false);
  });

  it('closes each object and discriminates every semantic branch', () => {
    const openPaths: string[] = [];
    visitSchema(originalLanguageStudyV2OutputSchema, '$', openPaths);
    expect(openPaths).toEqual([]);
    const source = JSON.stringify(originalLanguageStudyV2OutputSchema);
    for (const value of [
      'not_applicable', 'selected_token_required', 'no_usable_hebrew_identity', 'no_lexical_entry',
      'no_publishable_semantic_evidence', 'lexical_candidates', 'reference_aligned_source_candidate',
      'summary', 'detailed', 'omitted_response_byte_budget', 'dictionary', 'lexical_domains',
    ]) expect(source).toContain(value);
  });

  it('accepts production coordinator output and rejects a mismatched status/detail relationship', async () => {
    for (const detail of ['summary', 'detailed'] as const) {
      const output = (await productionCoordinator([productionCandidate(1)]).coordinator
        .study(productionRequest(undefined, detail))).output;
      expect(validateOutput(output), JSON.stringify(validateOutput.errors)).toBe(true);
    }
    const output = (await productionCoordinator([productionCandidate(1)]).coordinator.study(productionRequest())).output;
    if (output.semanticEvidence.status !== 'lexical_candidates') throw new Error('expected candidate evidence');
    const invalid = structuredClone(output) as typeof output;
    invalid.semanticEvidence.reason = 'no_lexical_entry' as never;
    expect(validateOutput(invalid)).toBe(false);
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
