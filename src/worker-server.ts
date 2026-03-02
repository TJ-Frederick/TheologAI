/**
 * Workers MCP server using the high-level McpServer class.
 *
 * Registers all 7 tools, 4 resources, and 4 prompts.
 * Consumed by createMcpHandler() in worker.ts.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WorkerCompositionRoot } from './tools/worker/index.js';

export function createWorkerMcpServer(root: WorkerCompositionRoot, version: string): McpServer {
  const server = new McpServer({
    name: 'theologai-bible-server',
    version,
  });

  const { tools, services } = root;

  // ── Tools ──
  // Use registerTool with explicit inputSchema to avoid server.tool() overload
  // ambiguity. z.object({}).passthrough() preserves all tool arguments.

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: z.object({}).passthrough(),
      },
      async (args: Record<string, unknown>) => {
        const result = await tool.handler(args);
        return result as any;
      },
    );
  }

  // ── Resources ──

  // Static: translations
  server.resource(
    'translations',
    'theologai://translations',
    { description: 'Available Bible translations with descriptions', mimeType: 'text/markdown' },
    async () => {
      const translations = services.bibleService.getSupportedTranslations();
      const lines = [
        '# Available Bible Translations\n',
        ...translations.map(t => `- **${t}**`),
        `\n*${translations.length} translations available.*`,
      ];
      return { contents: [{ uri: 'theologai://translations', mimeType: 'text/markdown', text: lines.join('\n') }] };
    },
  );

  // Static: commentaries
  server.resource(
    'commentaries',
    'theologai://commentaries',
    { description: 'Available commentary authors with coverage info', mimeType: 'text/markdown' },
    async () => {
      const commentators = services.commentaryService.getAvailableCommentators();
      const lines = [
        '# Available Commentaries\n',
        ...commentators.map(c => `- **${c}**`),
        `\n*${commentators.length} commentators available via HelloAO. Public domain.*`,
      ];
      return { contents: [{ uri: 'theologai://commentaries', mimeType: 'text/markdown', text: lines.join('\n') }] };
    },
  );

  // Template: documents/{slug}
  server.resource(
    'document',
    new ResourceTemplate('theologai://documents/{slug}', {
      list: async () => {
        const docs = await services.historicalService.listDocuments();
        return {
          resources: docs.map(doc => ({
            uri: `theologai://documents/${doc.id}`,
            name: doc.title,
            description: `${doc.type} (${doc.date || 'undated'})`,
            mimeType: 'text/markdown' as const,
          })),
        };
      },
    }),
    { description: 'A creed, confession, or catechism from the TheologAI collection', mimeType: 'text/markdown' },
    async (uri, { slug }) => {
      const doc = await services.historicalService.getDocument(slug as string);
      const sections = await services.historicalService.getSections(doc.id);
      const lines = [
        `# ${doc.title}\n`,
        `**Type:** ${doc.type}`,
        doc.date ? `**Date:** ${doc.date}` : '',
        '',
      ];
      for (const section of sections) {
        if (section.title) {
          lines.push(`## ${section.section_number ? `${section.section_number}. ` : ''}${section.title}\n`);
        }
        lines.push(section.content);
        lines.push('');
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: lines.filter(Boolean).join('\n') }] };
    },
  );

  // Template: strongs/{number}
  server.resource(
    'strongs-entry',
    new ResourceTemplate('theologai://strongs/{number}', { list: undefined }),
    { description: "Look up a Strong's concordance entry (e.g. G26, H430)", mimeType: 'text/markdown' },
    async (uri, { number }) => {
      const entry = await services.strongsService.lookup(number as string, true);
      const lines = [
        `# ${entry.strongs_number} — ${entry.lemma}\n`,
        entry.transliteration ? `**Transliteration:** ${entry.transliteration}` : '',
        entry.pronunciation ? `**Pronunciation:** ${entry.pronunciation}` : '',
        `**Testament:** ${entry.testament === 'OT' ? 'Old Testament (Hebrew)' : 'New Testament (Greek)'}`,
        `\n## Definition\n`,
        entry.definition,
      ];
      if (entry.derivation) {
        lines.push(`\n## Derivation\n`, entry.derivation);
      }
      if (entry.extended?.senses) {
        lines.push(`\n## Senses\n`);
        for (const [key, sense] of Object.entries(entry.extended.senses)) {
          lines.push(`- **${key}:** ${sense.gloss} (${sense.count}x) — ${sense.usage}`);
        }
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: lines.filter(Boolean).join('\n') }] };
    },
  );

  // ── Prompts ──

  server.prompt(
    'word-study',
    "Guided Greek/Hebrew word study using Strong's concordance, morphology, and lexicon data",
    { word: z.string().describe('The English word, Greek/Hebrew term, or Strong\'s number'), testament: z.string().optional().describe('Focus on OT (Hebrew) or NT (Greek)') },
    async ({ word, testament }) => {
      const isStrongs = /^[GHgh]\d+/.test(word);
      const testamentHint = testament ? ` Focus on the ${testament === 'OT' ? 'Hebrew (Old Testament)' : 'Greek (New Testament)'}.` : '';
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Conduct a thorough word study on "${word}".${testamentHint}\n\nFollow this methodology:\n\n1. **Identify the original term**\n   ${isStrongs ? `- Use \`original_language_lookup\` with strongs_number="${word}" and include_extended=true` : `- Search for the Strong's number: use \`original_language_lookup\` to search for "${word}"`}\n   - Note the lemma, transliteration, and core definition\n\n2. **Examine morphological usage**\n   - Find a key verse and use \`bible_verse_morphology\`\n\n3. **Study contextual meaning**\n   - Use \`bible_lookup\` on 2-3 key passages\n\n4. **Cross-references**\n   - Use \`bible_cross_references\` on a key verse\n\n5. **Synthesis**\n   - Semantic range, theological significance`,
          },
        }],
      };
    },
  );

  server.prompt(
    'passage-exegesis',
    'Systematic exegesis of a Bible passage',
    { reference: z.string().describe('Bible reference (e.g. "John 3:16")'), translation: z.string().optional().describe('Primary translation. Default: ESV.') },
    async ({ reference, translation }) => {
      const trans = translation || 'ESV';
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Perform a systematic exegesis of ${reference}.\n\n1. **Read** — \`bible_lookup\` with "${trans}" and KJV\n2. **Original language** — \`bible_verse_morphology\` + \`original_language_lookup\`\n3. **Cross-references** — \`bible_cross_references\` + \`parallel_passages\`\n4. **Commentaries** — \`commentary_lookup\` with 2+ commentators\n5. **Historical theology** — \`classic_text_lookup\`\n6. **Synthesis** — Meaning, key decisions, applications`,
          },
        }],
      };
    },
  );

  server.prompt(
    'compare-translations',
    'Compare a passage across multiple Bible translations',
    { reference: z.string().describe('Bible reference'), translations: z.string().optional().describe('Comma-separated translations. Default: ESV,KJV,NET,BSB.') },
    async ({ reference, translations }) => {
      const transList = translations || 'ESV,KJV,NET,BSB';
      const transArray = transList.split(',').map(t => t.trim());
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Compare ${reference} across translations.\n\n1. **Retrieve** each: ${transArray.map(t => `\`bible_lookup\` with "${t}"`).join(', ')}\n2. **Original language** — \`bible_verse_morphology\`\n3. **Investigate divergences** — \`original_language_lookup\`\n4. **Summary table** — Key differences, literal vs. dynamic, theological choices`,
          },
        }],
      };
    },
  );

  server.prompt(
    'confession-study',
    'Cross-tradition doctrinal comparison across creeds, confessions, and catechisms',
    { topic: z.string().describe('The doctrine or topic to compare'), traditions: z.string().optional().describe('Comma-separated traditions to focus on') },
    async ({ topic, traditions }) => {
      const traditionsHint = traditions ? ` Focus on: ${traditions.split(',').map(t => t.trim()).join(', ')}.` : '';
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Cross-tradition doctrinal comparison on "${topic}".${traditionsHint}\n\n1. **Identify documents** — \`classic_text_lookup\` with listWorks=true\n2. **Search** — \`classic_text_lookup\` with query="${topic}"\n3. **Read sections** — Browse specific documents\n4. **Biblical foundations** — \`bible_lookup\` + \`bible_cross_references\`\n5. **Comparison** — Agreement, divergence, Scripture, historical context`,
          },
        }],
      };
    },
  );

  return server;
}
