/**
 * Historical document repository backed by Cloudflare D1.
 *
 * Same SQL queries as the better-sqlite3 version, but using
 * the D1 async binding API.
 */

import type {
  IHistoricalDocumentRepository,
  DocumentInfo,
  DocumentSection,
  HistoricalDocumentDeliveryProfile,
  HistoricalSectionBrowseBoundary,
  HistoricalSectionSummary,
  ResolvedHistoricalSection,
  PrimarySourceLocalSearchOptions,
  PrimarySourceLocalSearchRow,
} from '../../kernel/repositories.js';
import {
  composeLocalPrimarySourceFtsQuery,
  isFtsSyntaxError,
  localPrimarySourceSearchSql,
} from '../shared/primarySourceSearchSql.js';
import { mapDocumentDatabaseRow, mapDocumentSectionDatabaseRow } from '../shared/historicalDocumentMetadata.js';
import { CLASSIC_TEXT_LIMITS } from '../../kernel/classicTextContract.js';

export class D1HistoricalDocumentRepository implements IHistoricalDocumentRepository {
  constructor(private db: D1Database) {}

  async listDocuments(): Promise<DocumentInfo[]> {
    const { results: rows } = await this.db.prepare(
      'SELECT * FROM documents ORDER BY title, id'
    ).all<{ id: string; title: string; type: string; date: string | null; metadata: string }>();

    return rows.map(mapDocumentDatabaseRow);
  }

  async getDocument(id: string): Promise<DocumentInfo | undefined> {
    const row = await this.db.prepare(
      'SELECT * FROM documents WHERE id = ?'
    ).bind(id).first<{ id: string; title: string; type: string; date: string | null; metadata: string }>();
    if (!row) return undefined;

    return mapDocumentDatabaseRow(row);
  }

  async getSections(documentId: string): Promise<DocumentSection[]> {
    const { results: rows } = await this.db.prepare(
      'SELECT * FROM document_sections WHERE document_id = ? ORDER BY id'
    ).bind(documentId).all<{
      id: number; document_id: string; section_number: string;
      title: string; content: string; topics: string;
    }>();

    return rows.map(mapDocumentSectionDatabaseRow);
  }

  async getSection(documentId: string, sectionNumber: string): Promise<DocumentSection | undefined> {
    const row = await this.db.prepare(
      'SELECT * FROM document_sections WHERE document_id = ? AND section_number = ?'
    ).bind(documentId, sectionNumber).first<{
      id: number; document_id: string; section_number: string;
      title: string; content: string; topics: string;
    }>();
    if (!row) return undefined;

    return mapDocumentSectionDatabaseRow(row);
  }

  async getDeliveryProfile(documentId: string): Promise<HistoricalDocumentDeliveryProfile | undefined> {
    const row = await this.db.prepare(`SELECT document_id, work_id, edition_id,
      immutable_corpus_identity, section_package_identity, delivery_mode, section_count,
      landing_max_bytes, browse_page_size, cursor_version, provenance_json, rights_json
      FROM historical_document_delivery_profiles WHERE document_id = ?`).bind(documentId)
      .first<DeliveryProfileDatabaseRow>();
    return row ? mapDeliveryProfile(row) : undefined;
  }

  async resolveSection(documentId: string, sectionId: string): Promise<ResolvedHistoricalSection | undefined> {
    const select = `SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics,
      d.id AS document_id_for_metadata, d.title AS document_title, d.type AS document_type,
      d.date AS document_date, d.metadata AS document_metadata, i.section_key, i.source_ordinal
      FROM historical_section_identities i
      JOIN document_sections ds ON ds.id = i.document_section_id AND ds.document_id = i.document_id
      JOIN documents d ON d.id = i.document_id`;
    // Keep the D1 query sequence semantically identical to SQLite: aliases are
    // never considered until the canonical key is proven absent.
    const canonical = await this.db.prepare(`${select} WHERE i.document_id = ? AND i.section_key = ?`)
      .bind(documentId, sectionId).first<ResolvedSectionDatabaseRow>();
    if (canonical) return mapResolvedSection(canonical, sectionId, 'canonical');
    const alias = await this.db.prepare(`${select}
      JOIN historical_section_aliases a ON a.document_id = i.document_id
        AND a.section_key = i.section_key AND a.source_ordinal = i.source_ordinal
      WHERE a.document_id = ? AND a.legacy_section_id = ?`)
      .bind(documentId, sectionId).first<ResolvedSectionDatabaseRow>();
    return alias ? mapResolvedSection(alias, sectionId, 'legacy_alias') : undefined;
  }

