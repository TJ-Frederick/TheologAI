import { CLASSIC_TEXT_LIMITS } from '../src/kernel/classicTextContract.js';

export type HistoricalMetadataStatus = 'reviewed' | 'anonymous' | 'collective' | 'unknown';

export const HISTORICAL_CREATOR_ROLES = [
  'author',
  'issuing_body',
  'drafting_body',
  'revising_body',
  'compiler',
] as const;
export type HistoricalCreatorRole = typeof HISTORICAL_CREATOR_ROLES[number];
export const HISTORICAL_LOOKUP_ALIAS_POLICY = 'exact_routing_only_not_metadata_evidence' as const;

const AMBIGUOUS_LOOKUP_ALIASES = new Set([
  'articles of religion',
  'catechism of christian doctrine',
  'confession of faith',
  'larger catechism',
  'shorter catechism',
]);

export interface HistoricalCreator {
  name: string;
  role: HistoricalCreatorRole;
}

export interface HistoricalCatalogMetadata {
  lookupAliases: string[];
  composition: { startYear?: number; endYear?: number; label: string };
  creators: HistoricalCreator[];
  metadataStatus: HistoricalMetadataStatus;
  metadataProvenanceIds: string[];
}

export interface HistoricalCatalogEntry extends HistoricalCatalogMetadata {
  documentId: string;
}

