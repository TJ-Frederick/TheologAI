import type { DocumentInfo, HistoricalDocumentCatalogMetadata } from '../../kernel/repositories.js';

interface DocumentDatabaseRow {
  id: string;
  title: string;
  type: string;
  date: string | null;
  metadata: string | null;
}

export function mapDocumentDatabaseRow(row: DocumentDatabaseRow): DocumentInfo {
  const metadata = parseMetadata(row.metadata);
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: row.date,
    topics: Array.isArray(metadata.topics) && metadata.topics.every(item => typeof item === 'string')
      ? metadata.topics
      : [],
    ...(isCatalogMetadata(metadata.catalog) ? { catalog: metadata.catalog } : {}),
  };
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
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