  async browseHistoricalSectionSummaries(
    documentId: string,
    after: HistoricalSectionBrowseBoundary | undefined,
    limit: number,
  ): Promise<HistoricalSectionSummary[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2001) throw new Error('Historical section browse limit must be 1..2001');
    const { results } = await this.db.prepare(`SELECT i.document_id, i.section_key, i.source_ordinal,
      ds.section_number AS legacy_display_label, ds.title AS heading
      FROM historical_section_identities i
      JOIN document_sections ds ON ds.id = i.document_section_id AND ds.document_id = i.document_id
      WHERE i.document_id = ?
        AND (? IS NULL OR i.source_ordinal > ? OR (i.source_ordinal = ? AND i.section_key > ?))
      ORDER BY i.source_ordinal, i.section_key LIMIT ?`)
      .bind(documentId, after?.sourceOrdinal ?? null, after?.sourceOrdinal ?? 0,
        after?.sourceOrdinal ?? 0, after?.sectionKey ?? '', limit)
      .all<HistoricalSectionSummaryDatabaseRow>();
    return results.map(row => ({
      documentId: row.document_id, sectionKey: row.section_key,
      sourceOrdinal: row.source_ordinal, legacyDisplayLabel: row.legacy_display_label, heading: row.heading,
    }));
  }

  async hasHistoricalSectionBoundary(documentId: string, boundary: HistoricalSectionBrowseBoundary): Promise<boolean> {
    const row = await this.db.prepare(`SELECT 1 AS present FROM historical_section_identities
      WHERE document_id = ? AND source_ordinal = ? AND section_key = ?`)
      .bind(documentId, boundary.sourceOrdinal, boundary.sectionKey).first<{ present: number }>();
    return row !== undefined && row !== null;
  }

  async search(query: string, limit: number = 20): Promise<DocumentSection[]> {
    const ftsQuery = composeLocalPrimarySourceFtsQuery(query, 'all_terms');

    try {
      const { results: rows } = await this.db.prepare(
        `SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics
         FROM sections_fts
         JOIN document_sections ds ON ds.id = sections_fts.rowid
         WHERE sections_fts MATCH ?
         ORDER BY rank, ds.id
         LIMIT ?`
      ).bind(ftsQuery, limit).all<{
        id: number; document_id: string; section_number: string;
        title: string; content: string; topics: string;
      }>();

      return rows.map(mapDocumentSectionDatabaseRow);
    } catch (error) {
      if (isFtsSyntaxError(error)) return [];
      throw error;
    }
  }

  async searchResolvedSections(query: string, limit: number = 20): Promise<ResolvedHistoricalSection[]> {
    const ftsQuery = composeLocalPrimarySourceFtsQuery(query, 'all_terms');
    try {
      const { results } = await this.db.prepare(`SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics,
        d.id AS document_id_for_metadata, d.title AS document_title, d.type AS document_type,
        d.date AS document_date, d.metadata AS document_metadata, i.section_key, i.source_ordinal
        FROM sections_fts
        JOIN document_sections ds ON ds.id = sections_fts.rowid
        JOIN historical_section_identities i ON i.document_section_id = ds.id AND i.document_id = ds.document_id
        JOIN documents d ON d.id = ds.document_id
        WHERE sections_fts MATCH ? ORDER BY rank, ds.id LIMIT ?`).bind(ftsQuery, limit)
        .all<ResolvedSectionDatabaseRow>();
      return results.map(row => mapResolvedSection(row, row.section_key, 'canonical'));
    } catch (error) {
      if (isFtsSyntaxError(error)) return [];
      throw error;
    }
  }

  async searchPrimarySources(options: PrimarySourceLocalSearchOptions): Promise<PrimarySourceLocalSearchRow[]> {
    validatePrimarySourceOptions(options);
    const ftsQuery = composeLocalPrimarySourceFtsQuery(options.text, options.match);
    const statement = this.db.prepare(localPrimarySourceSearchSql(options.selection ?? 'relevance', options.documentIds?.length));
    const bound = options.documentIds
      ? statement.bind(ftsQuery, JSON.stringify(options.documentIds), options.limit)
      : statement.bind(ftsQuery, options.limit);
    const { results } = await bound.all<PrimarySourceSearchDatabaseRow>();
    return results.map(mapPrimarySourceRow);
  }

  async findDocumentByName(name: string): Promise<DocumentInfo | undefined> {
    const normalized = name.toLowerCase().trim();
    const docs = await this.listDocuments();

    const byId = docs.find(d => d.id === normalized);
    if (byId) return byId;

    const byTitle = docs.find(d => d.title.toLowerCase().includes(normalized));
    if (byTitle) return byTitle;

    return docs.find(d => d.id.includes(normalized));
  }
}

