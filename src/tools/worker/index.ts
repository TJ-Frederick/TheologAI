/**
 * Workers composition root.
 *
 * HTTP adapters and services that don't depend on D1 are cached at
 * module scope (once per isolate) so their LRU caches persist across
 * requests. D1-dependent objects are created per-request since the
 * D1 binding is only available inside the fetch handler.
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
import { createDonationConfigHandler } from '../v2/donationConfig.js';
import { createVerifyDonationHandler } from '../v2/verifyDonation.js';

// Donation
import { OnChainVerifier } from '../../adapters/donation/OnChainVerifier.js';
import { DonationService } from '../../services/donation/DonationService.js';

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

// ── Module-scope singletons (created once per isolate) ──

const netAdapter = new NetBibleAdapter();
const helloaoAdapter = new HelloAoAdapter();
const helloaoCommentary = new HelloAoCommentaryAdapter();
const ccelAdapter = new CcelAdapter();

const commentaryService = new CommentaryService([helloaoCommentary]);
const ccelService = new CcelService(ccelAdapter);

// ESV adapter + BibleService are lazy-initialized on first request
// because EsvAdapter needs env.ESV_API_KEY which isn't available at module scope.
// Once created, they persist for the isolate's lifetime (secret changes require redeployment).
let _bibleService: BibleService | null = null;

// Donation service is HTTP-only (no D1 dependency), safe to cache at module scope.
let _donationService: DonationService | null = null;

function getBibleService(env: Env): BibleService {
  if (!_bibleService) {
    const esvAdapter = new EsvAdapter(env.ESV_API_KEY);
    _bibleService = new BibleService([esvAdapter, netAdapter, helloaoAdapter]);
  }
  return _bibleService;
}

export function getDonationService(env: Env): DonationService {
  if (!_donationService) {
    const verifier = new OnChainVerifier({
      ethereum: env.ETH_RPC_URL,
      base: env.BASE_RPC_URL,
      radius: env.RADIUS_RPC_URL,
    });
    _donationService = new DonationService(verifier);
  }
  return _donationService;
}

// ── Per-request creation (D1-dependent) ──

export function createWorkerCompositionRoot(env: Env): WorkerCompositionRoot {
  const db = env.THEOLOGAI_DB;

  // D1 repositories (per-request — binding is per-request)
  const crossRefRepo = new D1CrossReferenceRepository(db);
  const strongsRepo = new D1StrongsRepository(db);
  const morphRepo = new D1MorphologyRepository(db);
  const historicalRepo = new D1HistoricalDocumentRepository(db);

  // D1-dependent services (per-request)
  const crossRefService = new CrossReferenceService(crossRefRepo);
  const parallelService = new ParallelPassageService(
    crossRefRepo,
    helloaoAdapter,
    undefined, // no databasePath in Workers
    parallelPassagesData as any, // preloaded from JSON module
  );
  const historicalService = new HistoricalDocumentService(historicalRepo);
  const strongsService = new StrongsService(strongsRepo);
  const morphService = new MorphologyService(morphRepo);

  // Module-scope services (cached across requests)
  const bibleService = getBibleService(env);
  const donationService = getDonationService(env);

  // Tool handlers (per-request — hold D1-dependent services)
  const tools = [
    createBibleLookupHandler(bibleService),
    createCrossReferencesHandler(crossRefService),
    createParallelPassagesHandler(parallelService),
    createCommentaryHandler(commentaryService),
    createClassicTextsHandler(historicalService, ccelService),
    createStrongsLookupHandler(strongsService),
    createVerseMorphologyHandler(morphService),
    createDonationConfigHandler(donationService),
    createVerifyDonationHandler(donationService),
  ];

  return {
    tools,
    services: { bibleService, commentaryService, historicalService, strongsService },
  };
}
