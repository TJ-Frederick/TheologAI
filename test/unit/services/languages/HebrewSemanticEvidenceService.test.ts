import { describe, expect, it } from 'vitest';
import {
  UBS_SEMANTIC_REPOSITORY_LIMITS,
  UBS_SEMANTIC_REPOSITORY_ORDER,
  createUbsSemanticRepositoryCollection,
  requireUbsInternalLexicalIdentity,
} from '../../../../src/kernel/ubsSemanticDomain.js';
import type {
  IUbsSemanticRepository,
  UbsInternalHebrewLexicalIdentity,
  UbsInternalLexicalIdentity,
  UbsSemanticDomain,
  UbsSemanticEntry,
  UbsSemanticPageRequest,
  UbsSemanticReferenceEvidence,
  UbsSemanticSense,
  UbsSemanticSource,
} from '../../../../src/kernel/ubsSemanticDomain.js';
import {
  HEBREW_SEMANTIC_EVIDENCE_LIMITS,
  HebrewSemanticEvidenceService,
  type HebrewSemanticEvidenceRequest,
  type TrustedHebrewTokenAlignment,
} from '../../../../src/services/languages/HebrewSemanticEvidenceService.js';

const H0001 = requireUbsInternalLexicalIdentity('H0001') as UbsInternalHebrewLexicalIdentity;
const H0002 = requireUbsInternalLexicalIdentity('H0002') as UbsInternalHebrewLexicalIdentity;
const A0001 = requireUbsInternalLexicalIdentity('A0001');
const A0002 = requireUbsInternalLexicalIdentity('A0002');
const ARTIFACT = '7'.repeat(64);

interface SyntheticData {
  sources: UbsSemanticSource[];
  entries: UbsSemanticEntry[];
  senses: UbsSemanticSense[];
  domains: UbsSemanticDomain[];
  references: UbsSemanticReferenceEvidence[];
}

function source(sourceRole: 'dictionary' | 'lexical_domains'): UbsSemanticSource {
  return {
    sourceId: sourceRole === 'dictionary' ? 'synthetic-dictionary' : 'synthetic-domains',
    sourceRole,
    schemaVersion: 'ubs-semantics.v1', artifactIdentity: ARTIFACT,
    title: sourceRole === 'dictionary' ? 'SYNTHETIC DICTIONARY' : 'SYNTHETIC DOMAINS',
    artifactName: sourceRole === 'dictionary'
      ? 'UBSHebrewDic-v0.9.2-en.JSON' : 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
    artifactVersion: '0.9.2', language: 'Hebrew', publisher: 'United Bible Societies',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: `https://example.invalid/no-source-bytes/${sourceRole}`,
    sourceCommit: (sourceRole === 'dictionary' ? '1' : '2').repeat(40),
    sourceBlob: (sourceRole === 'dictionary' ? '3' : '4').repeat(40),
    sourceSha256: (sourceRole === 'dictionary' ? '5' : '6').repeat(64),
    transformVersion: 7, modified: true, modificationNote: 'Invented synthetic evidence only.',
  } as UbsSemanticSource;
}

function data(): SyntheticData {
  const entries: UbsSemanticEntry[] = [
    { entryId: 'entry-one', sourceId: 'synthetic-dictionary', sourceOrdinal: 1, lemma: 'SYNTHETIC LEMMA ONE', lexicalIdentities: [H0001, A0001] },
    { entryId: 'entry-two', sourceId: 'synthetic-dictionary', sourceOrdinal: 2, lemma: 'SYNTHETIC LEMMA TWO', lexicalIdentities: [H0001] },
    { entryId: 'entry-range', sourceId: 'synthetic-dictionary', sourceOrdinal: 3, lemma: 'SYNTHETIC RANGE LEMMA', lexicalIdentities: [H0002] },
    { entryId: 'entry-a-only', sourceId: 'synthetic-dictionary', sourceOrdinal: 4, lemma: 'SYNTHETIC A ONLY', lexicalIdentities: [A0002] },
  ];
  const senses: UbsSemanticSense[] = [
    sense('sense-one', 'entry-one', 1, 'domain-one'),
    sense('sense-two', 'entry-one', 2, 'domain-two'),
    sense('sense-three', 'entry-two', 1, 'domain-three'),
    sense('sense-range', 'entry-range', 1, 'domain-range'),
    sense('sense-a-only', 'entry-a-only', 1, 'domain-a-only'),
  ];
  const domains = ['one', 'two', 'three', 'range', 'a-only'].map((suffix, index) => ({
    domainId: `domain-${suffix}`, sourceId: 'synthetic-domains', sourceOrdinal: index + 1,
    label: `SYNTHETIC DOMAIN ${suffix.toUpperCase()}`,
  } satisfies UbsSemanticDomain));
  const references: UbsSemanticReferenceEvidence[] = [
    evidence('reference-one', 'sense-one', 1, 'Synthetic 1:1'),
    evidence('reference-two', 'sense-two', 1, 'Synthetic 1:1-2'),
    evidence('reference-three', 'sense-three', 1, 'Synthetic 1:1'),
    evidence('reference-range', 'sense-range', 1, 'Synthetic 1:1-2'),
  ];
  return { sources: [source('dictionary'), source('lexical_domains')], entries, senses, domains, references };
}

