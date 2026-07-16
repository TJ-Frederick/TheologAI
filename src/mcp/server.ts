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
import { parseStrongsIdentity } from '../kernel/strongs.js';
import { parseLocalDocumentResourceUri } from '../kernel/documentResource.js';
import { formatLocalDocumentResource, formatLocalDocumentSectionResource } from '../formatters/historicalFormatter.js';
import type { ToolHandler } from '../kernel/types.js';
import type { BibleService } from '../services/bible/BibleService.js';
import type { CommentaryService } from '../services/commentary/CommentaryService.js';
import type { HistoricalDocumentService } from '../services/historical/HistoricalDocumentService.js';
import type { StrongsService } from '../services/languages/StrongsService.js';
import { internalError, resourceNotFound } from './errors.js';
import { registerPromptHandlers } from './prompts.js';
import { registerToolHandlers } from './tools.js';
import { jsonSchemaValidator } from './validation.js';
import { buildPrimarySourceCatalog, PRIMARY_SOURCE_CATALOG_URI } from './primarySourceCatalog.js';
import { COMMENTARY_CATALOG } from '../kernel/commentaryCatalog.js';
import type { PrimarySourceContractConfig } from '../kernel/featureFlags.js';

export interface McpServerServices {
  bibleService: Pick<BibleService, 'getSupportedTranslations'>;
  commentaryService: Pick<CommentaryService, 'getAvailableCommentators'>;
  historicalService: Pick<HistoricalDocumentService, 'listDocuments' | 'getDocument' | 'getSections' | 'getSection'>;
  strongsService: Pick<StrongsService, 'lookup'>;
}

export interface McpCompositionRoot {
  tools: ToolHandler[];
  services: McpServerServices;
  primarySourceContract: PrimarySourceContractConfig;
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
  assertPrimarySourceContractParity(root);
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
      resources.push({
        uri: PRIMARY_SOURCE_CATALOG_URI,
        name: 'Local Primary-source Catalog',
        description: 'Reviewed metadata for works hosted in the local primary-source collection',
        mimeType: 'application/json',
      });
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
      const lines = [
        '# Available Commentaries\n',
        ...COMMENTARY_CATALOG.map(entry =>
          `- **${entry.canonicalName}** — ${entry.publicCoverageDescription}.`),
        '\n*Exact-verse (scalar) coverage varies by commentary provider. When an exact match is unavailable, request the containing chapter or another commentator; chapter results must remain labeled as chapter-level commentary.*',
        `\n*${COMMENTARY_CATALOG.length} commentators available via HelloAO. Licensing varies by work; tool results include attribution and provenance.*`,
      ];
      return {
        contents: [{ uri, mimeType: 'text/markdown', text: lines.join('\n') }],
      };
    }

    if (uri === PRIMARY_SOURCE_CATALOG_URI) {
      try {
        const catalog = buildPrimarySourceCatalog(await services.historicalService.listDocuments());
        return {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(catalog, null, 2) }],
        };
      } catch {
        throw internalError('Unable to read resource');
      }
    }

    // theologai://documents/{slug}[#section-{sectionNumber}]
    const documentResource = parseLocalDocumentResourceUri(uri);
    if (documentResource) {
      try {
        const doc = await services.historicalService.getDocument(documentResource.documentId);

        if (documentResource.sectionId !== undefined) {
          if (doc.id !== documentResource.documentId) throw new NotFoundError('document', 'Exact document resource identity did not match.');
          const section = await services.historicalService.getSection(doc.id, documentResource.sectionId);
          return {
            contents: [{
              uri,
              mimeType: 'text/markdown',
              text: formatLocalDocumentSectionResource(doc, section),
            }],
          };
        }

        const sections = await services.historicalService.getSections(doc.id);

        return {
          contents: [{ uri, mimeType: 'text/markdown', text: formatLocalDocumentResource(doc, sections) }],
        };
      } catch (error) {
        if (error instanceof NotFoundError) throw resourceNotFound(uri);
        throw internalError('Unable to read resource');
      }
    }

    // theologai://strongs/{number}
    const strongsMatch = uri.match(/^theologai:\/\/strongs\/([^/]+)$/);
    const strongsIdentity = strongsMatch ? parseStrongsIdentity(strongsMatch[1]) : undefined;
    if (strongsIdentity) {
      try {
        const entry = await services.strongsService.lookup(strongsIdentity.publicId, true);

        const lines = [
          `# ${entry.strongs_number} — ${entry.lemma}\n`,
          entry.transliteration ? `**Transliteration:** ${entry.transliteration}` : '',
          entry.pronunciation ? `**Pronunciation:** ${entry.pronunciation}` : '',
          `**Testament:** ${entry.testament === 'OT'
            ? 'Old Testament (Hebrew)'
            : entry.testament === 'NT'
              ? 'New Testament (Greek)'
              : 'Not classified (source-language lexicon identity)'}`,
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

  registerPromptHandlers(server, root.primarySourceContract);

  return mcpServer;
}

function assertPrimarySourceContractParity(root: McpCompositionRoot): void {
  const tool = root.tools.find(candidate => candidate.name === 'primary_source_search');
  if (!tool) return;
  const advertisedVersion = (tool.outputSchema?.properties?.schemaVersion as { const?: unknown } | undefined)?.const;
  const expectedOpenWorld = root.primarySourceContract.contractVersion === '4';
  if (advertisedVersion !== root.primarySourceContract.contractVersion
    || tool.annotations?.openWorldHint !== expectedOpenWorld) {
    throw new Error('primary_source_search tool and guided-prompt contracts must use the same configuration.');
  }
}
