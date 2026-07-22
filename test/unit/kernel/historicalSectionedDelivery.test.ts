import { describe, expect, it } from 'vitest';
import {
  decodeHistoricalSectionedOnlyCursor,
  encodeHistoricalSectionedOnlyCursor,
  HISTORICAL_SECTIONED_ONLY_CURSOR_MAX_LENGTH,
} from '../../../src/kernel/historicalSectionedDelivery.js';
import type { HistoricalDocumentDeliveryProfile } from '../../../src/kernel/repositories.js';

const profile: HistoricalDocumentDeliveryProfile = {
  documentId: 'edition', workId: 'work', editionId: 'edition',
  immutableCorpusIdentity: 'a'.repeat(64), sectionPackageIdentity: 'b'.repeat(64),
  deliveryMode: 'sectioned_only', sectionCount: 99, landingMaxBytes: 16_384,
  browsePageSize: 32, cursorVersion: 1, provenance: {}, rights: {},
};

describe('Transform-8 sectioned-only cursor', () => {
  it('uses the frozen seven-key canonical closed object', () => {
    const cursor = encodeHistoricalSectionedOnlyCursor(profile, { sourceOrdinal: 32, sectionKey: 'source-0032' });
    const text = new TextDecoder().decode(Uint8Array.from(atob(cursor.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(cursor.length / 4) * 4, '=')), c => c.charCodeAt(0)));
    expect(Object.keys(JSON.parse(text))).toEqual([
      'contractVersion', 'documentId', 'editionId', 'immutableCorpusIdentity',
      'pageSize', 'lastSourceOrdinal', 'lastSectionKey',
    ]);
    expect(decodeHistoricalSectionedOnlyCursor(cursor, profile)).toEqual({ sourceOrdinal: 32, sectionKey: 'source-0032' });
  });

  it('rejects hostile, stale, noncanonical, and oversized cursors identically', () => {
    const valid = encodeHistoricalSectionedOnlyCursor(profile, { sourceOrdinal: 1, sectionKey: 'source-0001' });
    for (const cursor of ['', `${valid}=`, 'a'.repeat(HISTORICAL_SECTIONED_ONLY_CURSOR_MAX_LENGTH + 1)]) {
      expect(() => decodeHistoricalSectionedOnlyCursor(cursor, profile)).toThrow('Historical section browse cursor');
    }
    expect(() => decodeHistoricalSectionedOnlyCursor(valid, { ...profile, editionId: 'other' })).toThrow('Historical section browse cursor');
  });
});
