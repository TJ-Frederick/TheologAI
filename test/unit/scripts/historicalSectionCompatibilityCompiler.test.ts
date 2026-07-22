import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_PATH,
  HISTORICAL_SECTION_COMPATIBILITY_POLICY,
  compileHistoricalSectionCompatibility,
  compileHistoricalSectionCompatibilityFromDisk,
  countHistoricalSectionCompatibilityMap,
  parseHistoricalSectionCompatibilityAttestation,
  parseHistoricalSectionCompatibilityMap,
  resolveHistoricalSectionCompatibility,
  verifyHistoricalSectionCompatibilityAttestationFromDisk,
  type HistoricalSectionCompatibilityMap,
} from '../../../scripts/historical-section-compatibility-compiler.js';
import {
  parseHistoricalSectionKeyPlan,
  readHistoricalSectionSources,
} from '../../../scripts/historical-section-key-plan.js';
import { parseHistoricalSectionCompatibilityEvidence } from '../../../scripts/historical-section-compatibility-evidence.js';
import { buildLocalDocumentResourceUri } from '../../../src/kernel/documentResource.js';

const ROOT = process.cwd();

function trackedAttestation(): unknown {
  return JSON.parse(readFileSync(HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_PATH, 'utf8'));
}

describe('historical section source-first compatibility compiler', () => {
  it('regenerates and attests every row for exactly the approved 17-work scope', () => {
    const compilation = verifyHistoricalSectionCompatibilityAttestationFromDisk(ROOT);

    expect(compilation.counts).toEqual({
      documentCount: 17,
      sectionCount: 3054,
      legacyLocatorCount: 2821,
      collisionGroups: 23,
      affectedSections: 256,
      newlyAddressableSections: 233,
    });
    expect(countHistoricalSectionCompatibilityMap(compilation.map)).toEqual(compilation.counts);
    expect(compilation.attestation.policy).toEqual(HISTORICAL_SECTION_COMPATIBILITY_POLICY);
    expect(compilation.map.documents.map(document => document.documentId)).toEqual(
      [...compilation.map.documents.map(document => document.documentId)].sort(),
    );

    let visitedSections = 0;
    let visitedAliases = 0;
    for (const document of compilation.map.documents) {
      const sectionByKey = new Map(document.sections.map(section => [section.sectionKey, section]));
      for (const [index, section] of document.sections.entries()) {
        visitedSections++;
        expect(section.sourceOrdinal).toBe(index + 1);
        expect(section.canonicalLocator).toBe(buildLocalDocumentResourceUri(document.documentId, section.sectionKey));
        expect(Object.keys(section).sort()).toEqual([
          'canonicalLocator',
          'legacySectionId',
          'sectionKey',
          'sourceOrdinal',
          'sourceSignature',
        ]);
      }
      for (const alias of document.legacyAliases) {
        visitedAliases++;
        const target = sectionByKey.get(alias.targetSectionKey);
        expect(target).toMatchObject({
          sourceOrdinal: alias.targetSourceOrdinal,
          canonicalLocator: alias.targetCanonicalLocator,
        });
        expect(target!.legacySectionId).toBe(alias.legacySectionId);
      }
    }
    expect(visitedSections).toBe(3054);
    expect(visitedAliases).toBe(2821);
    expect(JSON.stringify(compilation.map)).not.toMatch(/"(?:title|content|question|answer|chapter|topics)"\s*:/);
  });

  it('is byte-stable in ordering and canonical identity across repeated regeneration', () => {
    const first = compileHistoricalSectionCompatibilityFromDisk(ROOT);
    const second = compileHistoricalSectionCompatibilityFromDisk(ROOT);
    expect(JSON.stringify(first.map)).toBe(JSON.stringify(second.map));
    expect(first.attestation).toEqual(second.attestation);
    expect(first.attestation.canonicalOutputSha256).toBe('3a8734e7f5ee4974f7b88811e7507021cfaddd5cfdbc0ab6f801b1e7d43a5bc5');
  });

  it('resolves canonical keys before aliases and keeps aliases as a fallback only', () => {
    const real = verifyHistoricalSectionCompatibilityAttestationFromDisk(ROOT).map;
    const realDocument = real.documents.find(document => document.documentId === 'baltimore-catechism')!;
    const overlap = realDocument.legacyAliases.find(alias => alias.legacySectionId === alias.targetSectionKey)!;
    expect(resolveHistoricalSectionCompatibility(real, realDocument.documentId, overlap.legacySectionId)).toMatchObject({
      kind: 'canonical',
      sectionKey: overlap.targetSectionKey,
      sourceOrdinal: overlap.targetSourceOrdinal,
    });

    const fallback = parseHistoricalSectionCompatibilityMap(syntheticMap());
    expect(resolveHistoricalSectionCompatibility(fallback, 'synthetic', 'legacy-1')).toEqual({
      kind: 'legacy_alias',
      documentId: 'synthetic',
      sectionKey: 'canonical-1',
      sourceOrdinal: 1,
      canonicalLocator: 'theologai://documents/synthetic#section-canonical-1',
    });
    expect(resolveHistoricalSectionCompatibility(fallback, 'synthetic', 'canonical-1')?.kind).toBe('canonical');
    expect(resolveHistoricalSectionCompatibility(fallback, 'synthetic', 'unknown')).toBeUndefined();
  });

  it.each([
    ['policy drift', (raw: any) => { raw.policy.runtimeStatus = 'active'; }, 'policy must remain'],
    ['input drift', (raw: any) => { raw.inputs.historicalSourcesCanonicalSha256 = '0'.repeat(64); }, 'does not match regenerated'],
    ['count drift', (raw: any) => { raw.exactCounts.sectionCount = 3053; }, 'exact 17/3054/2821'],
    ['output drift', (raw: any) => { raw.canonicalOutputSha256 = '0'.repeat(64); }, 'does not match regenerated'],
    ['extra field', (raw: any) => { raw.content = 'forbidden'; }, 'exact keys'],
  ])('fails closed on attestation %s', (_label, mutate, message) => {
    const raw = trackedAttestation() as any;
    mutate(raw);
    if (_label === 'policy drift' || _label === 'count drift' || _label === 'extra field') {
      expect(() => parseHistoricalSectionCompatibilityAttestation(raw)).toThrow(message);
      return;
    }
    const parsed = parseHistoricalSectionCompatibilityAttestation(raw);
    const regenerated = compileHistoricalSectionCompatibilityFromDisk(ROOT).attestation;
    expect(parsed).not.toEqual(regenerated);
    expect(() => {
      if (JSON.stringify(parsed) !== JSON.stringify(regenerated)) throw new Error('does not match regenerated');
    }).toThrow(message);
  });

  it.each([
    ['body content', (raw: any) => { raw.documents[0].sections[0].content = 'forbidden'; }, 'exact keys'],
    ['source ordinal drift', (raw: any) => { raw.documents[0].sections[0].sourceOrdinal = 2; }, 'dense and source-ordered'],
    ['canonical locator drift', (raw: any) => { raw.documents[0].sections[0].canonicalLocator += '-wrong'; }, 'exact canonical section locator'],
    ['alias target drift', (raw: any) => { raw.documents[0].legacyAliases[0].targetSourceOrdinal = 2; }, 'does not match a canonical section'],
    ['missing alias', (raw: any) => { raw.documents[0].legacyAliases = []; }, 'must contain 1..2000 legacy aliases'],
  ])('rejects compiled-map %s', (_label, mutate, message) => {
    const raw = structuredClone(compileHistoricalSectionCompatibilityFromDisk(ROOT).map) as any;
    mutate(raw);
    expect(() => parseHistoricalSectionCompatibilityMap(raw)).toThrow(message);
  });

  it('rejects an alias that would shadow a different canonical section', () => {
    const raw = syntheticMap() as any;
    raw.documents[0].sections.push({
      sourceOrdinal: 2,
      sourceSignature: 'b'.repeat(64),
      legacySectionId: 'legacy-2',
      sectionKey: 'legacy-1',
      canonicalLocator: 'theologai://documents/synthetic#section-legacy-1',
    });
    raw.documents[0].legacyAliases.push({
      legacySectionId: 'legacy-2',
      targetSectionKey: 'legacy-1',
      targetSourceOrdinal: 2,
      targetCanonicalLocator: 'theologai://documents/synthetic#section-legacy-1',
    });
    expect(() => parseHistoricalSectionCompatibilityMap(raw)).toThrow('conflicts with canonical-before-alias resolution');
  });

  it('refuses source drift and a decision packet that no longer matches collision members', () => {
    const plan = parseHistoricalSectionKeyPlan(JSON.parse(readFileSync('data/historical-section-key-plan.json', 'utf8')));
    const evidence = parseHistoricalSectionCompatibilityEvidence(JSON.parse(readFileSync(
      'data/historical-section-compatibility-evidence.json',
      'utf8',
    )));
    const changedSources = structuredClone(readHistoricalSectionSources(ROOT));
    (changedSources[0]!.value.sections[0] as Record<string, unknown>).content = 'changed';
    expect(() => compileHistoricalSectionCompatibility(plan, changedSources, evidence)).toThrow('source snapshot changed');

    const changedEvidence = structuredClone(evidence);
    changedEvidence.collisionGroups[0]!.members[0]!.plannedSectionKey = 'wrong-but-safe';
    expect(() => compileHistoricalSectionCompatibility(plan, readHistoricalSectionSources(ROOT), changedEvidence))
      .toThrow('does not exactly cover compiled collision members and keys');
  });

  it('binds the former fixture authority to the manifest and keeps public/runtime surfaces inert', () => {
    const manifest = JSON.parse(readFileSync('data/data-manifest.json', 'utf8')) as {
      schemaVersion: string;
      materializations: { d1: { transformVersion: number; inputs: string[] } };
    };
    expect(manifest.schemaVersion).toBe('0005_historical_section_identity_delivery');
    expect(manifest.materializations.d1.transformVersion).toBe(8);
    expect(manifest.materializations.d1.inputs).toEqual(expect.arrayContaining([
      'data/historical-section-key-plan.json',
      'data/historical-section-compatibility-evidence.json',
      'data/historical-section-compatibility-attestation.json',
    ]));
    const builder = readFileSync('scripts/build-database.ts', 'utf8');
    expect(builder).toContain('sourceRegistry.read(\'data/historical-section-key-plan.json\'');
    expect(builder).toContain('sourceRegistry.read(\'data/historical-section-compatibility-evidence.json\'');
    expect(builder).toContain('sourceRegistry.read(\'data/historical-section-compatibility-attestation.json\'');
    for (const publicSurface of [
      'src/server.ts',
      'src/worker-server.ts',
      'src/mcp/tools.ts',
      'src/mcp/schemas/classicTexts.ts',
      'src/presenters/classicTextsStructured.ts',
    ]) {
      const source = readFileSync(publicSurface, 'utf8');
      expect(source, publicSurface).not.toContain('historical_section_identities');
      expect(source, publicSurface).not.toContain('historical_section_aliases');
      expect(source, publicSurface).not.toContain('historical_document_delivery_profiles');
    }
  });
});

function syntheticMap(): HistoricalSectionCompatibilityMap {
  return {
    schemaVersion: 1,
    kind: 'historical_section_source_first_compatibility_map',
    policy: HISTORICAL_SECTION_COMPATIBILITY_POLICY,
    documents: [{
      documentId: 'synthetic',
      sections: [{
        sourceOrdinal: 1,
        sourceSignature: 'a'.repeat(64),
        legacySectionId: 'legacy-1',
        sectionKey: 'canonical-1',
        canonicalLocator: 'theologai://documents/synthetic#section-canonical-1',
      }],
      legacyAliases: [{
        legacySectionId: 'legacy-1',
        targetSectionKey: 'canonical-1',
        targetSourceOrdinal: 1,
        targetCanonicalLocator: 'theologai://documents/synthetic#section-canonical-1',
      }],
    }],
  };
}
