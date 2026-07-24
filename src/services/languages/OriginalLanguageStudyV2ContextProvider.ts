import type {
  IOriginalLanguageStudyV2ContextProvider,
  OriginalLanguageStudyV2AuthoritativeContext,
  OriginalLanguageStudyV2ResolvedRequest,
} from '../../kernel/originalLanguageStudyV2Contract.js';
import type { OriginalLanguageStudyService } from './OriginalLanguageStudyService.js';

/**
 * Pinned Transform-7 semantic payload identity.  This deliberately lives in
 * a tiny runtime module: Worker execution must not import compiler scripts or
 * the 108 MiB semantic-compilation audit merely to bind one aggregate query.
 */
export const ORIGINAL_LANGUAGE_STUDY_V2_SEMANTIC_ARTIFACT_IDENTITY =
  'bd19fb99f7bbfd13ad68f2184aaded4a6e5587196ad76b68b0c22bf971fc90f6' as const;

/**
 * Server-owned bridge from the complete existing v1 study into the v2
 * coordinator.  It intentionally supplies no alignment proof: the current
 * runtime has no exact morphology-token-to-sense verifier.
 */
export class OriginalLanguageStudyV2ContextProvider implements IOriginalLanguageStudyV2ContextProvider {
  constructor(private readonly v1StudyService: Pick<OriginalLanguageStudyService, 'study'>) {}

  async resolve(
    request: Readonly<OriginalLanguageStudyV2ResolvedRequest>,
  ): Promise<OriginalLanguageStudyV2AuthoritativeContext> {
    const v1Result = await this.v1StudyService.study({
      reference: request.reference,
      target: request.target,
      ...(request.position === undefined ? {} : { position: request.position }),
    });
    return {
      v1Result,
      semanticArtifactIdentity: ORIGINAL_LANGUAGE_STUDY_V2_SEMANTIC_ARTIFACT_IDENTITY,
    };
  }
}
