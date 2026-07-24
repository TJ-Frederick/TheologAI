/**
 * Minimal fixtures for the active production v2 modules.
 *
 * The historic `original-language-study-v2` draft packet remains frozen for
 * provenance review.  These fixtures intentionally live elsewhere so the
 * production implementation is tested without editing or importing its
 * coordinator/support implementation.
 */
import {
  type IUbsSemanticEvidenceBundleRepository,
  type UbsSemanticEvidenceBundleCandidateRow,
  type UbsSemanticEvidenceBundleRepositoryPage,
  type UbsSemanticEvidenceBundleRepositoryQuery,
} from '../../src/kernel/ubsSemanticEvidenceBundle.js';
import {
  type IOriginalLanguageStudyV2ContextProvider,
  type OriginalLanguageStudyV2AuthoritativeContext,
  type OriginalLanguageStudyV2CursorBinding,
  deriveOriginalLanguageStudyV2MorphologyTokenIdentity,
} from '../../src/kernel/originalLanguageStudyV2Contract.js';
import {
  requireUbsInternalLexicalIdentity,
  type UbsInternalHebrewLexicalIdentity,
  type UbsSemanticSource,
} from '../../src/kernel/ubsSemanticDomain.js';
import { OriginalLanguageStudyV2Coordinator } from '../../src/services/languages/OriginalLanguageStudyV2Coordinator.js';
import type { OriginalLanguageStudyDomainResult } from '../../src/services/languages/OriginalLanguageStudyService.js';

export const SYNTHETIC_ARTIFACT = 'a'.repeat(64);
export const SYNTHETIC_H0001 = requireUbsInternalLexicalIdentity('H0001') as UbsInternalHebrewLexicalIdentity;

const CANONICAL_DISPLAY_REFERENCE = 'Genesis 1:1';
const SEMANTIC_REFERENCE = 'GEN 1:1';

export function productionCandidate(
  index: number,
  definitionCharacters = 0,
): UbsSemanticEvidenceBundleCandidateRow {
  const suffix = String(index).padStart(2, '0');
  return {
    entry: {
      entryId: `production-entry-${suffix}`,
      sourceId: 'production-dictionary',
      sourceOrdinal: index,
      lemma: `PRODUCTION LEMMA ${suffix}`,
      lexicalIdentities: [SYNTHETIC_H0001],
    },
    sense: {
      senseId: `production-sense-${suffix}`,
      sourceId: 'production-dictionary',
      entryId: `production-entry-${suffix}`,
      sourceOrdinal: index,
      definitionStatus: 'published',
      definition: definitionCharacters > 0
        ? `PRODUCTION ${'D'.repeat(definitionCharacters - 11)}`
        : `PRODUCTION DEFINITION ${suffix}`,
      definitionExclusionReasons: [],
      glosses: [`PRODUCTION GLOSS ${suffix}`],
      domainRefs: [{ sourceId: 'production-domains', domainId: `production-domain-${suffix}` }],
    },
    domains: [{
      domainId: `production-domain-${suffix}`,
      sourceId: 'production-domains',
      sourceOrdinal: index,
      label: `PRODUCTION DOMAIN ${suffix}`,
    }],
    domainTotal: 1,
    matchingReferences: [{
      evidenceId: `production-reference-${suffix}`,
      sourceId: 'production-dictionary',
      senseId: `production-sense-${suffix}`,
      sourceOrdinal: index,
      sourceReference: CANONICAL_DISPLAY_REFERENCE,
      normalizedReference: SEMANTIC_REFERENCE,
      evidenceKind: 'source_attested_sense_reference',
    }],
    matchingReferenceTotal: 1,
  };
}

export function productionHebrewV1Result(): OriginalLanguageStudyDomainResult {
  return {
    status: 'complete', reference: CANONICAL_DISPLAY_REFERENCE, language: 'Hebrew', target: 'H1',
    selectedToken: {
      position: 1, text: 'PRODUCTION TOKEN', lemma: 'PRODUCTION LEMMA', strongsNumber: 'H1',
      morphologyCode: 'HNcmsa', gloss: 'PRODUCTION LOCAL GLOSS',
    },
    identity: {
      publicStrongs: 'H1', morphologyKey: 'H0001', sourceStrongs: 'H1', lemma: 'PRODUCTION LEMMA',
      transliteration: 'PRODUCTION TRANSLITERATION', joinKind: 'exact',
    },
    grammar: { code: 'HNcmsa', expansion: 'PRODUCTION GRAMMAR', certainty: 'expanded' },
    dictionary: {
      strongs_number: 'H1', testament: 'OT', lemma: 'PRODUCTION LEMMA',
      definition: 'PRODUCTION EXISTING V1 DEFINITION', citation: { source: 'PRODUCTION V1 FIXTURE' },
    },
    warnings: [],
  };
}

