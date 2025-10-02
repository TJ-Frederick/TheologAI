import { CommentaryLookupParams, CommentaryResult } from '../types/index.js';
import { ESVAdapter } from '../adapters/esvApi.js';
import { PublicCommentaryAdapter } from '../adapters/publicCommentaryAdapter.js';
import { APIError } from '../utils/errors.js';

export class CommentaryService {
  private esv: ESVAdapter;
  private publicCommentary: PublicCommentaryAdapter;

  constructor() {
    this.esv = new ESVAdapter();
    this.publicCommentary = new PublicCommentaryAdapter();
  }

  async lookup(params: CommentaryLookupParams): Promise<CommentaryResult> {
    try {
      const commentator = params.commentator || 'Matthew Henry';

      // Route to public domain commentary
      if (this.isPublicDomainCommentator(commentator)) {
        return await this.getPublicDomainCommentary(params.reference, commentator);
      }

      // Legacy ESV footnotes approach (kept for backward compatibility)
      if (commentator.toLowerCase().includes('esv')) {
        return await this.getESVFootnotes(params);
      }

      // Default to Matthew Henry
      return await this.getPublicDomainCommentary(params.reference, 'Matthew Henry');

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
   * Get public domain commentary from HelloAO Bible API
   * Provides actual theological commentary (not just textual notes)
   */
  private async getPublicDomainCommentary(reference: string, commentator: string): Promise<CommentaryResult> {
    try {
      const result = await this.publicCommentary.getCommentary({
        reference,
        commentator: commentator as any
      });

      // Format commentary text
      let commentaryText = `**${reference}** - ${result.commentator}'s Commentary\n\n`;
      commentaryText += `---\n\n`;
      commentaryText += result.fullText;
      commentaryText += `\n\n---\n\n`;
      commentaryText += `*Source: [HelloAO Bible API](${result.url}) (Public Domain)*`;

      return {
        reference,
        commentator: result.commentator,
        text: commentaryText,
        citation: {
          source: `${result.commentator}'s Commentary`,
          copyright: 'Public Domain',
          url: result.url
        }
      };
    } catch (error) {
      // Provide helpful error message if commentary not available
      throw new APIError(
        404,
        `Commentary not available for ${reference} from ${commentator}. ` +
        `This may be due to: (1) Invalid reference format, (2) Book not covered by this commentator ` +
        `(e.g., Keil-Delitzsch is OT only), or (3) Unknown commentator name. ` +
        `Available: Matthew Henry, Jamieson-Fausset-Brown, Adam Clarke, John Gill, Keil-Delitzsch, Tyndale.`
      );
    }
  }

  /**
   * Get ESV translation notes (textual variants, translation alternatives)
   * Legacy method - kept for backward compatibility
   */
  private async getESVFootnotes(params: CommentaryLookupParams): Promise<CommentaryResult> {
    // Fetch passage with footnotes from ESV
    const result = await this.esv.getPassageWithNotes(params.reference);

    // Extract plain text from HTML
    const plainText = this.extractPlainText(result.html);

    // Check if there are any footnotes
    if (!result.footnotes || result.footnotes.length === 0) {
      // Return verse text with helpful message instead of throwing error
      return {
        reference: params.reference,
        commentator: 'ESV Translation Committee',
        text: `**${params.reference}** (ESV)\n\n${plainText}\n\n---\n\nThis verse has no textual variants or translation notes in the ESV.`,
        citation: {
          source: 'ESV Bible',
          copyright: this.esv.getCopyrightNotice(),
          url: 'https://www.esv.org'
        }
      };
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
  }

  /**
   * Check if commentator is a public domain commentator
   */
  private isPublicDomainCommentator(commentator: string): boolean {
    const normalized = commentator.toLowerCase();
    return normalized.includes('matthew') ||
           normalized.includes('henry') ||
           normalized.includes('jfb') ||
           normalized.includes('jamieson') ||
           normalized.includes('fausset') ||
           normalized.includes('brown') ||
           normalized.includes('clarke') ||
           normalized.includes('gill') ||
           normalized.includes('keil') ||
           normalized.includes('delitzsch') ||
           normalized.includes('tyndale');
  }

  /**
   * Get list of available commentators
   */
  getAvailableCommentators(): string[] {
    return [
      'Matthew Henry',
      'Jamieson-Fausset-Brown',
      'Adam Clarke',
      'John Gill',
      'Keil-Delitzsch (OT only)',
      'Tyndale',
      'ESV (translation notes only - legacy)'
    ];
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