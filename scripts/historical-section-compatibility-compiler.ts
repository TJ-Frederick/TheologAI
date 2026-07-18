#!/usr/bin/env tsx

/**
 * Compile the reviewed source-first compatibility map for the 17 current local
 * historical works without changing a database, seed, manifest, or runtime.
 *
 * The checked-in attestation is evidence about a reproducible output, never an
 * input from which section data may be reconstructed. A future reviewed
 * migration must call the compiler against the then-current sources and key
 * ledger, verify the attestation, and consume the emitted map.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLocalDocumentResourceUri } from '../src/kernel/documentResource.js';
import {
  HISTORICAL_SECTION_KEY_PLAN_PATH,
  historicalLegacySectionId,
  parseHistoricalSectionKeyPlan,
  readHistoricalSectionSources,
  sha256Canonical,
  verifyHistoricalSectionKeyPlan,
  type HistoricalSectionKeyPlan,
  type HistoricalSectionSourceDocument,
} from './historical-section-key-plan.js';
import {
  parseHistoricalSectionCompatibilityEvidence,
  verifyHistoricalSectionCompatibilityEvidenceFromSources,
  type HistoricalSectionCompatibilityEvidence,
} from './historical-section-compatibility-evidence.js';
import {
  HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_KIND,
  HISTORICAL_SECTION_COMPATIBILITY_COMPILER_SCHEMA_VERSION,
  HISTORICAL_SECTION_COMPATIBILITY_MAP_KIND,
  HISTORICAL_SECTION_COMPATIBILITY_POLICY,
  countHistoricalSectionCompatibilityMap,
  parseHistoricalSectionCompatibilityAttestation,
  parseHistoricalSectionCompatibilityMap,
  sameHistoricalSectionCompatibilityCounts,
  type HistoricalSectionCompatibilityAttestation,
  type HistoricalSectionCompatibilityCounts,
  type HistoricalSectionCompatibilityMap,
  type HistoricalSectionCompatibilityMapAlias,
  type HistoricalSectionCompatibilityMapDocument,
  type HistoricalSectionCompatibilityMapSection,
} from './historical-section-compatibility-schema.js';

export {
  HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_KIND,
  HISTORICAL_SECTION_COMPATIBILITY_COMPILER_SCHEMA_VERSION,
  HISTORICAL_SECTION_COMPATIBILITY_MAP_KIND,
  HISTORICAL_SECTION_COMPATIBILITY_POLICY,
  countHistoricalSectionCompatibilityMap,
  parseHistoricalSectionCompatibilityAttestation,
  parseHistoricalSectionCompatibilityMap,
  resolveHistoricalSectionCompatibility,
  type HistoricalSectionCompatibilityAttestation,
  type HistoricalSectionCompatibilityCounts,
  type HistoricalSectionCompatibilityMap,
  type HistoricalSectionCompatibilityMapAlias,
  type HistoricalSectionCompatibilityMapDocument,
  type HistoricalSectionCompatibilityMapSection,
  type HistoricalSectionCompatibilityResolution,
} from './historical-section-compatibility-schema.js';

export const HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_PATH =
  'test/fixtures/historical-section-compatibility/source-first-compiler-attestation.json';
export const HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_PATH =
  'test/fixtures/historical-section-compatibility/real-local-evidence.json';

export interface HistoricalSectionCompatibilityCompilation {
  map: HistoricalSectionCompatibilityMap;
  attestation: HistoricalSectionCompatibilityAttestation;
  counts: HistoricalSectionCompatibilityCounts;
}

/** Compile only from source documents, the immutable key plan, and the approved evidence. */
export function compileHistoricalSectionCompatibility(
  plan: HistoricalSectionKeyPlan,
  sources: HistoricalSectionSourceDocument[],
  approvedEvidence: HistoricalSectionCompatibilityEvidence,
): HistoricalSectionCompatibilityCompilation {
  const planReport = verifyHistoricalSectionKeyPlan(plan, sources);
  const sourceById = new Map(sources.map(source => [source.documentId, source]));

  const documents = plan.documents.map((document): HistoricalSectionCompatibilityMapDocument => {
    const source = sourceById.get(document.documentId);
    if (!source) throw new Error(`Compatibility compiler has no source document for ${document.documentId}`);
    const keyBySignature = new Map(document.sections.map(section => [section.sourceSignature, section.sectionKey]));
    const sections = source.value.sections.map((section, sourceIndex): HistoricalSectionCompatibilityMapSection => {
      const sourceSignature = sha256Canonical(section);
      const sectionKey = keyBySignature.get(sourceSignature);
      if (!sectionKey) throw new Error(`Compatibility compiler has no immutable key for ${document.documentId} source row ${sourceIndex + 1}`);
      const canonicalLocator = buildLocalDocumentResourceUri(document.documentId, sectionKey);
      if (!canonicalLocator) throw new Error(`Compatibility compiler cannot form a canonical locator for ${document.documentId}#${sectionKey}`);
      return {
        sourceOrdinal: sourceIndex + 1,
        sourceSignature,
        legacySectionId: historicalLegacySectionId(section, sourceIndex),
        sectionKey,
        canonicalLocator,
      };
    });
    const sectionByKey = new Map(sections.map(section => [section.sectionKey, section]));
    const legacyAliases = document.legacyLocators.map((alias): HistoricalSectionCompatibilityMapAlias => {
      const target = sectionByKey.get(alias.sectionKey);
      if (!target) throw new Error(`Compatibility compiler alias targets an unknown key: ${document.documentId}#${alias.sectionKey}`);
      return {
        legacySectionId: alias.legacySectionId,
        targetSectionKey: target.sectionKey,
        targetSourceOrdinal: target.sourceOrdinal,
        targetCanonicalLocator: target.canonicalLocator,
      };
    });
    return { documentId: document.documentId, sections, legacyAliases };
  });

  const map = parseHistoricalSectionCompatibilityMap({
    schemaVersion: HISTORICAL_SECTION_COMPATIBILITY_COMPILER_SCHEMA_VERSION,
    kind: HISTORICAL_SECTION_COMPATIBILITY_MAP_KIND,
    policy: HISTORICAL_SECTION_COMPATIBILITY_POLICY,
    documents,
  });
  verifyApprovedEvidenceAgainstCompiledMap(plan, approvedEvidence, map);
  const counts = countHistoricalSectionCompatibilityMap(map);
  if (!sameHistoricalSectionCompatibilityCounts(counts, planReport)) {
    throw new Error('Compatibility compiler output counts contradict the verified section-key plan');
  }
  const attestation: HistoricalSectionCompatibilityAttestation = {
    schemaVersion: HISTORICAL_SECTION_COMPATIBILITY_COMPILER_SCHEMA_VERSION,
    kind: HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_KIND,
    policy: HISTORICAL_SECTION_COMPATIBILITY_POLICY,
    inputs: {
      historicalSectionKeyPlanCanonicalSha256: sha256Canonical(plan),
      historicalSourcesCanonicalSha256: sha256Canonical(sources.map(source => ({
        documentId: source.documentId,
        sourceCanonicalSha256: sha256Canonical(source.value),
      }))),
      approvedSourceFirstEvidenceCanonicalSha256: sha256Canonical(approvedEvidence),
    },
    exactCounts: counts,
    canonicalOutputSha256: sha256Canonical(map),
  };
  return { map, attestation: parseHistoricalSectionCompatibilityAttestation(attestation), counts };
}

