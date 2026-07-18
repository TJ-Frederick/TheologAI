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
  HebrewSemanticEvidenceService,
  type CoordinateOnlyHebrewReferenceAttestation,
} from '../../../../src/services/languages/HebrewSemanticEvidenceService.js';

const H0001 = requireUbsInternalLexicalIdentity('H0001') as UbsInternalHebrewLexicalIdentity;
const ARTIFACT = '7'.repeat(64);
const RAW_ANCHOR = '01001001000001';

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
    sourceUrl: `https://example.invalid/${role}`,
    sourceCommit: (role === 'dictionary' ? '1' : '2').repeat(40),
    sourceBlob: (role === 'dictionary' ? '3' : '4').repeat(40),
    sourceSha256: (role === 'dictionary' ? '5' : '6').repeat(64),
    transformVersion: 7, modified: true, modificationNote: 'Synthetic evidence only.',
  } as UbsSemanticSource;
}

function sense(
  id = 'sense-one', ordinal = 1,
  definitionStatus: UbsSemanticSense['definitionStatus'] = 'published',
  withDomain = true,
): UbsSemanticSense {
  return {
    senseId: id, sourceId: 'synthetic-dictionary', entryId: 'entry-one', sourceOrdinal: ordinal,
    definitionStatus,
    ...(definitionStatus === 'published' ? { definition: `SYNTHETIC DEFINITION ${id.toUpperCase()}` } : {}),
    definitionExclusionReasons: definitionStatus === 'excluded_unresolved_markup'
      ? ['malformed_or_unknown_markup'] : [],
    glosses: [`SYNTHETIC GLOSS ${id.toUpperCase()}`],
    domainRefs: withDomain ? [{ sourceId: 'synthetic-domains', domainId: `domain-${ordinal}` }] : [],
  };
}

function evidence(id = 'reference-one', senseId = 'sense-one', ordinal = 1): UbsSemanticReferenceEvidence {
  return {
    evidenceId: id, sourceId: 'synthetic-dictionary', senseId, sourceOrdinal: ordinal,
    sourceReference: RAW_ANCHOR, normalizedReference: 'Synthetic 1:1',
    evidenceKind: 'source_attested_sense_reference',
  };
}

interface Values {
  sources: UbsSemanticSource[];
  entries: UbsSemanticEntry[];
  senses: UbsSemanticSense[];
  domains: UbsSemanticDomain[];
  references: UbsSemanticReferenceEvidence[];
}

function values(withDomain = true): Values {
  return {
    sources: [source('dictionary'), source('lexical_domains')],
    entries: [{
      entryId: 'entry-one', sourceId: 'synthetic-dictionary', sourceOrdinal: 1,
      lemma: 'SYNTHETIC LEMMA', lexicalIdentities: [H0001],
    }],
    senses: [sense('sense-one', 1, 'published', withDomain)],
    domains: withDomain ? [{
      domainId: 'domain-1', sourceId: 'synthetic-domains', sourceOrdinal: 1,
      label: 'SYNTHETIC DOMAIN',
    }] : [],
    references: [evidence()],
  };
}

class Repository implements IUbsSemanticRepository {
  readonly calls: string[] = [];
  constructor(readonly data: Values) {}

