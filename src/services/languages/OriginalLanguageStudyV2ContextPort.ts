import type { OriginalLanguageStudyDomainResult } from './OriginalLanguageStudyService.js';
import type {
  OriginalLanguageStudyV2ResolvedRequest,
  ServerVerifiedHebrewSemanticAlignment,
} from '../../kernel/originalLanguageStudyV2Contract.js';

/**
 * Server-owned context. The coordinator snapshots it before composition so
 * callers cannot inject source IDs, artifact identities, or alignment proofs.
 */
export interface OriginalLanguageStudyV2AuthoritativeContext {
  v1Result: OriginalLanguageStudyDomainResult;
  semanticArtifactIdentity?: string;
  serverVerifiedAlignment?: ServerVerifiedHebrewSemanticAlignment;
}

export interface OriginalLanguageStudyV2ContextPort {
  resolve(request: Readonly<OriginalLanguageStudyV2ResolvedRequest>):
    Promise<OriginalLanguageStudyV2AuthoritativeContext>;
}
