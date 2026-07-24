/**
 * Canonical MCP tool-handler registry.
 *
 * Composition roots own platform-specific dependency construction; this module
 * owns the public handler set and ordering so Node, Workers, and deterministic
 * protocol fixtures cannot silently drift from one another.
 */

import type { ToolHandler } from '../kernel/types.js';
import { createBibleLookupHandler } from './v2/bibleLookup.js';
import { createClassicTextsHandler } from './v2/classicTexts.js';
import { createCommentaryHandler } from './v2/commentary.js';
import { createCrossReferencesHandler } from './v2/crossReferences.js';
import { createDonationConfigHandler } from './v2/donationConfig.js';
import { createOriginalLanguageStudyHandler } from './v2/originalLanguageStudy.js';
import { createParallelPassagesHandler } from './v2/parallelPassages.js';
import { createPrimarySourceSearchHandler } from './v2/primarySourceSearch.js';
import { createStrongsLookupHandler } from './v2/strongsLookup.js';
import { createVerifyDonationHandler } from './v2/verifyDonation.js';
import { createVerseMorphologyHandler } from './v2/verseMorphology.js';
import type { PrimarySourceContractConfig } from '../kernel/featureFlags.js';

export interface ToolRegistryDependencies {
  bibleService: Parameters<typeof createBibleLookupHandler>[0];
  crossReferenceService: Parameters<typeof createCrossReferencesHandler>[0];
  parallelPassageService: Parameters<typeof createParallelPassagesHandler>[0];
  commentaryService: Parameters<typeof createCommentaryHandler>[0];
  historicalService: Parameters<typeof createClassicTextsHandler>[0];
  primarySourceSearchService: Parameters<typeof createPrimarySourceSearchHandler>[0];
  primarySourceContract: PrimarySourceContractConfig;
  strongsService: Parameters<typeof createStrongsLookupHandler>[0];
  morphologyService: Parameters<typeof createVerseMorphologyHandler>[0];
  originalLanguageStudyCoordinator: Parameters<typeof createOriginalLanguageStudyHandler>[0];
  donationService: Parameters<typeof createDonationConfigHandler>[0];
}

export function createToolRegistry(dependencies: ToolRegistryDependencies): ToolHandler[] {
  return [
    createBibleLookupHandler(dependencies.bibleService),
    createCrossReferencesHandler(dependencies.crossReferenceService),
    createParallelPassagesHandler(dependencies.parallelPassageService),
    createCommentaryHandler(dependencies.commentaryService),
    createClassicTextsHandler(dependencies.historicalService),
    createPrimarySourceSearchHandler(dependencies.primarySourceSearchService, dependencies.primarySourceContract),
    createStrongsLookupHandler(dependencies.strongsService),
    createVerseMorphologyHandler(dependencies.morphologyService),
    createOriginalLanguageStudyHandler(dependencies.originalLanguageStudyCoordinator),
    createDonationConfigHandler(dependencies.donationService),
    createVerifyDonationHandler(dependencies.donationService),
  ];
}