function sense(senseId: string, entryId: string, sourceOrdinal: number, domainId: string): UbsSemanticSense {
  return {
    senseId, entryId, sourceId: 'synthetic-dictionary', sourceOrdinal,
    definition: `SYNTHETIC DEFINITION ${senseId.toUpperCase()}`,
    glosses: [`SYNTHETIC GLOSS ${senseId.toUpperCase()}`],
    domainRefs: [{ sourceId: 'synthetic-domains', domainId }],
  };
}

function evidence(evidenceId: string, senseId: string, sourceOrdinal: number, normalizedReference: string): UbsSemanticReferenceEvidence {
  return {
    evidenceId, senseId, sourceId: 'synthetic-dictionary', sourceOrdinal,
    sourceReference: normalizedReference.replace('Synthetic', 'SYN'), normalizedReference,
    evidenceKind: 'source_attested_sense_reference',
  };
}

class SyntheticRepository implements IUbsSemanticRepository {
  readonly calls: string[] = [];
  constructor(readonly values: SyntheticData, private readonly shape: 'node' | 'd1' = 'node') {}

  async getSource(sourceId: string) {
    this.calls.push(`source:${sourceId}`);
    return clone(this.values.sources.find(item => item.sourceId === sourceId), this.shape);
  }
  async getEntry(sourceId: string, entryId: string) {
    return clone(this.values.entries.find(item => item.sourceId === sourceId && item.entryId === entryId), this.shape);
  }
  async getEntriesByLexicalIdentity(identity: UbsInternalLexicalIdentity, page?: UbsSemanticPageRequest) {
    this.calls.push(`entries:${identity}:${page?.cursor ?? 'first'}`);
    if (page?.cursor) throw new Error('UBS semantic cursor is stale or synthetic-invalid');
    const items = this.values.entries.filter(item => item.lexicalIdentities.includes(identity));
    return createUbsSemanticRepositoryCollection(clone(items, this.shape), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity, { priorShowing: 0 });
  }
  async getSense(sourceId: string, senseId: string) {
    return clone(this.values.senses.find(item => item.sourceId === sourceId && item.senseId === senseId), this.shape);
  }
  async getSensesForEntry(sourceId: string, entryId: string) {
    this.calls.push(`senses:${sourceId}:${entryId}`);
    const items = this.values.senses.filter(item => item.sourceId === sourceId && item.entryId === entryId);
    return createUbsSemanticRepositoryCollection(clone(items, this.shape), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.sensesPerEntry,
      UBS_SEMANTIC_REPOSITORY_LIMITS.sensesPerEntry, { priorShowing: 0 });
  }
  async getDomain(sourceId: string, domainId: string) {
    return clone(this.values.domains.find(item => item.sourceId === sourceId && item.domainId === domainId), this.shape);
  }
  async getDomainsForSense(sourceId: string, senseId: string) {
    this.calls.push(`domains:${sourceId}:${senseId}`);
    const senseValue = this.values.senses.find(item => item.sourceId === sourceId && item.senseId === senseId);
    const keys = new Set(senseValue?.domainRefs.map(ref => `${ref.sourceId}\0${ref.domainId}`));
    const items = this.values.domains.filter(item => keys.has(`${item.sourceId}\0${item.domainId}`));
    return createUbsSemanticRepositoryCollection(clone(items, this.shape), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.domainsPerSense,
      UBS_SEMANTIC_REPOSITORY_LIMITS.domainsPerSense, { priorShowing: 0 });
  }
  async getReferenceEvidenceForSense(sourceId: string, senseId: string) {
    const items = this.values.references.filter(item => item.sourceId === sourceId && item.senseId === senseId);
    return createUbsSemanticRepositoryCollection(clone(items, this.shape), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.referenceEvidencePerSense,
      UBS_SEMANTIC_REPOSITORY_LIMITS.referenceEvidencePerSense, { priorShowing: 0 });
  }
  async findReferenceEvidence(sourceId: string, senseId: string, normalizedReference: string) {
    this.calls.push(`references:${sourceId}:${senseId}:${normalizedReference}`);
    const items = this.values.references.filter(item => item.sourceId === sourceId
      && item.senseId === senseId && item.normalizedReference === normalizedReference);
    return createUbsSemanticRepositoryCollection(clone(items, this.shape), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.matchingReferenceEvidence,
      UBS_SEMANTIC_REPOSITORY_LIMITS.matchingReferenceEvidence, { priorShowing: 0 });
  }
}

