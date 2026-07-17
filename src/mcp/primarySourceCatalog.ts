import type { DocumentInfo } from '../kernel/repositories.js';
import { LOCAL_EDITION_READINESS } from '../services/historical/primarySourceTypes.js';

export const PRIMARY_SOURCE_CATALOG_URI = 'theologai://primary-sources/catalog';

/** Public metadata-only inventory. It deliberately contains no work bodies or provenance URLs. */
export function buildPrimarySourceCatalog(documents: DocumentInfo[]) {
  const works = documents
    .filter((document): document is DocumentInfo & { catalog: NonNullable<DocumentInfo['catalog']> } => document.catalog !== undefined)
    .map(document => ({
      id: document.id,
      title: document.title,
      documentType: document.type,
      lookupAliases: [...document.catalog.lookupAliases],
      composition: { ...document.catalog.composition },
      creators: document.catalog.creators.map(creator => ({ ...creator })),
      metadataStatus: document.catalog.metadataStatus,
      metadataProvenanceIds: [...document.catalog.metadataProvenanceIds],
      editionReadiness: LOCAL_EDITION_READINESS,
    }))
    .sort((left, right) => left.id.localeCompare(right.id, 'en-US'));

  return {
    schemaVersion: '2' as const,
    kind: 'local_primary_source_catalog' as const,
    workCount: works.length,
    works,
    policies: {
      scope: 'hosted_collection_only' as const,
      lookupAliasUse: 'exact_routing_only_not_metadata_evidence' as const,
      editionProvenance: 'incomplete' as const,
      rightsStatus: 'not_established' as const,
      editionReadiness: LOCAL_EDITION_READINESS,
    },
  };
}
