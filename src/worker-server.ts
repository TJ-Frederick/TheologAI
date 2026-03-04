/**
 * Workers MCP server using the low-level Server class.
 *
 * Uses setRequestHandler() to pass tool JSON Schemas through directly
 * (McpServer.registerTool() only handles Zod schemas at runtime).
 *
 * Registers all 7 tools, 4 resources, 4 prompts.
 * Consumed by createMcpHandler() in worker.ts.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { WorkerCompositionRoot } from './tools/worker/index.js';

export function createWorkerMcpServer(root: WorkerCompositionRoot, version: string): Server {
  const server = new Server(
    { name: 'theologai-bible-server', version },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
    },
  );

  const { tools, services } = root;

  // ── Tools (JSON Schema passed through directly) ──

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return await tool.handler(args ?? {}) as any;
  });

  // ── Resources ──

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources: Array<{
      uri: string;
      name: string;
      description?: string;
      mimeType?: string;
    }> = [];

    // Translations list
    resources.push({
      uri: 'theologai://translations',
      name: 'Bible Translations',
      description: 'Available Bible translations with descriptions',
      mimeType: 'text/markdown',
    });

    // Commentaries list
    resources.push({
      uri: 'theologai://commentaries',
      name: 'Commentaries',
      description: 'Available commentary authors with coverage info',
      mimeType: 'text/markdown',
    });

    // Individual historical documents
    try {
      const docs = await services.historicalService.listDocuments();
      for (const doc of docs) {
        resources.push({
          uri: `theologai://documents/${doc.id}`,
          name: doc.title,
          description: `${doc.type} (${doc.date || 'undated'})`,
          mimeType: 'text/markdown',
        });
      }
    } catch {
      // Historical documents unavailable — skip
    }

    return { resources };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      {
        uriTemplate: 'theologai://documents/{slug}',
        name: 'Historical Document',
        description: 'A creed, confession, or catechism from the TheologAI collection',
        mimeType: 'text/markdown',
      },
      {
        uriTemplate: 'theologai://strongs/{number}',
        name: "Strong's Dictionary Entry",
        description: "Look up a Strong's concordance entry (e.g. G26, H430)",
        mimeType: 'text/markdown',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // theologai://translations
    if (uri === 'theologai://translations') {
      const translations = services.bibleService.getSupportedTranslations();
      const lines = [
        '# Available Bible Translations\n',
        ...translations.map(t => `- **${t}**`),
        `\n*${translations.length} translations available.*`,
      ];
      return {
        contents: [{ uri, mimeType: 'text/markdown', text: lines.join('\n') }],
      };
    }

    // theologai://commentaries
    if (uri === 'theologai://commentaries') {
      const commentators = services.commentaryService.getAvailableCommentators();
      const lines = [
        '# Available Commentaries\n',
        ...commentators.map(c => `- **${c}**`),
        `\n*${commentators.length} commentators available via HelloAO. Public domain.*`,
      ];
      return {
        contents: [{ uri, mimeType: 'text/markdown', text: lines.join('\n') }],
      };
    }

    // theologai://documents/{slug}
    const docMatch = uri.match(/^theologai:\/\/documents\/(.+)$/);
    if (docMatch) {
      const slug = docMatch[1];
      const doc = await services.historicalService.getDocument(slug);
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

      return {
        contents: [{ uri, mimeType: 'text/markdown', text: lines.filter(Boolean).join('\n') }],
      };
    }

    // theologai://strongs/{number}
    const strongsMatch = uri.match(/^theologai:\/\/strongs\/([GHgh]\d+[a-z]?)$/);
    if (strongsMatch) {
      const number = strongsMatch[1].toUpperCase();
      const entry = await services.strongsService.lookup(number, true);

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

      return {
        contents: [{ uri, mimeType: 'text/markdown', text: lines.filter(Boolean).join('\n') }],
      };
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  });

  // ── Prompts ──

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'word-study',
        description: "Guided Greek/Hebrew word study using Strong's concordance, morphology, and lexicon data",
        arguments: [
          { name: 'word', description: 'The English word, Greek/Hebrew term, or Strong\'s number (e.g. "love", "agape", "G26")', required: true },
          { name: 'testament', description: 'Focus on OT (Hebrew) or NT (Greek). Default: auto-detect.', required: false },
        ],
      },
      {
        name: 'passage-exegesis',
        description: 'Systematic exegesis of a Bible passage: text, cross-references, commentary, and original language analysis',
        arguments: [
          { name: 'reference', description: 'Bible reference (e.g. "John 3:16", "Romans 8:28-30")', required: true },
          { name: 'translation', description: 'Primary translation. Default: ESV.', required: false },
        ],
      },
      {
        name: 'compare-translations',
        description: 'Compare a passage across multiple Bible translations to highlight differences in rendering',
        arguments: [
          { name: 'reference', description: 'Bible reference (e.g. "Philippians 2:6-8")', required: true },
          { name: 'translations', description: 'Comma-separated list of translations. Default: ESV,KJV,NET,BSB.', required: false },
        ],
      },
      {
        name: 'confession-study',
        description: 'Cross-tradition doctrinal comparison across creeds, confessions, and catechisms',
        arguments: [
          { name: 'topic', description: 'The doctrine or topic to compare', required: true },
          { name: 'traditions', description: 'Comma-separated traditions to focus on', required: false },
        ],
      },
      {
        name: 'donate',
        description: 'Guide for donating to support TheologAI development',
        arguments: [],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'word-study': {
        const word = args?.word ?? '';
        const testament = args?.testament;
        const isStrongs = /^[GHgh]\d+/.test(word);
        const testamentHint = testament
          ? ` Focus on the ${testament === 'OT' ? 'Hebrew (Old Testament)' : 'Greek (New Testament)'}.`
          : '';
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Conduct a thorough word study on "${word}".${testamentHint}

Follow this methodology:

1. **Identify the original term**
   ${isStrongs
      ? `- Use \`original_language_lookup\` with strongs_number="${word}" and include_extended=true`
      : `- Search for the Strong's number: use \`original_language_lookup\` to search for "${word}"`}
   - Note the lemma, transliteration, and core definition

2. **Examine morphological usage**
   - Find a key verse where this word appears
   - Use \`bible_verse_morphology\` to see exactly how the word is used grammatically
   - Note the morphological form (tense, voice, mood for verbs; case, number for nouns)

3. **Study contextual meaning**
   - Use \`bible_lookup\` to read 2-3 key passages where this word is significant
   - Compare how different translations render it using multiple translations

4. **Explore related cross-references**
   - Use \`bible_cross_references\` on a key verse to find thematic connections

5. **Synthesis**
   - Summarize the semantic range of the word
   - Note any theological significance
   - Identify common English translations and their nuances`,
            },
          }],
        };
      }

      case 'passage-exegesis': {
        const reference = args?.reference ?? '';
        const trans = args?.translation || 'ESV';
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Perform a systematic exegesis of ${reference}.

Follow this methodology:

1. **Read the text**
   - Use \`bible_lookup\` with reference="${reference}" and translation="${trans}" (include footnotes)
   - Also read in KJV for comparison

2. **Examine the original language**
   - Use \`bible_verse_morphology\` on the passage (or key verses if it's a range)
   - Identify theologically significant words and their grammatical forms
   - Use \`original_language_lookup\` for any key terms (with include_extended=true)

3. **Explore cross-references**
   - Use \`bible_cross_references\` to find related passages
   - Use \`parallel_passages\` to find synoptic parallels or OT quotations

4. **Consult commentaries**
   - Use \`commentary_lookup\` with at least 2 commentators (e.g. Matthew Henry, John Gill)
   - Note areas of agreement and divergence

5. **Check historical theology**
   - Use \`classic_text_lookup\` to search for how historic creeds/confessions address the themes in this passage

6. **Synthesis**
   - Summarize the passage's meaning in its original context
   - Note key interpretive decisions and their implications
   - Suggest application points`,
            },
          }],
        };
      }

      case 'compare-translations': {
        const reference = args?.reference ?? '';
        const transList = args?.translations || 'ESV,KJV,NET,BSB';
        const transArray = transList.split(',').map(t => t.trim());
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Compare ${reference} across multiple Bible translations.

1. **Retrieve the passage in each translation**
   ${transArray.map(t => `- Use \`bible_lookup\` with reference="${reference}" and translation="${t}"`).join('\n   ')}

2. **Examine the original language**
   - Use \`bible_verse_morphology\` to get the word-by-word analysis
   - Identify words where translations diverge

3. **For each divergence, investigate**
   - Use \`original_language_lookup\` on the Strong's number to understand the semantic range
   - Explain why different translations made different choices

4. **Summary table**
   - Create a comparison highlighting key differences
   - Note which renderings are more literal vs. dynamic
   - Identify any theologically significant translation choices`,
            },
          }],
        };
      }

      case 'confession-study': {
        const topic = args?.topic ?? '';
        const traditions = args?.traditions;
        const traditionsHint = traditions
          ? ` Focus on: ${traditions.split(',').map(t => t.trim()).join(', ')}.`
          : '';
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Cross-tradition doctrinal comparison on "${topic}".${traditionsHint}

1. **Identify documents** — \`classic_text_lookup\` with listWorks=true
2. **Search** — \`classic_text_lookup\` with query="${topic}"
3. **Read sections** — Browse specific documents
4. **Biblical foundations** — \`bible_lookup\` + \`bible_cross_references\`
5. **Comparison** — Agreement, divergence, Scripture, historical context`,
            },
          }],
        };
      }

      case 'donate':
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `The user wants to donate to TheologAI. Guide them through the options:

**TheologAI Donations**

Donations help support TheologAI's development and are entirely voluntary — all features are free regardless.

**Easiest option:** Donate via the web at [theologai.pages.dev](https://theologai.pages.dev/), which has a donation section with wallet connection support.

**Manual transfer options:**
- USDC or ETH on Base
- USDC or ETH on Ethereum
- SBC on Radius

Recipient address: \`0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04\`

---

If the user has a wallet MCP tool available, you can help them send a transaction directly — call \`donation_config\` with format="technical" to get the contract addresses and chain details needed.`,
            },
          }],
        };

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  return server;
}
