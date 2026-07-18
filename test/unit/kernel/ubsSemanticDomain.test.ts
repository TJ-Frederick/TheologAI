import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  UBS_SEMANTIC_REPOSITORY_LIMITS,
  UBS_SEMANTIC_REPOSITORY_ORDER,
  createUbsSemanticCursor,
  createUbsSemanticRepositoryCollection,
  isUbsInternalLexicalIdentity,
  parseUbsPublicHebrewIdentity,
  parseUbsSemanticCursor,
  requireUbsInternalLexicalIdentity,
  requireUbsSemanticNormalizedReference,
} from '../../../src/kernel/ubsSemanticDomain.js';
import type {
  IUbsSemanticRepository,
  FutureExactHebrewTokenAlignmentProof,
  UbsInternalLexicalIdentity,
  UbsSemanticResolution,
  UbsSemanticSource,
} from '../../../src/kernel/ubsSemanticDomain.js';
import { parseStrongsIdentity } from '../../../src/kernel/strongs.js';

describe('UBS semantic domain contract', () => {
  const artifactIdentity = 'a'.repeat(64);
  it('keeps every repository operation async', () => {
    expectTypeOf<IUbsSemanticRepository['getSource']>()
      .returns.toEqualTypeOf<Promise<UbsSemanticSource | undefined>>();
    expectTypeOf<IUbsSemanticRepository['getEntriesByLexicalIdentity']>()
      .returns.toEqualTypeOf<Promise<Awaited<ReturnType<IUbsSemanticRepository['getEntriesByLexicalIdentity']>>>>();
    expectTypeOf<IUbsSemanticRepository['findReferenceEvidence']>()
      .returns.toEqualTypeOf<Promise<Awaited<ReturnType<IUbsSemanticRepository['findReferenceEvidence']>>>>();
    expectTypeOf<Parameters<IUbsSemanticRepository['getEntriesByLexicalIdentity']>[0]>()
      .toEqualTypeOf<UbsInternalLexicalIdentity>();
  });

  it('shares explicit bounded deterministic repository contracts', () => {
    expect(UBS_SEMANTIC_REPOSITORY_LIMITS).toEqual({
      entriesByLexicalIdentity: 16,
      sensesPerEntry: 64,
      domainsPerSense: 16,
      referenceEvidencePerSense: 128,
      matchingReferenceEvidence: 16,
    });
    expect(UBS_SEMANTIC_REPOSITORY_ORDER).toEqual({
      entriesByLexicalIdentity: 'source_id_source_ordinal_entry_id',
      sensesPerEntry: 'source_ordinal_sense_id',
      domainsPerSense: 'source_ordinal_domain_id',
      referenceEvidencePerSense: 'source_ordinal_evidence_id',
      matchingReferenceEvidence: 'source_ordinal_evidence_id',
    });
  });

  it('constructs honest bounded windows and rejects cap/total violations', () => {
    const nextCursor = createUbsSemanticCursor(
      'getEntriesByLexicalIdentity',
      artifactIdentity,
      ['H0001'],
      ['synthetic-source', '2', 'synthetic-entry'],
      2,
    );
    const result = createUbsSemanticRepositoryCollection(
      ['first', 'second'], 3,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
      { priorShowing: 0, continuation: {
        nextCursor, operation: 'getEntriesByLexicalIdentity', artifactIdentity, queryScope: ['H0001'],
      } },
    );
    expect(result).toMatchObject({ showing: 2, priorShowing: 0, consumed: 2, total: 3, hasMore: true, limit: 16, nextCursor });
    expect(() => createUbsSemanticRepositoryCollection(
      Array.from({ length: 17 }, (_, index) => index), 17,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
      { priorShowing: 0 },
    )).toThrow('above its 16-item cap');
    expect(() => createUbsSemanticRepositoryCollection(
      ['first', 'second'], 1,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
      { priorShowing: 0 },
    )).toThrow('cannot exceed total matches');
    expect(() => createUbsSemanticRepositoryCollection(
      ['first'], 2,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
      { priorShowing: 0 },
    )).toThrow('if and only if more matches remain');
    expect(() => createUbsSemanticRepositoryCollection(
      ['last'], 2,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
      { priorShowing: 1, continuation: {
        nextCursor, operation: 'getEntriesByLexicalIdentity', artifactIdentity, queryScope: ['H0001'],
      } },
    )).toThrow('if and only if more matches remain');
    const wrongPositionCursor = createUbsSemanticCursor(
      'getEntriesByLexicalIdentity', artifactIdentity, ['H0001'],
      ['synthetic-source', '1', 'synthetic-entry'], 1,
    );
    expect(() => createUbsSemanticRepositoryCollection(
      ['first', 'second'], 3,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
      { priorShowing: 0, continuation: {
        nextCursor: wrongPositionCursor,
        operation: 'getEntriesByLexicalIdentity', artifactIdentity, queryScope: ['H0001'],
      } },
    )).toThrow('prior position');
  });

  it('round-trips deterministic order-bound cursors and makes continuation explicit', () => {
    const order = UBS_SEMANTIC_REPOSITORY_ORDER.referenceEvidencePerSense;
    const query = ['synthetic-source', 'synthetic-sense'];
    const keyset = ['7', 'synthetic-evidence'];
    const first = createUbsSemanticCursor('getReferenceEvidenceForSense', artifactIdentity, query, keyset, 7);
    const second = createUbsSemanticCursor('getReferenceEvidenceForSense', artifactIdentity, query, keyset, 7);
    expect(first).toBe(second);
    expect(parseUbsSemanticCursor(first, 'getReferenceEvidenceForSense', artifactIdentity, query))
      .toEqual({ keyset, priorShowing: 7 });
    expect(() => parseUbsSemanticCursor(first, 'getReferenceEvidenceForSense', artifactIdentity, ['synthetic-source', 'other-sense']))
      .toThrow('query scope');
    expect(() => parseUbsSemanticCursor(first, 'findReferenceEvidence', artifactIdentity, [...query, 'Synthetic 1:1']))
      .toThrow('requested operation');
    expect(() => parseUbsSemanticCursor(first, 'getReferenceEvidenceForSense', 'b'.repeat(64), query))
      .toThrow('semantic artifact');
    expect(() => createUbsSemanticCursor('getReferenceEvidenceForSense', artifactIdentity, query, ['only-one'], 7))
      .toThrow('exactly 2');
    expect(() => createUbsSemanticCursor('getReferenceEvidenceForSense', artifactIdentity, query, ['7', 'x'.repeat(513)], 7))
      .toThrow('bounded canonical values');
    expect(() => createUbsSemanticCursor('getReferenceEvidenceForSense', artifactIdentity, query, keyset, 0))
      .toThrow('positive safe integer');
    expect(() => parseUbsSemanticCursor(`${first}00`.padEnd(4097, '0'), 'getReferenceEvidenceForSense', artifactIdentity, query))
      .toThrow('4096-character limit');
    expect(() => parseUbsSemanticCursor(first.replace(/[a-f]/, match => match.toUpperCase()), 'getReferenceEvidenceForSense', artifactIdentity, query))
      .toThrow('invalid encoding');
    expect(createUbsSemanticRepositoryCollection(
      ['last'], 3, order, UBS_SEMANTIC_REPOSITORY_LIMITS.referenceEvidencePerSense,
      { priorShowing: 2 },
    )).toMatchObject({ showing: 1, priorShowing: 2, consumed: 3, total: 3, hasMore: false });
    expect(createUbsSemanticRepositoryCollection(
      [], 0, order, UBS_SEMANTIC_REPOSITORY_LIMITS.referenceEvidencePerSense,
      { priorShowing: 0 },
    )).toMatchObject({ showing: 0, consumed: 0, total: 0, hasMore: false });
  });

  it('separates public Hebrew Strong\'s identities from internal H/A source identities', () => {
    expect(parseUbsPublicHebrewIdentity('H430')).toEqual({ publicStrongs: 'H430', sourceIdentity: 'H0430' });
    expect(parseUbsPublicHebrewIdentity('h0430')).toEqual({ publicStrongs: 'H430', sourceIdentity: 'H0430' });
    for (const unavailable of ['A0001', 'G430', 'H430A', 'H0000', 'H10000']) {
      expect(parseUbsPublicHebrewIdentity(unavailable)).toBeUndefined();
    }
    expect(isUbsInternalLexicalIdentity('H0430')).toBe(true);
    expect(isUbsInternalLexicalIdentity('A0001')).toBe(true);
    expect(isUbsInternalLexicalIdentity('H430')).toBe(false);
    expect(parseStrongsIdentity('A0001')).toBeUndefined();
    expect(requireUbsInternalLexicalIdentity('H0430')).toBe('H0430');
    expect(requireUbsInternalLexicalIdentity('A0001')).toBe('A0001');
    for (const invalidFirstPageIdentity of ['H430', 'h0430', 'A1', 'G0430', 'H0000', 'A0000', 'H10000']) {
      expect(() => requireUbsInternalLexicalIdentity(invalidFirstPageIdentity))
        .toThrow('canonical fixed-width H#### or A####');
    }
  });

  it('enforces operation-specific canonical cursor fields at creation and roundtrip', () => {
    const internalA = createUbsSemanticCursor(
      'getEntriesByLexicalIdentity', artifactIdentity, ['A0001'], ['source', '1', 'entry'], 1,
    );
    expect(parseUbsSemanticCursor(internalA, 'getEntriesByLexicalIdentity', artifactIdentity, ['A0001']))
      .toEqual({ keyset: ['source', '1', 'entry'], priorShowing: 1 });
    expect(() => createUbsSemanticCursor('getEntriesByLexicalIdentity', artifactIdentity, ['G0001'], ['source', '1', 'entry'], 1))
      .toThrow('H#### or A####');
    expect(() => createUbsSemanticCursor('getSensesForEntry', artifactIdentity, ['Source', 'entry'], ['1', 'sense'], 1))
      .toThrow('canonical identifier');
    expect(() => createUbsSemanticCursor('getSensesForEntry', artifactIdentity, ['source', 'entry'], ['007', 'sense'], 1))
      .toThrow('canonical positive decimal');
    const decomposed = 'Synthetic e\u0301 1:1';
    expect(() => createUbsSemanticCursor(
      'findReferenceEvidence', artifactIdentity, ['source', 'sense', decomposed], ['1', 'evidence'], 1,
    )).toThrow(/trimmed, NFC/);
    const maximumBoundedCursor = createUbsSemanticCursor(
      'findReferenceEvidence', artifactIdentity, ['s'.repeat(512), 'n'.repeat(512), 'x'.repeat(100)], ['1', 'e'.repeat(512)], 1,
    );
    expect(maximumBoundedCursor.length).toBeLessThanOrEqual(4096);
  });

  it('uses one hostile-Unicode normalized-reference boundary at cursor creation and parsing', () => {
    expect(requireUbsSemanticNormalizedReference('Synthetic 1:1')).toBe('Synthetic 1:1');
    for (const hostileReference of [
      'Synthetic\u0000 1:1', 'Synthetic\u0085 1:1', 'Synthetic\u202e 1:1',
      'Synthetic\u200b 1:1', 'Synthetic\ud800 1:1', 'Synthetic\u2028 1:1',
      `Synthetic${String.fromCodePoint(0x10ffff)} 1:1`,
    ]) {
      expect(() => createUbsSemanticCursor(
        'findReferenceEvidence', artifactIdentity,
        ['synthetic-source', 'synthetic-sense', hostileReference], ['1', 'synthetic-evidence'], 1,
      )).toThrow(/forbidden control|forbidden Unicode noncharacter/);
    }

    const valid = createUbsSemanticCursor(
      'findReferenceEvidence', artifactIdentity,
      ['synthetic-source', 'synthetic-sense', 'Synthetic 1:1'], ['1', 'synthetic-evidence'], 1,
    );
    const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(
      valid.slice(5).match(/../g)!.map(byte => Number.parseInt(byte, 16)),
    ))) as { queryScope: string[] };
    payload.queryScope[2] = 'Synthetic\u202e 1:1';
    const hostileCursor = `ubs1_${[...new TextEncoder().encode(JSON.stringify(payload))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
    expect(() => parseUbsSemanticCursor(
      hostileCursor, 'findReferenceEvidence', artifactIdentity,
      ['synthetic-source', 'synthetic-sense', 'Synthetic\u202e 1:1'],
    )).toThrow(/forbidden control/);
  });

  it('requires verified token alignment without claiming an adjudicated contextual meaning', () => {
    type Aligned = Extract<UbsSemanticResolution, { status: 'reference_aligned_source_candidate' }>;
    expectTypeOf<Aligned['alignmentEvidence']['status']>().toEqualTypeOf<'verified_token_alignment'>();
    expectTypeOf<Aligned['alignmentEvidence']['proofContract']>()
      .toEqualTypeOf<'theologai-exact-hebrew-token-alignment.v1'>();
    expectTypeOf<Aligned['alignmentEvidence']>().toEqualTypeOf<FutureExactHebrewTokenAlignmentProof>();
    expectTypeOf<Aligned>().toHaveProperty('referenceEvidence');
  });
});
