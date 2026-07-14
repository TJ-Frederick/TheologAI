/**
 * Pure formatting functions for historical document tool responses.
 */

import type { DocumentInfo, DocumentSection } from '../adapters/data/HistoricalDocumentRepository.js';
import { buildLocalDocumentResourceUri } from '../kernel/documentResource.js';
import { LOCAL_PRIMARY_SOURCE_ATTRIBUTION } from '../services/historical/primarySourceTypes.js';

/** Provenance label for documents bundled with the server. No edition is implied. */
export const LOCAL_HISTORICAL_SOURCE = LOCAL_PRIMARY_SOURCE_ATTRIBUTION;

const localSource = `*Source: ${LOCAL_HISTORICAL_SOURCE}*`;

/** Canonical exact-section representation shared by resources/read and link sizing. */
export function formatLocalDocumentSectionResource(doc: DocumentInfo, section: DocumentSection): string {
  const heading = section.title
    ? `## ${section.section_number ? `${section.section_number}. ` : ''}${section.title}`
    : section.section_number ? `## Section ${section.section_number}` : '## Selected section';
  return [
    `# ${doc.title}\n`,
    `**Type:** ${doc.type}`,
    doc.date ? `**Date:** ${doc.date}` : '',
    '',
    heading,
    '',
    section.content,
    '',
    localSource,
  ].filter(Boolean).join('\n');
}

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

/** Compact section directory for selecting an exact MCP resource without returning every body. */
export function formatDocumentSectionIndex(doc: DocumentInfo, sections: DocumentSection[]): string {
  const entries = sections.flatMap(section => {
    const uri = buildLocalDocumentResourceUri(doc.id, section.section_number);
    if (!uri) return [];
    const number = section.section_number ? `Section ${section.section_number}` : 'Section';
    const label = section.title ? `${number} — ${section.title}` : number;
    return [`- **${label}** — [read exact section](${uri})`];
  });
  return [
    `**${doc.title} — Section Index** (${doc.type}, ${doc.date ?? 'n.d.'})`,
    '',
    ...entries,
    '',
    'Each link identifies one canonical exact-section MCP resource. Section bodies are omitted from this index.',
    '',
    localSource,
  ].join('\n').trim();
}

/** Format search results */
export function formatSearchResults(query: string, sections: DocumentSection[], documents: DocumentInfo[] = []): string {
  if (sections.length === 0) {
    return `No results found for "${query}".`;
  }

  const documentTitles = new Map(documents.map(document => [document.id, document.title]));
  const attributableSections = sections.flatMap(section => {
    const uri = buildLocalDocumentResourceUri(section.document_id, section.section_number);
    return uri ? [{ section, uri }] : [];
  });
  if (attributableSections.length === 0) return `No attributable results found for "${query}".`;
  const displayedSections = attributableSections.slice(0, 10);
  const count = attributableSections.length > displayedSections.length
    ? `(showing ${displayedSections.length} of ${attributableSections.length} results)`
    : `(${attributableSections.length} results)`;
  let s = `**Search Results for "${query}"** ${count}\n\n`;

  for (const { section, uri } of displayedSections) {
    const document = documentTitles.get(section.document_id) ?? section.document_id;
    const sectionIdentity = section.section_number ? `Section ${section.section_number}` : 'Selected section';
    s += `**${document} — ${sectionIdentity}${section.title ? `: ${section.title}` : ''}**\n`;
    s += `[Read the canonical exact section](${uri})\n\n`;
    const preview = section.content.substring(0, 300);
    s += `*Discovery snippet only — read the exact section before quoting:* ${preview}${section.content.length > 300 ? '...' : ''}\n\n`;
  }

  return `${s.trim()}\n\n${localSource}`;
}
