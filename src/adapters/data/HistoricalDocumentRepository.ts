/**
 * Historical document data access via SQLite + FTS5.
 *
 * Replaces in-memory loading from localData.ts with indexed search.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';
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
  LOCAL_PRIMARY_SOURCE_SEARCH_SQL,
  localPrimarySourceSearchSql,
} from '../shared/primarySourceSearchSql.js';
import { mapDocumentDatabaseRow, mapDocumentSectionDatabaseRow } from '../shared/historicalDocumentMetadata.js';

export type { DocumentInfo, DocumentSection } from '../../kernel/repositories.js';

export class HistoricalDocumentRepository implements IHistoricalDocumentRepository {
  private db: Database.Database;
  private stmtAllDocs: Database.Statement;
  private stmtDocById: Database.Statement;
  private stmtSections: Database.Statement;
  private stmtSectionByNum: Database.Statement;
  private stmtFtsSearch: Database.Statement;
  private stmtPrimarySourceSearch: Database.Statement;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();

    this.stmtAllDocs = this.db.prepare('SELECT * FROM documents ORDER BY title, id');
    this.stmtDocById = this.db.prepare('SELECT * FROM documents WHERE id = ?');
    this.stmtSections = this.db.prepare(
      'SELECT * FROM document_sections WHERE document_id = ? ORDER BY id'
    );
    this.stmtSectionByNum = this.db.prepare(
      'SELECT * FROM document_sections WHERE document_id = ? AND section_number = ?'
    );
    this.stmtFtsSearch = this.db.prepare(
      `SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics
       FROM sections_fts
       JOIN document_sections ds ON ds.id = sections_fts.rowid
       WHERE sections_fts MATCH ?
       ORDER BY rank, ds.id
       LIMIT ?`
    );
    this.stmtPrimarySourceSearch = this.db.prepare(LOCAL_PRIMARY_SOURCE_SEARCH_SQL);
  }

  /** List all available documents */
  listDocuments(): DocumentInfo[] {
    const rows = this.stmtAllDocs.all() as Array<{
      id: string; title: string; type: string; date: string | null; metadata: string;
    }>;

    return rows.map(mapDocumentDatabaseRow);
  }

  /** Get a document by its slug ID */
  getDocument(id: string): DocumentInfo | undefined {
    const row = this.stmtDocById.get(id) as {
      id: string; title: string; type: string; date: string | null; metadata: string;
    } | undefined;
    if (!row) return undefined;

    return mapDocumentDatabaseRow(row);
  }

  /** Get all sections of a document */
  getSections(documentId: string): DocumentSection[] {
    const rows = this.stmtSections.all(documentId) as Array<{
      id: number; document_id: string; section_number: string;
      title: string; content: string; topics: string;
    }>;

    return rows.map(mapDocumentSectionDatabaseRow);
  }

  /** Get a specific section by number */
  getSection(documentId: string, sectionNumber: string): DocumentSection | undefined {
    const row = this.stmtSectionByNum.get(documentId, sectionNumber) as {
      id: number; document_id: string; section_number: string;
      title: string; content: string; topics: string;
    } | undefined;
    if (!row) return undefined;

    return mapDocumentSectionDatabaseRow(row);
  }

  /** Full-text search across all document sections */
  search(query: string, limit: number = 20): DocumentSection[] {
    const ftsQuery = composeLocalPrimarySourceFtsQuery(query, 'all_terms');

    try {
      const rows = this.stmtFtsSearch.all(ftsQuery, limit) as Array<{
        id: number; document_id: string; section_number: string | null;
        title: string | null; content: string; topics: string | null;
      }>;

      return rows.map(mapDocumentSectionDatabaseRow);
    } catch (error) {
      if (isFtsSyntaxError(error)) return [];
      throw error;
    }
  }

  searchPrimarySources(options: PrimarySourceLocalSearchOptions): PrimarySourceLocalSearchRow[] {
    validatePrimarySourceOptions(options);
    const ftsQuery = composeLocalPrimarySourceFtsQuery(options.text, options.match);
    const selection = options.selection ?? 'relevance';
    const sql = localPrimarySourceSearchSql(selection, options.documentIds?.length);
    const statement = selection === 'relevance' && options.documentIds === undefined
      ? this.stmtPrimarySourceSearch
      : this.db.prepare(sql);
    const rows = options.documentIds
      ? statement.all(ftsQuery, ...options.documentIds, options.limit)
      : statement.all(ftsQuery, options.limit);
    return (rows as PrimarySourceSearchDatabaseRow[]).map(mapPrimarySourceRow);
  }

  /** Find a document by name (fuzzy matching) */
  findDocumentByName(name: string): DocumentInfo | undefined {
    const normalized = name.toLowerCase().trim();
    const docs = this.listDocuments();

    // Exact ID match
    const byId = docs.find(d => d.id === normalized);
    if (byId) return byId;

    // Title contains
    const byTitle = docs.find(d => d.title.toLowerCase().includes(normalized));
    if (byTitle) return byTitle;

    // ID contains
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