function verifyApprovedEvidenceAgainstCompiledMap(
  plan: HistoricalSectionKeyPlan,
  evidence: HistoricalSectionCompatibilityEvidence,
  map: HistoricalSectionCompatibilityMap,
): void {
  if (evidence.historicalSectionKeyPlanSha256 !== sha256Canonical(plan)) {
    throw new Error('Approved source-first evidence does not bind the compiled section-key plan');
  }
  const compiledGroups = map.documents.flatMap(document => {
    const byLegacy = new Map<string, HistoricalSectionCompatibilityMapSection[]>();
    for (const section of document.sections) {
      const group = byLegacy.get(section.legacySectionId) ?? [];
      group.push(section);
      byLegacy.set(section.legacySectionId, group);
    }
    return [...byLegacy.entries()]
      .filter(([, sections]) => sections.length > 1)
      .map(([legacySectionId, sections]) => ({
        documentId: document.documentId,
        legacySectionId,
        members: sections.map(section => ({
          sourceOrdinal: section.sourceOrdinal,
          sourceSignature: section.sourceSignature,
          plannedSectionKey: section.sectionKey,
        })),
      }));
  }).sort((left, right) => {
    const leftId = `${left.documentId}\u0000${left.legacySectionId}`;
    const rightId = `${right.documentId}\u0000${right.legacySectionId}`;
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
  const approvedGroups = evidence.collisionGroups.map(group => ({
    documentId: group.documentId,
    legacySectionId: group.legacySectionId,
    members: group.members.map(member => ({
      sourceOrdinal: member.sourceOrdinal,
      sourceSignature: member.sourceSignature,
      plannedSectionKey: member.plannedSectionKey,
    })),
  }));
  if (sha256Canonical(compiledGroups) !== sha256Canonical(approvedGroups)) {
    throw new Error('Approved source-first evidence does not exactly cover compiled collision members and keys');
  }
}

/** Read and verify all three authoritative inputs before compiling. */
export function compileHistoricalSectionCompatibilityFromDisk(root: string): HistoricalSectionCompatibilityCompilation {
  const plan = parseHistoricalSectionKeyPlan(JSON.parse(readFileSync(join(root, HISTORICAL_SECTION_KEY_PLAN_PATH), 'utf8')));
  const sources = readHistoricalSectionSources(root);
  const evidence = parseHistoricalSectionCompatibilityEvidence(JSON.parse(readFileSync(
    join(root, HISTORICAL_SECTION_COMPATIBILITY_EVIDENCE_PATH),
    'utf8',
  )));
  verifyHistoricalSectionCompatibilityEvidenceFromSources(root, evidence);
  return compileHistoricalSectionCompatibility(plan, sources, evidence);
}

/** Verify the compact packet by regenerating every output row from authority. */
export function verifyHistoricalSectionCompatibilityAttestationFromDisk(
  root: string,
): HistoricalSectionCompatibilityCompilation {
  const tracked = parseHistoricalSectionCompatibilityAttestation(JSON.parse(readFileSync(
    join(root, HISTORICAL_SECTION_COMPATIBILITY_ATTESTATION_PATH),
    'utf8',
  )));
  const compilation = compileHistoricalSectionCompatibilityFromDisk(root);
  if (sha256Canonical(tracked) !== sha256Canonical(compilation.attestation)) {
    throw new Error('Historical section compatibility attestation does not match regenerated authoritative inputs and output');
  }
  return compilation;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv.length === 2) {
    const compilation = verifyHistoricalSectionCompatibilityAttestationFromDisk(root);
    process.stdout.write(`${JSON.stringify({ ...compilation.counts, canonicalOutputSha256: compilation.attestation.canonicalOutputSha256 })}\n`);
  } else if (process.argv.length === 3 && process.argv[2] === '--emit-map') {
    const compilation = verifyHistoricalSectionCompatibilityAttestationFromDisk(root);
    process.stdout.write(`${JSON.stringify(compilation.map)}\n`);
  } else {
    throw new Error('Usage: historical-section-compatibility-compiler.ts [--emit-map]');
  }
}
