import { describe, expect, it } from 'vitest';
import {
  buildLocalDocumentResourceUri,
  parseLocalDocumentResourceUri,
} from '../../../src/kernel/documentResource.js';

describe('local document resource URIs', () => {
  it('round-trips canonical whole-document and exact-section resources', () => {
    expect(buildLocalDocumentResourceUri('institutes')).toBe('theologai://documents/institutes');
    const uri = buildLocalDocumentResourceUri('institutes', '3:1')!;
    expect(uri).toBe('theologai://documents/institutes#section-3%3A1');
    expect(parseLocalDocumentResourceUri(uri)).toEqual({ documentId: 'institutes', sectionId: '3:1' });
  });

  it.each([
    'theologai://documents/../secret#section-1',
    'theologai://documents/doc?section=1',
    'theologai://documents/doc#section-',
    'theologai://documents/doc#section-%2fescape',
    'https://example.test/documents/doc#section-1',
  ])('rejects noncanonical or unsafe shape %s', uri => {
    expect(parseLocalDocumentResourceUri(uri)).toBeUndefined();
  });
});
