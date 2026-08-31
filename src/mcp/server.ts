/**
 * Shared MCP protocol registration for both Node.js and Cloudflare Workers.
 *
 * The low-level v2 Server keeps the advertised JSON Schemas, deterministic
 * lists, and error taxonomy under one dual-era registry without implicitly
 * advertising list-change notifications that this stateless service cannot
 * deliver.
 */

import {
  ProtocolError,
  Server,
  type JSONRPCRequest,
  type Result,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { NotFoundError } from '../kernel/errors.js';
import { parseStrongsIdentity } from '../kernel/strongs.js';
import { buildLocalDocumentResourceUri, parseLocalDocumentResourceUri } from '../kernel/documentResource.js';
import { formatLocalDocumentResource, formatLocalDocumentSectionResourceWithIdentity, formatSectionedDocumentLanding } from '../formatters/historicalFormatter.js';
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
import type { PrimarySourceSearchBinding } from '../tools/v2/primarySourceSearch.js';

export class TheologAiMcpServer extends Server {
  /** Temporary source-compatible view for callers that previously received McpServer. */
  get server(): Server {
    return this;
  }

  protected override _wrapHandler(
    method: string,
    handler: (request: JSONRPCRequest, ctx: ServerContext) => Promise<Result>,
  ): (request: JSONRPCRequest, ctx: ServerContext) => Promise<Result> {
    const wrapped = super._wrapHandler(method, handler);
    return async (request, ctx) => {
      try {
        return await wrapped(request, ctx);
      } catch (error) {
        if (error instanceof ProtocolError) throw error;
        throw internalError();
      }
    };
  }
}

export interface McpServerServices {
  bibleService: Pick<BibleService, 'getSupportedTranslations'>;
  commentaryService: Pick<CommentaryService, 'getAvailableCommentators'>;
  historicalService: Pick<HistoricalDocumentService, 'listDocuments' | 'getDocument' | 'getSections' | 'getDeliveryProfile' | 'resolveSection'>;
  strongsService: Pick<StrongsService, 'lookup'>;
}

export interface McpCompositionRoot {
  tools: ToolHandler[];
  services: McpServerServices;
  primarySourceContract: PrimarySourceContractConfig;
  primarySourceSearch: PrimarySourceSearchBinding;
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
  era: 'legacy' | 'modern' = 'legacy',
): TheologAiMcpServer {
  assertPrimarySourceContractParity(root);
  const legacyLogging = profile.logging && era === 'legacy';
  const server = new TheologAiMcpServer(
    { name: 'theologai-bible-server', version },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        ...(legacyLogging ? { logging: {} } : {}),
      },
      jsonSchemaValidator,
      cacheHints: {
        'server/discover': { ttlMs: 0, cacheScope: 'private' },
        'tools/list': { ttlMs: 0, cacheScope: 'private' },
        'prompts/list': { ttlMs: 0, cacheScope: 'private' },
        'resources/list': { ttlMs: 0, cacheScope: 'private' },
        'resources/templates/list': { ttlMs: 0, cacheScope: 'private' },
        'resources/read': { ttlMs: 0, cacheScope: 'private' },
      },
    },
  );

  const { tools, services } = root;
  registerToolHandlers(server, tools, legacyLogging);

  // ── Resources ──

  server.setRequestHandler('resources/list', async () => {
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
        const profile = await services.historicalService.getDeliveryProfile(doc.id);
        resources.push({
          uri: `theologai://documents/${doc.id}`,
          name: doc.title,
          description: profile.deliveryMode === 'sectioned_only'
            ? `${doc.type} (${doc.date || 'undated'}); bounded landing, exact canonical sections carry bodies`
            : `${doc.type} (${doc.date || 'undated'}); complete document with canonical exact-section children`,
          mimeType: 'text/markdown',
        });
      }
    } catch {
      if (legacyLogging) {
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

  server.setRequestHandler('resources/templates/list', async () => ({
    resourceTemplates: [
      {
        uriTemplate: 'theologai://documents/{slug}',
        name: 'Historical Document',
        description: 'Historical document landing or complete work; canonical #section-{sectionKey} resources resolve one exact section',
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

  server.setRequestHandler('resources/read', async (request) => {
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
        if (doc.id !== documentResource.documentId) {
          throw new NotFoundError('document', 'Exact document resource identity did not match.');
        }

        const profile = await services.historicalService.getDeliveryProfile(doc.id);
        if (documentResource.sectionId !== undefined) {
          const resolved = await services.historicalService.resolveSection(doc.id, documentResource.sectionId);
          const canonicalUri = buildLocalDocumentResourceUri(doc.id, resolved.sectionKey);
          if (!canonicalUri) throw new NotFoundError('section', 'Canonical section resource identity was invalid.');
          return {
            contents: [{
              uri,
              mimeType: 'text/markdown',
              text: formatLocalDocumentSectionResourceWithIdentity(doc, resolved.section, {
                sectionKey: resolved.sectionKey,
                sourceOrdinal: resolved.sourceOrdinal,
                resolution: resolved.resolution,
                canonicalUri,
                ...(resolved.resolution === 'legacy_alias' ? { requestedUri: uri } : {}),
              }),
              _meta: {
                'theologai/canonicalUri': canonicalUri,
                'theologai/sectionKey': resolved.sectionKey,
                'theologai/sourceOrdinal': resolved.sourceOrdinal,
                'theologai/sectionResolution': resolved.resolution,
              },
            }],
          };
        }

        if (profile.deliveryMode === 'sectioned_only') {
          return {
            contents: [{ uri, mimeType: 'text/markdown', text: formatSectionedDocumentLanding(doc, profile) }],
          };
        }

        const sections = await services.historicalService.getSections(doc.id);

        return {
          contents: [{ uri, mimeType: 'text/markdown', text: formatLocalDocumentResource(doc, sections) }],
        };
      } catch (error) {
        if (error instanceof NotFoundError) throw resourceNotFound(uri, era);
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
          entry.definition ?? 'Semantic evidence unavailable from the retained Hebrew lexicon fields.',
        ];

        if (entry.evidencePolicy && entry.extended?.gloss) {
          lines.push(`\n## Brief gloss\n`, entry.extended.gloss);
        }

        if (entry.evidencePolicy) {
          lines.push(`\n## Evidence policy\n`, entry.evidencePolicy.notice);
        }

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
        if (error instanceof NotFoundError) throw resourceNotFound(uri, era);
        throw internalError('Unable to read resource');
      }
    }

    throw resourceNotFound(uri, era);
  });

  registerPromptHandlers(server, root.primarySourceSearch.descriptor);

  return server;
}

function assertPrimarySourceContractParity(root: McpCompositionRoot): void {
  const { descriptor, tool } = root.primarySourceSearch;
  const named = root.tools.filter(candidate => candidate.name === descriptor.name);
  if (descriptor.name !== 'primary_source_search' || tool.name !== descriptor.name
    || named.length !== 1 || named[0] !== tool) {
    throw new Error('primary_source_search binding must expose its exact named tool exactly once.');
  }
}
