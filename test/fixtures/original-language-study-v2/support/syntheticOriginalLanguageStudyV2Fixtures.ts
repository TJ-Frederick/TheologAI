import {
  type IUbsSemanticEvidenceBundleRepository,
  type UbsSemanticEvidenceBundleCandidateRow,
  type UbsSemanticEvidenceBundleRepositoryPage,
  type UbsSemanticEvidenceBundleRepositoryQuery,
} from '../../../../src/kernel/ubsSemanticEvidenceBundle.js';
import {
  requireUbsInternalLexicalIdentity,
  type UbsInternalHebrewLexicalIdentity,
  type UbsSemanticSource,
} from '../../../../src/kernel/ubsSemanticDomain.js';
import type { OriginalLanguageStudyDomainResult } from '../../../../src/services/languages/OriginalLanguageStudyService.js';
import {
  OriginalLanguageStudyV2DraftCoordinator,
  type IOriginalLanguageStudyV2DraftContextProvider,
  type OriginalLanguageStudyV2DraftAuthoritativeContext,
} from './OriginalLanguageStudyV2DraftCoordinator.js';
import type { OriginalLanguageStudyV2DraftCursorBinding } from './originalLanguageStudyV2DraftContract.js';

export const SYNTHETIC_ARTIFACT = 'a'.repeat(64);
export const SYNTHETIC_H0001 = requireUbsInternalLexicalIdentity('H0001') as UbsInternalHebrewLexicalIdentity;

