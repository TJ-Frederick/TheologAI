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
  LOCAL_PRIMARY_SOURCE_SEARCH_SQL,
  LOCAL_PRIMARY_SOURCE_WORK_SEARCH_SQL,
} from '../shared/primarySourceSearchSql.js';

export type { DocumentInfo, DocumentSection } from '../../kernel/repositories.js';

export class HistoricalDocumentRepository implements IHistoricalDocumentRepository {
  private db: Database.Database;
  private stmtAllDocs: Database.Statement;
  private stmtDocById: Database.Statement;
  private stmtSections: Database.Statement;
  private stmtSectionByNum: Database.Statement;
  private stmtFtsSearch: Database.Statement;
  private stmtPrimarySourceSearch: Database.Statement;
  private stmtPrimarySourceWorkSearch: Database.Statement;

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
    this.stmtPrimarySourceWorkSearch = this.db.prepare(LOCAL_PRIMARY_SOURCE_WORK_SEARCH_SQL);
  }

  /** List all available documents */
  listDocuments(): DocumentInfo[] {
    const rows = this.stmtAllDocs.all() as Array<{
      id: string; title: string; type: string; date: string | null; metadata: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      title: r.title,
      type: r.type,
      date: r.date,
      topics: r.metadata ? (JSON.parse(r.metadata).topics || []) : [],
    }));
  }

  /** Get a document by its slug ID */
  getDocument(id: string): DocumentInfo | undefined {
    const row = this.stmtDocById.get(id) as {
      id: string; title: string; type: string; date: string | null; metadata: string;
    } | undefined;
    if (!row) return undefined;

    return {
      id: row.id,
      title: row.title,
      type: row.type,
      date: row.date,
      topics: row.metadata ? (JSON.parse(row.metadata).topics || []) : [],
    };
  }

  /** Get all sections of a document */
  getSections(documentId: string): DocumentSection[] {
    const rows = this.stmtSections.all(documentId) as Array<{
      id: number; document_id: string; section_number: string;
      title: string; content: string; topics: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      document_id: r.document_id,
      section_number: r.section_number,
      title: r.title || '',
      content: r.content,
      topics: r.topics ? JSON.parse(r.topics) : [],
    }));
  }

  /** Get a specific section by number */
  getSection(documentId: string, sectionNumber: string): DocumentSection | undefined {
    const row = this.stmtSectionByNum.get(documentId, sectionNumber) as {
      id: number; document_id: string; section_number: string;
      title: string; content: string; topics: string;
    } | undefined;
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

  /** Full-text search across all document sections */
  search(query: string, limit: number = 20): DocumentSection[] {
    const escaped = query.replace(/['"*]/g, '');
    const ftsQuery = `"${escaped}"*`;

    try {
      const rows = this.stmtFtsSearch.all(ftsQuery, limit) as Array<{
        id: number; document_id: string; section_number: string | null;
        title: string | null; content: string; topics: string | null;
      }>;

      return rows.map(r => ({
        id: r.id,
        document_id: r.document_id,
        section_number: r.section_number || '',
        title: r.title || '',
        content: r.content,
        topics: r.topics ? JSON.parse(r.topics) : [],
      }));
    } catch {
      // FTS query syntax error — fall back to empty
      return [];
    }
  }

  searchPrimarySources(options: PrimarySourceLocalSearchOptions): PrimarySourceLocalSearchRow[] {
    validatePrimarySourceOptions(options);
    const ftsQuery = composeLocalPrimarySourceFtsQuery(options.text, options.match);
    const rows = options.documentId
      ? this.stmtPrimarySourceWorkSearch.all(ftsQuery, options.documentId, options.limit)
      : this.stmtPrimarySourceSearch.all(ftsQuery, options.limit);
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
