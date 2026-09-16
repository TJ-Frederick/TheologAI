/** Markdown views for bounded active hierarchy delivery. */

import { OutputLimitError } from '../kernel/errors.js';
import type {
  HistoricalHierarchyChildDelivery,
  HistoricalHierarchyLanding,
  HistoricalHierarchyNodeDelivery,
  HistoricalHierarchySearchDelivery,
} from '../services/historical/HistoricalHierarchyService.js';

const encoder = new TextEncoder();

export function formatHistoricalHierarchyLanding(delivery: HistoricalHierarchyLanding): string {
  const { publication, profile } = delivery;
  return bounded(publication.landingMaxBytes, 'landing', [
    `# ${publication.title}`,
    '',
    publication.metadata.editionLabel,
    '',
    publication.coverage.statement,
    '',
    `**Coverage:** ${publication.coverage.completeness}`,
    `**Rights:** ${publication.metadata.rightsStatus}. ${publication.metadata.territoryCaveat}`,
    `**Source:** ${profile.provenance.sourceLabel}`,
    '',
    'Bodies are available only from one exact hierarchy node at a time. Browse returns immediate child metadata; search returns snippets only.',
  ].join('\n'));
}

export function formatHistoricalHierarchyNode(delivery: HistoricalHierarchyNodeDelivery): string {
  const { publication, context, canonicalUri } = delivery;
  const breadcrumb = [...context.ancestors, context.node].map(node => node.label).join(' › ');
  const body = context.body === undefined
    ? '_This navigation node has no direct body._'
    : context.body.content;
  return bounded(publication.nodeMaxBytes, 'node', [
    `# ${publication.title}`,
    '',
    `## ${context.node.heading}`,
    '',
    `**Path:** ${breadcrumb}`,
    `**Canonical resource:** ${canonicalUri}`,
    `**Edition:** ${publication.metadata.editionLabel}`,
    `**Rights:** ${publication.metadata.rightsStatus}. ${publication.metadata.territoryCaveat}`,
    `**Source:** ${delivery.profile.provenance.sourceLabel}`,
    `**Coverage:** ${publication.coverage.statement}`,
    '',
    body,
  ].join('\n'));
}

export function formatHistoricalHierarchyChildren(delivery: HistoricalHierarchyChildDelivery): string {
  const { publication, page, parentNodeKey, nextCursor } = delivery;
  const parent = parentNodeKey === null ? 'work root' : parentNodeKey;
  const rows = page.nodes.length === 0
    ? ['_No immediate children._']
    : page.nodes.map(node => `- ${node.label} — ${node.heading}`);
  if (nextCursor !== undefined) rows.push('', `More children are available with cursor: \`${nextCursor}\`.`);
  return bounded(publication.directoryMaxBytes, 'children', [
    `# ${publication.title}`,
    '',
    `## Children of ${parent}`,
    '',
    ...rows,
  ].join('\n'));
}

export function formatHistoricalHierarchySearch(delivery: HistoricalHierarchySearchDelivery): string {
  const { publication, results } = delivery;
  const rows = results.length === 0
    ? ['_No local hierarchy matches found._']
    : results.map((result, index) => {
      const breadcrumb = result.breadcrumb.map(node => node.label).join(' › ');
      return `${index + 1}. **${result.node.heading}** (${breadcrumb})\n\n   ${result.snippet}`;
    });
  return bounded(publication.searchMaxBytes, 'search', [
    `# ${publication.title}`,
    '',
    ...rows,
  ].join('\n'));
}

function bounded(maximum: number, mode: string, text: string): string {
  if (encoder.encode(text).byteLength > maximum) {
    throw new OutputLimitError(`Historical hierarchy ${mode} output exceeds its reviewed UTF-8 byte budget.`);
  }
  return text;
}
