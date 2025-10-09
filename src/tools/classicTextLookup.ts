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
  topic?: string;
  listWorks?: boolean;
  browseSections?: boolean;
}

const service = new CCELService();
const resolver = new SectionResolver();

export const classicTextLookupHandler: ToolHandler = {
  name: 'classic_text_lookup',
  description: `Look up classic Christian texts from the Christian Classics Ethereal Library (CCEL).

**Discover and access ALL works from CCEL's complete catalog spanning 2000 years of church history:**
- Church Fathers: Augustine, Athanasius, Chrysostom
- Medieval: Aquinas, Anselm, Bernard, Thomas à Kempis
- Reformers: Calvin, Luther, Knox
- Puritans: Bunyan, Owen, Baxter, Brooks
- Post-Reformation: Edwards, Wesley, Spurgeon, Chesterton
- Plus devotional classics, apologetics, and church history

**How to use:**
1. **Discover works:** Use listWorks or search by topic/keyword
2. **Find sections within a work:** Provide work + topic to search section titles
3. **Retrieve content:** Provide work + natural language query (e.g., "Book 1 Chapter 1")

**NO section IDs needed - just use natural language!**

**Example queries:**
- listWorks: true → See 40+ curated works organized by era
- query: "justification" → Find works about justification
- work: "calvin/institutes", topic: "predestination" → Find relevant sections
- work: "calvin/institutes", query: "Book 3 Chapter 21" → Retrieve specific section
- work: "augustine/city_of_god", query: "Book 1" → Retrieve Book 1`,

  inputSchema: {
    type: 'object',
    properties: {
      work: {
        type: 'string',
        description: 'Work identifier in format: author/work (e.g., "calvin/institutes", "augustine/confessions", "bunyan/pilgrim"). Use listWorks to discover work IDs.'
      },
      query: {
        type: 'string',
        description: 'Natural language section reference OR topic keyword. For sections: "Book 1 Chapter 1", "Introduction", "Part 2 Question 5". For topic search without work: finds relevant works.'
      },
      topic: {
        type: 'string',
        description: 'Search for sections within a work by topic/keyword (requires work parameter). Searches section titles for matching content. Example: work="calvin/institutes", topic="predestination"'
      },
      listWorks: {
        type: 'boolean',
        description: 'Set to true to see 40+ popular works organized by era (Church Fathers, Medieval, Reformers, Puritans, etc.)'
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

        // Group by category
        const categories = new Map<string, typeof works>();
        for (const work of works) {
          if (!categories.has(work.category)) {
            categories.set(work.category, []);
          }
          categories.get(work.category)!.push(work);
        }

        // Format by category
        const sections = Array.from(categories.entries()).map(([category, categoryWorks]) => {
          const worksFormatted = categoryWorks.map(w =>
            `  • **${w.author}** - *${w.title}*\n    Work ID: \`${w.work}\`\n    ${w.description}`
          ).join('\n\n');
          return `### ${category}\n\n${worksFormatted}`;
        }).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: formatMarkdown({
                title: 'Popular Classic Works on CCEL (40+ Works)',
                content: sections,
                footer: 'To retrieve: { work: "work_id", query: "Book X Chapter Y" } | To search by topic: { query: "topic" } | To find sections: { work: "work_id", topic: "keyword" }'
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

      // Mode 2b: Search sections within a work by topic
      if (input.topic && input.work) {
        const matchingSections = await resolver.searchSectionsByTopic(input.work, input.topic);

        if (matchingSections.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: formatMarkdown({
                  title: `No Sections Found for "${input.topic}"`,
                  content: `No sections found in ${input.work} with "${input.topic}" in the title.\n\nTry:\n- Different keywords\n- Browse all sections with \`browseSections: true\`\n- Retrieve a specific section with \`query: "Book X Chapter Y"\``,
                  footer: 'CCEL (Christian Classics Ethereal Library)'
                })
              }
            ]
          };
        }

        const formatted = matchingSections.slice(0, 10).map(s => {
          const bookInfo = s.book ? `Book ${s.book}` : '';
          const chapterInfo = s.chapter ? `Chapter ${s.chapter}` : '';
          const partInfo = s.part ? `Part ${s.part}` : '';
          const questionInfo = s.question ? `Question ${s.question}` : '';
          const meta = [partInfo, bookInfo, chapterInfo, questionInfo].filter(Boolean).join(', ');
          return `- **${s.title}**${meta ? `\n  (${meta})` : ''}`;
        }).join('\n\n');

        const summary = matchingSections.length > 10
          ? `\n\n*Showing top 10 of ${matchingSections.length} matching sections*`
          : `\n\n*Found ${matchingSections.length} matching section${matchingSections.length === 1 ? '' : 's'}*`;

        return {
          content: [
            {
              type: 'text',
              text: formatMarkdown({
                title: `Sections about "${input.topic}" in ${input.work}`,
                content: `${formatted}${summary}`,
                footer: 'To retrieve a section, use: { work: "' + input.work + '", query: "Book X Chapter Y" }'
              })
            }
          ]
        };
      }

      // Mode 3: Search for works by topic/author (unlimited catalog search)
      if (input.query && !input.work) {
        // First, try searching the full CCEL catalog via scraping
        const catalogResults = await service.searchAllWorks(input.query);

        if (catalogResults.length > 0) {
          const formatted = catalogResults.map(s =>
            `**${s.author}** - *${s.title}*\n  Work ID: \`${s.work}\`\n  ${s.description}`
          ).join('\n\n');

          const footer = catalogResults.length === 66
            ? `Showing top 66 results from CCEL catalog | To read: { work: "work_id", query: "Book X Chapter Y" }`
            : `Found ${catalogResults.length} work${catalogResults.length === 1 ? '' : 's'} | To read: { work: "work_id", query: "Book X Chapter Y" }`;

          return {
            content: [
              {
                type: 'text',
                text: formatMarkdown({
                  title: `CCEL Catalog Results for "${input.query}"`,
                  content: formatted,
                  footer
                })
              }
            ]
          };
        }

        // Fallback: Search curated 40-work list by theological topic
        const suggestions = service.suggestWorks(input.query);

        if (suggestions.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: formatMarkdown({
                  title: 'No Works Found',
                  content: `No works found matching "${input.query}". Use \`listWorks: true\` to see curated popular works.`,
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
                title: `Suggested Works for "${input.query}" (Curated List)`,
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
