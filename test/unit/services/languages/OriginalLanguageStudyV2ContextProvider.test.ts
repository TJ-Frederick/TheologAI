import { describe, expect, it, vi } from 'vitest';
import {
  ORIGINAL_LANGUAGE_STUDY_V2_SEMANTIC_ARTIFACT_IDENTITY,
  OriginalLanguageStudyV2ContextProvider,
} from '../../../../src/services/languages/OriginalLanguageStudyV2ContextProvider.js';
import { productionHebrewV1Result } from '../../../helpers/originalLanguageStudyV2ProductionFixtures.js';

describe('OriginalLanguageStudyV2ContextProvider', () => {
  it('wraps the existing v1 service, pins the Transform-7 artifact, and omits an unimplemented alignment proof', async () => {
    const study = vi.fn().mockResolvedValue(productionHebrewV1Result());
    const provider = new OriginalLanguageStudyV2ContextProvider({ study } as any);

    const context = await provider.resolve({
      reference: 'Genesis 1:1', target: 'H1', position: 1, detail: 'summary',
    });

    expect(study).toHaveBeenCalledWith({ reference: 'Genesis 1:1', target: 'H1', position: 1 });
    expect(context).toEqual({
      v1Result: productionHebrewV1Result(),
      semanticArtifactIdentity: ORIGINAL_LANGUAGE_STUDY_V2_SEMANTIC_ARTIFACT_IDENTITY,
    });
    expect(context).not.toHaveProperty('serverVerifiedAlignment');
    expect(ORIGINAL_LANGUAGE_STUDY_V2_SEMANTIC_ARTIFACT_IDENTITY)
      .toBe('bd19fb99f7bbfd13ad68f2184aaded4a6e5587196ad76b68b0c22bf971fc90f6');
  });
});