export function syntheticSource(sourceRole: 'dictionary' | 'lexical_domains'): UbsSemanticSource {
  const common = {
    sourceId: sourceRole === 'dictionary' ? 'synthetic-dictionary' : 'synthetic-domains',
    schemaVersion: 'ubs-semantics.v1', artifactIdentity: SYNTHETIC_ARTIFACT,
    title: `SYNTHETIC ${sourceRole.toUpperCase()}`,
    artifactVersion: '0.9.2', language: 'Hebrew', publisher: 'United Bible Societies',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: `https://example.invalid/${sourceRole}`,
    sourceCommit: (sourceRole === 'dictionary' ? '1' : '2').repeat(40),
    sourceBlob: (sourceRole === 'dictionary' ? '3' : '4').repeat(40),
    sourceSha256: (sourceRole === 'dictionary' ? '5' : '6').repeat(64),
    transformVersion: 7, modified: true, modificationNote: 'Invented synthetic fixture only.',
  } as const;
  return sourceRole === 'dictionary'
    ? { ...common, sourceRole, artifactName: 'UBSHebrewDic-v0.9.2-en.JSON' }
    : { ...common, sourceRole, artifactName: 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON' };
}

export function syntheticCandidate(index: number, definitionCharacters = 0): UbsSemanticEvidenceBundleCandidateRow {
  const suffix = String(index).padStart(2, '0');
  return {
    entry: {
      entryId: `synthetic-entry-${suffix}`, sourceId: 'synthetic-dictionary', sourceOrdinal: index,
      lemma: `SYNTHETIC LEMMA ${suffix}`, lexicalIdentities: [SYNTHETIC_H0001],
    },
    sense: {
      senseId: `synthetic-sense-${suffix}`, sourceId: 'synthetic-dictionary', entryId: `synthetic-entry-${suffix}`,
      sourceOrdinal: index,
      definition: definitionCharacters > 0 ? `SYNTHETIC ${'D'.repeat(definitionCharacters - 10)}` : `SYNTHETIC DEFINITION ${suffix}`,
      glosses: [`SYNTHETIC GLOSS ${suffix}`],
      domainRefs: [{ sourceId: 'synthetic-domains', domainId: `synthetic-domain-${suffix}` }],
    },
    domains: [{
      domainId: `synthetic-domain-${suffix}`, sourceId: 'synthetic-domains', sourceOrdinal: index,
      label: `SYNTHETIC DOMAIN ${suffix}`,
    }],
    domainTotal: 1,
    matchingReferences: [{
      evidenceId: `synthetic-reference-${suffix}`, sourceId: 'synthetic-dictionary',
      senseId: `synthetic-sense-${suffix}`, sourceOrdinal: index, sourceReference: `SYN ${index}:1`,
      normalizedReference: 'Synthetic 1:1', evidenceKind: 'source_attested_sense_reference',
    }],
    matchingReferenceTotal: 1,
  };
}

function keyset(value: UbsSemanticEvidenceBundleCandidateRow): [string, string, string, string, string] {
  return [value.entry.sourceId, String(value.entry.sourceOrdinal), value.entry.entryId,
    String(value.sense.sourceOrdinal), value.sense.senseId];
}

export class SyntheticAggregateRepository implements IUbsSemanticEvidenceBundleRepository {
  queryCount = 0;
  constructor(private readonly candidates: readonly UbsSemanticEvidenceBundleCandidateRow[]) {}

  async getSemanticEvidenceBundle(
    query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>,
  ): Promise<UbsSemanticEvidenceBundleRepositoryPage> {
    this.queryCount += 1;
    if (query.artifactIdentity !== SYNTHETIC_ARTIFACT || query.sourceIdentity !== SYNTHETIC_H0001
      || query.normalizedReference !== 'Synthetic 1:1') throw new Error('synthetic repository received an unbound query');
    const start = query.after === undefined ? 0 : this.boundaryStart(query.after.keyset, query.after.priorShowing);
    return {
      items: this.candidates.slice(start, start + 8).map(value => structuredClone(value)),
      lexicalEntryTotal: this.candidates.length,
      semanticSenseTotal: this.candidates.length,
      boundary: {
        artifactIdentity: SYNTHETIC_ARTIFACT, sourceIdentity: SYNTHETIC_H0001,
        normalizedReference: 'Synthetic 1:1',
        order: 'entry_source_id_entry_ordinal_entry_id_sense_ordinal_sense_id', priorShowing: start,
        ...(query.after === undefined ? {} : {
          after: { keyset: [...query.after.keyset] as [string, string, string, string, string] },
        }),
      },
      sources: [syntheticSource('dictionary'), syntheticSource('lexical_domains')],
    };
  }

  private boundaryStart(cursorKeyset: readonly string[], priorShowing: number): number {
    const at = this.candidates.findIndex(value => JSON.stringify(keyset(value)) === JSON.stringify(cursorKeyset));
    if (at < 0 || priorShowing !== at + 1 || priorShowing >= this.candidates.length) {
      throw new Error('synthetic repository rejected a cursor that is not a genuine current continuation boundary');
    }
    return priorShowing;
  }
}

export class SyntheticContextProvider implements IOriginalLanguageStudyV2DraftContextProvider {
  calls = 0;
  constructor(private readonly context: OriginalLanguageStudyV2DraftAuthoritativeContext) {}
  async resolve(): Promise<OriginalLanguageStudyV2DraftAuthoritativeContext> {
    this.calls += 1;
    return structuredClone(this.context);
  }
}

export function syntheticHebrewV1Result(): OriginalLanguageStudyDomainResult {
  return {
    status: 'complete', reference: 'Synthetic 1:1', language: 'Hebrew', target: 'H1',
    selectedToken: {
      position: 1, text: 'SYNTHETIC TOKEN', lemma: 'SYNTHETIC LEMMA', strongsNumber: 'H1',
      morphologyCode: 'HNcmsa', gloss: 'SYNTHETIC LOCAL GLOSS',
    },
    identity: {
      publicStrongs: 'H1', morphologyKey: 'H0001', sourceStrongs: 'H1', lemma: 'SYNTHETIC LEMMA',
      transliteration: 'SYNTHETIC TRANSLITERATION', joinKind: 'exact',
    },
    grammar: { code: 'HNcmsa', expansion: 'SYNTHETIC GRAMMAR', certainty: 'expanded' },
    dictionary: {
      strongs_number: 'H1', testament: 'OT', lemma: 'SYNTHETIC LEMMA',
      definition: 'SYNTHETIC EXISTING V1 DEFINITION', citation: { source: 'SYNTHETIC V1 FIXTURE' },
    },
    warnings: [],
  };
}

export function syntheticGreekV1Result(): OriginalLanguageStudyDomainResult {
  return {
    status: 'complete', reference: 'Synthetic 1:1', language: 'Greek', target: 'H1',
    selectedToken: {
      position: 1, text: 'SYNTHETIC GREEK TOKEN', lemma: 'SYNTHETIC GREEK LEMMA',
      strongsNumber: 'G1', morphologyCode: 'V-PAI-3S', gloss: 'SYNTHETIC GREEK GLOSS',
    },
    identity: {
      publicStrongs: 'G1', morphologyKey: 'G0001', sourceStrongs: 'G1', lemma: 'SYNTHETIC GREEK LEMMA',
      joinKind: 'exact',
    },
    grammar: { code: 'V-PAI-3S', expansion: 'SYNTHETIC GREEK GRAMMAR', certainty: 'expanded' },
    dictionary: {
      strongs_number: 'G1', testament: 'NT', lemma: 'SYNTHETIC GREEK LEMMA',
      definition: 'SYNTHETIC EXISTING GREEK DEFINITION', citation: { source: 'SYNTHETIC V1 FIXTURE' },
    },
    warnings: [],
  };
}

export function syntheticContext(
  language: 'Hebrew' | 'Greek' = 'Hebrew',
  alignment = false,
): OriginalLanguageStudyV2DraftAuthoritativeContext {
  if (language === 'Greek') return { v1Result: syntheticGreekV1Result() };
  return {
    v1Result: syntheticHebrewV1Result(), semanticArtifactIdentity: SYNTHETIC_ARTIFACT,
    ...(alignment ? { serverVerifiedAlignment: {
      status: 'verified_token_alignment' as const, morphologyTokenIdentity: 'synthetic-token-1', verifierVersion: 1,
      sourceId: 'synthetic-dictionary', entryId: 'synthetic-entry-01', senseId: 'synthetic-sense-01',
      evidenceId: 'synthetic-reference-01',
    } } : {}),
  };
}

export function syntheticCoordinator(
  values: readonly UbsSemanticEvidenceBundleCandidateRow[] = [syntheticCandidate(1)],
  context: OriginalLanguageStudyV2DraftAuthoritativeContext = syntheticContext(),
) {
  const repository = new SyntheticAggregateRepository(values);
  const provider = new SyntheticContextProvider(context);
  return {
    coordinator: new OriginalLanguageStudyV2DraftCoordinator(provider, repository), repository, provider,
  };
}

export function syntheticRequest(cursor?: string, detail: 'summary' | 'detailed' = 'summary') {
  return {
    reference: 'Synthetic 1:1', target: 'H1', position: 1, detail,
    ...(cursor === undefined ? {} : { cursor }),
  };
}

export function syntheticCursorBinding(
  target = 'H1',
  position: number | null = 1,
): OriginalLanguageStudyV2DraftCursorBinding {
  const token = syntheticHebrewV1Result().selectedToken!;
  return {
    requestReference: 'Synthetic 1:1', requestTarget: target, requestPosition: position,
    canonicalReference: 'Synthetic 1:1',
    selectedToken: {
      position: position ?? token.position, text: token.text, lemma: token.lemma,
      strongsNumber: token.strongsNumber, morphologyCode: token.morphologyCode, gloss: token.gloss,
    },
    publicStrongs: 'H1', sourceIdentity: SYNTHETIC_H0001,
    normalizedReference: 'Synthetic 1:1', artifactIdentity: SYNTHETIC_ARTIFACT,
  };
}