  async getSource(sourceId: string) {
    this.calls.push(`source:${sourceId}`);
    return structuredClone(this.data.sources.find(item => item.sourceId === sourceId));
  }
  async getEntry(sourceId: string, entryId: string) {
    return structuredClone(this.data.entries.find(item => item.sourceId === sourceId && item.entryId === entryId));
  }
  async getEntriesByLexicalIdentity(identity: UbsInternalLexicalIdentity, page?: UbsSemanticPageRequest) {
    this.calls.push(`entries:${identity}:${page?.cursor ?? 'first'}`);
    if (page?.cursor) throw new Error('synthetic cursor rejected');
    const items = this.data.entries.filter(item => item.lexicalIdentities.includes(identity));
    return createUbsSemanticRepositoryCollection(structuredClone(items), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity, { priorShowing: 0 });
  }
  async getSense(sourceId: string, senseId: string) {
    return structuredClone(this.data.senses.find(item => item.sourceId === sourceId && item.senseId === senseId));
  }
  async getSensesForEntry(sourceId: string, entryId: string) {
    this.calls.push(`senses:${sourceId}:${entryId}`);
    const items = this.data.senses.filter(item => item.sourceId === sourceId && item.entryId === entryId);
    return createUbsSemanticRepositoryCollection(structuredClone(items), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.sensesPerEntry,
      UBS_SEMANTIC_REPOSITORY_LIMITS.sensesPerEntry, { priorShowing: 0 });
  }
  async getDomain(sourceId: string, domainId: string) {
    return structuredClone(this.data.domains.find(item => item.sourceId === sourceId && item.domainId === domainId));
  }
  async getDomainsForSense(sourceId: string, senseId: string) {
    this.calls.push(`domains:${sourceId}:${senseId}`);
    const target = this.data.senses.find(item => item.sourceId === sourceId && item.senseId === senseId)!;
    const identities = new Set(target.domainRefs.map(item => `${item.sourceId}\0${item.domainId}`));
    const items = this.data.domains.filter(item => identities.has(`${item.sourceId}\0${item.domainId}`));
    return createUbsSemanticRepositoryCollection(structuredClone(items), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.domainsPerSense,
      UBS_SEMANTIC_REPOSITORY_LIMITS.domainsPerSense, { priorShowing: 0 });
  }
  async getReferenceEvidenceForSense(sourceId: string, senseId: string) {
    const items = this.data.references.filter(item => item.sourceId === sourceId && item.senseId === senseId);
    return createUbsSemanticRepositoryCollection(structuredClone(items), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.referenceEvidencePerSense,
      UBS_SEMANTIC_REPOSITORY_LIMITS.referenceEvidencePerSense, { priorShowing: 0 });
  }
  async findReferenceEvidence(sourceId: string, senseId: string, normalizedReference: string) {
    this.calls.push(`references:${sourceId}:${senseId}:${normalizedReference}`);
    const items = this.data.references.filter(item => item.sourceId === sourceId
      && item.senseId === senseId && item.normalizedReference === normalizedReference);
    return createUbsSemanticRepositoryCollection(structuredClone(items), items.length,
      UBS_SEMANTIC_REPOSITORY_ORDER.matchingReferenceEvidence,
      UBS_SEMANTIC_REPOSITORY_LIMITS.matchingReferenceEvidence, { priorShowing: 0 });
  }
}

function coordinateAttestation(overrides: Partial<CoordinateOnlyHebrewReferenceAttestation['coordinateAttestation']> = {}): CoordinateOnlyHebrewReferenceAttestation {
  const token = 'tahot-gen-deu:1';
  return {
    status: 'coordinate_attested_unpromoted',
    coordinateAttestation: {
      schemaVersion: 'theologai-ubs-tahot-coordinate-attestation.v1', verifierVersion: 1,
      artifactIdentity: ARTIFACT, sourceId: 'synthetic-dictionary', entryId: 'entry-one',
      senseId: 'sense-one', evidenceId: 'reference-one', rawAnchor: RAW_ANCHOR,
      footnoteSuffix: '',
      nativeCoordinate: { bookNumber: 1, bookCode: 'GEN', chapter: 1, verse: 1 },
      normalizedCoordinate: { bookNumber: 1, bookCode: 'GEN', chapter: 1, verse: 1 },
      normalizedReference: 'Synthetic 1:1', tahotTokenIdentity: token,
      tahotWordElement: 'SYNTHETIC', tahotFileId: 'tahot-gen-deu', tahotFileLine: 1,
      tahotCorpus: [
        { id: 'tahot-gen-deu', sha256: 'e9b8546ee48fe0bfc57c3b70f5f40e98d96580e803526d19026224e31753368b', gitBlobSha1: 'eb051292f8cee648c4f3eaf1b48cd0f1f30dc1d5' },
        { id: 'tahot-isa-mal', sha256: 'f3ded203d2a74d6368932c97ae550d1d0754b271af491dc0dedf36fe3ba0bcc5', gitBlobSha1: '1cfe6718a1dae0d5d45a57a942d3f7f716ac6342' },
        { id: 'tahot-job-sng', sha256: '84e118a97e5725e3847cdfdd593873513021c790c63cc91a0d41fca2b5db2ed5', gitBlobSha1: '3d7af689417b54ebc468700b2bd86a8ba5377530' },
        { id: 'tahot-jos-est', sha256: '195fee1dc3653bab33701f170734eb894ed647c10cd08cc61749375fe8b73775', gitBlobSha1: 'e3824344f6dea1a3f51932d1b0a53537c3c2023e' },
      ],
      usfmtc: {
        commit: 'a222dd3e78360f8e275ca56f4307af7e02b2430a',
        referenceBlob: '16cd6fc2a42664a494a5989b8587247a27331cb6',
        referenceSha256: 'eaff130bef0b6f6dde52386acb8c7a2e5111be11f1ca104522cffef72ea42b69',
        licenseBlob: '94b86440d4155c330b5fc17459effd133044064f',
        licenseSha256: '8d67696c8d8dca45ebed80adf43d53a8c5f4ebc563ace89da23d1af3b3e50be9',
      },
      limitation: 'coordinate_and_explicit_pair_only_not_token_alignment_or_lexical_sense_adjudication',
      ...overrides,
    },
  };
}

