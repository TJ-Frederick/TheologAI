/**
 * Shared MCP protocol registration for both Node.js and Cloudflare Workers.
 *
 * The high-level McpServer is the transport-facing object. Its underlying
 * low-level server is used here so the advertised JSON Schemas, dynamic
 * resource listing, and protocol error taxonomy remain under one registry.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { NotFoundError } from '../kernel/errors.js';
import { LOCAL_HISTORICAL_SOURCE } from '../formatters/historicalFormatter.js';
import type { ToolHandler } from '../kernel/types.js';
import type { BibleService } from '../services/bible/BibleService.js';
import type { CommentaryService } from '../services/commentary/CommentaryService.js';
import type { HistoricalDocumentService } from '../services/historical/HistoricalDocumentService.js';
import type { StrongsService } from '../services/languages/StrongsService.js';
import { internalError, resourceNotFound } from './errors.js';
import { registerPromptHandlers } from './prompts.js';
import { registerToolHandlers } from './tools.js';
import { jsonSchemaValidator } from './validation.js';

export interface McpServerServices {
  bibleService: Pick<BibleService, 'getSupportedTranslations'>;
  commentaryService: Pick<CommentaryService, 'getAvailableCommentators'>;
  historicalService: Pick<HistoricalDocumentService, 'listDocuments' | 'getDocument' | 'getSections'>;
  strongsService: Pick<StrongsService, 'lookup'>;
}

export interface McpCompositionRoot {
  tools: ToolHandler[];
  services: McpServerServices;
}

export interface McpCapabilityProfile {
  /** Stateful stdio can honor logging/setLevel; stateless HTTP cannot. */
  logging: boolean;
}

export const STDIO_CAPABILITIES: McpCapabilityProfile = { logging: true };
export const STATELESS_HTTP_CAPABILITIES: McpCapabilityProfile = { logging: false };

export function createTheologAiMcpServer(
  root: McpCompositionRoot,
  version: string,
  profile: McpCapabilityProfile = STDIO_CAPABILITIES,
): McpServer {
  const mcpServer = new McpServer(
    { name: 'theologai-bible-server', version },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        ...(profile.logging ? { logging: {} } : {}),
      },
      jsonSchemaValidator,
    },
  );
  const server = mcpServer.server;

  const { tools, services } = root;
  registerToolHandlers(server, tools, profile.logging);

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
      if (profile.logging) {
        await server.sendLoggingMessage({
          level: 'warning',
          logger: 'theologai.resources',
          data: { event: 'historical_resources_unavailable' },
        }).catch(() => {
          // Preserve the two static resources even if log delivery is unavailable.
        });
      } else {
        throw internalError('Unable to list resources');
      }
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
        `\n*${commentators.length} commentators available via HelloAO. Licensing varies by work; tool results include attribution.*`,
      ];
      return {
        contents: [{ uri, mimeType: 'text/markdown', text: lines.join('\n') }],
      };
    }

    // theologai://documents/{slug}
    const docMatch = uri.match(/^theologai:\/\/documents\/(.+)$/);
    if (docMatch) {
      try {
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
        lines.push(`*Source: ${LOCAL_HISTORICAL_SOURCE}*`);

        return {
          contents: [{ uri, mimeType: 'text/markdown', text: lines.filter(Boolean).join('\n') }],
        };
      } catch (error) {
        if (error instanceof NotFoundError) throw resourceNotFound(uri);
        throw internalError('Unable to read resource');
      }
    }

    // theologai://strongs/{number}
    const strongsMatch = uri.match(/^theologai:\/\/strongs\/([GHgh]\d+[a-z]?)$/);
    if (strongsMatch) {
      try {
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
      } catch (error) {
        if (error instanceof NotFoundError) throw resourceNotFound(uri);
        throw internalError('Unable to read resource');
      }
    }

    throw resourceNotFound(uri);
  });

  registerPromptHandlers(server);

  return mcpServer;
}
