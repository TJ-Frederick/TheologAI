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
  LOCAL_PRIMARY_SOURCE_SEARCH_SQL,
  LOCAL_PRIMARY_SOURCE_WORK_SEARCH_SQL,
} from '../shared/primarySourceSearchSql.js';

export class D1HistoricalDocumentRepository implements IHistoricalDocumentRepository {
  constructor(private db: D1Database) {}

  async listDocuments(): Promise<DocumentInfo[]> {
    const { results: rows } = await this.db.prepare(
      'SELECT * FROM documents ORDER BY title, id'
    ).all<{ id: string; title: string; type: string; date: string | null; metadata: string }>();

    return rows.map(r => ({
      id: r.id,
      title: r.title,
      type: r.type,
      date: r.date,
      topics: r.metadata ? (JSON.parse(r.metadata).topics || []) : [],
    }));
  }

  async getDocument(id: string): Promise<DocumentInfo | undefined> {
    const row = await this.db.prepare(
      'SELECT * FROM documents WHERE id = ?'
    ).bind(id).first<{ id: string; title: string; type: string; date: string | null; metadata: string }>();
    if (!row) return undefined;

    return {
      id: row.id,
      title: row.title,
      type: row.type,
      date: row.date,
      topics: row.metadata ? (JSON.parse(row.metadata).topics || []) : [],
    };
  }

  async getSections(documentId: string): Promise<DocumentSection[]> {
    const { results: rows } = await this.db.prepare(
      'SELECT * FROM document_sections WHERE document_id = ? ORDER BY id'
    ).bind(documentId).all<{
      id: number; document_id: string; section_number: string;
      title: string; content: string; topics: string;
    }>();

    return rows.map(r => ({
      id: r.id,
      document_id: r.document_id,
      section_number: r.section_number,
      title: r.title || '',
      content: r.content,
      topics: r.topics ? JSON.parse(r.topics) : [],
    }));
  }

  async getSection(documentId: string, sectionNumber: string): Promise<DocumentSection | undefined> {
    const row = await this.db.prepare(
      'SELECT * FROM document_sections WHERE document_id = ? AND section_number = ?'
    ).bind(documentId, sectionNumber).first<{
      id: number; document_id: string; section_number: string;
      title: string; content: string; topics: string;
    }>();
    if (!row) return undefined;

    return {
      id: row.id,
      document_id: row.document_id,
      section_number: row.section_number,
      title: row.title || '',
      content: row.content,
      topics: row.topics ? JSON.parse(row.topics) : [],
    };
  }

  async search(query: string, limit: number = 20): Promise<DocumentSection[]> {
    const escaped = query.replace(/['"*]/g, '');
    const ftsQuery = `"${escaped}"*`;

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

      return rows.map(r => ({
        id: r.id,
        document_id: r.document_id,
        section_number: r.section_number || '',
        title: r.title || '',
        content: r.content,
        topics: r.topics ? JSON.parse(r.topics) : [],
      }));
    } catch {
      // FTS5 queries can fail on malformed input. The repository contract uses
      // an empty result for invalid search syntax and never logs raw errors.
      return [];
    }
  }

  async searchPrimarySources(options: PrimarySourceLocalSearchOptions): Promise<PrimarySourceLocalSearchRow[]> {
    validatePrimarySourceOptions(options);
    const ftsQuery = composeLocalPrimarySourceFtsQuery(options.text, options.match);
    const statement = this.db.prepare(options.documentId ? LOCAL_PRIMARY_SOURCE_WORK_SEARCH_SQL : LOCAL_PRIMARY_SOURCE_SEARCH_SQL);
    const bound = options.documentId
      ? statement.bind(ftsQuery, options.documentId, options.limit)
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
    document: {
      id: row.document_id,
      title: row.document_title,
      type: row.document_type,
      date: row.document_date,
      topics: row.document_metadata ? (JSON.parse(row.document_metadata).topics || []) : [],
    },
    section: {
      id: row.id,
      document_id: row.document_id,
      section_number: row.section_number || '',
      title: row.title || '',
      content: row.content,
      topics: row.topics ? JSON.parse(row.topics) : [],
    },
  };
}

function validatePrimarySourceOptions(options: PrimarySourceLocalSearchOptions): void {
  if (!options || typeof options.text !== 'string' || options.text.length < 1) throw new Error('Primary-source search text is required');
  if (options.match !== 'all_terms' && options.match !== 'phrase') throw new Error('Primary-source match mode is invalid');
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 8) throw new Error('Primary-source limit must be 1..8');
  if (options.documentId !== undefined && (typeof options.documentId !== 'string' || options.documentId.length < 1)) throw new Error('Primary-source document ID is invalid');
}
