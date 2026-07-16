/**
 * Tool registry (v2) — composition root.
 *
 * Creates all adapters, repositories, services, and tool handlers.
 * This is the single wiring point for dependency injection.
 */

import type Database from 'better-sqlite3';
import type { ToolHandler } from '../../kernel/types.js';

// Adapters — Bible
import { EsvAdapter } from '../../adapters/bible/EsvAdapter.js';
import { NetBibleAdapter } from '../../adapters/bible/NetBibleAdapter.js';
import { HelloAoAdapter } from '../../adapters/bible/HelloAoAdapter.js';

// Adapters — Commentary
import { HelloAoCommentaryAdapter } from '../../adapters/commentary/HelloAoCommentaryAdapter.js';
import { CcelSearchAdapter } from '../../adapters/commentary/CcelSearchAdapter.js';

// Repositories (SQLite-backed)
import { CrossReferenceRepository } from '../../adapters/data/CrossReferenceRepository.js';
import { StrongsRepository } from '../../adapters/data/StrongsRepository.js';
import { MorphologyRepository } from '../../adapters/data/MorphologyRepository.js';
import { HistoricalDocumentRepository } from '../../adapters/data/HistoricalDocumentRepository.js';
import { loadUbsParallelPassageRepository } from '../../adapters/data/loadUbsParallelPassages.js';

// Services
import { BibleService } from '../../services/bible/BibleService.js';
import { CrossReferenceService } from '../../services/bible/CrossReferenceService.js';
import { ParallelPassageService } from '../../services/bible/ParallelPassageService.js';
import { CommentaryService } from '../../services/commentary/CommentaryService.js';
import { HistoricalDocumentService } from '../../services/historical/HistoricalDocumentService.js';
import { LocalPrimarySourceSearchProvider } from '../../services/historical/LocalPrimarySourceSearchProvider.js';
import { PrimarySourceSearchService } from '../../services/historical/PrimarySourceSearchService.js';
import { StrongsService } from '../../services/languages/StrongsService.js';
import { MorphologyService } from '../../services/languages/MorphologyService.js';
import { OriginalLanguageStudyService } from '../../services/languages/OriginalLanguageStudyService.js';
import { SourceAttestedParallelService } from '../../services/bible/SourceAttestedParallelService.js';

import { createToolRegistry } from '../toolRegistry.js';

// Donation
import { OnChainVerifier } from '../../adapters/donation/OnChainVerifier.js';
import { DonationService } from '../../services/donation/DonationService.js';

import { getDatabase } from '../../adapters/shared/Database.js';
import { readPrimarySourceFeatureFlags } from '../../kernel/featureFlags.js';
import { ProcessLocalCcelUpstreamCoordinator } from '../../services/historical/CcelUpstreamCoordinator.js';

/** Services exposed for MCP Resources / Prompts (Phase 5+) */
export interface ServerServices {
  bibleService: BibleService;
  commentaryService: CommentaryService;
  historicalService: HistoricalDocumentService;
  strongsService: StrongsService;
  sourceAttestedParallelService: SourceAttestedParallelService;
}

/** Result of the composition root wiring */
export interface CompositionRoot {
  tools: ToolHandler[];
  services: ServerServices;
  primarySourceContract: ReturnType<typeof readPrimarySourceFeatureFlags>;
}

export interface CompositionRootOptions {
  /** Explicit database injection for isolated runtimes and clean-checkout tests. */
  database?: Database.Database;
}

// One cache/executor and one process-local budget per Node process. Multi-process
// deployments must keep live discovery disabled unless they provide a shared
// coordinator outside this composition root.
const nodeCcelSearchAdapter = new CcelSearchAdapter({
  enabled: true,
  telemetry: event => console.error(JSON.stringify(event)),
});
const nodeCcelCoordinator = new ProcessLocalCcelUpstreamCoordinator({ enabled: true });

/**
 * Create all tool handlers and services with fully-wired dependency graph.
 */
export function createCompositionRoot(options: CompositionRootOptions = {}): CompositionRoot {
  // Database
  const db = options.database ?? getDatabase();

  // Repositories
  const crossRefRepo = new CrossReferenceRepository(db);
  const strongsRepo = new StrongsRepository(db);
  const morphRepo = new MorphologyRepository(db);
  const historicalRepo = new HistoricalDocumentRepository(db);
  const sourceAttestedParallelRepo = loadUbsParallelPassageRepository();

  // Bible adapters
  const esvAdapter = new EsvAdapter();
  const netAdapter = new NetBibleAdapter();
  const helloaoAdapter = new HelloAoAdapter();

  // Commentary adapters
  const helloaoCommentary = new HelloAoCommentaryAdapter();
  const primarySourceContract = readPrimarySourceFeatureFlags({
    THEOLOGAI_EXPOSE_CCEL_DISCOVERY: process.env.THEOLOGAI_EXPOSE_CCEL_DISCOVERY,
    THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH: process.env.THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH,
    THEOLOGAI_ENABLE_CCEL_COORDINATOR: process.env.THEOLOGAI_ENABLE_CCEL_COORDINATOR,
  });

  // Services
  const bibleService = new BibleService([esvAdapter, netAdapter, helloaoAdapter]);
  const crossRefService = new CrossReferenceService(crossRefRepo);
  const sourceAttestedParallelService = new SourceAttestedParallelService(sourceAttestedParallelRepo);
  const parallelService = new ParallelPassageService(
    crossRefRepo, bibleService, undefined, undefined, sourceAttestedParallelService,
  );
  const commentaryService = new CommentaryService([helloaoCommentary]);
  const historicalService = new HistoricalDocumentService(historicalRepo);
  const primarySourceSearchService = new PrimarySourceSearchService(
    new LocalPrimarySourceSearchProvider(historicalRepo),
    nodeCcelSearchAdapter,
    primarySourceContract,
    primarySourceContract.liveCcelEnabled ? nodeCcelCoordinator : undefined,
  );
  const strongsService = new StrongsService(strongsRepo, morphRepo);
  const morphService = new MorphologyService(morphRepo);
  const originalLanguageStudyService = new OriginalLanguageStudyService(morphRepo, strongsRepo);

  // Donation (no DB dependency)
  const onChainVerifier = new OnChainVerifier({});
  const donationService = new DonationService(onChainVerifier);

  // Tool handlers
  const tools = createToolRegistry({
    bibleService,
    crossReferenceService: crossRefService,
    parallelPassageService: parallelService,
    commentaryService,
    historicalService,
    primarySourceSearchService,
    primarySourceContract,
    strongsService,
    morphologyService: morphService,
    originalLanguageStudyService,
    donationService,
  });

  return {
    tools,
    services: { bibleService, commentaryService, historicalService, strongsService, sourceAttestedParallelService },
    primarySourceContract,
  };
}

/** Find a tool by name */
export function getToolByName(tools: ToolHandler[], name: string): ToolHandler | undefined {
  return tools.find(t => t.name === name);
}
