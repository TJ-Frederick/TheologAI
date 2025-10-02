import { BibleResult, CommentaryResult, HistoricalResult, Reference, Citation } from '../types/index.js';

export function formatBibleResponse(data: BibleResult): string {
  let response = `**${data.reference} (${data.translation})**\n\n`;
  response += `${data.text}\n`;

  // Format footnotes if present
  if (data.footnotes && data.footnotes.length > 0) {
    response += `\n**Footnotes:**\n`;
    for (const footnote of data.footnotes) {
      response += `${footnote.caller} (v${footnote.reference.verse}): ${footnote.text}\n`;
    }
  }

  // Format cross-references if present
  if (data.crossReferences && data.crossReferences.length > 0) {
    response += `\n*Cross References:* ${data.crossReferences.map(ref => ref.reference).join(', ')}\n`;
  }

  response += `\n*Source: ${data.citation.source}*`;
  if (data.citation.copyright) {
    response += ` - ${data.citation.copyright}`;
  }

  return response.trim();
}

/**
 * Format multiple Bible translations for comparison
 */
export function formatMultiBibleResponse(results: BibleResult[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  // Use the first result's reference as the main reference
  const reference = results[0].reference;
  let response = `**${reference}** (${results.length} translations)\n\n`;

  // Add each translation
  for (const result of results) {
    response += `**${result.translation}:**\n`;
    response += `${result.text}\n\n`;

    // Add footnotes if present (inline for each translation)
    if (result.footnotes && result.footnotes.length > 0) {
      response += `*Footnotes:*\n`;
      for (const footnote of result.footnotes) {
        response += `  ${footnote.caller} (v${footnote.reference.verse}): ${footnote.text}\n`;
      }
      response += `\n`;
    }
  }

  // Add sources (collect unique sources)
  const sources = Array.from(new Set(results.map(r => r.citation.source)));
  response += `\n*Sources: ${sources.join(', ')}*`;

  return response.trim();
}

export function formatCommentaryResponse(data: CommentaryResult): string {
  let response = `**${data.commentator} Commentary on ${data.reference}**\n\n`;
  response += `${data.text}\n\n`;
  response += `*Source: ${data.citation.source}*`;

  return response.trim();
}

export function formatHistoricalResponse(data: HistoricalResult): string {
  let response = `**${data.document}**\n`;
  if (data.section) {
    response += `*Section: ${data.section}*\n\n`;
  } else {
    response += '\n';
  }

  response += `${data.text}\n\n`;
  response += `*Source: ${data.citation.source}*`;

  return response.trim();
}

export function formatToolResponse(content: string) {
  return {
    content: [{
      type: 'text' as const,
      text: content
    }]
  };
}

export interface MarkdownFormatOptions {
  title: string;
  content: string;
  citation?: string;
  footer?: string;
}

export function formatMarkdown(options: MarkdownFormatOptions): string {
  let response = `**${options.title}**\n\n`;
  response += `${options.content}\n\n`;

  if (options.citation) {
    response += `*Citation: ${options.citation}*\n`;
  }

  if (options.footer) {
    response += `*${options.footer}*`;
  }

  return response.trim();
}