/**
 * Historical document data access via SQLite + FTS5.
 *
 * Replaces in-memory loading from localData.ts with indexed search.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';

export interface DocumentInfo {
  id: string;
  title: string;
  type: string;
  date: string | null;
  topics: string[];
}

export interface DocumentSection {
  id: number;
  document_id: string;
  section_number: string;
  title: string;
  content: string;
  topics: string[];
}

export class HistoricalDocumentRepository {
  private db: Database.Database;
  private stmtAllDocs: Database.Statement;
  private stmtDocById: Database.Statement;
  private stmtSections: Database.Statement;
  private stmtSectionByNum: Database.Statement;
  private stmtFtsSearch: Database.Statement;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();

    this.stmtAllDocs = this.db.prepare('SELECT * FROM documents ORDER BY title');
    this.stmtDocById = this.db.prepare('SELECT * FROM documents WHERE id = ?');
    this.stmtSections = this.db.prepare(
      'SELECT * FROM document_sections WHERE document_id = ? ORDER BY id'
    );
    this.stmtSectionByNum = this.db.prepare(
      'SELECT * FROM document_sections WHERE document_id = ? AND section_number = ?'
    );
    this.stmtFtsSearch = this.db.prepare(
      'SELECT rowid, title, content, topics FROM sections_fts WHERE sections_fts MATCH ? ORDER BY rank LIMIT ?'
    );
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
        rowid: number; title: string; content: string; topics: string;
      }>;

      // FTS rowids correspond to document_sections rowids
      return rows.map(r => ({
        id: r.rowid,
        document_id: '', // FTS doesn't include this, caller can join if needed
        section_number: '',
        title: r.title || '',
        content: r.content,
        topics: r.topics ? JSON.parse(r.topics) : [],
      }));
    } catch {
      // FTS query syntax error — fall back to empty
      return [];
    }
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
