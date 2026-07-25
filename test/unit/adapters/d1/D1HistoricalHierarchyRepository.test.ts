import { describe, expect, it } from 'vitest';
import { D1HistoricalHierarchyRepository } from '../../../../src/adapters/d1/D1HistoricalHierarchyRepository.js';
import { createMockD1 } from '../../../helpers/mockD1.js';

const profile = {
  hierarchyId: 'hierarchy', packId: 'pack', workId: 'work', editionId: 'edition', availability: 'local_only_inactive', hierarchySchemaVersion: 'edition-hierarchy.v1',
  levelSpecJson: '{"maxDepth":3,"levels":[]}', sourceManifestSha256: 'a'.repeat(64), aggregateSha256: 'b'.repeat(64), orderedQuestionKeysSha256: 'c'.repeat(64), orderedArticleKeysSha256: 'd'.repeat(64),
  sourceLockSha256: 'e'.repeat(64), localReceiptSha256: 'f'.repeat(64), topologyLockSha256: '1'.repeat(64), discrepancyLedgerSha256: '2'.repeat(64), authorityBodiesSha256: '3'.repeat(64), navigationPreorderSha256: '4'.repeat(64),
  bodyCount: 1, nodeCount: 3, coverageJson: '{"disclosure":"local"}', provenanceJson: '{"rightsStatus":"public_domain_in_usa"}',
};
const part = { hierarchyId: 'hierarchy', nodeKey: 'part', parentNodeKey: null, nodeKind: 'part', bodyKey: null, depth: 1, flatOrdinal: 1, siblingOrdinal: 1, label: 'Part', heading: 'Part' };
const question = { hierarchyId: 'hierarchy', nodeKey: 'question', parentNodeKey: 'part', nodeKind: 'question', bodyKey: 'preamble', depth: 2, flatOrdinal: 2, siblingOrdinal: 1, label: 'Question', heading: 'Question' };
const article = { hierarchyId: 'hierarchy', nodeKey: 'article', parentNodeKey: 'question', nodeKind: 'article', bodyKey: 'article-body', depth: 3, flatOrdinal: 3, siblingOrdinal: 1, label: 'Article', heading: 'Article' };
const contextRow = {
  node_hierarchyId: 'hierarchy', node_nodeKey: 'question', node_parentNodeKey: 'part', node_nodeKind: 'question', node_bodyKey: 'preamble', node_depth: 2, node_flatOrdinal: 2, node_siblingOrdinal: 1, node_label: 'Question', node_heading: 'Question',
  body_hierarchyId: 'hierarchy', body_bodyKey: 'preamble', body_bodyKind: 'preamble', body_sourceOrdinal: 2, body_heading: 'Question', body_contentSha256: '5'.repeat(64), body_contentUtf8Bytes: 4, body_content: 'body',
};
const searchRow = { ...contextRow, body_content: undefined, rank: -1.25, snippet: '<mark>Sacred</mark> Doctrine' };

describe('D1HistoricalHierarchyRepository', () => {
  it('maps the generic anchored profile and exact source artifacts', async () => {
    const db = createMockD1([
      { sql: 'historical_source_artifacts', all: { results: [{ artifactId: 'pg-1', editionId: 'edition', role: 'authority', locator: 'https://example.test/a.zip', sha256: 'a'.repeat(64), bytes: 1, acquiredAt: '2026-01-01T00:00:00.000Z' }] } },
      { sql: 'historical_edition_hierarchies', first: profile },
    ]);
    const repo = new D1HistoricalHierarchyRepository(db as any);
    await expect(repo.getHierarchyProfile('hierarchy')).resolves.toMatchObject({ hierarchyId: 'hierarchy', provenance: { rightsStatus: 'public_domain_in_usa' }, levelSpec: { maxDepth: 3 } });
    await expect(repo.listHierarchyArtifacts('hierarchy')).resolves.toHaveLength(1);
  });

  it('maps direct body/context ancestors without descendants', async () => {
    const db = createMockD1([
      { sql: 'LEFT JOIN historical_edition_hierarchy_bodies', first: contextRow },
      { sql: 'historical_edition_hierarchies', first: profile },
      { sql: 'FROM historical_edition_hierarchy_nodes WHERE hierarchy_id', first: part },
    ]);
    const result = await new D1HistoricalHierarchyRepository(db as any).getHierarchyNodeContext('hierarchy', 'question');
    expect(result).toMatchObject({ node: { nodeKey: 'question' }, body: { content: 'body' }, ancestors: [{ nodeKey: 'part' }] });
  });

  it('uses validated cursor/lookahead root navigation and sibling neighbors', async () => {
    const db = createMockD1([
      { sql: 'SELECT sibling_ordinal AS siblingOrdinal', first: { siblingOrdinal: 1 } },
      { sql: 'sibling_ordinal > ?', all: { results: [question, article] }, first: article },
      { sql: 'WHERE hierarchy_id = ? AND node_key = ?', first: question },
      { sql: 'sibling_ordinal < ?', first: part },
      { sql: 'sibling_ordinal > ?', first: article },
    ]);
    const repo = new D1HistoricalHierarchyRepository(db as any);
    await expect(repo.listHierarchyChildren('hierarchy', 'part', { siblingOrdinal: 1, nodeKey: 'question' }, 1)).resolves.toMatchObject({ nodes: [{ nodeKey: 'question' }], hasMore: true, nextAfter: { nodeKey: 'question' } });
    await expect(repo.getHierarchyNeighbors('hierarchy', 'question')).resolves.toMatchObject({ previous: { nodeKey: 'part' }, next: { nodeKey: 'article' } });
    await expect(repo.listHierarchyChildren('hierarchy', null, { siblingOrdinal: 0, nodeKey: '' }, 1)).rejects.toThrow('cursor is invalid');
  });

  it('uses controlled heading/content phrase FTS ranking and never maps full body content into results', async () => {
    const db = createMockD1([
      { sql: 'historical_edition_hierarchy_bodies_fts', all: { results: [{ ...searchRow, node_parentNodeKey: null }] } },
      { sql: 'historical_edition_hierarchies', first: profile },
    ]);
    const repo = new D1HistoricalHierarchyRepository(db as any);
    const result = await repo.searchHierarchyBodies({ hierarchyId: 'hierarchy', text: 'Sacred Doctrine', match: 'phrase', limit: 9 });
    expect(result).toMatchObject([{ body: { bodyKey: 'preamble', contentUtf8Bytes: 4 }, snippet: '<mark>Sacred</mark> Doctrine', breadcrumb: [{ nodeKey: 'question' }] }]);
    expect('content' in result[0]!.body).toBe(false);
    const ftsSql = db.prepare.mock.calls.map(([sql]: [unknown]) => String(sql))
      .find(sql => sql.includes('historical_edition_hierarchy_bodies_fts'));
    expect(ftsSql).toContain('bm25(historical_edition_hierarchy_bodies_fts, 0.0, 0.0, 8.0, 1.0)');
    expect(ftsSql).toContain("snippet(historical_edition_hierarchy_bodies_fts, 3, '<mark>', '</mark>', '…', 18)");
    const ftsBind = db.prepare.mock.results.find((entry: any) => String(entry.value.bind?.mock?.calls?.[0]?.[0] ?? '').includes('Sacred'))?.value.bind;
    expect(ftsBind).toBeDefined();
    await expect(repo.searchHierarchyBodies({ hierarchyId: 'hierarchy', text: 'one', match: 'all_terms', limit: 10 })).rejects.toThrow('1..9');
  });
});
