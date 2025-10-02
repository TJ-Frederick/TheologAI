import { CommentaryLookupParams, CommentaryResult } from '../types/index.js';
import { NETBibleAdapter } from '../adapters/netBibleApi.js';
import { APIError } from '../utils/errors.js';

export class CommentaryService {
  private netBible: NETBibleAdapter;

  constructor() {
    this.netBible = new NETBibleAdapter();
  }

  async lookup(params: CommentaryLookupParams): Promise<CommentaryResult> {
    try {
      // Fetch passage with notes from NET Bible
      const result = await this.netBible.getPassage(params.reference);

      // Check if there are any note markers
      if (!result.notes || result.notes.length === 0) {
        throw new APIError(
          404,
          `No translator notes available for "${params.reference}". The NET Bible includes extensive notes for most verses, but this particular verse may not have additional commentary.`
        );
      }

      // The NET Bible API only provides note markers, not the actual note content
      // We'll provide information about where to find the notes
      const noteCount = result.notes.length;
      const formattedRef = params.reference.replace(/\s+/g, '+');
      const netBibleUrl = `https://netbible.org/bible/${formattedRef}`;

      let commentaryText = `**${params.reference}** (NET Bible)\n\n`;
      commentaryText += `${result.text}\n\n`;
      commentaryText += `---\n\n`;
      commentaryText += `**Translator Notes Available:**\n\n`;
      commentaryText += `This verse has **${noteCount} translator note${noteCount > 1 ? 's' : ''}** in the NET Bible. `;
      commentaryText += `The NET Bible's 60,000+ translator notes provide detailed explanations of translation decisions, `;
      commentaryText += `textual variants, and interpretive insights.\n\n`;
      commentaryText += `**View full notes at:** ${netBibleUrl}\n\n`;
      commentaryText += `The NET Bible notes include:\n`;
      commentaryText += `- Study notes (theological/interpretive insights)\n`;
      commentaryText += `- Translator notes (explanation of translation choices)\n`;
      commentaryText += `- Textual criticism (manuscript variants and textual issues)\n`;

      // Apply max length if specified
      if (params.maxLength && commentaryText.length > params.maxLength) {
        commentaryText = commentaryText.substring(0, params.maxLength) + '...';
      }

      return {
        reference: params.reference,
        commentator: params.commentator || 'NET Bible Translators',
        text: commentaryText,
        citation: {
          source: 'NET Bible Translator Notes',
          copyright: this.netBible.getCopyrightNotice(),
          url: 'https://netbible.org'
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
}