interface PrimarySourceSearchDatabaseRow {
  id: number;
  document_id: string;
  section_number: string | null;
  title: string | null;
  content: string;
  topics: string | null;
  document_title: string;
  document_type: string;
  document_date: string | null;
  document_metadata: string | null;
  section_key: string;
  source_ordinal: number;
}

function mapPrimarySourceRow(row: PrimarySourceSearchDatabaseRow): PrimarySourceLocalSearchRow {
  return {
    document: mapDocumentDatabaseRow({
      id: row.document_id, title: row.document_title, type: row.document_type,
      date: row.document_date, metadata: row.document_metadata,
    }),
    section: mapDocumentSectionDatabaseRow(row),
    sectionKey: row.section_key,
    sourceOrdinal: row.source_ordinal,
  };
}

interface DeliveryProfileDatabaseRow {
  document_id: string; work_id: string | null; edition_id: string | null;
  immutable_corpus_identity: string; section_package_identity: string | null;
  delivery_mode: 'complete_document' | 'sectioned_only'; section_count: number;
  landing_max_bytes: 0 | 16_384; browse_page_size: 0 | 32; cursor_version: 0 | 1;
  provenance_json: string; rights_json: string;
}

interface ResolvedSectionDatabaseRow {
  id: number; document_id: string; section_number: string; title: string; content: string; topics: string;
  document_id_for_metadata: string; document_title: string; document_type: string;
  document_date: string | null; document_metadata: string | null;
  section_key: string; source_ordinal: number;
}

interface HistoricalSectionSummaryDatabaseRow {
  document_id: string; section_key: string; source_ordinal: number; legacy_display_label: string; heading: string;
}

function mapDeliveryProfile(row: DeliveryProfileDatabaseRow): HistoricalDocumentDeliveryProfile {
  return {
    documentId: row.document_id, workId: row.work_id, editionId: row.edition_id,
    immutableCorpusIdentity: row.immutable_corpus_identity,
    sectionPackageIdentity: row.section_package_identity,
    deliveryMode: row.delivery_mode, sectionCount: row.section_count,
    landingMaxBytes: row.landing_max_bytes, browsePageSize: row.browse_page_size,
    cursorVersion: row.cursor_version,
    provenance: parseJsonObject(row.provenance_json, 'historical delivery provenance'),
    rights: parseJsonObject(row.rights_json, 'historical delivery rights'),
  };
}

function mapResolvedSection(
  row: ResolvedSectionDatabaseRow,
  requestedSectionId: string,
  resolution: ResolvedHistoricalSection['resolution'],
): ResolvedHistoricalSection {
  return {
    document: mapDocumentDatabaseRow({
      id: row.document_id_for_metadata, title: row.document_title, type: row.document_type,
      date: row.document_date, metadata: row.document_metadata,
    }),
    section: mapDocumentSectionDatabaseRow(row), sectionKey: row.section_key,
    sourceOrdinal: row.source_ordinal, requestedSectionId, resolution,
  };
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be an object`);
  return parsed as Record<string, unknown>;
}

function validatePrimarySourceOptions(options: PrimarySourceLocalSearchOptions): void {
  if (!options || typeof options.text !== 'string' || options.text.length < 1) throw new Error('Primary-source search text is required');
  if (options.match !== 'all_terms' && options.match !== 'phrase') throw new Error('Primary-source match mode is invalid');
  if (options.selection !== undefined && options.selection !== 'relevance' && options.selection !== 'work_diversity') throw new Error('Primary-source selection is invalid');
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 9) throw new Error('Primary-source internal limit must be 1..9');
  if (options.documentIds !== undefined && (!Array.isArray(options.documentIds)
    || options.documentIds.length < 1 || options.documentIds.length > CLASSIC_TEXT_LIMITS.workCount
    || options.documentIds.some(id => typeof id !== 'string' || id.length < 1)
    || new Set(options.documentIds).size !== options.documentIds.length)) {
    throw new Error('Primary-source document scope is invalid');
  }
}
