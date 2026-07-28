import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HistoricalHierarchyRepository } from '../../../../src/adapters/data/HistoricalHierarchyRepository.js';
import { HistoricalHierarchyService } from '../../../../src/services/historical/HistoricalHierarchyService.js';
import type { IHistoricalHierarchyRepository } from '../../../../src/kernel/repositories.js';
import {
  presentHistoricalHierarchyChildren,
  presentHistoricalHierarchyLanding,
  presentHistoricalHierarchyNode,
  presentHistoricalHierarchySearch,
} from '../../../../src/presenters/historicalHierarchyStructured.js';
import { OutputLimitError } from '../../../../src/kernel/errors.js';
import { parseHistoricalHierarchyResourceUri } from '../../../../src/kernel/historicalHierarchyResource.js';
import { historicalHierarchyOutputSchema } from '../../../../src/mcp/schemas/historicalHierarchy.js';
import { validatorFor } from '../../../../src/mcp/validation.js';
import { materializeHistoricalHierarchy } from '../../../../scripts/historical-hierarchy.js';
import { loadApprovedAquinasHierarchy } from '../../../../scripts/aquinas-source-pack-capacity-comparison.js';
import { loadApprovedAquinasHierarchyPublication, materializeHistoricalHierarchyPublication } from '../../../../scripts/historical-hierarchy-publication.js';

const ROOT = process.cwd();
const internalValidate = validatorFor(historicalHierarchyOutputSchema);
const sdkValidate = new AjvJsonSchemaValidator().getValidator(historicalHierarchyOutputSchema);
let db: Database.Database;
let service: HistoricalHierarchyService;
let hierarchy: ReturnType<typeof loadApprovedAquinasHierarchy>;

function expectValidSchema(value: unknown): void {
  expect(internalValidate(value).valid).toBe(true);
  expect(sdkValidate(value).valid).toBe(true);
}

function expectInvalidSchema(value: unknown): void {
  expect(internalValidate(value).valid).toBe(false);
  expect(sdkValidate(value).valid).toBe(false);
}

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of [
    '0001_initial_schema.sql', '0002_ubs_parallel_passages.sql', '0003_original_language_usage.sql',
    '0004_ubs_hebrew_semantics.sql', '0005_historical_section_identity_delivery.sql',
    '0006_historical_source_packs.sql', '0007_historical_hierarchy.sql', '0008_historical_hierarchy_publications.sql',
  ]) db.exec(readFileSync(join(ROOT, 'migrations', migration), 'utf8'));
  hierarchy = loadApprovedAquinasHierarchy({ read: path => readFileSync(join(ROOT, path)) });
  materializeHistoricalHierarchy(db, hierarchy);
  materializeHistoricalHierarchyPublication(db, loadApprovedAquinasHierarchyPublication(hierarchy), hierarchy);
  service = new HistoricalHierarchyService(new HistoricalHierarchyRepository(db));
});

afterAll(() => db.close());

