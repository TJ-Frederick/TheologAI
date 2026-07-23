import type { DocumentInfo, ExactEditionProvenance } from '../kernel/repositories.js';
import { LOCAL_EDITION_READINESS, localEditionReadiness } from '../services/historical/primarySourceTypes.js';

export const PRIMARY_SOURCE_CATALOG_URI = 'theologai://primary-sources/catalog';

/** Public metadata-only inventory. It deliberately contains no work bodies or artifact locators. */
export function buildPrimarySourceCatalog(documents: DocumentInfo[]) {
  const hasExactSourcePacks = documents.some(document => document.editionProvenance !== undefined);
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
      editionReadiness: localEditionReadiness(document.editionProvenance),
      ...(document.editionProvenance ? { editionProvenance: publicEditionProvenance(document.editionProvenance) } : {}),
    }))
    .sort((left, right) => left.id.localeCompare(right.id, 'en-US'));

  return {
    schemaVersion: '2' as const,
    kind: 'local_primary_source_catalog' as const,
    workCount: works.length,
    works,
    policies: hasExactSourcePacks
      ? {
          scope: 'hosted_collection_only' as const,
          lookupAliasUse: 'exact_routing_only_not_metadata_evidence' as const,
          // Retain the long-standing legacy value so existing consumers can
          // continue to interpret it; exact works carry their own readiness.
          editionReadiness: LOCAL_EDITION_READINESS,
          editionReadinessScope: 'legacy_documents_only' as const,
          editionProvenance: 'mixed_legacy_and_exact_source_packs' as const,
          rightsStatus: 'mixed_not_established_and_no_known_conflict' as const,
          exactPackTextRightsScope: 'normalized_public_domain_text_only' as const,
        }
      : {
          scope: 'hosted_collection_only' as const,
          lookupAliasUse: 'exact_routing_only_not_metadata_evidence' as const,
          editionProvenance: 'incomplete' as const,
          rightsStatus: 'not_established' as const,
          editionReadiness: LOCAL_EDITION_READINESS,
        },
  };
}

function publicEditionProvenance(edition: ExactEditionProvenance) {
  return {
    foundation: edition.foundation,
    sourcePackId: edition.sourcePackId,
    editionId: edition.editionId,
    language: edition.language,
    publication: edition.publication,
    version: edition.version,
    provenance: {
      status: edition.provenance.status,
      reviewedAt: edition.provenance.reviewedAt,
    },
    normalizedTextRights: {
      status: edition.normalizedTextRights.status,
      scope: edition.normalizedTextRights.scope,
      reviewedAt: edition.normalizedTextRights.reviewedAt,
    },
  };
}
