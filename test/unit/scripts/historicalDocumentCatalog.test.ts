import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_CREATOR_ROLES,
  HISTORICAL_LOOKUP_ALIAS_POLICY,
  normalizeCatalogName,
  parseHistoricalDocumentCatalog,
  parseHistoricalDocumentCatalogProvenance,
} from '../../../scripts/historical-document-catalog.js';

describe('reviewed historical-document catalog', () => {
  const catalog = parseHistoricalDocumentCatalog(JSON.parse(readFileSync('data/historical-document-catalog.json', 'utf8')));
  const provenance = parseHistoricalDocumentCatalogProvenance(
    JSON.parse(readFileSync('data/historical-document-catalog-provenance.json', 'utf8')),
    catalog,
  );

  it('covers exactly every hosted historical document with unique exact lookup-only aliases', () => {
    const hosted = readdirSync('data/historical-documents').filter(file => file.endsWith('.json')).map(file => file.slice(0, -5)).sort();
    expect(catalog.map(entry => entry.documentId).sort()).toEqual(hosted);
    const aliases = catalog.flatMap(entry => [entry.documentId, ...entry.lookupAliases].map(normalizeCatalogName));
    expect(new Set(aliases).size).toBe(aliases.length);
    expect(HISTORICAL_LOOKUP_ALIAS_POLICY).toBe('exact_routing_only_not_metadata_evidence');
  });

  it('accepts 1..100 catalog entries and rejects empty or oversized catalogs', () => {
    const raw = JSON.parse(readFileSync('data/historical-document-catalog.json', 'utf8'));
    const template = raw.documents[0];
    const documents = Array.from({ length: 100 }, (_, index) => ({
      ...structuredClone(template),
      documentId: `boundary-document-${index + 1}`,
      lookupAliases: [`Boundary Document ${index + 1}`],
    }));

    expect(parseHistoricalDocumentCatalog({ ...raw, documents })).toHaveLength(100);
    expect(() => parseHistoricalDocumentCatalog({ ...raw, documents: [] })).toThrow('1..100');
    expect(() => parseHistoricalDocumentCatalog({
      ...raw,
      documents: [...documents, {
        ...structuredClone(template),
        documentId: 'boundary-document-101',
        lookupAliases: ['Boundary Document 101'],
      }],
    })).toThrow('1..100');
  });

  it('keeps uncertainty explicit and never relabels collective roles as authorship', () => {
    expect(catalog.find(entry => entry.documentId === 'apostles-creed')).toMatchObject({
      composition: { label: 'Before the end of the 4th century (present form)' }, creators: [], metadataStatus: 'anonymous',
    });
    expect(catalog.find(entry => entry.documentId === 'apostles-creed')?.composition).not.toHaveProperty('startYear');
    expect(catalog.find(entry => entry.documentId === 'council-of-trent')).toMatchObject({
      creators: [{ name: 'Council of Trent', role: 'issuing_body' }], metadataStatus: 'collective',
    });
    expect(catalog.find(entry => entry.documentId === 'augsburg-confession')).toMatchObject({
      creators: [{ name: 'Philip Melanchthon', role: 'author' }], metadataStatus: 'reviewed',
    });
    expect(catalog.find(entry => entry.documentId === 'athanasian-creed')).toMatchObject({
      composition: { label: 'Approximately the 6th century; author unknown' }, creators: [], metadataStatus: 'unknown',
    });
    expect(catalog.find(entry => entry.documentId === 'athanasian-creed')?.composition).not.toHaveProperty('startYear');
    expect(catalog.find(entry => entry.documentId === 'london-baptist-1689')).toMatchObject({
      composition: { startYear: 1677, endYear: 1677, label: '1677' },
      creators: [{ name: 'Particular Baptist churches of England', role: 'drafting_body' }],
    });
    expect(catalog.find(entry => entry.documentId === 'nicene-creed')).toMatchObject({
      composition: { startYear: 381, endYear: 381, label: '381 AD (present Niceno-Constantinopolitan text)' },
      creators: [{ name: 'First Council of Constantinople', role: 'revising_body' }],
    });
  });

  it('maps every creator/date claim to a bounded authoritative-source review record', () => {
    expect(provenance.documents.map(document => document.documentId)).toEqual(catalog.map(entry => entry.documentId));
    expect(provenance.sources.every(source => source.url.startsWith('https://'))).toBe(true);
    expect(provenance.sources.filter(source => source.authority === 'official_denominational').length).toBeGreaterThanOrEqual(12);
    for (const entry of catalog) {
      const reviewed = provenance.documents.find(document => document.documentId === entry.documentId)!;
      expect([...new Set(reviewed.claims.map(claim => claim.provenanceId))]).toEqual(entry.metadataProvenanceIds);
      expect(reviewed.claims.every(claim => claim.reviewNote.length >= 40)).toBe(true);
    }
  });

  it('enforces the exact closed creator-role vocabulary', () => {
    expect(HISTORICAL_CREATOR_ROLES).toEqual(['author', 'issuing_body', 'drafting_body', 'revising_body', 'compiler']);
    const raw = JSON.parse(readFileSync('data/historical-document-catalog.json', 'utf8'));
    raw.documents[0].creators[0].role = 'editor';
    expect(() => parseHistoricalDocumentCatalog(raw)).toThrow('outside the closed vocabulary');
  });

  it('rejects missing claim mappings and unregistered source IDs', () => {
    const raw = JSON.parse(readFileSync('data/historical-document-catalog-provenance.json', 'utf8'));
    raw.documents[0].claims[0].fields.pop();
    expect(() => parseHistoricalDocumentCatalogProvenance(raw, catalog)).toThrow('field coverage mismatch');
    const unknown = JSON.parse(readFileSync('data/historical-document-catalog-provenance.json', 'utf8'));
    unknown.documents[0].claims[0].provenanceId = 'hist-meta-unknown-source';
    expect(() => parseHistoricalDocumentCatalogProvenance(unknown, catalog)).toThrow('unknown source');
  });

  it('rejects unreviewed fields instead of silently materializing schema drift', () => {
    const raw = JSON.parse(readFileSync('data/historical-document-catalog.json', 'utf8'));
    raw.documents[0].influencedBy = ['Thomas Cranmer'];
    expect(() => parseHistoricalDocumentCatalog(raw)).toThrow('unknown field influencedBy');
  });

  it('rejects ambiguous aliases and any attempt to treat aliases as reviewed metadata', () => {
    const ambiguous = JSON.parse(readFileSync('data/historical-document-catalog.json', 'utf8'));
    ambiguous.documents[0].lookupAliases[0] = 'Articles of Religion';
    expect(() => parseHistoricalDocumentCatalog(ambiguous)).toThrow('Ambiguous lookup-only catalog alias');

    const oldShape = JSON.parse(readFileSync('data/historical-document-catalog.json', 'utf8'));
    oldShape.documents[0].workAliases = oldShape.documents[0].lookupAliases;
    delete oldShape.documents[0].lookupAliases;
    expect(() => parseHistoricalDocumentCatalog(oldShape)).toThrow('unknown field workAliases');

    const wrongPolicy = JSON.parse(readFileSync('data/historical-document-catalog.json', 'utf8'));
    wrongPolicy.lookupAliasPolicy = 'reviewed_metadata';
    expect(() => parseHistoricalDocumentCatalog(wrongPolicy)).toThrow('exact lookup-only alias policy');
  });
});