export function productionGreekV1Result(): OriginalLanguageStudyDomainResult {
  return {
    status: 'complete', reference: 'John 1:1', language: 'Greek', target: 'H1',
    selectedToken: {
      position: 1, text: 'PRODUCTION GREEK TOKEN', lemma: 'PRODUCTION GREEK LEMMA', strongsNumber: 'G1',
      morphologyCode: 'V-PAI-3S', gloss: 'PRODUCTION GREEK GLOSS',
    },
    identity: {
      publicStrongs: 'G1', morphologyKey: 'G0001', sourceStrongs: 'G1', lemma: 'PRODUCTION GREEK LEMMA',
      joinKind: 'exact',
    },
    grammar: { code: 'V-PAI-3S', expansion: 'PRODUCTION GREEK GRAMMAR', certainty: 'expanded' },
    dictionary: {
      strongs_number: 'G1', testament: 'NT', lemma: 'PRODUCTION GREEK LEMMA',
      definition: 'PRODUCTION EXISTING GREEK DEFINITION', citation: { source: 'PRODUCTION V1 FIXTURE' },
    },
    warnings: [],
  };
}

export function productionContext(
  language: 'Hebrew' | 'Greek' = 'Hebrew',
  alignment = false,
): OriginalLanguageStudyV2AuthoritativeContext {
  if (language === 'Greek') return { v1Result: productionGreekV1Result() };
  const v1Result = productionHebrewV1Result();
  const selectedToken = v1Result.selectedToken!;
  const binding = {
    canonicalReference: CANONICAL_DISPLAY_REFERENCE,
    normalizedReference: SEMANTIC_REFERENCE,
    selectedToken,
  };
  const dictionary = productionSource('dictionary');
  const lexicalDomains = productionSource('lexical_domains');
  return {
    v1Result,
    semanticArtifactIdentity: SYNTHETIC_ARTIFACT,
    ...(alignment ? {
      serverVerifiedAlignment: {
        status: 'verified_token_alignment' as const,
        proofContract: 'theologai-exact-hebrew-token-alignment.v1' as const,
        verifierVersion: 1,
        sourceIdentity: SYNTHETIC_H0001,
        normalizedReference: SEMANTIC_REFERENCE,
        artifactIdentity: SYNTHETIC_ARTIFACT,
        artifactVersion: '0.9.2' as const,
        artifactSources: {
          dictionary: {
            sourceId: dictionary.sourceId,
            sourceRole: dictionary.sourceRole,
            artifactName: dictionary.artifactName,
            artifactIdentity: dictionary.artifactIdentity,
            artifactVersion: dictionary.artifactVersion,
            sourceSha256: dictionary.sourceSha256,
          },
          lexicalDomains: {
            sourceId: lexicalDomains.sourceId,
            sourceRole: lexicalDomains.sourceRole,
            artifactName: lexicalDomains.artifactName,
            artifactIdentity: lexicalDomains.artifactIdentity,
            artifactVersion: lexicalDomains.artifactVersion,
            sourceSha256: lexicalDomains.sourceSha256,
          },
        },
        sourceId: 'production-dictionary',
        entryId: 'production-entry-01',
        senseId: 'production-sense-01',
        evidenceId: 'production-reference-01',
        morphologyTokenIdentity: deriveOriginalLanguageStudyV2MorphologyTokenIdentity(binding),
        morphologyTokenCoordinates: {
          canonicalReference: CANONICAL_DISPLAY_REFERENCE,
          normalizedReference: SEMANTIC_REFERENCE,
          position: selectedToken.position,
        },
        morphologyTokenWitness: {
          text: selectedToken.text,
          lemma: selectedToken.lemma,
          strongsNumber: selectedToken.strongsNumber,
          morphologyCode: selectedToken.morphologyCode,
          gloss: selectedToken.gloss,
        },
      },
    } : {}),
  };
}

export class ProductionAggregateRepository implements IUbsSemanticEvidenceBundleRepository {
  queryCount = 0;
  readonly received: UbsSemanticEvidenceBundleRepositoryQuery[] = [];

  constructor(private readonly candidates: readonly UbsSemanticEvidenceBundleCandidateRow[]) {}

