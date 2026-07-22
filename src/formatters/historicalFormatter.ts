/**
 * Pure formatting functions for historical document tool responses.
 */

import type { DocumentInfo, DocumentSection, HistoricalDocumentDeliveryProfile, HistoricalSectionSummary, ResolvedHistoricalSection } from '../kernel/repositories.js';
import { buildLocalDocumentResourceUri } from '../kernel/documentResource.js';
import { LOCAL_PRIMARY_SOURCE_ATTRIBUTION } from '../services/historical/primarySourceTypes.js';
import { CLASSIC_TEXT_LIMITS } from '../kernel/classicTextContract.js';
import { HISTORICAL_SECTIONED_ONLY_LANDING_MAX_BYTES } from '../kernel/historicalSectionedDelivery.js';

/** Provenance label for documents bundled with the server. No edition is implied. */
export const LOCAL_HISTORICAL_SOURCE = LOCAL_PRIMARY_SOURCE_ATTRIBUTION;

const localSource = `*Source: ${LOCAL_HISTORICAL_SOURCE}*`;

/**
 * Current local bodies are retained for research continuity, but have not yet
 * passed the per-edition review boundary introduced by the provenance
 * foundation. Keep this disclosure with every exact resource a model may read.
 */
const editionReadinessDisclosure = [
  '## Edition and provenance disclosure',
  '',
  'This hosted text is available for research, but this contract has not established its exact edition or transcription identity.',
  '- Provenance review: incomplete.',
  '- Exact-artifact redistribution rights: not established by this contract.',
  '- Do not infer edition, transcription source, or republication permission from the historical work alone.',
].join('\n');

/** Canonical exact-section representation shared by resources/read and link sizing. */
export function formatLocalDocumentSectionResource(doc: DocumentInfo, section: DocumentSection): string {
  return formatLocalDocumentSectionResourceWithIdentity(doc, section);
}

/**
 * Exact section body representation.  Identity metadata is included only when
 * the Transform-8 resolver supplies it, so legacy direct formatter callers
 * and complete-document whole-work formatting remain byte stable.
 */
export function formatLocalDocumentSectionResourceWithIdentity(
  doc: DocumentInfo,
  section: DocumentSection,
  identity?: Pick<ResolvedHistoricalSection, 'sectionKey' | 'sourceOrdinal' | 'resolution'> & { canonicalUri?: string; requestedUri?: string },
): string {
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
    ...(identity ? [
      '',
      '## Canonical section identity',
      '',
      `- Canonical section key: \`${identity.sectionKey}\``,
      `- Source ordinal: ${identity.sourceOrdinal}`,
      ...(identity.canonicalUri ? [`- Canonical resource: ${identity.canonicalUri}`] : []),
      ...(identity.resolution === 'legacy_alias' && identity.requestedUri
        ? [`- Requested legacy resource retained: ${identity.requestedUri}`]
        : []),
    ] : []),
    '',
    editionReadinessDisclosure,
    '',
    localSource,
  ].filter(Boolean).join('\n');
}

/** Bounded landing representation for a sectioned-only delivery profile. */
export function formatSectionedDocumentLanding(doc: DocumentInfo, profile: HistoricalDocumentDeliveryProfile): string {
  const text = [
    `# ${doc.title}`,
    '',
    `**Type:** ${doc.type}`,
    ...(doc.date ? [`**Date:** ${doc.date}`] : []),
    '',
    '## Sectioned delivery',
    '',
    `This edition delivers one exact section at a time (${profile.sectionCount} sections).`,
    'Use `classic_text_lookup` with `browseSections: true` to request a bounded metadata-only directory page.',
    'The whole-work body and section directory are intentionally not included in this landing resource.',
    '',
    localSource,
  ].join('\n');
  if (new TextEncoder().encode(text).byteLength > HISTORICAL_SECTIONED_ONLY_LANDING_MAX_BYTES) {
    throw new Error('Historical sectioned landing exceeded its 16384-byte contract.');
  }
  return text;
}

/** Bounded section directory; section bodies are never formatted here. */
export function formatSectionedDocumentDirectory(
  doc: DocumentInfo,
  sections: readonly HistoricalSectionSummary[],
  nextCursor?: string,
): string {
  const entries = sections.map(resolved => {
    const uri = buildLocalDocumentResourceUri(doc.id, resolved.sectionKey);
    const label = resolved.heading || resolved.legacyDisplayLabel || `Section ${resolved.sourceOrdinal}`;
    return uri ? `- **${label}** (source ${resolved.sourceOrdinal}) — ${uri}` : undefined;
  }).filter((value): value is string => Boolean(value));
  return [
    `# ${doc.title} — Section directory`,
    '',
    ...entries,
    ...(nextCursor ? ['', `Next cursor: \`${nextCursor}\``] : []),
    '',
    'Section bodies are omitted. Read an exact canonical section resource to access text.',
    '',
    localSource,
  ].join('\n');
}

