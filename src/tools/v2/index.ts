/**
 * Tool registry (v2) — composition root.
 *
 * Creates all adapters, repositories, services, and tool handlers.
 * This is the single wiring point for dependency injection.
 */

import type { ToolHandler } from '../../kernel/types.js';

// Adapters — Bible
import { EsvAdapter } from '../../adapters/bible/EsvAdapter.js';
import { NetBibleAdapter } from '../../adapters/bible/NetBibleAdapter.js';
import { HelloAoAdapter } from '../../adapters/bible/HelloAoAdapter.js';

// Adapters — Commentary
import { HelloAoCommentaryAdapter } from '../../adapters/commentary/HelloAoCommentaryAdapter.js';
import { CcelAdapter } from '../../adapters/commentary/CcelAdapter.js';

// Repositories (SQLite-backed)
import { CrossReferenceRepository } from '../../adapters/data/CrossReferenceRepository.js';
import { StrongsRepository } from '../../adapters/data/StrongsRepository.js';
import { MorphologyRepository } from '../../adapters/data/MorphologyRepository.js';
import { HistoricalDocumentRepository } from '../../adapters/data/HistoricalDocumentRepository.js';

// Services
import { BibleService } from '../../services/bible/BibleService.js';
import { CrossReferenceService } from '../../services/bible/CrossReferenceService.js';
import { ParallelPassageService } from '../../services/bible/ParallelPassageService.js';
import { CommentaryService } from '../../services/commentary/CommentaryService.js';
import { CcelService } from '../../services/commentary/CcelService.js';
import { HistoricalDocumentService } from '../../services/historical/HistoricalDocumentService.js';
import { StrongsService } from '../../services/languages/StrongsService.js';
import { MorphologyService } from '../../services/languages/MorphologyService.js';

// Tool handlers
import { createBibleLookupHandler } from './bibleLookup.js';
import { createCrossReferencesHandler } from './crossReferences.js';
import { createParallelPassagesHandler } from './parallelPassages.js';
import { createCommentaryHandler } from './commentary.js';
import { createClassicTextsHandler } from './classicTexts.js';
import { createStrongsLookupHandler } from './strongsLookup.js';
import { createVerseMorphologyHandler } from './verseMorphology.js';

import { getDatabase } from '../../adapters/shared/Database.js';

/** Services exposed for MCP Resources / Prompts (Phase 5+) */
export interface ServerServices {
  bibleService: BibleService;
  commentaryService: CommentaryService;
  historicalService: HistoricalDocumentService;
  strongsService: StrongsService;
}

/** Result of the composition root wiring */
export interface CompositionRoot {
  tools: ToolHandler[];
  services: ServerServices;
}

/**
 * Create all tool handlers and services with fully-wired dependency graph.
 */
export function createCompositionRoot(): CompositionRoot {
  // Database
  const db = getDatabase();

  // Repositories
  const crossRefRepo = new CrossReferenceRepository(db);
  const strongsRepo = new StrongsRepository(db);
  const morphRepo = new MorphologyRepository(db);
  const historicalRepo = new HistoricalDocumentRepository(db);

  // Bible adapters
  const esvAdapter = new EsvAdapter();
  const netAdapter = new NetBibleAdapter();
  const helloaoAdapter = new HelloAoAdapter();

  // Commentary adapters
  const helloaoCommentary = new HelloAoCommentaryAdapter();
  const ccelAdapter = new CcelAdapter();

  // Services
  const bibleService = new BibleService([esvAdapter, netAdapter, helloaoAdapter]);
  const crossRefService = new CrossReferenceService(crossRefRepo);
  const parallelService = new ParallelPassageService(crossRefRepo, helloaoAdapter);
  const commentaryService = new CommentaryService([helloaoCommentary]);
  const ccelService = new CcelService(ccelAdapter);
  const historicalService = new HistoricalDocumentService(historicalRepo);
  const strongsService = new StrongsService(strongsRepo);
  const morphService = new MorphologyService(morphRepo);

  // Tool handlers
  const tools = [
    createBibleLookupHandler(bibleService),
    createCrossReferencesHandler(crossRefService),
    createParallelPassagesHandler(parallelService),
    createCommentaryHandler(commentaryService),
    createClassicTextsHandler(historicalService, ccelService),
    createStrongsLookupHandler(strongsService),
    createVerseMorphologyHandler(morphService),
  ];

  return {
    tools,
    services: { bibleService, commentaryService, historicalService, strongsService },
  };
}

/** Find a tool by name */
export function getToolByName(tools: ToolHandler[], name: string): ToolHandler | undefined {
  return tools.find(t => t.name === name);
}
