import { CommentaryLookupParams, CommentaryResult } from '../types/index.js';
import { ESVAdapter } from '../adapters/esvApi.js';
import { APIError } from '../utils/errors.js';

export class CommentaryService {
  private esv: ESVAdapter;

  constructor() {
    this.esv = new ESVAdapter();
  }

  async lookup(params: CommentaryLookupParams): Promise<CommentaryResult> {
    try {
      // Fetch passage with footnotes from ESV
      const result = await this.esv.getPassageWithNotes(params.reference);

      // Extract plain text from HTML
      const plainText = this.extractPlainText(result.html);

      // Check if there are any footnotes
      if (!result.footnotes || result.footnotes.length === 0) {
        throw new APIError(
          404,
          `No translation notes available for "${params.reference}". The ESV includes footnotes for textual variants and translation alternatives, but this particular verse may not have additional notes.`
        );
      }

      // Build commentary text with footnotes
      let commentaryText = `**${params.reference}** (ESV)\n\n`;
      commentaryText += `${plainText}\n\n`;
      commentaryText += `---\n\n`;
      commentaryText += `**Translation Notes:**\n\n`;

      // Group footnotes by type
      const variants = result.footnotes.filter(f => f.type === 'variant');
      const translations = result.footnotes.filter(f => f.type === 'translation');
      const others = result.footnotes.filter(f => f.type === 'other');

      if (variants.length > 0) {
        commentaryText += `**Textual Variants:**\n`;
        variants.forEach(note => {
          commentaryText += `• [${note.marker}] ${note.reference}: ${note.text}\n`;
        });
        commentaryText += `\n`;
      }

      if (translations.length > 0) {
        commentaryText += `**Translation Alternatives:**\n`;
        translations.forEach(note => {
          commentaryText += `• [${note.marker}] ${note.reference}: ${note.text}\n`;
        });
        commentaryText += `\n`;
      }

      if (others.length > 0) {
        commentaryText += `**Additional Notes:**\n`;
        others.forEach(note => {
          commentaryText += `• [${note.marker}] ${note.reference}: ${note.text}\n`;
        });
        commentaryText += `\n`;
      }

      // Add cross-references if available
      if (result.crossReferences && result.crossReferences.length > 0) {
        commentaryText += `**Cross-References:**\n`;
        result.crossReferences.forEach(ref => {
          if (ref.text) {
            commentaryText += `• ${ref.verse}: ${ref.text}\n`;
          } else {
            commentaryText += `• ${ref.verse}\n`;
          }
        });
        commentaryText += `\n`;
      }

      // Apply max length if specified
      if (params.maxLength && commentaryText.length > params.maxLength) {
        commentaryText = commentaryText.substring(0, params.maxLength) + '...';
      }

      return {
        reference: params.reference,
        commentator: params.commentator || 'ESV Translation Committee',
        text: commentaryText,
        citation: {
          source: 'ESV Translation Notes',
          copyright: this.esv.getCopyrightNotice(),
          url: 'https://www.esv.org'
        }
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(
        500,
        `Failed to fetch commentary: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract plain text from ESV HTML, removing all tags
   */
  private extractPlainText(html: string): string {
    // Remove footnote markers
    let text = html.replace(/<sup[^>]*>.*?<\/sup>/g, '');

    // Remove headings
    text = text.replace(/<h\d[^>]*>.*?<\/h\d>/g, '');

    // Remove all HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }
}