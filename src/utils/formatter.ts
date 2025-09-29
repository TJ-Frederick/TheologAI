import { BibleResult, CommentaryResult, HistoricalResult, Reference, Citation } from '../types/index.js';

export function formatBibleResponse(data: BibleResult): string {
  let response = `**${data.reference} (${data.translation})**\n\n`;
  response += `${data.text}\n\n`;

  if (data.crossReferences && data.crossReferences.length > 0) {
    response += `*Cross References:* ${data.crossReferences.map(ref => ref.reference).join(', ')}\n\n`;
  }

  response += `*Source: ${data.citation.source}*`;
  if (data.citation.copyright) {
    response += ` - ${data.citation.copyright}`;
  }

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