export function parseHistoricalDocumentCatalog(value: unknown): HistoricalCatalogEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Historical-document catalog must be an object');
  const root = value as Record<string, unknown>;
  assertExactKeys(root, ['schemaVersion', 'lookupAliasPolicy', 'documents'], 'catalog root');
  if (root.schemaVersion !== 3 || root.lookupAliasPolicy !== HISTORICAL_LOOKUP_ALIAS_POLICY
    || !Array.isArray(root.documents) || root.documents.length < 1
    || root.documents.length > CLASSIC_TEXT_LIMITS.workCount) {
    throw new Error(`Historical-document catalog must contain 1..${CLASSIC_TEXT_LIMITS.workCount} schema-v3 documents with the exact lookup-only alias policy`);
  }
  const ids = new Set<string>();
  const aliases = new Set<string>();
  return root.documents.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Catalog document ${index + 1} must be an object`);
    const entry = raw as Record<string, unknown>;
    assertExactKeys(entry, ['documentId', 'lookupAliases', 'composition', 'creators', 'metadataStatus', 'metadataProvenanceIds'], `documents.${index}`);
    const documentId = requiredText(entry.documentId, `documents.${index}.documentId`, 160);
    if (ids.has(documentId)) throw new Error(`Duplicate catalog document ID: ${documentId}`);
    ids.add(documentId);
    if (!Array.isArray(entry.lookupAliases) || entry.lookupAliases.length < 1 || entry.lookupAliases.length > 8) {
      throw new Error(`Catalog ${documentId} must have 1..8 lookup-only aliases`);
    }
    const lookupAliases = entry.lookupAliases.map((alias, aliasIndex) => requiredText(alias, `${documentId}.lookupAliases.${aliasIndex}`, 160));
    for (const alias of [documentId, ...lookupAliases]) {
      const normalized = normalizeCatalogName(alias);
      if (AMBIGUOUS_LOOKUP_ALIASES.has(normalized)) throw new Error(`Ambiguous lookup-only catalog alias is forbidden: ${alias}`);
      if (aliases.has(normalized)) throw new Error(`Duplicate lookup-only catalog alias: ${alias}`);
      aliases.add(normalized);
    }
    if (!entry.composition || typeof entry.composition !== 'object' || Array.isArray(entry.composition)) throw new Error(`Catalog ${documentId} needs composition metadata`);
    const composition = entry.composition as Record<string, unknown>;
    assertExactKeys(composition, ['startYear', 'endYear', 'label'], `${documentId}.composition`);
    const startYear = optionalYear(composition.startYear, `${documentId}.composition.startYear`);
    const endYear = optionalYear(composition.endYear, `${documentId}.composition.endYear`);
    if ((startYear === undefined) !== (endYear === undefined) || (startYear !== undefined && startYear > endYear!)) {
      throw new Error(`Catalog ${documentId} composition bounds must be a valid pair`);
    }
    const label = requiredText(composition.label, `${documentId}.composition.label`, 100);
    if (!Array.isArray(entry.creators) || entry.creators.length > 8) throw new Error(`Catalog ${documentId} creators must be an array of at most 8 entries`);
    const creators = entry.creators.map((creator, creatorIndex) => {
      if (!creator || typeof creator !== 'object' || Array.isArray(creator)) throw new Error(`Catalog ${documentId} creator ${creatorIndex + 1} is invalid`);
      const item = creator as Record<string, unknown>;
      assertExactKeys(item, ['name', 'role'], `${documentId}.creators.${creatorIndex}`);
      const role = requiredText(item.role, `${documentId}.creators.${creatorIndex}.role`, 80);
      if (!HISTORICAL_CREATOR_ROLES.includes(role as HistoricalCreatorRole)) {
        throw new Error(`Catalog ${documentId} creator role is outside the closed vocabulary: ${role}`);
      }
      return {
        name: requiredText(item.name, `${documentId}.creators.${creatorIndex}.name`, 160),
        role: role as HistoricalCreatorRole,
      };
    });
    const metadataStatus = entry.metadataStatus;
    if (!['reviewed', 'anonymous', 'collective', 'unknown'].includes(String(metadataStatus))) throw new Error(`Catalog ${documentId} metadata status is invalid`);
    if (!Array.isArray(entry.metadataProvenanceIds) || entry.metadataProvenanceIds.length < 1 || entry.metadataProvenanceIds.length > 4) {
      throw new Error(`Catalog ${documentId} must have 1..4 metadata provenance IDs`);
    }
    const metadataProvenanceIds = entry.metadataProvenanceIds.map((id, provenanceIndex) =>
      requiredProvenanceId(id, `${documentId}.metadataProvenanceIds.${provenanceIndex}`));
    if (new Set(metadataProvenanceIds).size !== metadataProvenanceIds.length) {
      throw new Error(`Catalog ${documentId} contains duplicate metadata provenance IDs`);
    }
    return {
      documentId,
      lookupAliases,
      composition: { ...(startYear !== undefined ? { startYear, endYear } : {}), label },
      creators,
      metadataStatus: metadataStatus as HistoricalMetadataStatus,
      metadataProvenanceIds,
    };
  });
}

export type HistoricalCatalogSourceAuthority =
  | 'official_denominational'
  | 'confessional_institution'
  | 'institutional_archive';

export interface HistoricalCatalogProvenanceSource {
  provenanceId: string;
  title: string;
  publisher: string;
  authority: HistoricalCatalogSourceAuthority;
  url: string;
}

export interface HistoricalCatalogClaimReview {
  provenanceId: string;
  fields: string[];
  reviewNote: string;
}

export interface HistoricalCatalogDocumentProvenance {
  documentId: string;
  claims: HistoricalCatalogClaimReview[];
}

export interface HistoricalCatalogProvenance {
  reviewedOn: string;
  sources: HistoricalCatalogProvenanceSource[];
  documents: HistoricalCatalogDocumentProvenance[];
}

/**
 * Validate that every machine-readable creator and composition claim has an
 * explicit source mapping. This verifies the checked-in review record; it does
 * not perform a mutable network lookup during deterministic builds.
 */
export function parseHistoricalDocumentCatalogProvenance(
  value: unknown,
  catalog: HistoricalCatalogEntry[],
): HistoricalCatalogProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Historical catalog provenance must be an object');
  const root = value as Record<string, unknown>;
  assertExactKeys(root, ['schemaVersion', 'reviewedOn', 'sources', 'documents'], 'catalog provenance root');
  if (root.schemaVersion !== 1) throw new Error('Historical catalog provenance must use schema version 1');
  if (typeof root.reviewedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(root.reviewedOn)
    || Number.isNaN(Date.parse(`${root.reviewedOn}T00:00:00Z`))) {
    throw new Error('Historical catalog provenance reviewedOn must be an ISO calendar date');
  }
  if (!Array.isArray(root.sources) || root.sources.length < 1 || root.sources.length > 32) {
    throw new Error('Historical catalog provenance must contain 1..32 sources');
  }
  const sourceIds = new Set<string>();
  const sources = root.sources.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Historical provenance source ${index + 1} is invalid`);
    const source = raw as Record<string, unknown>;
    assertExactKeys(source, ['provenanceId', 'title', 'publisher', 'authority', 'url'], `sources.${index}`);
    const provenanceId = requiredProvenanceId(source.provenanceId, `sources.${index}.provenanceId`);
    if (sourceIds.has(provenanceId)) throw new Error(`Duplicate historical metadata provenance ID: ${provenanceId}`);
    sourceIds.add(provenanceId);
    const authority = requiredText(source.authority, `sources.${index}.authority`, 60);
    if (!['official_denominational', 'confessional_institution', 'institutional_archive'].includes(authority)) {
      throw new Error(`Historical provenance source ${provenanceId} has invalid authority ${authority}`);
    }
    const url = requiredHttpsUrl(source.url, `sources.${index}.url`);
    return {
      provenanceId,
      title: requiredText(source.title, `sources.${index}.title`, 240),
      publisher: requiredText(source.publisher, `sources.${index}.publisher`, 160),
      authority: authority as HistoricalCatalogSourceAuthority,
      url,
    };
  });
  if (JSON.stringify(sources.map(source => source.provenanceId))
    !== JSON.stringify(sources.map(source => source.provenanceId).sort())) {
    throw new Error('Historical metadata provenance sources must be sorted by provenance ID');
  }

  if (!Array.isArray(root.documents) || root.documents.length !== catalog.length) {
    throw new Error('Historical catalog provenance must cover every catalog document exactly once');
  }
  const catalogById = new Map(catalog.map(entry => [entry.documentId, entry]));
  const seenDocuments = new Set<string>();
  const documents = root.documents.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Historical document provenance ${index + 1} is invalid`);
    const item = raw as Record<string, unknown>;
    assertExactKeys(item, ['documentId', 'claims'], `documents.${index}`);
    const documentId = requiredText(item.documentId, `documents.${index}.documentId`, 160);
    const entry = catalogById.get(documentId);
    if (!entry) throw new Error(`Historical provenance references unknown catalog document ${documentId}`);
    if (seenDocuments.has(documentId)) throw new Error(`Duplicate historical document provenance: ${documentId}`);
    seenDocuments.add(documentId);
    if (!Array.isArray(item.claims) || item.claims.length < 1 || item.claims.length > 4) {
      throw new Error(`Historical provenance ${documentId} must contain 1..4 claim reviews`);
    }
    const mappedFields = new Set<string>();
    const claims = item.claims.map((rawClaim, claimIndex) => {
      if (!rawClaim || typeof rawClaim !== 'object' || Array.isArray(rawClaim)) throw new Error(`Historical provenance ${documentId} claim ${claimIndex + 1} is invalid`);
      const claim = rawClaim as Record<string, unknown>;
      assertExactKeys(claim, ['provenanceId', 'fields', 'reviewNote'], `${documentId}.claims.${claimIndex}`);
      const provenanceId = requiredProvenanceId(claim.provenanceId, `${documentId}.claims.${claimIndex}.provenanceId`);
      if (!sourceIds.has(provenanceId)) throw new Error(`Historical provenance ${documentId} references unknown source ${provenanceId}`);
      if (!Array.isArray(claim.fields) || claim.fields.length < 1 || claim.fields.length > 20) {
        throw new Error(`Historical provenance ${documentId} claim ${claimIndex + 1} must map 1..20 fields`);
      }
      const fields = claim.fields.map((field, fieldIndex) => requiredClaimField(field, `${documentId}.claims.${claimIndex}.fields.${fieldIndex}`));
      for (const field of fields) {
        if (mappedFields.has(field)) throw new Error(`Historical provenance ${documentId} maps field ${field} more than once`);
        mappedFields.add(field);
      }
      return {
        provenanceId,
        fields,
        reviewNote: requiredText(claim.reviewNote, `${documentId}.claims.${claimIndex}.reviewNote`, 800),
      };
    });
    const expectedFields = catalogClaimFields(entry);
    if (JSON.stringify([...mappedFields].sort()) !== JSON.stringify(expectedFields.sort())) {
      const missing = expectedFields.filter(field => !mappedFields.has(field));
      const extra = [...mappedFields].filter(field => !expectedFields.includes(field));
      throw new Error(`Historical provenance ${documentId} field coverage mismatch; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
    }
    const claimProvenanceIds = [...new Set(claims.map(claim => claim.provenanceId))];
    if (JSON.stringify(claimProvenanceIds) !== JSON.stringify(entry.metadataProvenanceIds)) {
      throw new Error(`Historical provenance ${documentId} source IDs do not match its materialized metadataProvenanceIds`);
    }
    return { documentId, claims };
  });
  if (catalog.some(entry => !seenDocuments.has(entry.documentId))) throw new Error('Historical catalog provenance coverage is incomplete');
  return { reviewedOn: root.reviewedOn, sources, documents };
}