/** Complete-document directory retains the legacy directory framing, with only locator identity updated. */
export function formatCompleteDocumentSectionIndex(doc: DocumentInfo, sections: readonly HistoricalSectionSummary[]): string {
  const entries = sections.flatMap(section => {
    const uri = buildLocalDocumentResourceUri(doc.id, section.sectionKey);
    if (!uri) return [];
    const label = section.heading ? `${section.legacyDisplayLabel} — ${section.heading}` : section.legacyDisplayLabel;
    return [`- **${label}** — [read exact section](${uri})`];
  });
  return [
    `**${doc.title} — Section Index** (${doc.type}, ${doc.date ?? 'n.d.'})`,
    '', ...entries, '',
    'Each link identifies one canonical exact-section MCP resource. Section bodies are omitted from this index.',
    '', localSource,
  ].join('\n').trim();
}

/** Canonical whole-document representation shared by resources/read and link sizing. */
export function formatLocalDocumentResource(doc: DocumentInfo, sections: DocumentSection[]): string {
  const lines = [
    `# ${doc.title}\n`,
    `**Type:** ${doc.type}`,
    doc.date ? `**Date:** ${doc.date}` : '',
    '',
  ];

  for (const section of sections) {
    if (section.title) {
      lines.push(`## ${section.section_number ? `${section.section_number}. ` : ''}${section.title}\n`);
    }
    lines.push(section.content);
    lines.push('');
  }
  lines.push(editionReadinessDisclosure);
  lines.push('');
  lines.push(localSource);
  return lines.filter(Boolean).join('\n');
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
export function formatSearchResults(
  query: string,
  sections: Array<ResolvedHistoricalSection | DocumentSection>,
  documents: DocumentInfo[] = [],
  preparedSnippets: readonly string[] = [],
): string {
  if (sections.length === 0) {
    return `No results found for "${query}".`;
  }

  const documentTitles = new Map(documents.map(document => [document.id, document.title]));
  const attributableSections: Array<{ resolved: ResolvedHistoricalSection; uri: string } | { legacy: DocumentSection; uri: string }> = [];
  for (const value of sections) {
    if ('sectionKey' in value) {
      const uri = buildLocalDocumentResourceUri(value.document.id, value.sectionKey);
      if (uri) attributableSections.push({ resolved: value, uri });
      continue;
    }
    const uri = buildLocalDocumentResourceUri(value.document_id, value.section_number);
    if (uri) attributableSections.push({ legacy: value, uri });
  }
  if (attributableSections.length === 0) return `No attributable results found for "${query}".`;
  const displayedSections = attributableSections.slice(0, CLASSIC_TEXT_LIMITS.searchHits);
  const count = attributableSections.length > displayedSections.length
    ? `(showing first ${displayedSections.length}; additional matches observed)`
    : `(${attributableSections.length} results)`;
  let s = `**Search Results for "${query}"** ${count}\n\n`;

  for (const [index, entry] of displayedSections.entries()) {
    if ('resolved' in entry) {
      const section = entry.resolved.section;
      const sectionIdentity = `Section ${entry.resolved.sectionKey} (source ${entry.resolved.sourceOrdinal})`;
      s += `**${entry.resolved.document.title} — ${sectionIdentity}${section.title ? `: ${section.title}` : ''}**\n`;
      s += `[Read the canonical exact section](${entry.uri})\n\n`;
      const snippet = preparedSnippets[index] ?? formatHistoricalDiscoverySnippet(section.content);
      s += `*Discovery snippet only — read the exact section before quoting:* ${snippet}\n\n`;
      continue;
    }
    const section = entry.legacy;
    const document = documentTitles.get(section.document_id) ?? section.document_id;
    const sectionIdentity = section.section_number ? `Section ${section.section_number}` : 'Selected section';
    s += `**${document} — ${sectionIdentity}${section.title ? `: ${section.title}` : ''}**\n`;
    s += `[Read the canonical exact section](${entry.uri})\n\n`;
    const snippet = preparedSnippets[index] ?? formatHistoricalDiscoverySnippet(section.content);
    s += `*Discovery snippet only — read the exact section before quoting:* ${snippet}\n\n`;
  }

  return `${s.trim()}\n\n${localSource}`;
}

/** Bounded Unicode-code-point preview shared by Markdown and structured discovery. */
export function formatHistoricalDiscoverySnippet(content: string): string {
  let snippet = '';
  let count = 0;
  for (const codePoint of content) {
    if (count === CLASSIC_TEXT_LIMITS.discoverySnippetBodyCharacters) {
      return `${snippet}${CLASSIC_TEXT_LIMITS.discoverySnippetEllipsis}`;
    }
    snippet += codePoint;
    count += 1;
  }
  return snippet;
}