describe('HistoricalHierarchyService dormant delivery seam', () => {
  it('publishes a strict, compilable, closed schema for every dormant presenter mode', async () => {
    const ajv = new Ajv2020({ strict: true, strictTypes: false, allErrors: true });
    expect(ajv.validateSchema(historicalHierarchyOutputSchema), ajv.errorsText(ajv.errors)).toBe(true);
    expect(() => ajv.compile(historicalHierarchyOutputSchema)).not.toThrow();

    const landing = presentHistoricalHierarchyLanding(await service.getLanding('summa-theologiae'));
    const directNode = presentHistoricalHierarchyNode(
      await service.getNode('summa-theologiae', 'question:prima.q001'),
    );
    const children = presentHistoricalHierarchyChildren(
      await service.browseChildren('summa-theologiae', 'part:secunda-secundae', undefined),
    );
    const search = presentHistoricalHierarchySearch(
      await service.search('summa-theologiae', 'Sacred Doctrine', 'phrase', 9),
    );

    for (const output of [landing, directNode, children, search]) expectValidSchema(output);

    const openMetadata = structuredClone(landing) as any;
    openMetadata.publication.metadata.arbitrary = {};
    const emptyMetadata = structuredClone(landing) as any;
    emptyMetadata.publication.metadata = {};
    const emptyCoverage = structuredClone(landing) as any;
    emptyCoverage.publication.coverage = {};
    const emptyAuthority = structuredClone(landing) as any;
    emptyAuthority.authority = {};
    const openProvenanceDisclosure = structuredClone(landing) as any;
    openProvenanceDisclosure.authority.provenance.disclosures[0].arbitrary = true;
    const emptyDirectBody = structuredClone(directNode) as any;
    emptyDirectBody.node.body = {};
    const openBreadcrumbResource = structuredClone(directNode) as any;
    openBreadcrumbResource.node.breadcrumb[0].resource.arbitrary = true;
    const emptyResultWindow = structuredClone(children) as any;
    emptyResultWindow.resultWindow = {};
    const openPagination = structuredClone(children) as any;
    openPagination.pagination.arbitrary = true;
    const emptySearchHit = structuredClone(search) as any;
    emptySearchHit.hits[0] = {};
    const openSearchNode = structuredClone(search) as any;
    openSearchNode.hits[0].node.arbitrary = true;
    const searchBodyLeak = structuredClone(search) as any;
    searchBodyLeak.hits[0].body.content = 'not a search output field';

    for (const invalid of [
      {},
      { arbitrary: {} },
      openMetadata,
      emptyMetadata,
      emptyCoverage,
      emptyAuthority,
      openProvenanceDisclosure,
      emptyDirectBody,
      openBreadcrumbResource,
      emptyResultWindow,
      openPagination,
      emptySearchHit,
      openSearchNode,
      searchBodyLeak,
    ]) expectInvalidSchema(invalid);
  });

  it('keeps the dormant envelope generic while retaining closed work-specific disclosures', async () => {
    const generic = structuredClone(presentHistoricalHierarchyLanding(await service.getLanding('summa-theologiae'))) as any;
    generic.publication = {
      ...generic.publication,
      publicationId: 'generic-medieval-work-v1', slug: 'generic-medieval-work', title: 'A Generic Medieval Work',
      canonicalUri: 'theologai://documents/generic-medieval-work',
      metadata: {
        creators: [{ name: 'Anonymous compiler', role: 'compiler' }], documentType: 'treatise', language: 'Latin',
        editionLabel: 'Reviewed local edition', rightsStatus: 'public_domain', territoryCaveat: 'Verify jurisdiction before reuse.',
      },
      coverage: {
        statement: 'The local edition contains books one through three.', completeness: 'partial_edition',
        descriptors: [{ relationship: 'included', label: 'Books 1–3', address: { scheme: 'book', start: '1', end: '3' } }],
      },
    };
    generic.authority = {
      ...generic.authority,
      hierarchyId: 'generic-medieval-hierarchy-v1', editionId: 'generic-medieval-edition-v1',
      provenance: {
        status: 'local_only_inactive', rightsStatus: 'public_domain', territoryCaveat: 'Verify jurisdiction before reuse.',
        catalogStatement: 'A reviewed local edition.', sourceLabel: 'University archive transcription',
        disclosures: [{ label: 'transcription_basis', values: ['Printed edition, 1890'] }],
        activation: 'This is a dormant local authority.',
      },
    };
    expectValidSchema(generic);
    expect(JSON.stringify(generic)).not.toMatch(/Summa|CCEL|question_range/);
  });

  it('binds a dormant projection to exact authority metadata and explicit partial-Summa coverage', async () => {
    const landing = await service.getLanding('summa-theologiae');
    expect(landing.publication).toMatchObject({
      hierarchyId: hierarchy.hierarchy.hierarchyId, activationState: 'dormant', deliveryKind: 'hierarchy_nodes_v1',
      canonicalUri: 'theologai://documents/summa-theologiae',
    });
    expect(landing.profile.availability).toBe('local_only_inactive');
    expect(landing.publication.coverage.statement).toBe(
      'Includes Prima (q1–119), Prima Secundae (q1–114), Secunda Secundae (q1–189), and Tertia through q90. Tertia q91+ and the traditional Supplement are excluded.',
    );
  });

  it('delivers an exact direct body with bounded ancestry and no descendant concatenation', async () => {
    const delivery = await service.getNode('summa-theologiae', 'question:prima.q001');
    const expected = hierarchy.bodies.find(body => body.bodyKey === 'preamble:prima.q001')!;
    expect(delivery.context.body?.content).toBe(expected.content);
    expect(delivery.context.body?.content).not.toContain('FIRST ARTICLE [I, Q. 1, Art. 1]');
    expect(delivery.context.ancestors.map(node => node.nodeKey)).toEqual(['part:prima']);
    expect(delivery.canonicalUri).toBe('theologai://documents/summa-theologiae#node-question:prima.q001');
    expect(await service.resolveCanonicalUri(delivery.canonicalUri)).toMatchObject({ context: { node: { nodeKey: 'question:prima.q001' } } });
  });

  it('rejects repository responses that cross publication hierarchy boundaries', async () => {
    const landing = await service.getLanding('summa-theologiae');
    const direct = await service.getNode('summa-theologiae', 'question:prima.q001');
    const children = await service.browseChildren('summa-theologiae', 'part:prima', undefined);
    const search = await service.search('summa-theologiae', 'Sacred Doctrine', 'phrase', 9);
    const repository = (overrides: Partial<IHistoricalHierarchyRepository>): IHistoricalHierarchyRepository => ({
      getHierarchyProfile: () => landing.profile,
      getHierarchyPublication: () => landing.publication,
      getHierarchyPublicationBySlug: () => landing.publication,
      listHierarchyArtifacts: () => [],
      getHierarchyNodeContext: () => direct.context,
      listHierarchyChildren: () => children.page,
      getHierarchyNeighbors: () => ({ previous: undefined, next: undefined }),
      searchHierarchyBodies: () => search.results,
      ...overrides,
    });
    const mismatchedNode = structuredClone(direct.context);
    mismatchedNode.node.hierarchyId = 'other-hierarchy';
    await expect(new HistoricalHierarchyService(repository({ getHierarchyNodeContext: () => mismatchedNode }))
      .getNode('summa-theologiae', 'question:prima.q001')).rejects.toThrow(/binding/);

    const mismatchedAncestor = structuredClone(direct.context);
    mismatchedAncestor.ancestors[0]!.hierarchyId = 'other-hierarchy';
    await expect(new HistoricalHierarchyService(repository({ getHierarchyNodeContext: () => mismatchedAncestor }))
      .getNode('summa-theologiae', 'question:prima.q001')).rejects.toThrow(/binding/);

    const mismatchedChildPage = structuredClone(children.page);
    mismatchedChildPage.nodes[0]!.hierarchyId = 'other-hierarchy';
    await expect(new HistoricalHierarchyService(repository({ listHierarchyChildren: () => mismatchedChildPage }))
      .browseChildren('summa-theologiae', 'part:prima', undefined)).rejects.toThrow(/binding/);

    const mismatchedSearch = structuredClone(search.results);
    mismatchedSearch[0]!.breadcrumb[0]!.hierarchyId = 'other-hierarchy';
    await expect(new HistoricalHierarchyService(repository({ searchHierarchyBodies: () => mismatchedSearch }))
      .search('summa-theologiae', 'Sacred Doctrine', 'phrase', 9)).rejects.toThrow(/binding/);

    const mismatchedNeighbor = structuredClone(direct.context.node);
    mismatchedNeighbor.hierarchyId = 'other-hierarchy';
    await expect(new HistoricalHierarchyService(repository({ getHierarchyNeighbors: () => ({ previous: mismatchedNeighbor, next: undefined }) }))
      .getNeighbors('summa-theologiae', 'question:prima.q001')).rejects.toThrow(/binding/);
  });

  it('uses a publication/parent/page-bound opaque cursor for immediate children only', async () => {
    const first = await service.browseChildren('summa-theologiae', 'part:secunda-secundae', undefined);
    expect(first.page.nodes).toHaveLength(32);
    expect(first.page.nodes[0]?.nodeKey).toBe('question:secunda-secundae.q001');
    expect(first.nextCursor).toBeTypeOf('string');
    const second = await service.browseChildren('summa-theologiae', 'part:secunda-secundae', first.nextCursor);
    expect(second.page.nodes[0]?.nodeKey).toBe('question:secunda-secundae.q033');
    await expect(service.browseChildren('summa-theologiae', 'part:prima', first.nextCursor)).rejects.toMatchObject({ field: 'cursor' });

    const presented = presentHistoricalHierarchyChildren(first);
    expect(new TextEncoder().encode(JSON.stringify(presented)).byteLength).toBeLessThanOrEqual(first.publication.directoryMaxBytes);
    expect(presented.bodyDelivery).toBe('not_included');
  });

  it('keeps internal FTS discovery metadata-only and bounds every dormant presenter output', async () => {
    const search = await service.search('summa-theologiae', 'Sacred Doctrine', 'phrase', 9);
    expect(search.results.length).toBeGreaterThan(0);
    expect(search.results.every(result => !('content' in result.body))).toBe(true);
    const searchOutput = presentHistoricalHierarchySearch(search);
    expect(JSON.stringify(searchOutput)).not.toContain('FIRST ARTICLE [I, Q. 1, Art. 1]');
    expect(new TextEncoder().encode(JSON.stringify(searchOutput)).byteLength).toBeLessThanOrEqual(search.publication.searchMaxBytes);

    const node = await service.getNode('summa-theologiae', 'article:prima-secundae.q102.a005');
    const nodeOutput = presentHistoricalHierarchyNode(node);
    expect(nodeOutput.node.body?.content).toBe(node.context.body?.content);
    expect(nodeOutput.descendants).toBe('not_included');
    expect(new TextEncoder().encode(JSON.stringify(nodeOutput)).byteLength).toBeLessThanOrEqual(node.publication.nodeMaxBytes);
    expect(parseHistoricalHierarchyResourceUri(nodeOutput.node.canonicalUri)).toEqual({
      publicSlug: 'summa-theologiae', nodeKey: 'article:prima-secundae.q102.a005',
    });
    expect(() => presentHistoricalHierarchyNode({ ...node, publication: { ...node.publication, nodeMaxBytes: 1024 } }))
      .toThrow(OutputLimitError);
  });
});
