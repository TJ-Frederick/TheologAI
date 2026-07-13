import type { BibleAdapter } from '../../src/adapters/bible/BibleAdapter.js';
import type { CommentaryAdapter } from '../../src/adapters/commentary/CommentaryAdapter.js';
import type { OnChainVerifier } from '../../src/adapters/donation/OnChainVerifier.js';
import type {
  ICrossReferenceRepository,
  IHistoricalDocumentRepository,
  IMorphologyRepository,
  IStrongsRepository,
} from '../../src/kernel/repositories.js';
import type { BibleReference } from '../../src/kernel/reference.js';
import type { McpCompositionRoot } from '../../src/mcp/server.js';
import { BibleService } from '../../src/services/bible/BibleService.js';
import { CrossReferenceService } from '../../src/services/bible/CrossReferenceService.js';
import { ParallelPassageService } from '../../src/services/bible/ParallelPassageService.js';
import { SourceAttestedParallelService } from '../../src/services/bible/SourceAttestedParallelService.js';
import { CommentaryService } from '../../src/services/commentary/CommentaryService.js';
import { DonationService } from '../../src/services/donation/DonationService.js';
import { HistoricalDocumentService } from '../../src/services/historical/HistoricalDocumentService.js';
import { LocalPrimarySourceSearchProvider } from '../../src/services/historical/LocalPrimarySourceSearchProvider.js';
import { PrimarySourceSearchService } from '../../src/services/historical/PrimarySourceSearchService.js';
import { MorphologyService } from '../../src/services/languages/MorphologyService.js';
import { StrongsService } from '../../src/services/languages/StrongsService.js';
import { OriginalLanguageStudyService } from '../../src/services/languages/OriginalLanguageStudyService.js';
import { createToolRegistry } from '../../src/tools/toolRegistry.js';
import type { WorkerCompositionRoot } from '../../src/tools/worker/index.js';

export type DeterministicMcpRoot = McpCompositionRoot & WorkerCompositionRoot;

export interface BiblePassageCall {
  reference: BibleReference;
  translation: string;
  options?: { includeFootnotes?: boolean };
}

export interface DeterministicMcpFixture {
  root: DeterministicMcpRoot;
  biblePassageCalls: BiblePassageCall[];
}

/**
 * Build the complete production MCP registry around local deterministic fakes.
 *
 * This fixture intentionally opens no database and performs no network calls.
 * It is shared by protocol integration tests and the official HTTP conformance
 * harness so both exercise the same eleven real tool definitions.
 */
export function createDeterministicMcpFixture(): DeterministicMcpFixture {
  const biblePassageCalls: BiblePassageCall[] = [];
  const bibleAdapter: BibleAdapter = {
    supportedTranslations: ['ESV'],
    async getPassage(reference, translation, options) {
      biblePassageCalls.push({ reference, translation, options });
      return {
        reference: 'John 3:16',
        translation,
        text: 'For God so loved the world.',
        citation: { source: 'Deterministic test fixture' },
      };
    },
    isConfigured: () => true,
    getCopyright: () => 'Deterministic test fixture',
  };

  const commentaryAdapter: CommentaryAdapter = {
    supportedCommentators: ['Test Commentary'],
    async getCommentary(_reference, commentator) {
      return {
        reference: 'John 3:16',
        commentator,
        text: 'Deterministic commentary.',
        citation: { source: 'Deterministic test fixture' },
      };
    },
    supportsBook: () => true,
  };

  const crossReferenceRepository: ICrossReferenceRepository = {
    getCrossReferences: () => ({ references: [], total: 0, showing: 0, hasMore: false }),
    hasReferences: () => false,
    getChapterStatistics: () => ({ totalVerses: 0, totalCrossRefs: 0, verseStats: [] }),
  };

  const historicalRepository: IHistoricalDocumentRepository = {
    listDocuments: () => [],
    getDocument: () => undefined,
    getSections: () => [],
    getSection: () => undefined,
    search: () => [],
    searchPrimarySources: () => [],
    findDocumentByName: () => undefined,
  };

  const strongsRepository: IStrongsRepository = {
    lookup: () => undefined,
    search: () => [],
    getLexiconEntry: () => undefined,
    getStats: () => ({ greek: 0, hebrew: 0, total: 0 }),
  };

  const morphologyRepository: IMorphologyRepository = {
    getVerseMorphology: () => [],
    expandMorphCode: () => undefined,
    getAvailableBooks: () => [],
    hasVerse: () => false,
    getOccurrences: () => [],
    getDistribution: () => [],
  };

  const onChainVerifier = {
    getEvidence: async () => {
      throw new Error('The deterministic verifier must not be called by conformance tests.');
    },
  } as unknown as OnChainVerifier;

  const bibleService = new BibleService([bibleAdapter]);
  const crossReferenceService = new CrossReferenceService(crossReferenceRepository);
  const sourceAttestedParallelService = new SourceAttestedParallelService({
    findGroups: () => [],
    getProvenance: () => ({
      sourceId: 'fixture', title: 'Fixture', publisher: 'Fixture', copyright: 'Fixture', license: 'Fixture',
      licenseUrl: 'https://example.test/license', sourceUrl: 'https://example.test/source', sourcePath: 'fixture',
      sourceCommit: '0'.repeat(40), sourceCommitDate: '2026-01-01', sourceBlob: '0'.repeat(40), sourceBytes: 1,
      sourceSha256: '0'.repeat(64), transformVersion: 1, modified: true, modificationNote: 'Fixture',
    }),
  });
  const parallelPassageService = new ParallelPassageService(
    crossReferenceRepository,
    bibleService,
    undefined,
    { description: 'Deterministic test fixture', version: '1', parallels: {} },
    sourceAttestedParallelService,
  );
  const commentaryService = new CommentaryService([commentaryAdapter]);
  const historicalService = new HistoricalDocumentService(historicalRepository);
  const primarySourceSearchService = new PrimarySourceSearchService(
    new LocalPrimarySourceSearchProvider(historicalRepository),
    { search: async () => ({ provider: 'ccel_live', status: 'disabled', searched: false, page: 1, hitCount: 0, hits: [], notices: [] }) },
    { ccelLiveSearch: false },
  );
  const strongsService = new StrongsService(strongsRepository);
  const morphologyService = new MorphologyService(morphologyRepository);
  const originalLanguageStudyService = new OriginalLanguageStudyService(morphologyRepository, strongsRepository);
  const donationService = new DonationService(onChainVerifier);

  const root = {
    tools: createToolRegistry({
      bibleService,
      crossReferenceService,
      parallelPassageService,
      commentaryService,
      historicalService,
      primarySourceSearchService,
      strongsService,
      morphologyService,
      originalLanguageStudyService,
      donationService,
    }),
    services: { bibleService, commentaryService, historicalService, strongsService, sourceAttestedParallelService },
  } satisfies DeterministicMcpRoot;

  return { root, biblePassageCalls };
}
