import type { PrimarySourceSearchMatch, PrimarySourceSelection } from '../../services/historical/primarySourceTypes.js';
import { CLASSIC_TEXT_LIMITS } from '../../kernel/classicTextContract.js';

export const LOCAL_PRIMARY_SOURCE_SEARCH_SQL = `SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics,
       d.title AS document_title, d.type AS document_type, d.date AS document_date, d.metadata AS document_metadata
  FROM sections_fts
  JOIN document_sections ds ON ds.id = sections_fts.rowid
  JOIN documents d ON d.id = ds.document_id
 WHERE sections_fts MATCH ?
 ORDER BY rank, ds.id
 LIMIT ?`;

export const LOCAL_PRIMARY_SOURCE_WORK_DIVERSE_SEARCH_SQL = workDiverseSql();

// One JSON-array bind keeps scoped searches below D1's 100-parameter ceiling;
// json_each is available in both Cloudflare D1 and the local SQLite runtime.
export function localPrimarySourceScopedSearchSql(documentCount: number): string {
  if (!Number.isSafeInteger(documentCount) || documentCount < 1 || documentCount > CLASSIC_TEXT_LIMITS.workCount) {
    throw new Error(`Local primary-source document scope must contain 1..${CLASSIC_TEXT_LIMITS.workCount} documents`);
  }
  return `SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics,
       d.title AS document_title, d.type AS document_type, d.date AS document_date, d.metadata AS document_metadata
  FROM sections_fts
  JOIN document_sections ds ON ds.id = sections_fts.rowid
  JOIN documents d ON d.id = ds.document_id
 WHERE sections_fts MATCH ?
   AND ds.document_id IN (SELECT value FROM json_each(?) WHERE type = 'text')
 ORDER BY rank, ds.id
 LIMIT ?`;
}

export function localPrimarySourceWorkDiverseScopedSearchSql(documentCount: number): string {
  if (!Number.isSafeInteger(documentCount) || documentCount < 1 || documentCount > CLASSIC_TEXT_LIMITS.workCount) {
    throw new Error(`Local primary-source document scope must contain 1..${CLASSIC_TEXT_LIMITS.workCount} documents`);
  }
  return workDiverseSql(`
       AND ds.document_id IN (SELECT value FROM json_each(?) WHERE type = 'text')`);
}

export function localPrimarySourceSearchSql(selection: PrimarySourceSelection, documentCount?: number): string {
  if (selection === 'relevance') {
    return documentCount === undefined ? LOCAL_PRIMARY_SOURCE_SEARCH_SQL : localPrimarySourceScopedSearchSql(documentCount);
  }
  if (selection === 'work_diversity') {
    return documentCount === undefined ? LOCAL_PRIMARY_SOURCE_WORK_DIVERSE_SEARCH_SQL : localPrimarySourceWorkDiverseScopedSearchSql(documentCount);
  }
  throw new Error('Local primary-source selection is invalid');
}

/**
 * Deterministic round-robin selection: the best section from every matching
 * work precedes every second-best section, then every third-best section.
 * Relevance and the stable section row id break ties within each round.
 */
function workDiverseSql(scope = ''): string {
  return `WITH matching_sections AS (
    SELECT ds.id, ds.document_id, ds.section_number, ds.title, ds.content, ds.topics,
           d.title AS document_title, d.type AS document_type, d.date AS document_date,
           d.metadata AS document_metadata, bm25(sections_fts) AS relevance_rank
      FROM sections_fts
      JOIN document_sections ds ON ds.id = sections_fts.rowid
      JOIN documents d ON d.id = ds.document_id
     WHERE sections_fts MATCH ?${scope}
  ), ranked_sections AS (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY document_id ORDER BY relevance_rank, id
    ) AS work_rank
      FROM matching_sections
  )
  SELECT id, document_id, section_number, title, content, topics,
         document_title, document_type, document_date, document_metadata
    FROM ranked_sections
   ORDER BY work_rank, relevance_rank, id
   LIMIT ?`;
}

/** Compose only quoted FTS5 literals; caller text can never become FTS syntax. */
export function composeLocalPrimarySourceFtsQuery(text: string, match: PrimarySourceSearchMatch): string {
  const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`;
  const normalized = text.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (match === 'phrase') return quote(normalized);
  return normalized.split(' ').map(quote).join(' AND ');
}

/** Only malformed FTS query syntax is a legitimate empty-search result. */
export function isFtsSyntaxError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:\bfts5?\b.*\bsyntax\b|\bsyntax\b.*\bfts5?\b)/iu.test(message);
}
