/**
 * Historical document repository backed by Cloudflare D1.
 *
 * Same SQL queries as the better-sqlite3 version, but using
 * the D1 async binding API.
 */

import type { IHistoricalDocumentRepository, DocumentInfo, DocumentSection } from '../../kernel/repositories.js';

// D1 binding type (subset used by this repo)
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export class D1HistoricalDocumentRepository implements IHistoricalDocumentRepository {
  constructor(private db: D1Database) {}

  async listDocuments(): Promise<DocumentInfo[]> {
    const { results: rows } = await this.db.prepare(
      'SELECT * FROM documents ORDER BY title'
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
         FROM sections_fts fts
         JOIN document_sections ds ON ds.id = fts.rowid
         WHERE sections_fts MATCH ?
         ORDER BY fts.rank
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
      return [];
    }
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