function assertExactKeys(value: Record<string, unknown>, allowed: string[], field: string): void {
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if (unknown) throw new Error(`${field} contains unknown field ${unknown}`);
}

export function normalizeCatalogName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (normalized.length < 1 || Array.from(normalized).length > maximum) throw new Error(`${field} is outside its length bound`);
  return normalized;
}

function optionalYear(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < -5000 || (value as number) > 3000) throw new Error(`${field} must be a safe year`);
  return value as number;
}

function requiredProvenanceId(value: unknown, field: string): string {
  const id = requiredText(value, field, 100);
  if (!/^hist-meta-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`${field} must be a stable historical metadata provenance ID`);
  return id;
}

function requiredClaimField(value: unknown, field: string): string {
  const claimField = requiredText(value, field, 100);
  if (!/^(?:composition\.(?:startYear|endYear|label)|creators\[\d+\]\.(?:name|role))$/.test(claimField)) {
    throw new Error(`${field} is not a creator/date claim field`);
  }
  return claimField;
}

function requiredHttpsUrl(value: unknown, field: string): string {
  const text = requiredText(value, field, 500);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${field} must be an absolute URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !url.hostname.includes('.')) {
    throw new Error(`${field} must be a public HTTPS URL without credentials or a fragment`);
  }
  return url.toString();
}

function catalogClaimFields(entry: HistoricalCatalogEntry): string[] {
  return [
    ...(entry.composition.startYear === undefined ? [] : ['composition.startYear', 'composition.endYear']),
    'composition.label',
    ...entry.creators.flatMap((_, index) => [`creators[${index}].name`, `creators[${index}].role`]),
  ];
}
