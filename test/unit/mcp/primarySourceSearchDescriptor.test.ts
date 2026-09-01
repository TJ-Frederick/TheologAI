import { describe, expect, it } from 'vitest';
import { createPrimarySourceSearchDescriptor } from '../../../src/mcp/primarySourceSearchDescriptor.js';
import { validatorFor } from '../../../src/mcp/validation.js';

describe('primary-source search descriptor', () => {
  it('owns the public v6 contract without execution configuration', () => {
    const descriptor = createPrimarySourceSearchDescriptor();
    expect(descriptor).toMatchObject({
      name: 'primary_source_search', contractVersion: '6',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    });
    expect(JSON.stringify(descriptor)).not.toMatch(/ccel|liveCcel|coordinator/i);
    expect(functionValues(descriptor)).toEqual([]);
  });

  it('switches only public v7 contract facts', () => {
    const descriptor = createPrimarySourceSearchDescriptor('7');
    expect(descriptor.contractVersion).toBe('7');
    expect(descriptor.annotations.openWorldHint).toBe(true);
    expect(functionValues(descriptor)).toEqual([]);
  });

  it('adds the dormant v8 evidence-bound retry contract without changing tool inventory', () => {
    const descriptor = createPrimarySourceSearchDescriptor('8');
    expect(descriptor).toMatchObject({
      name: 'primary_source_search', contractVersion: '8',
      outputSchema: { properties: { schemaVersion: { const: '8' } } },
      annotations: { openWorldHint: true },
    });
    const query = descriptor.inputSchema.properties?.queries as { items?: { properties?: Record<string, unknown> } };
    expect(query.items?.properties).toHaveProperty('expansionBasis');
    const validate = validatorFor(descriptor.inputSchema);
    expect(validate({ queries: [{
      id: 'valid', text: 'grace', searchDepth: 'expanded', selection: 'work_diversity',
      expansionBasis: { reason: 'insufficient_diversity', minimumDistinctWorks: 3, observedDistinctWorks: 2 },
    }] }).valid).toBe(true);
    expect(validate({ queries: [{
      id: 'wrong-selection', text: 'grace', searchDepth: 'expanded', selection: 'relevance',
      expansionBasis: { reason: 'insufficient_diversity', minimumDistinctWorks: 3, observedDistinctWorks: 1 },
    }] }).valid).toBe(false);
    expect(validate({ queries: [{
      id: 'not-short', text: 'grace', searchDepth: 'expanded', selection: 'work_diversity',
      expansionBasis: { reason: 'insufficient_diversity', minimumDistinctWorks: 3, observedDistinctWorks: 3 },
    }] }).valid).toBe(false);
    expect(functionValues(descriptor)).toEqual([]);
  });
});

function functionValues(value: unknown, path = '$'): string[] {
  if (typeof value === 'function') return [path];
  if (!value || typeof value !== 'object') return [];
  return Reflect.ownKeys(value).flatMap(key => functionValues(
    Reflect.get(value, key), `${path}.${String(key)}`,
  ));
}
