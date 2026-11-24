import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { composeLocalPrimarySourceFtsQuery, localPrimarySourceSearchSql } from '../../../src/adapters/shared/primarySourceSearchSql.js';
import { baselineWorkDiverseSql, workDiverseCases, workDiverseFixtureSql } from '../../worker-runtime/workDiverseFixture.js';

it('returns the original work-diversity rows on native SQLite, including ordered lookahead', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    for (const path of readdirSync('migrations').filter(path => path.endsWith('.sql')).sort()) {
      db.exec(readFileSync(`migrations/${path}`, 'utf8'));
    }
    for (const statement of workDiverseFixtureSql) db.exec(statement);
    for (const { text, match, ids, expected } of workDiverseCases) {
      const old = db.prepare(baselineWorkDiverseSql(ids !== undefined));
      const candidate = db.prepare(localPrimarySourceSearchSql('work_diversity', ids?.length));
      const parameters = [composeLocalPrimarySourceFtsQuery(text, match), ...(ids ? [JSON.stringify(ids)] : [])];
      for (const limit of [1, 2, Math.max(expected.length - 1, 1), Math.max(expected.length, 1), expected.length + 1]) {
        const rows = candidate.all(...parameters, limit) as { id: number }[];
        expect(rows).toEqual(old.all(...parameters, limit));
        expect(rows.map(row => row.id)).toEqual(expected.slice(0, limit));
      }
    }
    const context = composeLocalPrimarySourceFtsQuery('café grâce', 'all_terms');
    const params = [context, 1];
    const old = db.prepare(baselineWorkDiverseSql(false));
    const candidate = db.prepare(localPrimarySourceSearchSql('work_diversity'));
    expect(candidate.all(...params)).toEqual(old.all(...params));
    expect(old.get(...params)).toMatchObject({ id: 101, section_key: 'first', content: 'café grâce' });
  } finally {
    db.close();
  }
});
