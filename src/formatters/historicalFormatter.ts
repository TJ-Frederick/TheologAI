/**
 * Pure formatting functions for historical document tool responses.
 */

import type { DocumentInfo, DocumentSection } from '../adapters/data/HistoricalDocumentRepository.js';
import { LOCAL_PRIMARY_SOURCE_ATTRIBUTION } from '../services/historical/primarySourceTypes.js';

/** Provenance label for documents bundled with the server. No edition is implied. */
export const LOCAL_HISTORICAL_SOURCE = LOCAL_PRIMARY_SOURCE_ATTRIBUTION;

const localSource = `*Source: ${LOCAL_HISTORICAL_SOURCE}*`;

/** Format a document listing */
export function formatDocumentList(docs: DocumentInfo[]): string {
  let s = `**Available Historical Documents** (${docs.length})\n\n`;
  for (const doc of docs) {
    s += `- **${doc.title}** (${doc.type}, ${doc.date ?? 'n.d.'})\n`;
    s += `  ID: \`${doc.id}\`\n`;
  }
  return `${s.trim()}\n\n${localSource}`;
}

/** Format document sections */
export function formatDocumentSections(doc: DocumentInfo, sections: DocumentSection[]): string {
  let s = `**${doc.title}** (${doc.type}, ${doc.date ?? 'n.d.'})\n\n`;

  for (const section of sections) {
    if (section.title) s += `### ${section.title}\n\n`;
    s += `${section.content}\n\n`;
  }

  return `${s.trim()}\n\n${localSource}`;
}

/** Format search results */
export function formatSearchResults(query: string, sections: DocumentSection[]): string {
  if (sections.length === 0) {
    return `No results found for "${query}".`;
  }

  const displayedSections = sections.slice(0, 10);
  const count = sections.length > displayedSections.length
    ? `(showing ${displayedSections.length} of ${sections.length} results)`
    : `(${sections.length} results)`;
  let s = `**Search Results for "${query}"** ${count}\n\n`;

  for (const section of displayedSections) {
    if (section.title) s += `**${section.title}**\n`;
    const preview = section.content.substring(0, 300);
    s += `${preview}${section.content.length > 300 ? '...' : ''}\n\n`;
  }

  return `${s.trim()}\n\n${localSource}`;
}
