import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UNORDERED_NO_COMPATIBILITY_PROOF,
  deriveHistoricalSectionCompatibilityEvidence,
  parseHistoricalSectionCompatibilityEvidence,
  readHistoricalSectionRowsFromD1Seed,
  verifyCurrentUnorderedSectionResolutionSource,
  verifyHistoricalSectionCompatibilityEvidenceFromSources,
  verifyHistoricalSectionCompatibilityMaterialization,
  verifyApprovedSourceFirstAgreement,
  type HistoricalSectionCompatibilityEvidence,
  type HistoricalSectionCompatibilityEvidenceGroup,
} from '../../../scripts/historical-section-compatibility-evidence.js';

const ROOT = process.cwd();

function realEvidence(): HistoricalSectionCompatibilityEvidence {
  return parseHistoricalSectionCompatibilityEvidence(JSON.parse(readFileSync(
    'test/fixtures/historical-section-compatibility/real-local-evidence.json',
    'utf8',
  )));
}

function syntheticGroup(): { group: HistoricalSectionCompatibilityEvidenceGroup; sourceFirstAliasTarget: string } {
  const raw = JSON.parse(readFileSync('test/fixtures/historical-section-compatibility/synthetic-ambiguity.json', 'utf8')) as {
    group: HistoricalSectionCompatibilityEvidenceGroup;
    sourceFirstAliasTarget: string;
  };
  return raw;
}

