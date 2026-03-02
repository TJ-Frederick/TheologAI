/**
 * Workers composition root.
 *
 * Called per-request inside the fetch handler — D1 binding is only
 * available inside the fetch handler, not at module scope.
 */

import type { Env } from '../../worker-env.js';

// D1 repositories
import { D1CrossReferenceRepository } from '../../adapters/d1/D1CrossReferenceRepository.js';
import { D1StrongsRepository } from '../../adapters/d1/D1StrongsRepository.js';
import { D1MorphologyRepository } from '../../adapters/d1/D1MorphologyRepository.js';
import { D1HistoricalDocumentRepository } from '../../adapters/d1/D1HistoricalDocumentRepository.js';

// Bible adapters (HTTP-based, Workers-compatible)
import { EsvAdapter } from '../../adapters/bible/EsvAdapter.js';
import { NetBibleAdapter } from '../../adapters/bible/NetBibleAdapter.js';
import { HelloAoAdapter } from '../../adapters/bible/HelloAoAdapter.js';

// Commentary adapters
import { HelloAoCommentaryAdapter } from '../../adapters/commentary/HelloAoCommentaryAdapter.js';
import { CcelAdapter } from '../../adapters/commentary/CcelAdapter.js';

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
import { createBibleLookupHandler } from '../v2/bibleLookup.js';
import { createCrossReferencesHandler } from '../v2/crossReferences.js';
import { createParallelPassagesHandler } from '../v2/parallelPassages.js';
import { createCommentaryHandler } from '../v2/commentary.js';
import { createClassicTextsHandler } from '../v2/classicTexts.js';
import { createStrongsLookupHandler } from '../v2/strongsLookup.js';
import { createVerseMorphologyHandler } from '../v2/verseMorphology.js';

// Static data (imported as JSON module in Workers bundle)
import parallelPassagesData from '../../data/parallel-passages.json';

import type { ToolHandler } from '../../kernel/types.js';

export interface WorkerServices {
  bibleService: BibleService;
  commentaryService: CommentaryService;
  historicalService: HistoricalDocumentService;
  strongsService: StrongsService;
}

export interface WorkerCompositionRoot {
  tools: ToolHandler[];
  services: WorkerServices;
}

export function createWorkerCompositionRoot(env: Env): WorkerCompositionRoot {
  const db = env.THEOLOGAI_DB;

  // D1 repositories
  const crossRefRepo = new D1CrossReferenceRepository(db);
  const strongsRepo = new D1StrongsRepository(db);
  const morphRepo = new D1MorphologyRepository(db);
  const historicalRepo = new D1HistoricalDocumentRepository(db);

  // Bible adapters
  const esvAdapter = new EsvAdapter(env.ESV_API_KEY);
  const netAdapter = new NetBibleAdapter();
  const helloaoAdapter = new HelloAoAdapter();

  // Commentary adapters
  const helloaoCommentary = new HelloAoCommentaryAdapter();
  const ccelAdapter = new CcelAdapter();

  // Services
  const bibleService = new BibleService([esvAdapter, netAdapter, helloaoAdapter]);
  const crossRefService = new CrossReferenceService(crossRefRepo);
  const parallelService = new ParallelPassageService(
    crossRefRepo,
    helloaoAdapter,
    undefined, // no databasePath in Workers
    parallelPassagesData as any, // preloaded from JSON module
  );
  const commentaryService = new CommentaryService([helloaoCommentary]);
  const ccelService = new CcelService(ccelAdapter);
  const historicalService = new HistoricalDocumentService(historicalRepo);
  const strongsService = new StrongsService(strongsRepo);
  const morphService = new MorphologyService(morphRepo);

  // Tool handlers (reuse the same v2 handler factories)
  const tools = [
    createBibleLookupHandler(bibleService),
    createCrossReferencesHandler(crossRefService),
    createParallelPassagesHandler(parallelService),
    createCommentaryHandler(commentaryService),
    createClassicTextsHandler(historicalService, ccelService),
    createStrongsLookupHandler(strongsService, morphService),
    createVerseMorphologyHandler(morphService),
  ];

  return {
    tools,
    services: { bibleService, commentaryService, historicalService, strongsService },
  };
}
