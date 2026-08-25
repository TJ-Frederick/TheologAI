import { describe, expect, it } from 'vitest';
import {
  decodeHistoricalHierarchyCursor,
  encodeHistoricalHierarchyCursor,
  HISTORICAL_HIERARCHY_CURSOR_MAX_LENGTH,
} from '../../../src/kernel/historicalHierarchyDelivery.js';
import type { HistoricalHierarchyPublication } from '../../../src/kernel/repositories.js';

const publication: HistoricalHierarchyPublication = {
  publicationId: 'summa-theologiae-english-dominican-v1', hierarchyId: 'aquinas-hierarchy', publicSlug: 'summa-theologiae',
  title: 'Summa Theologiae', metadata: { creators: [], documentType: 'treatise', language: 'English', editionLabel: 'Synthetic', rightsStatus: 'synthetic', territoryCaveat: 'synthetic' }, deliveryKind: 'hierarchy_nodes_v1', coverage: { statement: 'Synthetic', completeness: 'complete', descriptors: [] },
  cursorContract: 'historical-hierarchy-browse-cursor-v1', cursorIdentity: 'a'.repeat(64), browsePageSize: 32,
  landingMaxBytes: 8192, directoryMaxBytes: 16384, nodeMaxBytes: 65536, searchMaxBytes: 16384,
  canonicalUri: 'theologai://documents/summa-theologiae', activationState: 'dormant',
};

describe('dormant hierarchy browse cursor', () => {
  it('uses the frozen eight-key canonical closed object bound to hierarchy/publication/parent/page size', () => {
    const cursor = encodeHistoricalHierarchyCursor(publication, 'part:prima', { siblingOrdinal: 12, nodeKey: 'question:prima.q012' });
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(cursor.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(cursor.length / 4) * 4, '=')), c => c.charCodeAt(0)));
    expect(Object.keys(JSON.parse(decoded))).toEqual([
      'contractVersion', 'hierarchyId', 'publicationId', 'cursorIdentity', 'parentNodeKey', 'pageSize', 'lastSiblingOrdinal', 'lastNodeKey',
    ]);
    expect(decodeHistoricalHierarchyCursor(cursor, publication, 'part:prima')).toEqual({ siblingOrdinal: 12, nodeKey: 'question:prima.q012' });
  });

  it('rejects hostile, stale, cross-parent, cross-page, and noncanonical cursor forms', () => {
    const cursor = encodeHistoricalHierarchyCursor(publication, null, { siblingOrdinal: 1, nodeKey: 'part:prima' });
    for (const value of ['', `${cursor}=`, 'a'.repeat(HISTORICAL_HIERARCHY_CURSOR_MAX_LENGTH + 1)]) {
      expect(() => decodeHistoricalHierarchyCursor(value, publication, null)).toThrow('Historical hierarchy browse cursor');
    }
    expect(() => decodeHistoricalHierarchyCursor(cursor, { ...publication, hierarchyId: 'other' }, null)).toThrow();
    expect(() => decodeHistoricalHierarchyCursor(cursor, { ...publication, publicationId: 'other' }, null)).toThrow();
    expect(() => decodeHistoricalHierarchyCursor(cursor, { ...publication, cursorIdentity: 'b'.repeat(64) }, null)).toThrow();
    expect(() => decodeHistoricalHierarchyCursor(cursor, { ...publication, browsePageSize: 16 }, null)).toThrow();
    expect(() => decodeHistoricalHierarchyCursor(cursor, publication, 'part:prima')).toThrow();
  });
});
