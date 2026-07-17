import { describe, expect, it } from 'vitest';
import {
  UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS,
  createUbsSemanticEvidenceBundleCursor,
  parseUbsSemanticEvidenceBundleCursor,
  queryUbsSemanticEvidenceBundle,
  type IUbsSemanticEvidenceBundleRepository,
  type UbsSemanticEvidenceBundleCandidateRow,
  type UbsSemanticEvidenceBundleRepositoryPage,
  type UbsSemanticEvidenceBundleRepositoryQuery,
} from '../../../src/kernel/ubsSemanticEvidenceBundle.js';
import { requireUbsInternalLexicalIdentity } from '../../../src/kernel/ubsSemanticDomain.js';
import type {
  UbsInternalHebrewLexicalIdentity,
  UbsSemanticDomain,
  UbsSemanticEntry,
  UbsSemanticReferenceEvidence,
  UbsSemanticSense,
  UbsSemanticSource,
} from '../../../src/kernel/ubsSemanticDomain.js';

const ARTIFACT = '7'.repeat(64);
const OTHER_ARTIFACT = '8'.repeat(64);
const H0001 = requireUbsInternalLexicalIdentity('H0001') as UbsInternalHebrewLexicalIdentity;
const H0002 = requireUbsInternalLexicalIdentity('H0002') as UbsInternalHebrewLexicalIdentity;

function source(role: 'dictionary' | 'lexical_domains'): UbsSemanticSource {
  return {
    sourceId: role === 'dictionary' ? 'synthetic-dictionary' : 'synthetic-domains',
    sourceRole: role,
    schemaVersion: 'ubs-semantics.v1', artifactIdentity: ARTIFACT,
    title: `SYNTHETIC ${role.toUpperCase()}`,
    artifactName: role === 'dictionary'
      ? 'UBSHebrewDic-v0.9.2-en.JSON' : 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
    artifactVersion: '0.9.2', language: 'Hebrew', publisher: 'United Bible Societies',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: `https://example.invalid/synthetic/${role}`,
    sourceCommit: (role === 'dictionary' ? '1' : '2').repeat(40),
    sourceBlob: (role === 'dictionary' ? '3' : '4').repeat(40),
    sourceSha256: (role === 'dictionary' ? '5' : '6').repeat(64),
    transformVersion: 7, modified: true, modificationNote: 'Synthetic only.',
  } as UbsSemanticSource;
}

function candidate(index: number, normalizedReference = 'Synthetic 1:1'): UbsSemanticEvidenceBundleCandidateRow {
  const suffix = String(index).padStart(2, '0');
  const entry: UbsSemanticEntry = {
    sourceId: 'synthetic-dictionary', entryId: 'entry-one', sourceOrdinal: 1,
    lemma: 'SYNTHETIC LEMMA', lexicalIdentities: [H0001],
  };
  const domain: UbsSemanticDomain = {
    sourceId: 'synthetic-domains', domainId: `domain-${suffix}`,
    sourceOrdinal: index, label: `SYNTHETIC DOMAIN ${suffix}`,
  };
  const sense: UbsSemanticSense = {
    sourceId: 'synthetic-dictionary', entryId: entry.entryId,
    senseId: `sense-${suffix}`, sourceOrdinal: index,
    definition: `SYNTHETIC DEFINITION ${suffix}`, glosses: [`GLOSS ${suffix}`],
    domainRefs: [{ sourceId: domain.sourceId, domainId: domain.domainId }],
  };
  const evidence: UbsSemanticReferenceEvidence = {
    sourceId: sense.sourceId, senseId: sense.senseId,
    evidenceId: `reference-${suffix}`, sourceOrdinal: 1,
    sourceReference: 'SYN 1:1', normalizedReference,
    evidenceKind: 'source_attested_sense_reference',
  };
  return {
    entry, sense, domains: [domain], domainTotal: 1,
    matchingReferences: [evidence], matchingReferenceTotal: 1,
  };
}

function candidateKeyset(candidateRow: UbsSemanticEvidenceBundleCandidateRow): [string, string, string, string, string] {
  return [
    candidateRow.entry.sourceId,
    String(candidateRow.entry.sourceOrdinal),
    candidateRow.entry.entryId,
    String(candidateRow.sense.sourceOrdinal),
    candidateRow.sense.senseId,
  ];
}