  async getSemanticEvidenceBundle(
    query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>,
  ): Promise<UbsSemanticEvidenceBundleRepositoryPage> {
    this.queryCount += 1;
    this.received.push(structuredClone(query));
    if (query.artifactIdentity !== SYNTHETIC_ARTIFACT
      || query.sourceIdentity !== SYNTHETIC_H0001
      || query.normalizedReference !== SEMANTIC_REFERENCE) {
      throw new Error('production fixture repository received an unbound semantic query');
    }
    const start = query.after === undefined ? 0 : this.boundaryStart(query.after.keyset, query.after.priorShowing);
    return {
      items: this.candidates.slice(start, start + 8).map(value => structuredClone(value)),
      lexicalEntryTotal: this.candidates.length,
      semanticSenseTotal: this.candidates.length,
      boundary: {
        artifactIdentity: SYNTHETIC_ARTIFACT,
        sourceIdentity: SYNTHETIC_H0001,
        normalizedReference: SEMANTIC_REFERENCE,
        order: 'entry_source_id_entry_ordinal_entry_id_sense_ordinal_sense_id',
        priorShowing: start,
        ...(query.after === undefined ? {} : {
          after: { keyset: [...query.after.keyset] as [string, string, string, string, string] },
        }),
      },
      sources: [productionSource('dictionary'), productionSource('lexical_domains')],
    };
  }

  private boundaryStart(cursorKeyset: readonly string[], priorShowing: number): number {
    const at = this.candidates.findIndex(value => JSON.stringify(keyset(value)) === JSON.stringify(cursorKeyset));
    if (at < 0 || priorShowing !== at + 1 || priorShowing >= this.candidates.length) {
      throw new Error('production fixture rejected a cursor that is not a genuine current continuation boundary');
    }
    return priorShowing;
  }
}

export class ProductionContextProvider implements IOriginalLanguageStudyV2ContextProvider {
  calls = 0;

  constructor(private readonly context: OriginalLanguageStudyV2AuthoritativeContext) {}

  async resolve(): Promise<OriginalLanguageStudyV2AuthoritativeContext> {
    this.calls += 1;
    return structuredClone(this.context);
  }
}

export function productionCoordinator(
  values: readonly UbsSemanticEvidenceBundleCandidateRow[] = [productionCandidate(1)],
  context: OriginalLanguageStudyV2AuthoritativeContext = productionContext(),
) {
  const repository = new ProductionAggregateRepository(values);
  const provider = new ProductionContextProvider(context);
  return { coordinator: new OriginalLanguageStudyV2Coordinator(provider, repository), repository, provider };
}

export function productionRequest(
  cursor?: string,
  detail: 'summary' | 'detailed' = 'summary',
  reference = 'Gen 1:1',
) {
  return {
    reference,
    target: 'H1',
    position: 1,
    detail,
    ...(cursor === undefined ? {} : { cursor }),
  };
}

export function productionCursorBinding(
  requestReference = 'Gen 1:1',
  target = 'H1',
  position: number | null = 1,
  detail: 'summary' | 'detailed' = 'summary',
): OriginalLanguageStudyV2CursorBinding {
  const token = productionHebrewV1Result().selectedToken!;
  return {
    requestReference,
    requestTarget: target,
    requestPosition: position,
    detail,
    canonicalReference: CANONICAL_DISPLAY_REFERENCE,
    selectedToken: {
      position: position ?? token.position,
      text: token.text,
      lemma: token.lemma,
      strongsNumber: token.strongsNumber,
      morphologyCode: token.morphologyCode,
      gloss: token.gloss,
    },
    publicStrongs: 'H1',
    sourceIdentity: SYNTHETIC_H0001,
    normalizedReference: SEMANTIC_REFERENCE,
    artifactIdentity: SYNTHETIC_ARTIFACT,
  };
}

function keyset(value: UbsSemanticEvidenceBundleCandidateRow): [string, string, string, string, string] {
  return [
    value.entry.sourceId,
    String(value.entry.sourceOrdinal),
    value.entry.entryId,
    String(value.sense.sourceOrdinal),
    value.sense.senseId,
  ];
}

function productionSource(sourceRole: 'dictionary' | 'lexical_domains'): UbsSemanticSource {
  const common = {
    sourceId: sourceRole === 'dictionary' ? 'production-dictionary' : 'production-domains',
    schemaVersion: 'ubs-semantics.v1',
    artifactIdentity: SYNTHETIC_ARTIFACT,
    title: `PRODUCTION FIXTURE ${sourceRole.toUpperCase()}`,
    artifactVersion: '0.9.2',
    language: 'Hebrew',
    publisher: 'United Bible Societies',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: `https://example.invalid/${sourceRole}`,
    sourceCommit: (sourceRole === 'dictionary' ? '1' : '2').repeat(40),
    sourceBlob: (sourceRole === 'dictionary' ? '3' : '4').repeat(40),
    sourceSha256: (sourceRole === 'dictionary' ? '5' : '6').repeat(64),
    transformVersion: 7,
    modified: true,
    modificationNote: 'Invented production-module test fixture only.',
  } as const;
  return sourceRole === 'dictionary'
    ? { ...common, sourceRole, artifactName: 'UBSHebrewDic-v0.9.2-en.JSON' }
    : { ...common, sourceRole, artifactName: 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON' };
}
