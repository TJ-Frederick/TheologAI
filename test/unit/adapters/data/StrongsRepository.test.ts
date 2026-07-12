import { describe, expect, it } from 'vitest';
import { StrongsRepository } from '../../../../src/adapters/data/StrongsRepository.js';
import { FakeSqliteDatabase } from './fakeSqlite.js';

const entry = {
  strongs_number: 'G0025',
  testament: 'NT' as const,
  lemma: 'ἀγαπάω',
  transliteration: 'agapaō',
  pronunciation: null,
  definition: 'to love',
  derivation: null,
};

describe('StrongsRepository', () => {
  it('prepares its reusable lookup, FTS, and lexicon statements', () => {
    const db = new FakeSqliteDatabase();
    new StrongsRepository(db.asDatabase());
    expect(db.prepare).toHaveBeenCalledTimes(3);
    expect(db.statement('strongs_fts MATCH').sql).toMatch(/ORDER BY rank, s\.strongs_number\s+LIMIT \?/);
  });

  it('canonicalizes padded input to the public identity', () => {
    const db = new FakeSqliteDatabase([{ match: 'strongs WHERE strongs_number', get: entry }]);
    const repo = new StrongsRepository(db.asDatabase());
    expect(repo.lookup(' g0025 ')).toEqual(entry);
    expect(db.statement('strongs WHERE strongs_number').get).toHaveBeenCalledOnce();
    expect(db.statement('strongs WHERE strongs_number').get).toHaveBeenCalledWith('G25');
  });

  it('falls back to a four-digit padded Strong number', () => {
    const db = new FakeSqliteDatabase([{
      match: 'strongs WHERE strongs_number',
      get: (number: unknown) => number === 'G0025' ? entry : undefined,
    }]);
    const repo = new StrongsRepository(db.asDatabase());
    expect(repo.lookup('g25')).toEqual(entry);
    expect(db.statement('strongs WHERE strongs_number').get.mock.calls).toEqual([['G25'], ['G0025']]);
    expect(repo.lookup('invalid')).toBeUndefined();
  });

  it('preserves a suffix before falling back to the base public identity', () => {
    const db = new FakeSqliteDatabase([{
      match: 'strongs WHERE strongs_number',
      get: (number: unknown) => number === 'G1722' ? entry : undefined,
    }]);
    const repo = new StrongsRepository(db.asDatabase());
    expect(repo.lookup('g01722A')).toEqual(entry);
    expect(db.statement('strongs WHERE strongs_number').get.mock.calls).toEqual([['G1722a'], ['G1722']]);
  });

  it('sanitizes FTS input and applies default and explicit limits', () => {
    const db = new FakeSqliteDatabase([{ match: 'strongs_fts MATCH', all: [entry] }]);
    const repo = new StrongsRepository(db.asDatabase());
    expect(repo.search(`love'*"`)).toEqual([entry]);
    expect(repo.search('agape', 2)).toEqual([entry]);
    expect(db.statement('strongs_fts MATCH').all.mock.calls).toEqual([
      ['"love"*', 10],
      ['"agape"*', 2],
    ]);
  });

  it('pads lexicon keys and parses extended JSON', () => {
    const db = new FakeSqliteDatabase([{
      match: 'stepbible_lexicons',
      get: { strongs_number: 'H0430', source: 'STEPBible', extended_data: '{"definition":"God"}' },
    }]);
    expect(new StrongsRepository(db.asDatabase()).getLexiconEntry(' h430 ')).toEqual({
      strongs_number: 'H0430',
      source: 'STEPBible',
      extended_data: { definition: 'God' },
    });
    expect(db.statement('stepbible_lexicons').get).toHaveBeenCalledWith('H0430');
  });

  it('tries a suffix-preserving morphology key before its base key', () => {
    const row = { strongs_number: 'H0430', source: 'STEPBible', extended_data: '{}' };
    const db = new FakeSqliteDatabase([{
      match: 'stepbible_lexicons',
      get: (number: unknown) => number === 'H0430' ? row : undefined,
    }]);
    expect(new StrongsRepository(db.asDatabase()).getLexiconEntry('h430A')).toMatchObject({ strongs_number: 'H0430' });
    expect(db.statement('stepbible_lexicons').get.mock.calls).toEqual([['H0430a'], ['H0430']]);
  });

  it('returns undefined for a missing lexicon row', () => {
    const db = new FakeSqliteDatabase([{ match: 'stepbible_lexicons', get: undefined }]);
    expect(new StrongsRepository(db.asDatabase()).getLexiconEntry('G25')).toBeUndefined();
  });

  it('propagates corrupt stored lexicon JSON', () => {
    const db = new FakeSqliteDatabase([{
      match: 'stepbible_lexicons',
      get: { strongs_number: 'G0025', source: 'STEPBible', extended_data: '{' },
    }]);
    expect(() => new StrongsRepository(db.asDatabase()).getLexiconEntry('G25')).toThrow(SyntaxError);
  });

  it('calculates Greek, Hebrew, and total entry counts', () => {
    const db = new FakeSqliteDatabase([
      { match: "testament = 'NT'", get: { c: 5624 } },
      { match: "testament = 'OT'", get: { c: 8674 } },
    ]);
    expect(new StrongsRepository(db.asDatabase()).getStats()).toEqual({ greek: 5624, hebrew: 8674, total: 14298 });
    expect(db.prepare).toHaveBeenCalledTimes(5);
  });
});