const request = { publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1', audience: 'expert' as const };

describe('HebrewSemanticEvidenceService inactive resolution seam', () => {
  it('returns useful lexical candidates before contextual alignment exists', async () => {
    const result = await new HebrewSemanticEvidenceService(new Repository(values())).resolve(request);
    expect(result.resolution).toMatchObject({
      status: 'lexical_candidates', reason: 'reference_alignment_unproven',
      candidates: [{ sense: { senseId: 'sense-one' } }],
    });
  });

  it.each(['absent_in_source', 'excluded_unresolved_markup'] as const)(
    'retains clean glosses and a zero-domain candidate when definition is %s', async definitionStatus => {
      const data = values(false);
      data.senses[0] = sense('sense-one', 1, definitionStatus, false);
      const result = await new HebrewSemanticEvidenceService(new Repository(data)).resolve(request);
      expect(result.resolution).toMatchObject({
        status: 'lexical_candidates', candidates: [{ sense: { definitionStatus }, domains: [] }],
      });
      expect(result.provenanceSources.map(item => item.sourceRole)).toEqual(['dictionary']);
    },
  );

  it('never promotes a lexical candidate from a coordinate-only attestation', async () => {
    const result = await new HebrewSemanticEvidenceService(new Repository(values())).resolve({
      ...request, coordinateOnlyAttestation: coordinateAttestation(),
    });
    expect(result.resolution).toMatchObject({
      status: 'lexical_candidates', reason: 'reference_alignment_unproven',
      candidates: [{ sense: { senseId: 'sense-one' } }],
    });
  });

  it('returns lexical candidates for coordinate observations regardless of cardinality or row match', async () => {
    const oneToMany = values();
    oneToMany.references.push(evidence('reference-two', 'sense-one', 2));
    const manyToOne = values();
    manyToOne.senses.push(sense('sense-two', 2, 'published', false));
    manyToOne.references.push(evidence('reference-two', 'sense-two', 1));
    for (const [data, trusted] of [
      [oneToMany, coordinateAttestation()],
      [manyToOne, coordinateAttestation()],
      [values(), coordinateAttestation({ evidenceId: 'missing-reference' })],
    ] as const) {
      const result = await new HebrewSemanticEvidenceService(new Repository(data)).resolve({
        ...request, coordinateOnlyAttestation: trusted,
      });
      expect(result.resolution).toMatchObject({
        status: 'lexical_candidates', reason: 'reference_alignment_unproven',
      });
    }
  });

  it('rejects malformed or internally inconsistent coordinate-only attestations before repository reads', async () => {
    const cases: CoordinateOnlyHebrewReferenceAttestation[] = [
      coordinateAttestation({ normalizedReference: 'Synthetic 1:2' }),
      coordinateAttestation({ artifactIdentity: 'x'.repeat(64) }),
      coordinateAttestation({ verifierVersion: 0 }),
      coordinateAttestation({ tahotTokenIdentity: '' }),
    ];
    for (const coordinateOnlyAttestation of cases) {
      const repository = new Repository(values());
      await expect(new HebrewSemanticEvidenceService(repository).resolve({ ...request, coordinateOnlyAttestation })).rejects.toThrow();
      expect(repository.calls).toEqual([]);
    }
  });

  it('rejects retired token-alignment and plural coordinate inputs before repository reads', async () => {
    const repository = new Repository(values());
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      ...request, trustedAlignment: { status: 'verified_token_alignment' },
    } as never)).rejects.toThrow('unsupported field');
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      ...request, coordinateOnlyAttestations: [coordinateAttestation()],
    } as never)).rejects.toThrow('unsupported field');
    expect(repository.calls).toEqual([]);
  });

  it('snapshots request and coordinate-attestation data before the first repository await', async () => {
    const repository = new Repository(values());
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = repository.getEntriesByLexicalIdentity.bind(repository);
    repository.getEntriesByLexicalIdentity = async (...args) => {
      await gate;
      return original(...args);
    };
    const coordinateOnlyAttestation = coordinateAttestation();
    const mutable = { ...request, coordinateOnlyAttestation };
    const pending = new HebrewSemanticEvidenceService(repository).resolve(mutable);
    mutable.publicStrongs = 'H2';
    coordinateOnlyAttestation.coordinateAttestation.evidenceId = 'mutated-evidence';
    release();
    const result = await pending;
    expect(result.identity.publicStrongs).toBe('H1');
    expect(result.resolution).toMatchObject({
      status: 'lexical_candidates', candidates: [{ sense: { senseId: 'sense-one' } }],
    });
  });

  it('reads each request field and page cursor once before repository access', async () => {
    const reads = new Map<PropertyKey, number>();
    let cursorReads = 0;
    const base = {
      ...request,
      entryPage: {
        get cursor() { cursorReads += 1; return 'stale-cursor'; },
      },
    };
    const proxied = new Proxy(base, {
      get(target, property, receiver) {
        reads.set(property, (reads.get(property) ?? 0) + 1);
        return Reflect.get(target, property, receiver);
      },
    });
    await expect(new HebrewSemanticEvidenceService(new Repository(values())).resolve(proxied))
      .rejects.toThrow('synthetic cursor rejected');
    expect([...reads.values()].every(count => count === 1)).toBe(true);
    expect([...reads.keys()].sort()).toEqual([
      'audience', 'coordinateOnlyAttestation', 'entryPage', 'normalizedReference', 'publicStrongs',
    ]);
    expect(cursorReads).toBe(1);
  });

  it('rejects public A identities and distinguishes no entry from no senses', async () => {
    const service = new HebrewSemanticEvidenceService(new Repository(values()));
    await expect(service.resolve({ ...request, publicStrongs: 'A1' })).rejects.toThrow('public H-number');
    expect((await service.resolve({ ...request, publicStrongs: 'H2' })).resolution)
      .toEqual({ status: 'unavailable', reason: 'no_lexical_entry' });
    const withoutSenses = values();
    withoutSenses.senses = [];
    withoutSenses.domains = [];
    withoutSenses.references = [];
    expect((await new HebrewSemanticEvidenceService(new Repository(withoutSenses)).resolve(request)).resolution)
      .toEqual({ status: 'unavailable', reason: 'no_publishable_semantic_evidence' });
  });

  it('distinguishes exact reference absence without inferring range overlap', async () => {
    const result = await new HebrewSemanticEvidenceService(new Repository(values())).resolve({
      ...request, normalizedReference: 'Synthetic 1:1-2',
    });
    expect(result.resolution).toMatchObject({ status: 'lexical_candidates', reason: 'no_reference_evidence' });
  });

  it('does not prioritize a coordinate-attested sense ahead of canonical lexical order', async () => {
    const data = values();
    data.senses.push(sense('sense-two', 2, 'published', false));
    data.references.push(evidence('reference-two', 'sense-two', 1));
    const result = await new HebrewSemanticEvidenceService(new Repository(data)).resolve({
      ...request, coordinateOnlyAttestation: coordinateAttestation({ senseId: 'sense-two', evidenceId: 'reference-two' }),
    });
    expect(result.resolution).toMatchObject({
      status: 'lexical_candidates',
      candidates: [{ sense: { senseId: 'sense-one' } }, { sense: { senseId: 'sense-two' } }],
    });
  });

  it('bounds deterministic candidate inspection without promoting later aligned senses', async () => {
    const data = values(false);
    data.senses = Array.from({ length: 20 }, (_, index) =>
      sense(`sense-${String(index + 1).padStart(2, '0')}`, index + 1, 'published', false));
    data.references = [];
    const repository = new Repository(data);
    const result = await new HebrewSemanticEvidenceService(repository).resolve(request);
    expect(result.coverage).toMatchObject({
      inspectedSenseCount: 8, publishableCandidateCount: 8,
      completeForReturnedEntryWindow: false,
    });
    expect(repository.calls.filter(call => call.startsWith('domains:'))).toHaveLength(8);
    expect(repository.calls.filter(call => call.startsWith('references:'))).toHaveLength(8);
  });

  it('propagates a stale internal cursor before sense or provenance work', async () => {
    const repository = new Repository(values());
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      ...request, entryPage: { cursor: 'stale-cursor' },
    })).rejects.toThrow('synthetic cursor rejected');
    expect(repository.calls).toEqual(['entries:H0001:stale-cursor']);
  });

  it('never treats an empty offset entry window as proof of absence', async () => {
    const repository = new Repository(values());
    repository.getEntriesByLexicalIdentity = async () => ({
      items: [], total: 1, showing: 0, priorShowing: 1, consumed: 1, hasMore: false,
      order: UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      limit: UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
    });
    await expect(new HebrewSemanticEvidenceService(repository).resolve({
      ...request, entryPage: { cursor: 'offset' },
    })).rejects.toThrow('incomplete entry evidence cannot establish');
  });

  it.each(['sense', 'domain', 'reference'] as const)(
    'rejects incomplete first-page %s evidence', async kind => {
      const repository = new Repository(values());
      if (kind === 'sense') {
        repository.getSensesForEntry = async () => ({
          items: [sense()], total: 2, showing: 1, priorShowing: 0, consumed: 1,
          hasMore: true, nextCursor: 'more',
          order: UBS_SEMANTIC_REPOSITORY_ORDER.sensesPerEntry,
          limit: UBS_SEMANTIC_REPOSITORY_LIMITS.sensesPerEntry,
        });
      } else if (kind === 'domain') {
        repository.getDomainsForSense = async () => ({
          items: structuredClone(values().domains), total: 2, showing: 1,
          priorShowing: 0, consumed: 1, hasMore: true, nextCursor: 'more',
          order: UBS_SEMANTIC_REPOSITORY_ORDER.domainsPerSense,
          limit: UBS_SEMANTIC_REPOSITORY_LIMITS.domainsPerSense,
        });
      } else {
        repository.findReferenceEvidence = async () => ({
          items: [evidence()], total: 2, showing: 1, priorShowing: 0, consumed: 1,
          hasMore: true, nextCursor: 'more',
          order: UBS_SEMANTIC_REPOSITORY_ORDER.matchingReferenceEvidence,
          limit: UBS_SEMANTIC_REPOSITORY_LIMITS.matchingReferenceEvidence,
        });
      }
      await expect(new HebrewSemanticEvidenceService(repository).resolve(request))
        .rejects.toThrow(`repository ${kind === 'reference' ? 'reference evidence' : kind} first-page collection must be complete`);
    },
  );

  it('fails closed on missing or incompatible exact provenance', async () => {
    const missing = values();
    missing.sources = missing.sources.filter(item => item.sourceRole !== 'dictionary');
    await expect(new HebrewSemanticEvidenceService(new Repository(missing)).resolve(request))
      .rejects.toThrow('provenance is missing');
    const mismatched = values();
    mismatched.sources[1]!.artifactIdentity = '8'.repeat(64);
    await expect(new HebrewSemanticEvidenceService(new Repository(mismatched)).resolve(request))
      .rejects.toThrow('do not share one exact semantic artifact identity');
  });

  it('rejects duplicate entry, sense, and reference identities across one resolution', async () => {
    const duplicateEntry = values();
    duplicateEntry.entries.push({ ...structuredClone(duplicateEntry.entries[0]!), sourceOrdinal: 2 });
    await expect(new HebrewSemanticEvidenceService(new Repository(duplicateEntry)).resolve(request))
      .rejects.toThrow('duplicate exact identity');

    const duplicateSense = values(false);
    duplicateSense.entries.push({
      ...structuredClone(duplicateSense.entries[0]!), entryId: 'entry-two', sourceOrdinal: 2,
    });
    duplicateSense.senses.push({
      ...sense('sense-one', 1, 'published', false), entryId: 'entry-two',
    });
    await expect(new HebrewSemanticEvidenceService(new Repository(duplicateSense)).resolve(request))
      .rejects.toThrow('duplicate cross-resolution identity');

    const duplicateReference = values(false);
    duplicateReference.senses.push(sense('sense-two', 2, 'published', false));
    duplicateReference.references.push({ ...evidence(), senseId: 'sense-two' });
    await expect(new HebrewSemanticEvidenceService(new Repository(duplicateReference)).resolve(request))
      .rejects.toThrow('duplicate cross-resolution identity');
  });

  it('rejects duplicate ordinals for entries, senses, domains, and references', async () => {
    const cases: Values[] = [];
    const duplicateEntryOrdinal = values();
    duplicateEntryOrdinal.entries.push({
      ...structuredClone(duplicateEntryOrdinal.entries[0]!), entryId: 'entry-two',
    });
    cases.push(duplicateEntryOrdinal);
    const duplicateSenseOrdinal = values(false);
    duplicateSenseOrdinal.senses.push(sense('sense-two', 1, 'published', false));
    cases.push(duplicateSenseOrdinal);
    const duplicateDomainOrdinal = values();
    duplicateDomainOrdinal.senses[0]!.domainRefs.push({ sourceId: 'synthetic-domains', domainId: 'domain-two' });
    duplicateDomainOrdinal.domains.push({
      domainId: 'domain-two', sourceId: 'synthetic-domains', sourceOrdinal: 1, label: 'SECOND',
    });
    cases.push(duplicateDomainOrdinal);
    const duplicateReferenceOrdinal = values();
    duplicateReferenceOrdinal.references.push(evidence('reference-two', 'sense-one', 1));
    cases.push(duplicateReferenceOrdinal);
    for (const data of cases) {
      await expect(new HebrewSemanticEvidenceService(new Repository(data)).resolve(request))
        .rejects.toThrow(/duplicate source ordinal/);
    }
  });

  it('rejects every Unicode noncharacter in coordinate-only TAHOT token identities', async () => {
    const codePoints = [
      ...Array.from({ length: 32 }, (_, index) => 0xfdd0 + index),
      ...Array.from({ length: 17 }, (_, plane) => (plane << 16) | 0xfffe),
      ...Array.from({ length: 17 }, (_, plane) => (plane << 16) | 0xffff),
    ];
    for (const codePoint of codePoints) {
      const trusted = coordinateAttestation();
      trusted.coordinateAttestation.tahotTokenIdentity = `token-${String.fromCodePoint(codePoint)}`;
      await expect(new HebrewSemanticEvidenceService(new Repository(values())).resolve({
        ...request, coordinateOnlyAttestation: trusted,
      })).rejects.toThrow('coordinate-only TAHOT token identity');
    }
  });

  it('rejects unknown definition exclusions and inconsistent definition states', async () => {
    const unknown = values(false);
    unknown.senses[0] = {
      ...sense('sense-one', 1, 'excluded_unresolved_markup', false),
      definitionExclusionReasons: ['unsupported_reason' as never],
    };
    await expect(new HebrewSemanticEvidenceService(new Repository(unknown)).resolve(request))
      .rejects.toThrow('unsupported');
    const leaked = values(false);
    leaked.senses[0] = {
      ...sense('sense-one', 1, 'absent_in_source', false), definition: 'LEAKED DEFINITION',
    };
    await expect(new HebrewSemanticEvidenceService(new Repository(leaked)).resolve(request))
      .rejects.toThrow('unpublished sense exposes definition text');
  });

  it('requires verifier v1 and the exact reviewed TAHOT/usfmtc pin sets without granting token alignment', async () => {
    const reviewed = coordinateAttestation().coordinateAttestation;
    const wrongTahot = coordinateAttestation({ tahotCorpus: reviewed.tahotCorpus.map((pin, index) =>
      index === 0 ? { ...pin, sha256: '0'.repeat(64) } : pin) });
    const wrongUsfmtc = coordinateAttestation({ usfmtc: { ...reviewed.usfmtc, commit: '0'.repeat(40) } });
    const wrongVersion = coordinateAttestation({ verifierVersion: 2 });
    for (const coordinateOnlyAttestation of [wrongTahot, wrongUsfmtc, wrongVersion]) {
      const repository = new Repository(values());
      await expect(new HebrewSemanticEvidenceService(repository).resolve({ ...request, coordinateOnlyAttestation }))
        .rejects.toThrow();
      expect(repository.calls).toEqual([]);
    }
  });
});