describe('historical section compatibility evidence', () => {
  it('exactly covers the reviewed real-local collision projection without source body text', () => {
    const evidence = realEvidence();
    const derived = verifyHistoricalSectionCompatibilityEvidenceFromSources(ROOT, evidence);
    const raw = JSON.parse(readFileSync(
      'test/fixtures/historical-section-compatibility/real-local-evidence.json',
      'utf8',
    )) as Record<string, unknown>;

    expect(evidence).toEqual(derived.evidence);
    expect(evidence.expectedCollisionReport).toEqual({
      collisionGroups: 23,
      affectedSections: 256,
      newlyAddressableSections: 233,
    });
    expect(evidence.collisionGroups.map(group => group.documentId)).toEqual([
      ...evidence.collisionGroups.map(group => group.documentId),
    ].sort());
    expect(derived.allRows).toHaveLength(3054);
    expect(JSON.stringify(raw)).not.toMatch(/"(?:title|content|question|answer|chapter|topics)"\s*:/);
    for (const group of evidence.collisionGroups) {
      expect(Object.keys(group).sort()).toEqual(['documentId', 'legacySectionId', 'members']);
      for (const member of group.members) {
        expect(Object.keys(member).sort()).toEqual([
          'd1SeedOrdinal',
          'plannedSectionKey',
          'sourceOrdinal',
          'sourceSignature',
          'sqliteBuilderRowId',
        ]);
      }
    }
  });

  it('records the approved future source-first target without claiming a production runtime result', () => {
    const evidence = realEvidence();
    expect(evidence.compatibilityStatus).toEqual({
      nodeGetCurrentResolution: UNORDERED_NO_COMPATIBILITY_PROOF,
      d1FirstCurrentResolution: UNORDERED_NO_COMPATIBILITY_PROOF,
      productionObservedTarget: null,
      decisionStatus: 'approved_source_first',
    });
    expect(() => verifyCurrentUnorderedSectionResolutionSource(ROOT)).not.toThrow();
  });

  it.each([
    ['a production target', (raw: any) => { raw.compatibilityStatus.productionObservedTarget = 'assigned-0001'; }, 'unordered, unobserved, approved-source-first'],
    ['a deterministic Node resolution', (raw: any) => { raw.compatibilityStatus.nodeGetCurrentResolution = 'lowest_row'; }, 'unordered, unobserved, approved-source-first'],
    ['a pending decision', (raw: any) => { raw.compatibilityStatus.decisionStatus = 'pending'; }, 'unordered, unobserved, approved-source-first'],
    ['an extra body field', (raw: any) => { raw.collisionGroups[0].members[0].content = 'must not be recorded'; }, 'exact keys'],
    ['a reordered D1 ordinal', (raw: any) => { raw.collisionGroups[0].members[1].d1SeedOrdinal = raw.collisionGroups[0].members[0].d1SeedOrdinal; }, 'D1 seed ordinals must be strictly increasing'],
    ['a non-SHA source signature', (raw: any) => { raw.collisionGroups[0].members[0].sourceSignature = 'not-a-hash'; }, 'lowercase SHA-256'],
  ])('fails closed on %s', (_label, mutate, message) => {
    const raw = JSON.parse(readFileSync(
      'test/fixtures/historical-section-compatibility/real-local-evidence.json',
      'utf8',
    ));
    mutate(raw);
    expect(() => parseHistoricalSectionCompatibilityEvidence(raw)).toThrow(message);
  });

  it('proves the synthetic approved source-first/lowest-row/first-seed target without calling it deployed behavior', () => {
    const synthetic = syntheticGroup();
    expect(() => verifyApprovedSourceFirstAgreement(synthetic.group, synthetic.sourceFirstAliasTarget)).not.toThrow();

    const wrongLowest = structuredClone(synthetic.group);
    [wrongLowest.members[0]!.sqliteBuilderRowId, wrongLowest.members[1]!.sqliteBuilderRowId] = [2, 1];
    expect(() => verifyApprovedSourceFirstAgreement(wrongLowest, synthetic.sourceFirstAliasTarget))
      .toThrow('does not agree locally');

    expect(() => verifyApprovedSourceFirstAgreement(synthetic.group, 'assigned-0001'))
      .toThrow('does not agree locally');
  });

  it('verifies all generated-row/seed projections while refusing any local ordering mismatch', () => {
    const evidence = realEvidence();
    const derived = deriveHistoricalSectionCompatibilityEvidence(ROOT);
    const sqliteRows = derived.allRows.map(row => ({
      id: row.sqliteBuilderRowId,
      documentId: row.documentId,
      legacySectionId: row.legacySectionId,
    }));
    const seedRows = derived.allRows.map(row => ({
      id: row.sqliteBuilderRowId,
      documentId: row.documentId,
      legacySectionId: row.legacySectionId,
      d1SeedOrdinal: row.d1SeedOrdinal,
    }));

    expect(verifyHistoricalSectionCompatibilityMaterialization(ROOT, evidence, sqliteRows, seedRows)).toMatchObject({
      documentCount: 17,
      sectionCount: 3054,
      collisionGroups: 23,
      affectedSections: 256,
      newlyAddressableSections: 233,
      sourceFirstLowestRowFirstSeedAndApprovedAliasAgreements: 23,
      productionObservedTarget: null,
      decisionStatus: 'approved_source_first',
    });

    seedRows[0]!.d1SeedOrdinal = 2;
    expect(() => verifyHistoricalSectionCompatibilityMaterialization(ROOT, evidence, sqliteRows, seedRows))
      .toThrow('D1 seed row 1 does not match');
  });

  it('reads only document-section identity columns from a manifest-checked synthetic seed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'theologai-historical-section-seed-'));
    const filename = '04-document-sections-000.sql';
    const sql = [
      'INSERT INTO "document_sections"("id","document_id","section_number","title","content","topics") VALUES(1,\'synthetic-catechism\',\'1\',\'\',\'\',\'[]\');',
      'INSERT INTO "document_sections"("id","document_id","section_number","title","content","topics") VALUES(2,\'synthetic-catechism\',\'1\',\'\',\'\',\'[]\');',
      '',
    ].join('\n');
    writeFileSync(join(directory, filename), sql);
    writeFileSync(join(directory, 'seed-manifest.json'), JSON.stringify({
      files: [{
        path: filename,
        table: 'document_sections',
        chunk: 0,
        sha256: createHash('sha256').update(sql).digest('hex'),
        byteSize: Buffer.byteLength(sql),
        statementCount: 2,
        rowCount: 2,
      }],
    }));

    expect(readHistoricalSectionRowsFromD1Seed(directory)).toEqual([
      { id: 1, documentId: 'synthetic-catechism', legacySectionId: '1', d1SeedOrdinal: 1 },
      { id: 2, documentId: 'synthetic-catechism', legacySectionId: '1', d1SeedOrdinal: 2 },
    ]);
  });
});
