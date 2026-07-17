import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  UBS_SEMANTIC_REPOSITORY_LIMITS,
  UBS_SEMANTIC_REPOSITORY_ORDER,
  createUbsSemanticCursor,
  createUbsSemanticRepositoryCollection,
  parseUbsSemanticCursor,
} from '../../../src/kernel/ubsSemanticDomain.js';
import type {
  IUbsSemanticRepository,
  UbsSemanticResolution,
  UbsSemanticSource,
} from '../../../src/kernel/ubsSemanticDomain.js';

describe('UBS semantic domain contract', () => {
  const artifactIdentity = 'a'.repeat(64);
  it('keeps every repository operation async', () => {
    expectTypeOf<IUbsSemanticRepository['getSource']>()
      .returns.toEqualTypeOf<Promise<UbsSemanticSource | undefined>>();
    expectTypeOf<IUbsSemanticRepository['getEntriesByLexicalIdentity']>()
      .returns.toEqualTypeOf<Promise<Awaited<ReturnType<IUbsSemanticRepository['getEntriesByLexicalIdentity']>>>>();
    expectTypeOf<IUbsSemanticRepository['findReferenceEvidence']>()
      .returns.toEqualTypeOf<Promise<Awaited<ReturnType<IUbsSemanticRepository['findReferenceEvidence']>>>>();
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
    );
    const result = createUbsSemanticRepositoryCollection(
      ['first', 'second'], 3,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
      { nextCursor, operation: 'getEntriesByLexicalIdentity', artifactIdentity, queryScope: ['H0001'] },
    );
    expect(result).toMatchObject({ showing: 2, total: 3, hasMore: true, limit: 16, nextCursor });
    expect(() => createUbsSemanticRepositoryCollection(
      Array.from({ length: 17 }, (_, index) => index), 17,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
    )).toThrow('above its 16-item cap');
    expect(() => createUbsSemanticRepositoryCollection(
      ['first', 'second'], 1,
      UBS_SEMANTIC_REPOSITORY_ORDER.entriesByLexicalIdentity,
      UBS_SEMANTIC_REPOSITORY_LIMITS.entriesByLexicalIdentity,
    )).toThrow('at least as large as the returned window');
  });

  it('round-trips deterministic order-bound cursors and makes continuation explicit', () => {
    const order = UBS_SEMANTIC_REPOSITORY_ORDER.referenceEvidencePerSense;
    const query = ['synthetic-source', 'synthetic-sense'];
    const keyset = ['7', 'synthetic-evidence'];
    const first = createUbsSemanticCursor('getReferenceEvidenceForSense', artifactIdentity, query, keyset);
    const second = createUbsSemanticCursor('getReferenceEvidenceForSense', artifactIdentity, query, keyset);
    expect(first).toBe(second);
    expect(parseUbsSemanticCursor(first, 'getReferenceEvidenceForSense', artifactIdentity, query)).toEqual(keyset);
    expect(() => parseUbsSemanticCursor(first, 'getReferenceEvidenceForSense', artifactIdentity, ['synthetic-source', 'other-sense']))
      .toThrow('query scope');
    expect(() => parseUbsSemanticCursor(first, 'findReferenceEvidence', artifactIdentity, [...query, 'Synthetic 1:1']))
      .toThrow('requested operation');
    expect(() => parseUbsSemanticCursor(first, 'getReferenceEvidenceForSense', 'b'.repeat(64), query))
      .toThrow('semantic artifact');
    expect(() => createUbsSemanticCursor('getReferenceEvidenceForSense', artifactIdentity, query, ['only-one']))
      .toThrow('exactly 2');
    expect(() => createUbsSemanticCursor('getReferenceEvidenceForSense', artifactIdentity, query, ['7', 'x'.repeat(513)]))
      .toThrow('bounded canonical values');
    expect(() => parseUbsSemanticCursor(`${first}00`.padEnd(4097, '0'), 'getReferenceEvidenceForSense', artifactIdentity, query))
      .toThrow('4096-character limit');
    expect(() => parseUbsSemanticCursor(first.replace(/[a-f]/, match => match.toUpperCase()), 'getReferenceEvidenceForSense', artifactIdentity, query))
      .toThrow('invalid encoding');
    expect(createUbsSemanticRepositoryCollection(
      ['last'], 3, order, UBS_SEMANTIC_REPOSITORY_LIMITS.referenceEvidencePerSense,
    )).toMatchObject({ hasMore: false });
  });

  it('enforces operation-specific canonical cursor fields at creation and roundtrip', () => {
    expect(() => createUbsSemanticCursor('getEntriesByLexicalIdentity', artifactIdentity, ['A0001'], ['source', '1', 'entry']))
      .toThrow('canonical H####');
    expect(() => createUbsSemanticCursor('getSensesForEntry', artifactIdentity, ['Source', 'entry'], ['1', 'sense']))
      .toThrow('canonical identifier');
    expect(() => createUbsSemanticCursor('getSensesForEntry', artifactIdentity, ['source', 'entry'], ['007', 'sense']))
      .toThrow('canonical positive decimal');
    const decomposed = 'Synthetic e\u0301 1:1';
    expect(() => createUbsSemanticCursor(
      'findReferenceEvidence', artifactIdentity, ['source', 'sense', decomposed], ['1', 'evidence'],
    )).toThrow('must be NFC');
    expect(() => createUbsSemanticCursor(
      'findReferenceEvidence', artifactIdentity, ['s'.repeat(512), 'n'.repeat(512), 'x'.repeat(512)], ['1', 'e'.repeat(512)],
    )).toThrow('4096-character limit');
  });

  it('requires verified token alignment in the exact-context branch', () => {
    type Exact = Extract<UbsSemanticResolution, { status: 'exact_context' }>;
    expectTypeOf<Exact['alignmentEvidence']['status']>().toEqualTypeOf<'verified_token_alignment'>();
    expectTypeOf<Exact>().toHaveProperty('referenceEvidence');
  });
});
