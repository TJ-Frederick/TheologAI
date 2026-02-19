/**
 * Pure formatting functions for historical document tool responses.
 */

import type { DocumentInfo, DocumentSection } from '../adapters/data/HistoricalDocumentRepository.js';

/** Format a document listing */
export function formatDocumentList(docs: DocumentInfo[]): string {
  let s = `**Available Historical Documents** (${docs.length})\n\n`;
  for (const doc of docs) {
    s += `- **${doc.title}** (${doc.type}, ${doc.date ?? 'n.d.'})\n`;
    s += `  ID: \`${doc.id}\`\n`;
  }
  return s.trim();
}

/** Format document sections */
export function formatDocumentSections(doc: DocumentInfo, sections: DocumentSection[]): string {
  let s = `**${doc.title}** (${doc.type}, ${doc.date ?? 'n.d.'})\n\n`;

  for (const section of sections) {
    if (section.title) s += `### ${section.title}\n\n`;
    s += `${section.content}\n\n`;
  }

  return s.trim();
}

/** Format search results */
export function formatSearchResults(query: string, sections: DocumentSection[]): string {
  if (sections.length === 0) {
    return `No results found for "${query}".`;
  }

  let s = `**Search Results for "${query}"** (${sections.length} results)\n\n`;

  for (const section of sections.slice(0, 10)) {
    if (section.title) s += `**${section.title}**\n`;
    const preview = section.content.substring(0, 300);
    s += `${preview}${section.content.length > 300 ? '...' : ''}\n\n`;
  }

  return s.trim();
}
