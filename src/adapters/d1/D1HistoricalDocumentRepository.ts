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
  PrimarySourceLocalSearchOptions,
  PrimarySourceLocalSearchRow,
} from '../../kernel/repositories.js';
import {
  composeLocalPrimarySourceFtsQuery,
  isFtsSyntaxError,
  localPrimarySourceSearchSql,
} from '../shared/primarySourceSearchSql.js';
import { mapDocumentDatabaseRow, mapDocumentSectionDatabaseRow } from '../shared/historicalDocumentMetadata.js';

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

  async searchPrimarySources(options: PrimarySourceLocalSearchOptions): Promise<PrimarySourceLocalSearchRow[]> {
    validatePrimarySourceOptions(options);
    const ftsQuery = composeLocalPrimarySourceFtsQuery(options.text, options.match);
    const statement = this.db.prepare(localPrimarySourceSearchSql(options.selection ?? 'relevance', options.documentIds?.length));
    const bound = options.documentIds
      ? statement.bind(ftsQuery, ...options.documentIds, options.limit)
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
}

function mapPrimarySourceRow(row: PrimarySourceSearchDatabaseRow): PrimarySourceLocalSearchRow {
  return {
    document: mapDocumentDatabaseRow({
      id: row.document_id, title: row.document_title, type: row.document_type,
      date: row.document_date, metadata: row.document_metadata,
    }),
    section: mapDocumentSectionDatabaseRow(row),
  };
}

function validatePrimarySourceOptions(options: PrimarySourceLocalSearchOptions): void {
  if (!options || typeof options.text !== 'string' || options.text.length < 1) throw new Error('Primary-source search text is required');
  if (options.match !== 'all_terms' && options.match !== 'phrase') throw new Error('Primary-source match mode is invalid');
  if (options.selection !== undefined && options.selection !== 'relevance' && options.selection !== 'work_diversity') throw new Error('Primary-source selection is invalid');
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 9) throw new Error('Primary-source internal limit must be 1..9');
  if (options.documentIds !== undefined && (!Array.isArray(options.documentIds)
    || options.documentIds.length < 1 || options.documentIds.length > 17
    || options.documentIds.some(id => typeof id !== 'string' || id.length < 1)
    || new Set(options.documentIds).size !== options.documentIds.length)) {
    throw new Error('Primary-source document scope is invalid');
  }
}
