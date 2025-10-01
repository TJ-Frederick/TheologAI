/**
 * Classic Text Lookup Tool
 *
 * MCP tool for looking up classic Christian texts from CCEL
 */

import { CCELService } from '../services/ccelService.js';
import { SectionResolver } from '../services/sectionResolver.js';
import { formatMarkdown } from '../utils/formatter.js';
import { ToolHandler } from '../types/index.js';

export interface ClassicTextInput {
  work?: string;
  query?: string;
  listWorks?: boolean;
  browseSections?: boolean;
}

const service = new CCELService();
const resolver = new SectionResolver();

export const classicTextLookupHandler: ToolHandler = {
  name: 'classic_text_lookup',
  description: `Look up classic Christian texts from the Christian Classics Ethereal Library (CCEL).

**How to use:**
1. Provide work ID (e.g., "calvin/institutes")
2. Provide natural language query (e.g., "Book 1 Chapter 1")
3. System automatically finds and retrieves content

**NO section IDs needed - just use natural language!**

Available works include:
- Augustine (Confessions, City of God)
- Calvin (Institutes of the Christian Religion)
- Luther (The Bondage of the Will)
- Aquinas (Summa Theologica)
- Bunyan (Pilgrim's Progress)
- And hundreds more

**Example queries:**
- work: "calvin/institutes", query: "Book 1 Chapter 1"
- work: "augustine/confessions", query: "Book 2"
- work: "calvin/institutes", query: "introduction"
- work: "aquinas/summa", query: "Part 1 Question 1"`,

  inputSchema: {
    type: 'object',
    properties: {
      work: {
        type: 'string',
        description: 'Work identifier in format: author/work (e.g., "calvin/institutes", "augustine/confessions")'
      },
      query: {
        type: 'string',
        description: 'Natural language description of which section to retrieve. Examples: "Book 1 Chapter 1", "Introduction", "Chapter 5", "Part 2"'
      },
      listWorks: {
        type: 'boolean',
        description: 'Set to true to see all available works and their IDs'
      },
      browseSections: {
        type: 'boolean',
        description: 'Set to true to see all available sections for a specific work (requires work parameter)'
      }
    },
    required: []
  },

  handler: async (input: ClassicTextInput) => {
    try {
      // Mode 1: List all available works
      if (input.listWorks) {
        const works = service.getPopularWorks();
        const formatted = works.map(w =>
          `**${w.author}** - *${w.title}*\n  ${w.description}\n  Work ID: \`${w.work}\``
        ).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: formatMarkdown({
                title: 'Popular Classic Works on CCEL',
                content: formatted,
                footer: 'To retrieve content, use: { work: "work_id", query: "Book X Chapter Y" }'
              })
            }
          ]
        };
      }

      // Mode 2: Browse sections of a specific work
      if (input.browseSections && input.work) {
        const sections = await resolver.listSections(input.work);
        const formatted = sections.slice(0, 20).map(s => {
          const bookInfo = s.book ? `Book ${s.book}` : '';
          const chapterInfo = s.chapter ? `Chapter ${s.chapter}` : '';
          const meta = [bookInfo, chapterInfo].filter(Boolean).join(', ');
          return `- ${s.title}${meta ? ` (${meta})` : ''}`;
        }).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: formatMarkdown({
                title: `Available Sections in ${input.work}`,
                content: `Showing first 20 sections:\n\n${formatted}`,
                footer: 'To retrieve a section, use: { work: "' + input.work + '", query: "Book X Chapter Y" }'
              })
            }
          ]
        };
      }

      // Mode 3: Search for works by topic
      if (input.query && !input.work) {
        const suggestions = service.suggestWorks(input.query);

        if (suggestions.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: formatMarkdown({
                  title: 'No Works Found',
                  content: `No works found matching "${input.query}". Use \`listWorks: true\` to see all available works.`,
                  footer: 'CCEL (Christian Classics Ethereal Library)'
                })
              }
            ]
          };
        }

        const formatted = suggestions.map(s =>
          `**${s.author}** - *${s.title}*\n  Work ID: \`${s.work}\`\n  ${s.reason}`
        ).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: formatMarkdown({
                title: `Suggested Works for "${input.query}"`,
                content: formatted,
                footer: 'To read content, use: { work: "work_id", query: "Book X Chapter Y" }'
              })
            }
          ]
        };
      }

      // Mode 4: Retrieve content (requires work)
      if (!input.work) {
        return {
          content: [
            {
              type: 'text',
              text: formatMarkdown({
                title: 'Missing Work Identifier',
                content: 'Please provide a `work` identifier.\n\nExamples:\n- "calvin/institutes"\n- "augustine/confessions"\n\nUse `listWorks: true` to see all available works.',
                footer: 'CCEL (Christian Classics Ethereal Library)'
              })
            }
          ]
        };
      }

      // If no query provided, show available sections for this work
      if (!input.query) {
        const sections = await resolver.listSections(input.work);
        const formatted = sections.slice(0, 15).map(s => {
          const bookInfo = s.book ? `Book ${s.book}` : '';
          const chapterInfo = s.chapter ? `Chapter ${s.chapter}` : '';
          const meta = [bookInfo, chapterInfo].filter(Boolean).join(', ');
          return `- ${s.title}${meta ? ` (${meta})` : ''}`;
        }).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: formatMarkdown({
                title: `Available Sections in ${input.work}`,
                content: `Please provide a \`query\` to specify which section you want.\n\nFirst 15 sections:\n\n${formatted}`,
                footer: 'Example: { work: "' + input.work + '", query: "Book 1 Chapter 1" }'
              })
            }
          ]
        };
      }

      // Resolve query to section ID
      const resolution = await resolver.resolve(input.work, input.query);

      // Fetch the content
      const result = await service.getClassicText({
        work: input.work,
        section: resolution.sectionId,
        query: input.query
      });

      // Format and return
      const formattedText = formatMarkdown({
        title: result.title,
        content: result.content,
        citation: result.url,
        footer: result.source
      });

      return {
        content: [
          {
            type: 'text',
            text: formattedText
          }
        ]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [
          {
            type: 'text',
            text: formatMarkdown({
              title: 'Error Looking Up Classic Text',
              content: errorMessage,
              footer: 'Try: { listWorks: true } to see available works, or { work: "work_id", query: "Book 1 Chapter 1" }'
            })
          }
        ],
        isError: true
      };
    }
  }
};
