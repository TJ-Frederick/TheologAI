import type { DocumentInfo, DocumentSection, ExactEditionProvenance, HistoricalDocumentCatalogMetadata } from '../../kernel/repositories.js';
import {
  assertClassicTextDocumentMetadata,
  assertClassicTextSectionMetadata,
  parseClassicTextSectionTopics,
} from '../../kernel/classicTextContract.js';

interface DocumentDatabaseRow {
  id: string;
  title: string;
  type: string;
  date: string | null;
  metadata: string | null;
}

export function mapDocumentDatabaseRow(row: DocumentDatabaseRow): DocumentInfo {
  const metadata = parseMetadata(row.metadata);
  const topics = metadata.topics === undefined ? [] : metadata.topics;
  const document = {
    id: row.id,
    title: row.title,
    type: row.type,
    date: row.date,
    topics,
  };
  assertClassicTextDocumentMetadata(document, `Stored classic-text document ${String(row.id)}`);
  return {
    ...document,
    ...(isCatalogMetadata(metadata.catalog) ? { catalog: metadata.catalog } : {}),
    ...(isExactEditionProvenance(metadata.editionProvenance) ? { editionProvenance: metadata.editionProvenance } : {}),
  };
}

function isExactEditionProvenance(value: unknown): value is ExactEditionProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const provenance = value as Record<string, unknown>;
  if (provenance.foundation !== 'edition-provenance-foundation.v1'
    || !validId(provenance.sourcePackId) || !validId(provenance.editionId)
    || typeof provenance.language !== 'string' || typeof provenance.publication !== 'string'
    || typeof provenance.version !== 'string') return false;
  const rights = provenance.normalizedTextRights;
  if (!rights || typeof rights !== 'object' || Array.isArray(rights)) return false;
  const r = rights as Record<string, unknown>;
  if (r.status !== 'no_known_conflict' || r.scope !== 'normalized_public_domain_text_only'
    || typeof r.basis !== 'string' || typeof r.reviewedAt !== 'string') return false;
  if (!Array.isArray(provenance.sourceArtifacts) || provenance.sourceArtifacts.length < 1
    || !provenance.sourceArtifacts.every(artifact => {
      if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return false;
      const a = artifact as Record<string, unknown>;
      return validId(a.artifactId) && (a.role === 'authority' || a.role === 'comparator')
        && typeof a.locator === 'string' && a.locator.startsWith('https://')
        && typeof a.sha256 === 'string' && /^[a-f0-9]{64}$/.test(a.sha256)
        && Number.isSafeInteger(a.bytes) && (a.bytes as number) > 0 && typeof a.acquiredAt === 'string';
    })) return false;
  if (!provenance.provenance || typeof provenance.provenance !== 'object' || Array.isArray(provenance.provenance)) return false;
  const review = provenance.provenance as Record<string, unknown>;
  return (review.status === 'verified' || review.status === 'verified_with_uncertainty')
    && (typeof review.uncertainty === 'string' || review.uncertainty === null)
    && typeof review.reviewedAt === 'string';
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(value);
}

interface DocumentSectionDatabaseRow {
  id: unknown;
  document_id: unknown;
  section_number: unknown;
  title: unknown;
  content: unknown;
  topics: unknown;
}

export function mapDocumentSectionDatabaseRow(row: DocumentSectionDatabaseRow): DocumentSection {
  const stored = {
    id: row.id,
    documentId: row.document_id,
    sectionNumber: row.section_number,
    title: row.title,
    content: row.content,
    topics: row.topics,
  };
  const context = `Stored classic-text section ${String(row.id)}`;
  assertClassicTextSectionMetadata(stored, context);
  const topics = parseClassicTextSectionTopics(stored.topics, context);
  return {
    id: stored.id!,
    document_id: stored.documentId,
    section_number: stored.sectionNumber,
    title: stored.title,
    content: stored.content,
    topics,
  };
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored classic-text document metadata must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function isCatalogMetadata(value: unknown): value is HistoricalDocumentCatalogMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const catalog = value as Record<string, unknown>;
  if (!Array.isArray(catalog.lookupAliases) || !catalog.lookupAliases.every(item => typeof item === 'string')) return false;
  if (!Array.isArray(catalog.creators) || !catalog.creators.every(item => item && typeof item === 'object' && !Array.isArray(item)
    && typeof (item as Record<string, unknown>).name === 'string'
    && ['author', 'issuing_body', 'drafting_body', 'revising_body', 'compiler']
      .includes(String((item as Record<string, unknown>).role)))) return false;
  if (!Array.isArray(catalog.metadataProvenanceIds) || catalog.metadataProvenanceIds.length < 1
    || !catalog.metadataProvenanceIds.every(item => typeof item === 'string' && /^hist-meta-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item))) return false;
  if (!['reviewed', 'anonymous', 'collective', 'unknown'].includes(String(catalog.metadataStatus))) return false;
  if (!catalog.composition || typeof catalog.composition !== 'object' || Array.isArray(catalog.composition)) return false;
  const composition = catalog.composition as Record<string, unknown>;
  if (typeof composition.label !== 'string') return false;
  const hasStart = composition.startYear !== undefined;
  const hasEnd = composition.endYear !== undefined;
  if (hasStart !== hasEnd) return false;
  if (hasStart && (!Number.isSafeInteger(composition.startYear) || !Number.isSafeInteger(composition.endYear))) return false;
  return true;
}
