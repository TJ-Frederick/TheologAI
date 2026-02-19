import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
import { createCompositionRoot, getToolByName } from './tools/v2/index.js';
import type { ServerServices } from './tools/v2/index.js';
import type { ToolHandler } from './kernel/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

export class BibleMCPServer {
  private server: Server;
  private tools: ToolHandler[];
  private services: ServerServices;

  constructor() {
    const root = createCompositionRoot();
    this.tools = root.tools;
    this.services = root.services;

    this.server = new Server(
      {
        name: 'theologai-bible-server',
        version: pkg.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();
  }

  // ── Logging helper ──

  private log(level: 'debug' | 'info' | 'warning' | 'error', message: string, data?: unknown): void {
    this.server.sendLoggingMessage({
      level,
      logger: 'theologai',
      data: data ? { message, ...((typeof data === 'object' && data !== null) ? data : { detail: data }) } : message,
    }).catch(() => {
      // Fallback if not connected yet
    });
  }

  // ── Tool handlers ──

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        }))
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = getToolByName(this.tools, name);
      if (!tool) {
        throw new Error(`Tool "${name}" not found`);
      }

      try {
        this.log('debug', `Executing tool: ${name}`);
        const result = await tool.handler(args ?? {});
        this.log('debug', `Tool ${name} completed`);
        return result as any;
      } catch (error) {
        this.log('error', `Error executing tool ${name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }

  // ── Resource handlers ──

  private setupResourceHandlers(): void {
    // Static resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
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
        const docs = this.services.historicalService.listDocuments();
        for (const doc of docs) {
          resources.push({
            uri: `theologai://documents/${doc.id}`,
            name: doc.title,
            description: `${doc.type} (${doc.date || 'undated'})`,
            mimeType: 'text/markdown',
          });
        }
      } catch {
        this.log('warning', 'Failed to list historical documents for resources');
      }

      return { resources };
    });

    // Resource templates (parameterized)
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      return {
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
      };
    });

    // Read a specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      this.log('debug', `Reading resource: ${uri}`);

      // theologai://translations
      if (uri === 'theologai://translations') {
        const translations = this.services.bibleService.getSupportedTranslations();
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
        const commentators = this.services.commentaryService.getAvailableCommentators();
        const lines = [
          '# Available Commentaries\n',
          ...commentators.map(c => `- **${c}**`),
          `\n*${commentators.length} commentators available via HelloAO (bible.helloao.org). Public domain.*`,
        ];
        return {
          contents: [{ uri, mimeType: 'text/markdown', text: lines.join('\n') }],
        };
      }

      // theologai://documents/{slug}
      const docMatch = uri.match(/^theologai:\/\/documents\/(.+)$/);
      if (docMatch) {
        const slug = docMatch[1];
        const doc = this.services.historicalService.getDocument(slug);
        const sections = this.services.historicalService.getSections(doc.id);

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
        const entry = this.services.strongsService.lookup(number, true);

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
  }

  // ── Prompt handlers ──

  private setupPromptHandlers(): void {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'word-study',
            description: 'Guided Greek/Hebrew word study using Strong\'s concordance, morphology, and lexicon data',
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
        ],
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      this.log('debug', `Getting prompt: ${name}`);

      switch (name) {
        case 'word-study':
          return this.getWordStudyPrompt(args?.word ?? '', args?.testament);

        case 'passage-exegesis':
          return this.getPassageExegesisPrompt(args?.reference ?? '', args?.translation);

        case 'compare-translations':
          return this.getCompareTranslationsPrompt(args?.reference ?? '', args?.translations);

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });
  }

  private getWordStudyPrompt(word: string, testament?: string) {
    const isStrongs = /^[GHgh]\d+/.test(word);
    const testamentHint = testament
      ? ` Focus on the ${testament === 'OT' ? 'Hebrew (Old Testament)' : 'Greek (New Testament)'}.`
      : '';

    return {
      description: `Word study for "${word}"`,
      messages: [
        {
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
        },
      ],
    };
  }

  private getPassageExegesisPrompt(reference: string, translation?: string) {
    const trans = translation || 'ESV';

    return {
      description: `Systematic exegesis of ${reference}`,
      messages: [
        {
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
        },
      ],
    };
  }

  private getCompareTranslationsPrompt(reference: string, translations?: string) {
    const transList = translations || 'ESV,KJV,NET,BSB';
    const transArray = transList.split(',').map(t => t.trim());

    return {
      description: `Translation comparison of ${reference}`,
      messages: [
        {
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
        },
      ],
    };
  }

  getServer(): Server {
    return this.server;
  }

  async connect(transport: any): Promise<void> {
    this.log('info', 'TheologAI server connecting');
    await this.server.connect(transport);
  }
}
