import type { PrimarySourceSearchMatch } from '../../services/historical/primarySourceTypes.js';

export const LOCAL_PRIMARY_SOURCE_SEARCH_SQL = `SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics,
       d.title AS document_title, d.type AS document_type, d.date AS document_date, d.metadata AS document_metadata
  FROM sections_fts
  JOIN document_sections ds ON ds.id = sections_fts.rowid
  JOIN documents d ON d.id = ds.document_id
 WHERE sections_fts MATCH ?
 ORDER BY rank, ds.id
 LIMIT ?`;

export const LOCAL_PRIMARY_SOURCE_WORK_SEARCH_SQL = `SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics,
       d.title AS document_title, d.type AS document_type, d.date AS document_date, d.metadata AS document_metadata
  FROM sections_fts
  JOIN document_sections ds ON ds.id = sections_fts.rowid
  JOIN documents d ON d.id = ds.document_id
 WHERE sections_fts MATCH ? AND ds.document_id = ?
 ORDER BY rank, ds.id
 LIMIT ?`;

/** Compose only quoted FTS5 literals; caller text can never become FTS syntax. */
export function composeLocalPrimarySourceFtsQuery(text: string, match: PrimarySourceSearchMatch): string {
  const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`;
  if (match === 'phrase') return quote(text);
  return text.split(' ').map(quote).join(' AND ');
}