function clone<T>(value: T, shape: 'node' | 'd1'): T {
  if (value === undefined) return value;
  const copy = structuredClone(value);
  if (shape === 'node') return copy;
  // Simulate D1's row serialization boundary instead of sharing object identity.
  return JSON.parse(JSON.stringify(copy)) as T;
}

function alignment(senseId = 'sense-one', evidenceId = 'reference-one', token = 'synthetic-token-1', entryId = 'entry-one'): TrustedHebrewTokenAlignment {
  return {
    status: 'verified_token_alignment', morphologyTokenIdentity: token, verifierVersion: 1,
    sourceIdentity: H0001, normalizedReference: 'Synthetic 1:1',
    sourceId: 'synthetic-dictionary', entryId, senseId, evidenceId,
  };
}

describe('HebrewSemanticEvidenceService inactive resolution seam', () => {
  it('produces identical bounded Node- and D1-shaped candidate evidence without adjudicating meaning', async () => {
    const node = new SyntheticRepository(data(), 'node');
    const d1 = new SyntheticRepository(data(), 'd1');
    const request = { publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner' as const };
    const [nodeResult, d1Result] = await Promise.all([
      new HebrewSemanticEvidenceService(node).resolve(request),
      new HebrewSemanticEvidenceService(d1).resolve(request),
    ]);
    expect(d1Result).toEqual(nodeResult);
    expect(node.calls).toEqual(d1.calls);
    expect(nodeResult.resolution).toMatchObject({
      status: 'lexical_candidates', reason: 'reference_alignment_unproven',
    });
    expect(nodeResult.identity).toEqual({ publicStrongs: 'H1', sourceIdentity: 'H0001' });
    expect(nodeResult.plainLanguage).toContain('no trusted token alignment');
    expect(nodeResult.provenanceSources.map(item => item.sourceRole)).toEqual(['dictionary', 'lexical_domains']);
    expect(JSON.stringify(nodeResult)).not.toContain('A0001');
  });

  it('emits the stronger status only for one exact separately verified evidence row', async () => {
    const result = await new HebrewSemanticEvidenceService(new SyntheticRepository(data())).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [alignment()],
    });
    expect(result.resolution).toMatchObject({
      status: 'reference_aligned_source_candidate',
      sense: { senseId: 'sense-one' },
      referenceEvidence: { evidenceId: 'reference-one', normalizedReference: 'Synthetic 1:1' },
      alignmentEvidence: { morphologyTokenIdentity: 'synthetic-token-1', verifierVersion: 1 },
    });
    expect(result.plainLanguage).toContain('candidate, not an adjudicated contextual sense');
  });

  it('keeps repeated local tokens distinct without caching or transferring alignment', async () => {
    const service = new HebrewSemanticEvidenceService(new SyntheticRepository(data()));
    const first = await service.resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [alignment('sense-one', 'reference-one', 'synthetic-token-1')],
    });
    const second = await service.resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [alignment('sense-one', 'reference-one', 'synthetic-token-2')],
    });
    expect(first.resolution).toMatchObject({ alignmentEvidence: { morphologyTokenIdentity: 'synthetic-token-1' } });
    expect(second.resolution).toMatchObject({ alignmentEvidence: { morphologyTokenIdentity: 'synthetic-token-2' } });
  });

  it('snapshots caller-controlled inputs before awaiting repository evidence', async () => {
    const repository = new SyntheticRepository(data());
    const originalEntries = repository.getEntriesByLexicalIdentity.bind(repository);
    let release!: () => void;
    let markEntered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { markEntered = resolve; });
    let receivedPage: UbsSemanticPageRequest | undefined;
    repository.getEntriesByLexicalIdentity = async (identity, page) => {
      receivedPage = page;
      markEntered();
      await gate;
      return originalEntries(identity);
    };
    const trusted = alignment();
    const request: HebrewSemanticEvidenceRequest = {
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      entryPage: { cursor: 'original-synthetic-cursor' },
      trustedAlignments: [trusted],
    };
    const pending = new HebrewSemanticEvidenceService(repository).resolve(request);
    await entered;
    request.audience = 'beginner';
    request.publicStrongs = 'A1';
    request.normalizedReference = 'Mutated 9:9';
    request.entryPage!.cursor = `mutated-${'y'.repeat(5_000)}`;
    request.trustedAlignments = [];
    trusted.morphologyTokenIdentity = `mutated-${'x'.repeat(1_000)}`;
    trusted.verifierVersion = HEBREW_SEMANTIC_EVIDENCE_LIMITS.verifierVersionMaximum + 1;
    trusted.senseId = 'sense-three';
    trusted.evidenceId = 'reference-three';
    release();
    const resolved = await pending;
    expect(resolved.audience).toBe('expert');
    expect(resolved.identity.publicStrongs).toBe('H1');
    expect(resolved.normalizedReference).toBe('Synthetic 1:1');
    expect(receivedPage).toEqual({ cursor: 'original-synthetic-cursor' });
    expect(resolved.resolution).toMatchObject({
      status: 'reference_aligned_source_candidate',
      sense: { senseId: 'sense-one' },
      referenceEvidence: { evidenceId: 'reference-one' },
      alignmentEvidence: { morphologyTokenIdentity: 'synthetic-token-1', verifierVersion: 1 },
    });
    expect(JSON.stringify(resolved)).not.toContain('mutated-');
  });

  it('reads an accessor-backed alignment token exactly once before validation', async () => {
    let tokenReads = 0;
    const accessorAlignment = {
      ...alignment(),
      get morphologyTokenIdentity() {
        tokenReads += 1;
        return tokenReads === 1 ? 'synthetic-token-1' : `leaked-${'x'.repeat(1_000)}`;
      },
    } as TrustedHebrewTokenAlignment;
    const resolved = await new HebrewSemanticEvidenceService(new SyntheticRepository(data())).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [accessorAlignment],
    });
    expect(tokenReads).toBe(1);
    expect(resolved.resolution).toMatchObject({
      status: 'reference_aligned_source_candidate',
      sense: { senseId: 'sense-one' },
      alignmentEvidence: { morphologyTokenIdentity: 'synthetic-token-1' },
    });
    expect(JSON.stringify(resolved)).not.toContain('leaked-');
  });

  it('reads every Proxy-backed exact alignment property once and uses only that snapshot', async () => {
    const first = alignment();
    const later: Record<keyof TrustedHebrewTokenAlignment, unknown> = {
      status: 'not-verified',
      morphologyTokenIdentity: `leaked-${'x'.repeat(1_000)}`,
      verifierVersion: HEBREW_SEMANTIC_EVIDENCE_LIMITS.verifierVersionMaximum + 1,
      sourceIdentity: H0002,
      normalizedReference: 'Mutated 9:9',
      sourceId: 'synthetic-other',
      entryId: 'entry-two',
      senseId: 'sense-three',
      evidenceId: 'reference-three',
    };
    const reads = new Map<PropertyKey, number>();
    const proxied = new Proxy(first, {
      get(target, property, receiver) {
        const count = (reads.get(property) ?? 0) + 1;
        reads.set(property, count);
        return count === 1
          ? Reflect.get(target, property, receiver)
          : later[property as keyof TrustedHebrewTokenAlignment];
      },
    });
    const resolved = await new HebrewSemanticEvidenceService(new SyntheticRepository(data())).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [proxied],
    });
    expect([...reads.entries()]).toEqual([
      ['status', 1],
      ['morphologyTokenIdentity', 1],
      ['verifierVersion', 1],
      ['sourceIdentity', 1],
      ['normalizedReference', 1],
      ['sourceId', 1],
      ['entryId', 1],
      ['senseId', 1],
      ['evidenceId', 1],
    ]);
    expect(resolved.resolution).toMatchObject({
      status: 'reference_aligned_source_candidate',
      sense: { senseId: 'sense-one' },
      referenceEvidence: { evidenceId: 'reference-one' },
      alignmentEvidence: { morphologyTokenIdentity: 'synthetic-token-1', verifierVersion: 1 },
    });
    expect(JSON.stringify(resolved)).not.toContain('leaked-');
  });

  it('rejects dishonest Proxy array lengths before reaching the repository', async () => {
    for (const reportedLength of [Number.NaN, -1, 1.5, 9]) {
      const repository = new SyntheticRepository(data());
      let lengthReads = 0;
      const alignments = new Proxy([alignment()], {
        get(target, property, receiver) {
          if (property === 'length') {
            lengthReads += 1;
            return reportedLength;
          }
          return Reflect.get(target, property, receiver);
        },
      });
      await expect(new HebrewSemanticEvidenceService(repository).resolve({
        publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
        trustedAlignments: alignments,
      })).rejects.toThrow('honest safe-integer length');
      expect(lengthReads).toBe(1);
      expect(repository.calls).toEqual([]);
    }
  });

  it('rejects a Proxy-truncated mixed assertion set before a valid assertion can promote', async () => {
    const repository = new SyntheticRepository(data());
    let lengthReads = 0;
    const mixed = [
      alignment(),
      alignment('sense-three', 'missing-reference', 'synthetic-token-1', 'entry-two'),
    ];
    const truncated = new Proxy(mixed, {
      get(target, property, receiver) {
        if (property === 'length') {
          lengthReads += 1;
          return 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: truncated,
    })).rejects.toThrow('no assertion hidden beyond its reported length');
    expect(lengthReads).toBe(1);
    expect(repository.calls).toEqual([]);
  });

  it('rejects zero-length dishonesty and sparse or missing assertion indices', async () => {
    const hiddenRepository = new SyntheticRepository(data());
    const hidden = new Proxy([alignment()], {
      get(target, property, receiver) {
        return property === 'length' ? 0 : Reflect.get(target, property, receiver);
      },
    });
    await expect(new HebrewSemanticEvidenceService(hiddenRepository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: hidden,
    })).rejects.toThrow('no assertion hidden beyond its reported length');
    expect(hiddenRepository.calls).toEqual([]);

    const sparseRepository = new SyntheticRepository(data());
    const sparse = new Array<TrustedHebrewTokenAlignment>(2);
    sparse[0] = alignment();
    await expect(new HebrewSemanticEvidenceService(sparseRepository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: sparse,
    })).rejects.toThrow('every reported index present');
    expect(sparseRepository.calls).toEqual([]);
  });

  it('reads each Proxy-backed request field and page cursor exactly once', async () => {
    const repository = new SyntheticRepository(data());
    const originalEntries = repository.getEntriesByLexicalIdentity.bind(repository);
    repository.getEntriesByLexicalIdentity = async identity => originalEntries(identity);
    let cursorReads = 0;
    const page = {
      get cursor() {
        cursorReads += 1;
        return cursorReads === 1 ? 'original-synthetic-cursor' : `leaked-${'y'.repeat(5_000)}`;
      },
    } as UbsSemanticPageRequest;
    const first: HebrewSemanticEvidenceRequest = {
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      entryPage: page, trustedAlignments: [alignment()],
    };
    const later: Record<keyof HebrewSemanticEvidenceRequest, unknown> = {
      publicStrongs: 'A1', normalizedReference: 'Mutated 9:9', audience: 'beginner',
      entryPage: undefined, trustedAlignments: [],
    };
    const reads = new Map<PropertyKey, number>();
    const request = new Proxy(first, {
      get(target, property, receiver) {
        const count = (reads.get(property) ?? 0) + 1;
        reads.set(property, count);
        return count === 1
          ? Reflect.get(target, property, receiver)
          : later[property as keyof HebrewSemanticEvidenceRequest];
      },
    });
    const resolved = await new HebrewSemanticEvidenceService(repository).resolve(request);
    expect([...reads.values()].every(count => count === 1)).toBe(true);
    expect([...reads.keys()].sort()).toEqual([
      'audience', 'entryPage', 'normalizedReference', 'publicStrongs', 'trustedAlignments',
    ]);
    expect(cursorReads).toBe(1);
    expect(resolved).toMatchObject({
      audience: 'expert', identity: { publicStrongs: 'H1' }, normalizedReference: 'Synthetic 1:1',
      resolution: { status: 'reference_aligned_source_candidate', sense: { senseId: 'sense-one' } },
    });
  });

  it('preserves ambiguity when two exact source candidates are separately aligned', async () => {
    const result = await new HebrewSemanticEvidenceService(new SyntheticRepository(data())).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [alignment(), alignment('sense-three', 'reference-three', 'synthetic-token-1', 'entry-two')],
    });
    expect(result.resolution).toMatchObject({ status: 'lexical_candidates', reason: 'ambiguous_reference_alignment' });
  });

  it('does not invent sense ambiguity from two exact evidence rows for the same sense', async () => {
    const values = data();
    values.references.splice(1, 0, evidence('reference-one-b', 'sense-one', 2, 'Synthetic 1:1'));
    const result = await new HebrewSemanticEvidenceService(new SyntheticRepository(values)).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [alignment(), alignment('sense-one', 'reference-one-b')],
    });
    expect(result.resolution).toMatchObject({
      status: 'reference_aligned_source_candidate', referenceEvidence: { evidenceId: 'reference-one' },
    });
  });

  it('does not infer range overlap and distinguishes absent reference evidence', async () => {
    const service = new HebrewSemanticEvidenceService(new SyntheticRepository(data()));
    const exact = await service.resolve({ publicStrongs: 'H2', normalizedReference: 'Synthetic 1:1', audience: 'beginner' });
    expect(exact.resolution).toMatchObject({ status: 'lexical_candidates', reason: 'no_reference_evidence' });
    const range = await service.resolve({ publicStrongs: 'H2', normalizedReference: 'Synthetic 1:1-2', audience: 'beginner' });
    expect(range.resolution).toMatchObject({ status: 'lexical_candidates', reason: 'reference_alignment_unproven' });
  });

  it('preserves H+A internally, rejects public A input, and never promotes an A-only entry', async () => {
    const service = new HebrewSemanticEvidenceService(new SyntheticRepository(data()));
    await expect(service.resolve({ publicStrongs: 'A0002', normalizedReference: 'Synthetic 1:1', audience: 'beginner' }))
      .rejects.toThrow('public H-number');
    const missing = await service.resolve({ publicStrongs: 'H3', normalizedReference: 'Synthetic 1:1', audience: 'beginner' });
    expect(missing.resolution).toEqual({ status: 'unavailable', reason: 'no_lexical_entry' });
  });

  it('distinguishes a lexical entry with no publishable senses from no lexical entry', async () => {
    const values = data();
    values.senses = values.senses.filter(item => item.entryId !== 'entry-range');
    const unavailable = await new HebrewSemanticEvidenceService(new SyntheticRepository(values)).resolve({
      publicStrongs: 'H2', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
    });
    expect(unavailable.resolution).toEqual({
      status: 'unavailable', reason: 'no_publishable_semantic_evidence',
    });
  });

  it('propagates stale internal repository cursors before sense or provenance work', async () => {
    const repository = new SyntheticRepository(data());
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
      entryPage: { cursor: 'stale-synthetic-cursor' },
    })).rejects.toThrow('cursor is stale');
    expect(repository.calls).toEqual(['entries:H0001:stale-synthetic-cursor']);
  });

  it('fails closed on missing or mismatched trusted alignment evidence', async () => {
    const service = new HebrewSemanticEvidenceService(new SyntheticRepository(data()));
    await expect(service.resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [alignment('sense-two', 'missing-reference')],
    })).rejects.toThrow('every trusted alignment must match one exact returned');
    await expect(service.resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [{ ...alignment(), normalizedReference: 'Synthetic 1:2' }],
    })).rejects.toThrow('exact token, source identity, normalized reference');
  });

  it('bounds candidate inspection and deterministic calls even with many senses', async () => {
    const values = data();
    values.entries = [values.entries[0]];
    values.senses = Array.from({ length: 20 }, (_, index) => sense(
      `sense-many-${String(index + 1).padStart(2, '0')}`, 'entry-one', index + 1, 'domain-one',
    ));
    values.references = [];
    const repository = new SyntheticRepository(values);
    const result = await new HebrewSemanticEvidenceService(repository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 9:9', audience: 'beginner',
    });
    expect(result.resolution).toMatchObject({ status: 'lexical_candidates', reason: 'reference_alignment_unproven' });
    expect(result.coverage).toMatchObject({
      inspectedSenseCount: 8,
      publishableCandidateCount: HEBREW_SEMANTIC_EVIDENCE_LIMITS.candidates,
      completeForReturnedEntryWindow: false,
    });
    expect(repository.calls.filter(call => call.startsWith('domains:'))).toHaveLength(8);
    expect(repository.calls.filter(call => call.startsWith('references:'))).toHaveLength(8);
  });

  it('prioritizes an exact trusted sense within a bounded returned sense page', async () => {
    const values = data();
    values.entries = [values.entries[0]];
    values.senses = Array.from({ length: 12 }, (_, index) => sense(
      `sense-priority-${String(index + 1).padStart(2, '0')}`, 'entry-one', index + 1, 'domain-one',
    ));
    values.references = [evidence('reference-priority', 'sense-priority-12', 1, 'Synthetic 1:1')];
    const result = await new HebrewSemanticEvidenceService(new SyntheticRepository(values)).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [{
        ...alignment('sense-priority-12', 'reference-priority'), entryId: 'entry-one',
      }],
    });
    expect(result.resolution).toMatchObject({
      status: 'reference_aligned_source_candidate', sense: { senseId: 'sense-priority-12' },
    });
    expect(result.coverage.completeForReturnedEntryWindow).toBe(false);
  });

  it('fails closed when a mixed trusted-assertion set contains even one unmatched row', async () => {
    await expect(new HebrewSemanticEvidenceService(new SyntheticRepository(data())).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [alignment(), alignment('sense-three', 'missing-reference', 'synthetic-token-1', 'entry-two')],
    })).rejects.toThrow('every trusted alignment must match one exact returned');
  });

  it('fails closed when a trusted assertion is outside the bounded candidate window', async () => {
    const values = data();
    values.entries = values.entries.slice(0, 2);
    values.senses = [
      ...Array.from({ length: 8 }, (_, index) => sense(
        `sense-window-${String(index + 1).padStart(2, '0')}`, 'entry-one', index + 1, 'domain-one',
      )),
      sense('sense-three', 'entry-two', 1, 'domain-three'),
    ];
    values.references = [evidence('reference-three', 'sense-three', 1, 'Synthetic 1:1')];
    await expect(new HebrewSemanticEvidenceService(new SyntheticRepository(values)).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
      trustedAlignments: [alignment('sense-three', 'reference-three', 'synthetic-token-1', 'entry-two')],
    })).rejects.toThrow('every trusted alignment must match one exact returned');
  });

  it('never treats an empty offset window as proof that no lexical entry exists', async () => {
    const repository = new SyntheticRepository(data());
    repository.getEntriesByLexicalIdentity = async () => ({
      items: [], total: 1, showing: 0, priorShowing: 1, consumed: 1, hasMore: false,
      order: UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      limit: UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
    });
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
      entryPage: { cursor: 'synthetic-offset-window' },
    })).rejects.toThrow('incomplete entry evidence cannot establish');
  });

  it('rejects incomplete first-page sense, domain, and reference evidence', async () => {
    const cases = ['sense', 'domain', 'reference'] as const;
    for (const kind of cases) {
      const repository = new SyntheticRepository(data());
      if (kind === 'sense') {
        repository.getSensesForEntry = async (sourceId, entryId) => ({
          items: [sense('sense-one', entryId, 1, 'domain-one')], total: 2, showing: 1,
          priorShowing: 0, consumed: 1, hasMore: true, nextCursor: 'synthetic-more-senses',
          order: UBS_SEMANTIC_REPOSITORY_ORDER.sensesPerEntry,
          limit: UBS_SEMANTIC_REPOSITORY_LIMITS.sensesPerEntry,
        });
      } else if (kind === 'domain') {
        repository.getDomainsForSense = async () => ({
          items: [data().domains[0]], total: 2, showing: 1, priorShowing: 0, consumed: 1,
          hasMore: true, nextCursor: 'synthetic-more-domains',
          order: UBS_SEMANTIC_REPOSITORY_ORDER.domainsPerSense,
          limit: UBS_SEMANTIC_REPOSITORY_LIMITS.domainsPerSense,
        });
      } else {
        repository.findReferenceEvidence = async () => ({
          items: [evidence('reference-one', 'sense-one', 1, 'Synthetic 1:1')], total: 2,
          showing: 1, priorShowing: 0, consumed: 1, hasMore: true, nextCursor: 'synthetic-more-references',
          order: UBS_SEMANTIC_REPOSITORY_ORDER.matchingReferenceEvidence,
          limit: UBS_SEMANTIC_REPOSITORY_LIMITS.matchingReferenceEvidence,
        });
      }
      await expect(new HebrewSemanticEvidenceService(repository).resolve({
        publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
      })).rejects.toThrow(`repository ${kind === 'reference' ? 'reference evidence' : kind} first-page collection must be complete`);
    }
  });

  it('rejects internally inconsistent short-page counts rather than publishing partial evidence', async () => {
    const repository = new SyntheticRepository(data());
    repository.getSensesForEntry = async (_sourceId, entryId) => ({
      items: [sense('sense-one', entryId, 1, 'domain-one')], total: 2, showing: 1,
      priorShowing: 0, consumed: 1, hasMore: false,
      order: UBS_SEMANTIC_REPOSITORY_ORDER.sensesPerEntry,
      limit: UBS_SEMANTIC_REPOSITORY_LIMITS.sensesPerEntry,
    });
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
    })).rejects.toThrow('bounded honest-window contract');
  });

  it('does not assert unavailability when an entry window is incomplete', async () => {
    const values = data();
    values.senses = [];
    const repository = new SyntheticRepository(values);
    repository.getEntriesByLexicalIdentity = async () => ({
      items: [values.entries[0]], total: 2, showing: 1, priorShowing: 0, consumed: 1,
      hasMore: true, nextCursor: 'synthetic-more-entries',
      order: UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      limit: UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
    });
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
    })).rejects.toThrow('incomplete repository evidence cannot establish');
  });

  it('rejects all 66 Unicode noncharacters in trusted token identities', async () => {
    const noncharacters = [
      ...Array.from({ length: 0x20 }, (_, index) => 0xfdd0 + index),
      ...Array.from({ length: 17 }, (_, plane) => [0xfffe + plane * 0x10000, 0xffff + plane * 0x10000]).flat(),
    ];
    expect(noncharacters).toHaveLength(66);
    for (const codePoint of noncharacters) {
      await expect(new HebrewSemanticEvidenceService(new SyntheticRepository(data())).resolve({
        publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert',
        trustedAlignments: [alignment('sense-one', 'reference-one', `token-${String.fromCodePoint(codePoint)}`)],
      })).rejects.toThrow('morphology token identity');
    }
  });

  it('rejects Unicode noncharacters across repository and provenance text fields', async () => {
    const bad = String.fromCodePoint(0x10ffff);
    const mutations: Array<(values: SyntheticData) => void> = [
      values => { values.entries[0].lemma = `lemma-${bad}`; },
      values => { values.entries[0].transliteration = `transliteration-${bad}`; },
      values => { values.entries[0].partOfSpeech = `part-${bad}`; },
      values => { values.senses[0].definition = `definition-${bad}`; },
      values => { values.senses[0].glosses = [`gloss-${bad}`]; },
      values => { values.domains[0].label = `label-${bad}`; },
      values => { values.domains[0].description = `description-${bad}`; },
      values => { values.sources[0].title = `title-${bad}`; },
      values => { values.sources[0].modificationNote = `note-${bad}`; },
      values => { values.sources[0].sourceUrl = `https://example.invalid/${bad}`; },
    ];
    for (const mutate of mutations) {
      const values = data();
      mutate(values);
      await expect(new HebrewSemanticEvidenceService(new SyntheticRepository(values)).resolve({
        publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
      })).rejects.toThrow();
    }
  });

  it('rejects a Unicode noncharacter in a bounded repository cursor token', async () => {
    const repository = new SyntheticRepository(data());
    repository.getEntriesByLexicalIdentity = async () => ({
      items: [data().entries[0]], total: 2, showing: 1, priorShowing: 0, consumed: 1,
      hasMore: true, nextCursor: `cursor-${String.fromCodePoint(0xffff)}`,
      order: UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      limit: UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
    });
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
    })).rejects.toThrow('bounded honest-window contract');
  });

  it('fails closed on incomplete provenance and malformed repository identity evidence', async () => {
    const missingSource = data();
    missingSource.sources.pop();
    await expect(new HebrewSemanticEvidenceService(new SyntheticRepository(missingSource)).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
    })).rejects.toThrow('provenance is missing');

    const wrongIdentity = data();
    wrongIdentity.entries[0].lexicalIdentities = [A0001];
    const repository = new SyntheticRepository(wrongIdentity);
    repository.getEntriesByLexicalIdentity = async () => createUbsSemanticRepositoryCollection(
      [wrongIdentity.entries[0]], 1,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
      { priorShowing: 0 },
    );
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
    })).rejects.toThrow('requested branded lexical identity');
  });

  it('enforces compiler identity uniqueness across the complete resolution', async () => {
    const duplicateLexicalIdentity = data();
    duplicateLexicalIdentity.entries[0].lexicalIdentities = [H0001, H0001];
    await expect(new HebrewSemanticEvidenceService(new SyntheticRepository(duplicateLexicalIdentity)).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
    })).rejects.toThrow('lexical identities must be unique');

    const duplicateSenseIdentity = data();
    duplicateSenseIdentity.senses = [
      sense('sense-duplicate', 'entry-one', 1, 'domain-one'),
      sense('sense-duplicate', 'entry-two', 1, 'domain-three'),
    ];
    duplicateSenseIdentity.references = [];
    await expect(new HebrewSemanticEvidenceService(new SyntheticRepository(duplicateSenseIdentity)).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
    })).rejects.toThrow('duplicate cross-resolution identity');

    const duplicateEvidenceIdentity = data();
    duplicateEvidenceIdentity.references = [
      evidence('reference-duplicate', 'sense-one', 1, 'Synthetic 1:1'),
      evidence('reference-duplicate', 'sense-three', 1, 'Synthetic 1:1'),
    ];
    await expect(new HebrewSemanticEvidenceService(new SyntheticRepository(duplicateEvidenceIdentity)).resolve({
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
    })).rejects.toThrow('duplicate cross-resolution identity');
  });

  it('enforces compiler ordinal uniqueness for entries, senses, domains, and references', async () => {
    const cases: Array<{ mutate: (values: SyntheticData) => void; message: string }> = [
      {
        mutate: values => { values.entries[1].sourceOrdinal = values.entries[0].sourceOrdinal; },
        message: 'entries contain a duplicate source ordinal',
      },
      {
        mutate: values => { values.senses[1].sourceOrdinal = values.senses[0].sourceOrdinal; },
        message: 'senses contain a duplicate source ordinal',
      },
      {
        mutate: values => {
          values.senses[0].domainRefs.push({ sourceId: 'synthetic-domains', domainId: 'domain-two' });
          values.domains[1].sourceOrdinal = values.domains[0].sourceOrdinal;
        },
        message: 'domains contain a duplicate source ordinal',
      },
      {
        mutate: values => {
          values.references.splice(1, 0, evidence('reference-one-b', 'sense-one', 1, 'Synthetic 1:1'));
        },
        message: 'reference evidence contains a duplicate source ordinal',
      },
    ];
    for (const testCase of cases) {
      const values = data();
      testCase.mutate(values);
      await expect(new HebrewSemanticEvidenceService(new SyntheticRepository(values)).resolve({
        publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'beginner',
      })).rejects.toThrow(testCase.message);
    }
  });
});
