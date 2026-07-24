import { describe, expect, it } from 'vitest';
import { D1_SEED_BASE_TABLES, D1_SEED_EXPORT_ORDER } from '../../../scripts/d1-seed-order.js';

describe('D1 deterministic seed order', () => {
  it('loads the reviewed edition before its active sectioned profile and descendants', () => {
    const position = (table: (typeof D1_SEED_BASE_TABLES)[number]) => D1_SEED_BASE_TABLES.indexOf(table);
    expect(position('documents')).toBeLessThan(position('historical_document_delivery_profiles'));
    expect(position('historical_source_packs')).toBeLessThan(position('historical_editions'));
    expect(position('historical_works')).toBeLessThan(position('historical_editions'));
    expect(position('historical_editions')).toBeLessThan(position('historical_source_artifacts'));
    expect(position('historical_editions')).toBeLessThan(position('historical_edition_sections'));
    expect(position('historical_editions')).toBeLessThan(position('historical_document_delivery_profiles'));
    expect(position('historical_document_delivery_profiles')).toBeLessThan(position('historical_section_identities'));
    expect(position('historical_section_identities')).toBeLessThan(position('historical_section_aliases'));
    expect(D1_SEED_EXPORT_ORDER.at(-1)).toBe('fts');
  });
});