function sameKeyset(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hostileEnumerableProxy<T extends object>(value: T, label: string): T {
  return new Proxy(value, {
    ownKeys(target) {
      return [...Reflect.ownKeys(target), label];
    },
    getOwnPropertyDescriptor(target, property) {
      if (property === label) return { configurable: true, enumerable: true };
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    get(target, property, receiver) {
      if (property === label) throw new Error(`unvalidated ${label} must never be read`);
      return Reflect.get(target, property, receiver);
    },
  });
}

function candidateWithCappedDomains(total = 17): UbsSemanticEvidenceBundleCandidateRow {
  const value = candidate(1);
  const domains = Array.from({ length: UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.domainsPerSense }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    return {
      sourceId: 'synthetic-domains',
      domainId: `domain-cap-${suffix}`,
      sourceOrdinal: index + 1,
      label: `SYNTHETIC CAPPED DOMAIN ${suffix}`,
    } as UbsSemanticDomain;
  });
  value.domains = [...domains].reverse();
  value.sense.domainRefs = domains.map(domain => ({
    sourceId: domain.sourceId,
    domainId: domain.domainId,
  })).reverse();
  value.domainTotal = total;
  return value;
}

class SyntheticAggregateRepository implements IUbsSemanticEvidenceBundleRepository {
  queryCount = 0;
  readonly queries: UbsSemanticEvidenceBundleRepositoryQuery[] = [];

  constructor(
    private readonly allCandidates: UbsSemanticEvidenceBundleCandidateRow[],
    private readonly shape: 'node' | 'd1' = 'node',
    private readonly lexicalEntryTotal = allCandidates.length > 0 ? 1 : 0,
  ) {}

  async getSemanticEvidenceBundle(query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>) {
    this.queryCount += 1;
    this.queries.push(structuredClone(query));
    if (query.artifactIdentity !== ARTIFACT) {
      throw new Error('synthetic aggregate artifact is unavailable');
    }
    const exactCandidates = this.allCandidates.filter(candidateRow =>
      candidateRow.entry.lexicalIdentities.includes(query.sourceIdentity)
      && candidateRow.matchingReferences.some(evidence =>
        evidence.normalizedReference === query.normalizedReference,
      ));
    let start = 0;
    if (query.after) {
      const boundaryIndex = exactCandidates.findIndex(candidateRow =>
        sameKeyset(candidateKeyset(candidateRow), query.after!.keyset));
      if (boundaryIndex < 0 || boundaryIndex + 1 !== query.after.priorShowing) {
        throw new Error('synthetic aggregate cursor is not a genuine current page boundary');
      }
      start = boundaryIndex + 1;
    }
    const items = exactCandidates.slice(start, start + query.limit);
    const page: UbsSemanticEvidenceBundleRepositoryPage = {
      items,
      lexicalEntryTotal: this.lexicalEntryTotal,
      semanticSenseTotal: exactCandidates.length,
      boundary: {
        artifactIdentity: query.artifactIdentity,
        sourceIdentity: query.sourceIdentity,
        normalizedReference: query.normalizedReference,
        order: query.order,
        priorShowing: start,
        ...(query.after ? { after: { keyset: [...query.after.keyset] as [string, string, string, string, string] } } : {}),
      },
      sources: [source('dictionary'), source('lexical_domains')],
    };
    return clone(page, this.shape);
  }
}

function clone<T>(value: T, shape: 'node' | 'd1'): T {
  const copy = structuredClone(value);
  return shape === 'node' ? copy : JSON.parse(JSON.stringify(copy)) as T;
}

function request(overrides: Partial<{
  artifactIdentity: string;
  sourceIdentity: UbsInternalHebrewLexicalIdentity;
  normalizedReference: string;
  cursor: string;
}> = {}) {
  return {
    artifactIdentity: overrides.artifactIdentity ?? ARTIFACT,
    sourceIdentity: overrides.sourceIdentity ?? H0001,
    normalizedReference: overrides.normalizedReference ?? 'Synthetic 1:1',
    ...(overrides.cursor ? { page: { cursor: overrides.cursor } } : {}),
  };
}

function mutateCursor(cursor: string, mutate: (payload: Record<string, unknown>) => void): string {
  const bytes = cursor.slice(6).match(/../g)!.map(byte => Number.parseInt(byte, 16));
  const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as Record<string, unknown>;
  mutate(payload);
  return encodeRawCursorJson(JSON.stringify(payload));
}

function encodeRawCursorJson(json: string): string {
  return `ubsa1_${[...new TextEncoder().encode(json)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

describe('inactive UBS semantic aggregate evidence bundle', () => {
  it('produces byte-equivalent synthetic Node/D1-shaped bundles with one query', async () => {
    const values = [candidate(1), candidate(2), candidate(3)];
    const node = new SyntheticAggregateRepository(values, 'node');
    const d1 = new SyntheticAggregateRepository(values, 'd1');
    const [nodeResult, d1Result] = await Promise.all([
      queryUbsSemanticEvidenceBundle(node, request()),
      queryUbsSemanticEvidenceBundle(d1, request()),
    ]);
    expect(d1Result).toEqual(nodeResult);
    expect(node.queryCount).toBe(1);
    expect(d1.queryCount).toBe(1);
    expect(nodeResult.coverage).toMatchObject({
      completeForReturnedWindow: true,
      completeForWholeQuery: true,
      incompleteReasons: [],
      candidateWindow: { returnedCount: 3, totalCount: 3, hasMore: false },
    });
  });

  it('canonicalizes explicit undefined optionals identically across Node and D1 shapes', async () => {
    const value = candidate(1);
    value.entry.transliteration = undefined;
    value.entry.partOfSpeech = undefined;
    value.domains[0].parentDomainId = undefined;
    value.domains[0].description = undefined;
    const node = await queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository([value], 'node'), request(),
    );
    const d1 = await queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository([value], 'd1'), request(),
    );
    expect(node).toEqual(d1);
    expect('transliteration' in node.candidates[0].entry).toBe(false);
    expect('partOfSpeech' in node.candidates[0].entry).toBe(false);
    expect('parentDomainId' in node.candidates[0].domains[0]).toBe(false);
    expect('description' in node.candidates[0].domains[0]).toBe(false);
  });

  it('allowlists validated fields without enumerating hostile adapter extras', async () => {
    const repository = new SyntheticAggregateRepository([candidate(1)]);
    const original = repository.getSemanticEvidenceBundle.bind(repository);
    repository.getSemanticEvidenceBundle = async query => {
      const page = await original(query);
      page.items[0].sense.domainRefs[0] = hostileEnumerableProxy(
        page.items[0].sense.domainRefs[0], 'hostileDomainReference',
      );
      page.items[0].matchingReferences[0] = hostileEnumerableProxy(
        page.items[0].matchingReferences[0], 'hostileReferenceEvidence',
      );
      page.items[0].sense = hostileEnumerableProxy(page.items[0].sense, 'hostileSense');
      page.sources[0] = hostileEnumerableProxy(page.sources[0], 'hostileProvenance');
      return page;
    };
    const result = await queryUbsSemanticEvidenceBundle(repository, request());
    expect(result.candidates[0]!.sense).not.toHaveProperty('hostileSense');
    expect(result.candidates[0]!.sense.domainRefs[0]).not.toHaveProperty('hostileDomainReference');
    expect(result.candidates[0]!.matchingReferences[0]).not.toHaveProperty('hostileReferenceEvidence');
    expect(result.sources[0]).not.toHaveProperty('hostileProvenance');
    expect(repository.queryCount).toBe(1);
  });

  it('canonicalizes lexical identities and nested domain/reference evidence across shuffled Node/D1 shapes', async () => {
    const shuffled = candidateWithCappedDomains(16);
    shuffled.entry.lexicalIdentities = [H0002, H0001];
    shuffled.matchingReferences = [
      {
        ...shuffled.matchingReferences[0],
        evidenceId: 'reference-z',
        sourceOrdinal: 2,
      },
      {
        ...shuffled.matchingReferences[0],
        evidenceId: 'reference-a',
        sourceOrdinal: 1,
      },
    ];
    shuffled.matchingReferenceTotal = 2;
    const ordered = structuredClone(shuffled);
    ordered.entry.lexicalIdentities.reverse();
    ordered.sense.domainRefs.reverse();
    ordered.domains.reverse();
    ordered.matchingReferences.reverse();
    const [node, d1] = await Promise.all([
      queryUbsSemanticEvidenceBundle(new SyntheticAggregateRepository([shuffled], 'node'), request()),
      queryUbsSemanticEvidenceBundle(new SyntheticAggregateRepository([ordered], 'd1'), request()),
    ]);
    expect(node).toEqual(d1);
    expect(node.candidates[0]!.entry.lexicalIdentities).toEqual([H0001, H0002]);
    expect(node.candidates[0]!.sense.domainRefs.map(ref => ref.domainId)).toEqual([
      ...node.candidates[0]!.sense.domainRefs.map(ref => ref.domainId),
    ].sort());
    expect(node.candidates[0]!.matchingReferences.map(evidence => evidence.evidenceId))
      .toEqual(['reference-a', 'reference-z']);
  });

  it('rejects adversarial nested ordering ties that cannot have a deterministic source identity', async () => {
    const value = candidate(1);
    value.matchingReferences = [
      value.matchingReferences[0],
      { ...value.matchingReferences[0], evidenceId: 'reference-tie', sourceOrdinal: 1 },
    ];
    value.matchingReferenceTotal = 2;
    await expect(queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository([value]), request(),
    )).rejects.toThrow('duplicate reference ordinal');
  });

  it('uses a fixed one-query count independent of zero, one, or many candidates', async () => {
    for (const count of [0, 1, 20]) {
      const repository = new SyntheticAggregateRepository(
        Array.from({ length: count }, (_, index) => candidate(index + 1)),
      );
      const result = await queryUbsSemanticEvidenceBundle(repository, request());
      expect(repository.queryCount).toBe(1);
      expect(result.candidates).toHaveLength(Math.min(
        count, UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.candidatesPerPage,
      ));
    }
  });

  it('paginates deterministic candidate windows and marks both pages honestly incomplete', async () => {
    const values = Array.from({ length: 10 }, (_, index) => candidate(index + 1));
    const firstRepository = new SyntheticAggregateRepository(values);
    const first = await queryUbsSemanticEvidenceBundle(firstRepository, request());
    expect(firstRepository.queryCount).toBe(1);
    expect(first.coverage).toMatchObject({
      completeForReturnedWindow: true, completeForWholeQuery: false,
      incompleteReasons: ['candidate_window'],
      candidateWindow: { priorCount: 0, returnedCount: 8, consumedCount: 8, totalCount: 10, hasMore: true },
    });
    const cursor = first.coverage.candidateWindow.nextCursor!;
    const secondRepository = new SyntheticAggregateRepository(values);
    const second = await queryUbsSemanticEvidenceBundle(secondRepository, request({ cursor }));
    expect(secondRepository.queryCount).toBe(1);
    expect(second.candidates.map(item => item.sense.senseId)).toEqual(['sense-09', 'sense-10']);
    expect(second.coverage).toMatchObject({
      completeForReturnedWindow: true, completeForWholeQuery: false,
      incompleteReasons: ['prior_candidate_window'],
      candidateWindow: { priorCount: 8, returnedCount: 2, consumedCount: 10, totalCount: 10, hasMore: false },
    });
  });

  it('binds cursors to the exact operation, artifact, H identity, and normalized reference', async () => {
    const values = Array.from({ length: 10 }, (_, index) => candidate(index + 1));
    const first = await queryUbsSemanticEvidenceBundle(new SyntheticAggregateRepository(values), request());
    const cursor = first.coverage.candidateWindow.nextCursor!;
    for (const changed of [
      request({ cursor, artifactIdentity: OTHER_ARTIFACT }),
      request({ cursor, sourceIdentity: H0002 }),
      request({ cursor, normalizedReference: 'Synthetic 1:2' }),
    ]) {
      const repository = new SyntheticAggregateRepository(values);
      await expect(queryUbsSemanticEvidenceBundle(repository, changed))
        .rejects.toThrow('exact query and artifact binding');
      expect(repository.queryCount).toBe(0);
    }
    for (const tampered of [
      mutateCursor(cursor, payload => { payload.operation = 'different-operation'; }),
      mutateCursor(cursor, payload => { payload.order = 'different-order'; }),
    ]) {
      const repository = new SyntheticAggregateRepository(values);
      await expect(queryUbsSemanticEvidenceBundle(repository, request({ cursor: tampered })))
        .rejects.toThrow('exact query and artifact binding');
      expect(repository.queryCount).toBe(0);
    }
  });

  it('reports nested evidence incompleteness without changing the one-query bound', async () => {
    const value = candidate(1);
    value.matchingReferenceTotal = 2;
    const repository = new SyntheticAggregateRepository([value]);
    const result = await queryUbsSemanticEvidenceBundle(repository, request());
    expect(repository.queryCount).toBe(1);
    expect(result.coverage).toMatchObject({
      completeForReturnedWindow: false,
      completeForWholeQuery: false,
      incompleteReasons: ['reference_evidence'],
    });

    const partialDomain = candidate(1);
    partialDomain.domains = [];
    partialDomain.sense.domainRefs = [];
    const domainResult = await queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository([partialDomain]), request(),
    );
    expect(domainResult.coverage).toMatchObject({
      completeForReturnedWindow: false,
      completeForWholeQuery: false,
      incompleteReasons: ['domain_evidence'],
    });
  });

  it('reports an authoritative domain total beyond the returned cap without overstating completeness', async () => {
    const value = candidateWithCappedDomains();
    const result = await queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository([value]), request(),
    );
    expect(result.candidates[0]).toMatchObject({
      domainTotal: 17,
      domains: { length: UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.domainsPerSense },
      sense: { domainRefs: { length: UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.domainsPerSense } },
    });
    expect(result.coverage).toMatchObject({
      completeForReturnedWindow: false,
      completeForWholeQuery: false,
      incompleteReasons: ['domain_evidence'],
    });
    expect(result.candidates[0]!.domains.map(domain => domain.domainId)).toEqual([
      ...result.candidates[0]!.domains.map(domain => domain.domainId),
    ].sort());
  });

  it('rejects a claimed domain total smaller than the bounded evidence actually returned', async () => {
    const value = candidateWithCappedDomains(15);
    await expect(queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository([value]), request(),
    )).rejects.toThrow('nested evidence exceeds its authoritative total');
  });

  it('distinguishes no lexical entry from an entry with no semantic senses using aggregate totals', async () => {
    const missing = await queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository([], 'node', 0), request(),
    );
    const entryWithoutSenses = await queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository([], 'node', 1), request(),
    );
    expect(missing.coverage).toMatchObject({ lexicalEntryTotal: 0, semanticSenseTotal: 0, completeForWholeQuery: true });
    expect(entryWithoutSenses.coverage).toMatchObject({ lexicalEntryTotal: 1, semanticSenseTotal: 0, completeForWholeQuery: true });
  });

  it('rejects more visible distinct entries than the honest lexical-entry total', async () => {
    const values = [candidate(1), candidate(2)];
    values[1].entry.entryId = 'entry-two';
    values[1].entry.sourceOrdinal = 2;
    values[1].sense.entryId = 'entry-two';
    values[1].sense.sourceOrdinal = 1;
    await expect(queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository(values, 'node', 1), request(),
    )).rejects.toThrow('more distinct bundled entries');
  });

  it('allows identical shared domains but rejects inconsistent identity or ordinal reuse page-wide', async () => {
    const shared = [candidate(1), candidate(2)];
    shared[1].domains = [structuredClone(shared[0].domains[0])];
    shared[1].sense.domainRefs = [structuredClone(shared[0].sense.domainRefs[0])];
    const accepted = await queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository(shared), request(),
    );
    expect(accepted.candidates).toHaveLength(2);

    const inconsistent = structuredClone(shared);
    inconsistent[1].domains[0].label = 'INCONSISTENT SHARED DOMAIN';
    await expect(queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository(inconsistent), request(),
    )).rejects.toThrow('domain identity with inconsistent evidence');

    const ordinalReuse = [candidate(1), candidate(2)];
    ordinalReuse[1].domains[0].sourceOrdinal = 1;
    await expect(queryUbsSemanticEvidenceBundle(
      new SyntheticAggregateRepository(ordinalReuse), request(),
    )).rejects.toThrow('domain source ordinal for another domain ID');
  });

  it('snapshots cursor helper bindings and candidate keyset primitives exactly once', () => {
    const baselineBinding = request();
    const value = candidate(1);
    const baseline = createUbsSemanticEvidenceBundleCursor(baselineBinding, value, 1);
    const bindingReads = new Map<PropertyKey, number>();
    const proxiedBinding = new Proxy(baselineBinding, {
      get(target, property, receiver) {
        const count = (bindingReads.get(property) ?? 0) + 1;
        bindingReads.set(property, count);
        if (count > 1) {
          if (property === 'artifactIdentity') return OTHER_ARTIFACT;
          if (property === 'sourceIdentity') return H0002;
          if (property === 'normalizedReference') return 'Mutated 9:9';
        }
        return Reflect.get(target, property, receiver);
      },
    });
    let sourceIdReads = 0;
    const accessorEntry = {
      ...value.entry,
      get sourceId() {
        sourceIdReads += 1;
        return sourceIdReads === 1 ? 'synthetic-dictionary' : 'swapped-source';
      },
    };
    const candidateReads = new Map<PropertyKey, number>();
    const proxiedCandidate = new Proxy({ ...value, entry: accessorEntry }, {
      get(target, property, receiver) {
        candidateReads.set(property, (candidateReads.get(property) ?? 0) + 1);
        return Reflect.get(target, property, receiver);
      },
    });
    const actual = createUbsSemanticEvidenceBundleCursor(proxiedBinding, proxiedCandidate, 1);
    expect(actual).toBe(baseline);
    expect([...bindingReads.values()]).toEqual([1, 1, 1]);
    expect(candidateReads.get('entry')).toBe(1);
    expect(candidateReads.get('sense')).toBe(1);
    expect(sourceIdReads).toBe(1);

    const parseReads = new Map<PropertyKey, number>();
    const parseBinding = new Proxy(baselineBinding, {
      get(target, property, receiver) {
        const count = (parseReads.get(property) ?? 0) + 1;
        parseReads.set(property, count);
        return count === 1 ? Reflect.get(target, property, receiver) : 'mutated';
      },
    });
    expect(parseUbsSemanticEvidenceBundleCursor(actual, parseBinding)).toMatchObject({ priorShowing: 1 });
    expect([...parseReads.values()]).toEqual([1, 1, 1]);
  });

  it('server-validates a genuine synthesized boundary once and preserves Node/D1 parity', async () => {
    const values = Array.from({ length: 10 }, (_, index) => candidate(index + 1));
    const synthesizedCursor = createUbsSemanticEvidenceBundleCursor(request(), values[0]!, 1);
    const nodeRepository = new SyntheticAggregateRepository(values, 'node');
    const d1Repository = new SyntheticAggregateRepository(values, 'd1');
    const [node, d1] = await Promise.all([
      queryUbsSemanticEvidenceBundle(nodeRepository, request({ cursor: synthesizedCursor })),
      queryUbsSemanticEvidenceBundle(d1Repository, request({ cursor: synthesizedCursor })),
    ]);
    expect(node).toEqual(d1);
    expect(node.candidates[0]?.sense.senseId).toBe('sense-02');
    expect(node.coverage.candidateWindow).toMatchObject({ priorCount: 1, returnedCount: 8, hasMore: true });
    expect(nodeRepository.queryCount).toBe(1);
    expect(d1Repository.queryCount).toBe(1);
  });

  it('rejects tampered, false-terminal, huge, and stale continuation positions through one authoritative call', async () => {
    const values = Array.from({ length: 10 }, (_, index) => candidate(index + 1));
    const first = await queryUbsSemanticEvidenceBundle(new SyntheticAggregateRepository(values), request());
    const cursor = first.coverage.candidateWindow.nextCursor!;
    const tamperedPositions = [
      {
        name: 'keyset',
        cursor: mutateCursor(cursor, payload => {
          payload.keyset = candidateKeyset(values[1]!);
        }),
      },
      {
        name: 'prior count',
        cursor: mutateCursor(cursor, payload => { payload.priorShowing = 7; }),
      },
      {
        name: 'false terminal',
        cursor: mutateCursor(cursor, payload => { payload.priorShowing = 10; }),
      },
      {
        name: 'huge terminal',
        cursor: mutateCursor(cursor, payload => { payload.priorShowing = Number.MAX_SAFE_INTEGER; }),
      },
    ];
    for (const tampered of tamperedPositions) {
      const repository = new SyntheticAggregateRepository(values);
      await expect(queryUbsSemanticEvidenceBundle(repository, request({ cursor: tampered.cursor })), tampered.name)
        .rejects.toThrow('genuine current page boundary');
      expect(repository.queryCount, tampered.name).toBe(1);
    }

    const staleValues = [...values.slice(0, 7), ...values.slice(8)];
    const staleRepository = new SyntheticAggregateRepository(staleValues);
    await expect(queryUbsSemanticEvidenceBundle(staleRepository, request({ cursor })))
      .rejects.toThrow('genuine current page boundary');
    expect(staleRepository.queryCount).toBe(1);
  });

  it('rejects noncanonical cursor aliases before querying and mismatched repository attestations before publishing', async () => {
    const values = Array.from({ length: 10 }, (_, index) => candidate(index + 1));
    const first = await queryUbsSemanticEvidenceBundle(new SyntheticAggregateRepository(values), request());
    const cursor = first.coverage.candidateWindow.nextCursor!;
    const bytes = cursor.slice(6).match(/../g)!.map(byte => Number.parseInt(byte, 16));
    const json = new TextDecoder().decode(new Uint8Array(bytes));
    const decimalAlias = encodeRawCursorJson(json.replace('"priorShowing":8', '"priorShowing":8.0'));
    for (const alias of [decimalAlias, cursor.toUpperCase()]) {
      const repository = new SyntheticAggregateRepository(values);
      await expect(queryUbsSemanticEvidenceBundle(repository, request({ cursor: alias })))
        .rejects.toThrow(/canonical|bounded encoding/);
      expect(repository.queryCount).toBe(0);
    }

    const repository = new SyntheticAggregateRepository(values);
    const original = repository.getSemanticEvidenceBundle.bind(repository);
    repository.getSemanticEvidenceBundle = async query => {
      const page = await original(query);
      page.boundary.after!.keyset = candidateKeyset(values[6]!);
      return page;
    };
    await expect(queryUbsSemanticEvidenceBundle(repository, request({ cursor })))
      .rejects.toThrow('does not match the requested cursor position');
    expect(repository.queryCount).toBe(1);
  });

  it('fails closed on adversarial malformed aggregate rows and honest-window metadata', async () => {
    const mutations: Array<{ message: string; mutate(page: UbsSemanticEvidenceBundleRepositoryPage): void }> = [
      { message: 'exact query identity', mutate: page => { page.items[0].entry.lexicalIdentities = [H0002]; } },
      { message: 'strict canonical order', mutate: page => { page.items.reverse(); } },
      { message: 'duplicate sense identity', mutate: page => { page.items[1] = structuredClone(page.items[0]); } },
      { message: 'exact query identity', mutate: page => { page.items[0].matchingReferences[0].normalizedReference = 'Synthetic 1:2'; } },
      { message: 'domain total', mutate: page => { page.items[0].domainTotal = 0; } },
      { message: 'provenance is malformed', mutate: page => { page.sources[0].artifactIdentity = OTHER_ARTIFACT; } },
      { message: 'honest candidate window', mutate: page => { page.semanticSenseTotal = 1; } },
      { message: 'inconsistent evidence', mutate: page => { page.items[1].entry.lemma = 'INCONSISTENT LEMMA'; } },
      { message: 'reuses a sense ordinal', mutate: page => { page.items[1].sense.sourceOrdinal = 1; } },
      {
        message: 'repeats reference evidence',
        mutate: page => { page.items[1].matchingReferences[0].evidenceId = 'reference-01'; },
      },
      {
        message: 'exact provenance source roles',
        mutate: page => {
          page.items[0].domains[0].sourceId = 'synthetic-dictionary';
          page.items[0].sense.domainRefs[0].sourceId = 'synthetic-dictionary';
        },
      },
    ];
    for (const testCase of mutations) {
      const values = [candidate(1), candidate(2)];
      const repository = new SyntheticAggregateRepository(values);
      const original = repository.getSemanticEvidenceBundle.bind(repository);
      repository.getSemanticEvidenceBundle = async query => {
        const page = await original(query);
        testCase.mutate(page);
        return page;
      };
      await expect(queryUbsSemanticEvidenceBundle(repository, request())).rejects.toThrow(testCase.message);
      expect(repository.queryCount).toBe(1);
    }
  });

  it('rejects stale cursor position metadata and pages that do not advance', async () => {
    const values = Array.from({ length: 10 }, (_, index) => candidate(index + 1));
    const first = await queryUbsSemanticEvidenceBundle(new SyntheticAggregateRepository(values), request());
    const cursor = first.coverage.candidateWindow.nextCursor!;
    const stale = new SyntheticAggregateRepository(values);
    const original = stale.getSemanticEvidenceBundle.bind(stale);
    stale.getSemanticEvidenceBundle = async query => {
      const page = await original(query);
      page.boundary.priorShowing = 0;
      return page;
    };
    await expect(queryUbsSemanticEvidenceBundle(stale, request({ cursor })))
      .rejects.toThrow('cursor position');
  });
});
