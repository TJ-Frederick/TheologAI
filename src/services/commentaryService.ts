import { CommentaryLookupParams, CommentaryResult } from '../types/index.js';

export class CommentaryService {
  // Sample commentary data for common verses
  private mockCommentary: Record<string, { commentator: string; text: string }> = {
    'john 3:16': {
      commentator: 'NET Bible Notes',
      text: 'This verse encapsulates the gospel message. The Greek word "kosmos" (world) emphasizes God\'s love for all humanity. "Only begotten" (monogenes) refers to Jesus as the unique Son of God.'
    },
    'john 1:1': {
      commentator: 'NET Bible Notes',
      text: 'The Word (Logos) was both "with God" (pros ton theon) indicating relationship, and "was God" (theos en ho logos) indicating deity. This establishes both the distinction and unity within the Trinity.'
    },
    'genesis 1:1': {
      commentator: 'NET Bible Notes',
      text: 'The Hebrew "bara" (created) is used exclusively of divine activity. "In the beginning" (bereshit) establishes the temporal beginning of the created order.'
    },
    'romans 8:28': {
      commentator: 'NET Bible Notes',
      text: 'The phrase "all things work together" (panta synergei) suggests divine providence orchestrating circumstances for the good of believers.'
    }
  };

  async lookup(params: CommentaryLookupParams): Promise<CommentaryResult> {
    const normalizedRef = params.reference.toLowerCase().trim();
    const commentary = this.mockCommentary[normalizedRef];

    if (!commentary) {
      const availableRefs = Object.keys(this.mockCommentary).map(ref =>
        ref.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      ).sort();

      throw new Error(`No commentary available for "${params.reference}". Available commentary for: ${availableRefs.join(', ')}`);
    }

    return {
      reference: params.reference,
      commentator: params.commentator || commentary.commentator,
      text: commentary.text,
      citation: {
        source: `${commentary.commentator}`,
        copyright: 'NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.',
        url: 'https://netbible.org'
      }
    };
  }
}