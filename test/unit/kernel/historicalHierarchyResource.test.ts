import { describe, expect, it } from 'vitest';
import {
  buildHistoricalHierarchyResourceUri,
  parseHistoricalHierarchyResourceUri,
} from '../../../src/kernel/historicalHierarchyResource.js';

describe('historical hierarchy resource URIs', () => {
  it('round-trips canonical landings and direct nodes without a legacy section alias', () => {
    expect(buildHistoricalHierarchyResourceUri('summa-theologiae')).toBe('theologai://documents/summa-theologiae');
    const uri = buildHistoricalHierarchyResourceUri('summa-theologiae', 'article:prima.q001.a001')!;
    expect(uri).toBe('theologai://documents/summa-theologiae#node-article:prima.q001.a001');
    expect(parseHistoricalHierarchyResourceUri(uri)).toEqual({ publicSlug: 'summa-theologiae', nodeKey: 'article:prima.q001.a001' });
  });

  it.each([
    'theologai://documents/../secret#node-article:prima.q001.a001',
    'theologai://documents/summa-theologiae?node=article:prima.q001.a001',
    'theologai://documents/summa-theologiae#node-',
    'theologai://documents/summa-theologiae#node-article%3Aprima.q001.a001',
    'theologai://documents/summa-theologiae#section-article:prima.q001.a001',
    'https://example.test/documents/summa-theologiae#node-article:prima.q001.a001',
  ])('rejects noncanonical or unsafe shape %s', uri => {
    expect(parseHistoricalHierarchyResourceUri(uri)).toBeUndefined();
  });
});
