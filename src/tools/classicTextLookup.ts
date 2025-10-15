/**
 * Classic Text Lookup Tool
 *
 * MCP tool for looking up classic Christian texts from CCEL
 */

import { CCELService } from '../services/ccelService.js';
import { SectionResolver } from '../services/sectionResolver.js';
import { LocalDataAdapter } from '../adapters/localData.js';
import { formatMarkdown, formatHistoricalResponse } from '../utils/formatter.js';
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
const localData = new LocalDataAdapter();

export const classicTextLookupHandler: ToolHandler = {
  name: 'classic_text_lookup',
  description: `Look up ALL classic Christian texts: local historical documents (creeds, confessions, catechisms) AND the Christian Classics Ethereal Library (CCEL).

**This is the PRIMARY tool for ALL historical Christian document searches.**

**PRIORITY: Checks local historical documents FIRST, then CCEL**

**Local Historical Documents (18 curated documents):**
- **Creeds:** Apostles, Nicene, Chalcedonian, Athanasian
- **Confessions:** Westminster, Augsburg, Belgic, Dort, 39 Articles, London Baptist 1689, Dositheus, Trent
- **Catechisms:** Westminster Larger/Shorter, Heidelberg, Philaret, Baltimore

**CCEL Complete Catalog (1000s of works spanning 2000 years):**
- **Church Fathers:** Augustine, Athanasius, Chrysostom, Irenaeus, Origen
- **Medieval:** Aquinas, Anselm, Bernard of Clairvaux, Thomas à Kempis
- **Reformers:** Calvin, Luther, Knox, Zwingli
- **Puritans:** Bunyan, Owen, Baxter, Brooks, Goodwin
- **Post-Reformation:** Edwards, Wesley, Spurgeon, Whitefield, Chesterton
- **Plus:** Devotional classics, apologetics, church history, commentaries

**How to use:**
1. **Search any topic across all documents:** { query: "justification" } → searches local docs + CCEL
2. **Lookup specific document:** { work: "westminster-confession", query: "scripture" } → returns matching sections
3. **Browse document structure:** { work: "philaret-catechism", browseSections: true } → lists all sections
4. **Discover available works:** { listWorks: true } → shows CCEL catalog organized by era
5. **Search within CCEL work:** { work: "calvin/institutes", query: "Book 3 Chapter 21" } → retrieves specific content

**NO section IDs needed - just use natural language!**

**Example queries:**
- query: "trinity" → Search ALL documents (local + CCEL)
- work: "nicene-creed" → Get full Nicene Creed from local storage
- work: "augsburg-confession", query: "justification" → Search Augsburg Confession
- work: "calvin/institutes", query: "Book 3 Chapter 21" → Retrieve from CCEL
- listWorks: true → See 40+ CCEL works organized by era`,

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
      // Priority 0: Check local historical documents first for specific work queries
      if (input.work && !input.listWorks && !input.browseSections) {
        // Normalize work ID to match local filenames
        const localWorkId = input.work
          .replace(/^(westminster)\/(.*)$/, 'westminster-$2')  // westminster/confession → westminster-confession
          .replace(/^(.*)\/(.*)$/, '$1-$2')  // other/work → other-work
          .replace(/_/g, '-');  // underscores to dashes

        const localDoc = localData.getDocument(localWorkId);

        if (localDoc) {
          const searchQuery = input.query || input.topic || '';

          // If no query provided, return full document
          if (!searchQuery) {
            const results = localData.searchDocuments('', localWorkId);
            const formattedResults = results
              .slice(0, 10) // Show more for full document view
              .map(result => formatHistoricalResponse(result))
              .join('\n\n---\n\n');

            const summary = results.length > 10
              ? `\n\n*Showing first 10 of ${results.length} sections*`
              : `\n\n*Complete document (${results.length} section${results.length === 1 ? '' : 's'})*`;

            return {
              content: [{
                type: 'text',
                text: formattedResults + summary
              }]
            };
          }

          // Search within document
          const results = localData.searchDocuments(searchQuery, localWorkId);

          if (results.length > 0) {
            const formattedResults = results
              .slice(0, 5)
              .map(result => formatHistoricalResponse(result))
              .join('\n\n---\n\n');

            const summary = results.length > 5
              ? `\n\n*Showing first 5 of ${results.length} results*`
              : `\n\n*Found ${results.length} result(s)*`;

            return {
              content: [{
                type: 'text',
                text: formattedResults + summary
              }]
            };
          } else {
            // Document found but no matches for query
            return {
              content: [{
                type: 'text',
                text: formatMarkdown({
                  title: `No Matches in ${localDoc.title}`,
                  content: `The document "${localDoc.title}" is available locally, but no sections match "${searchQuery}".\n\nTry different search terms, or omit the query parameter to see the full document.`,
                  footer: `Local Historical Document (${localDoc.date})`
                })
              }]
            };
          }
        }
      }

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
        // Check if this is a local document first
        const localWorkId = input.work
          .replace(/^(westminster)\/(.*)$/, 'westminster-$2')
          .replace(/^(.*)\/(.*)$/, '$1-$2')
          .replace(/_/g, '-');

        const localDoc = localData.getDocument(localWorkId);

        if (localDoc) {
          // Browse local document sections
          const formatted = localDoc.sections.slice(0, 20).map(s => {
            if (s.question_number) {
              const preview = s.question ? ` ${s.question.substring(0, 50)}...` : '';
              return `${s.question_number}.${preview}`;
            }
            if (s.chapter) return `Chapter ${s.chapter}`;
            if (s.title) return s.title;
            return 'Section';
          }).join('\n');

          return {
            content: [{
              type: 'text',
              text: formatMarkdown({
                title: `Sections in ${localDoc.title}`,
                content: `${localDoc.title} has ${localDoc.sections.length} sections. Showing first 20:\n\n${formatted}\n\n*This is a local historical document. Use { work: "${localWorkId}", query: "search term" } to search within it.*`,
                footer: `Local Historical Document (${localDoc.date})`
              })
            }]
          };
        }

        // Not local, try CCEL
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
        // Priority 1: Search local historical documents first
        const localResults = localData.searchDocuments(input.query);

        if (localResults.length > 0) {
          const formattedLocal = localResults
            .slice(0, 5)
            .map(result => formatHistoricalResponse(result))
            .join('\n\n---\n\n');

          const localSummary = localResults.length > 5
            ? `\n\n*Showing first 5 of ${localResults.length} results from local historical documents*`
            : '';

          // Also search CCEL for additional results
          const catalogResults = await service.searchAllWorks(input.query);

          if (catalogResults.length > 0) {
            const formattedCCEL = catalogResults.slice(0, 3).map(s =>
              `**${s.author}** - *${s.title}*\n  Work ID: \`${s.work}\`\n  ${s.description}`
            ).join('\n\n');

            return {
              content: [{
                type: 'text',
                text: formatMarkdown({
                  title: `Results for "${input.query}"`,
                  content: `### Local Historical Documents\n\n${formattedLocal}${localSummary}\n\n### CCEL Catalog (showing 3 of ${catalogResults.length})\n\n${formattedCCEL}`,
                  footer: 'Local documents searched first, then CCEL catalog'
                })
              }]
            };
          }

          // Only local results found
          return {
            content: [{
              type: 'text',
              text: formattedLocal + localSummary
            }]
          };
        }

        // Priority 2: Search the full CCEL catalog via scraping
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
