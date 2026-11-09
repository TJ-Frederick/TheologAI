import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { boundedMatchContext } from '../../../../src/services/historical/LocalPrimarySourceSearchProvider.js';
import { HistoricalDocumentRepository } from '../../../../src/adapters/data/HistoricalDocumentRepository.js';
import { LocalPrimarySourceSearchProvider } from '../../../../src/services/historical/LocalPrimarySourceSearchProvider.js';

// Immutable pre-optimization implementation: catches changes to normalization,
// indexing, tie-breaking and slicing as well as character conversion.
const historical = execFileSync('git', ['show', '7fe92b0c0398c09b0f07c27e98a39b42194bac49:src/services/historical/LocalPrimarySourceSearchProvider.ts'], { encoding: 'utf8' });
const tail = historical.slice(historical.indexOf('export function boundedMatchContext')).replace('export function', 'function');
const baseline = new Function(ts.transpileModule(tail, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nreturn boundedMatchContext;')() as typeof boundedMatchContext;
it('preserves every single-code-point mapping including lone surrogates', () => {
  let differences = 0;
  for (let point = 0; point <= 0x10ffff; point++) {
    const value = String.fromCodePoint(point);
    if (value.toLowerCase() !== value.toLocaleLowerCase('en-US')) differences++;
  }
  expect(differences).toBe(0);
});
it('preserves Unicode expansion, contextual sigma, NFC, boundaries and earliest matches', () => {
  const values = ['İ', 'i\u0307', 'I', 'ı', 'Σ', 'σ', 'ς', 'ΟΣ', 'ος', 'ß', 'SS', 'ẞ', 'K', 'K', 'e\u0301', 'é', '😀', '𐐀', '𐐨', '\uD800', '\uDC00', '\0', '\u0085', '\t'];
  for (const value of values) for (const query of values) for (const mode of ['phrase', 'all_terms'] as const) {
    const content = 'x '.repeat(270) + value + ' y '.repeat(270);
    expect(boundedMatchContext(content, query, mode, 500)).toBe(baseline(content, query, mode, 500));
  }
  for (const maximum of [1, 2, 3, 20, 499, 500, 501]) {
    const content = '😀'.repeat(501) + 'İΣ e\u0301 Grace' + 'a'.repeat(501);
    expect(boundedMatchContext(content, 'grace İΣ', 'all_terms', maximum)).toBe(baseline(content, 'grace İΣ', 'all_terms', maximum));
  }
});
it('preserves corpus acceptance snippets with the real repository and full provider', async () => {
  const db = new Database(process.env.THEOLOGAI_TEST_DATABASE_PATH ?? 'data/theologai.db', { readonly: true, fileMustExist: true });
  try {
    const repository = new HistoricalDocumentRepository(db);
    const provider = new LocalPrimarySourceSearchProvider(repository);
    const probes = ['historical-core-preview-audit.json', 'historical-spine-preview-audit.json'].flatMap(file => JSON.parse(readFileSync('test/fixtures/' + file, 'utf8')).probes);
    const queries = [...probes.map((p: { query: string; workId: string }) => ({ text: p.query, work: p.workId })),
      { text: 'grace faith', selection: 'relevance' as const }, { text: 'two natures', match: 'phrase' as const, selection: 'work_diversity' as const }, { text: 'God', work: 'calvin-institutes-of-the-christian-religion' }];
    let compared = 0;
    for (const input of queries) {
      const result = await provider.search({ ...input, limit: 8 });
      for (const hit of result.hits) {
        if (hit.locator.kind !== 'local_section') throw Error('unexpected locator');
        const section = repository.resolveSection(hit.locator.documentId, hit.locator.sectionKey)!;
        expect(hit.snippet).toBe(baseline(section.section.content, input.text, 'match' in input ? input.match ?? 'all_terms' : 'all_terms', 500));
        compared++;
      }
    }
    expect(compared).toBe(79);
  } finally { db.close(); }
});
