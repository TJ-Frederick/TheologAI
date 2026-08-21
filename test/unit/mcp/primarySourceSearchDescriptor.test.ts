import { describe, expect, it } from 'vitest';
import { createPrimarySourceSearchDescriptor } from '../../../src/mcp/primarySourceSearchDescriptor.js';

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
});

function functionValues(value: unknown, path = '$'): string[] {
  if (typeof value === 'function') return [path];
  if (!value || typeof value !== 'object') return [];
  return Reflect.ownKeys(value).flatMap(key => functionValues(
    Reflect.get(value, key), `${path}.${String(key)}`,
  ));
}
