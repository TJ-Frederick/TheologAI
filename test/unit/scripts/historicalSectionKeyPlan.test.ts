import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_HISTORICAL_SECTION_COLLISIONS,
  HISTORICAL_SECTION_KEY_PLAN_KIND,
  parseHistoricalSectionKeyPlan,
  readHistoricalSectionSources,
  sha256Canonical,
  verifyHistoricalSectionKeyPlan,
  verifyHistoricalSectionKeyPlanFromDisk,
  verifyHistoricalSectionKeyPlanGenesis,
  verifyHistoricalSectionKeyPlanTransition,
  type HistoricalSectionKeyPlan,
  type HistoricalSectionSourceDocument,
} from '../../../scripts/historical-section-key-plan.js';

const ROOT = process.cwd();
const deployWorkflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const prWorkflow = readFileSync('.github/workflows/pr.yml', 'utf8');

function rawTrackedPlan(): any {
  return JSON.parse(readFileSync('data/historical-section-key-plan.json', 'utf8'));
}

function fixture(): { raw: any; source: HistoricalSectionSourceDocument } {
  const value = {
    title: 'Fixture',
    sections: [
      { question_number: '1', question: 'Main question', answer: 'Answer' },
      { question_number: '1', question: 'Nested item', answer: '' },
      { question_number: '2', question: 'Second question', answer: 'Answer' },
    ],
  };
  const source = {
    documentId: 'fixture',
    sourcePath: 'data/historical-documents/fixture.json',
    value,
  };
  const entries = [
    { sourceSignature: sha256Canonical(value.sections[0]), sectionKey: '1' },
    { sourceSignature: sha256Canonical(value.sections[1]), sectionKey: 'assigned-0001' },
    { sourceSignature: sha256Canonical(value.sections[2]), sectionKey: '2' },
  ].sort((left, right) => left.sourceSignature < right.sourceSignature ? -1 : 1);
  return {
    source,
    raw: {
      schemaVersion: 1,
      kind: HISTORICAL_SECTION_KEY_PLAN_KIND,
      lineage: { mode: 'genesis', predecessorPlanSha256: null },
      policy: {
        authority: 'checked_in_explicit_keys',
        sourceSignatures: 'coverage_only_not_identity',
        legacyResolution: 'provisional_source_first_target',
        runtimeStatus: 'inactive_until_0005_transform_8',
      },
      expectedCollisionReport: { collisionGroups: 1, affectedSections: 2, newlyAddressableSections: 1 },
      documents: [{
        documentId: 'fixture',
        sourcePath: source.sourcePath,
        sourceCanonicalSha256: sha256Canonical(value),
        sections: entries.sort((left, right) => left.sectionKey < right.sectionKey ? -1 : 1),
        legacyLocators: [
          { legacySectionId: '1', sectionKey: '1' },
          { legacySectionId: '2', sectionKey: '2' },
        ],
        retiredSectionKeys: [],
      }],
    },
  };
}

function successor(previous: HistoricalSectionKeyPlan, raw: any): any {
  raw.lineage = { mode: 'successor', predecessorPlanSha256: sha256Canonical(previous) };
  return raw;
}

function runCli(currentRaw: any, previousRaw: any): ReturnType<typeof spawnSync> {
  const directory = mkdtempSync(join(tmpdir(), 'theologai-section-key-cli-'));
  const previousPath = join(directory, 'previous.json');
  const currentPath = join(directory, 'current.json');
  writeFileSync(previousPath, JSON.stringify(previousRaw));
  writeFileSync(currentPath, JSON.stringify(currentRaw));
  return spawnSync(process.execPath, [
    '--import', 'tsx',
    resolve('scripts/historical-section-key-plan.ts'),
    '--current-plan', currentPath,
    '--previous-plan', previousPath,
  ], { encoding: 'utf8' });
}

describe('migration-free historical section-key plan', () => {
  it('covers the exact current 17-work source snapshot and reviewed collision report', () => {
    const plan = parseHistoricalSectionKeyPlan(rawTrackedPlan());
    const report = verifyHistoricalSectionKeyPlanFromDisk(ROOT);

    expect(report).toEqual({
      documentCount: 17,
      sectionCount: 3054,
      legacyLocatorCount: 2821,
      ...EXPECTED_HISTORICAL_SECTION_COLLISIONS,
    });
    expect(plan.documents.map(document => document.documentId)).toEqual(
      readHistoricalSectionSources(ROOT).map(source => source.documentId),
    );
  });

  it('records every old locator with its provisional source-first target and assigns all colliding rows explicit keys', () => {
    const plan = parseHistoricalSectionKeyPlan(rawTrackedPlan());
    const sources = new Map(readHistoricalSectionSources(ROOT).map(source => [source.documentId, source]));
    let explicitlyAssigned = 0;

    for (const document of plan.documents) {
      const source = sources.get(document.documentId)!;
      const keyBySignature = new Map(document.sections.map(section => [section.sourceSignature, section.sectionKey]));
      const firstSignatureByLegacy = new Map<string, string>();
      for (const [index, section] of source.value.sections.entries()) {
        const raw = section as Record<string, unknown>;
        const legacy = String(raw.question_number || raw.section_number || index + 1);
        const signature = sha256Canonical(section);
        if (!firstSignatureByLegacy.has(legacy)) firstSignatureByLegacy.set(legacy, signature);
        else explicitlyAssigned++;
      }
      const aliases = new Map(document.legacyLocators.map(alias => [alias.legacySectionId, alias.sectionKey]));
      for (const [legacy, firstSignature] of firstSignatureByLegacy) {
        expect(keyBySignature.get(firstSignature)).toBe(legacy);
        expect(aliases.get(legacy)).toBe(legacy);
      }
    }
    expect(explicitlyAssigned).toBe(233);
  });

  it('verifies a bounded adversarial fixture without deriving its assigned key', () => {
    const { raw, source } = fixture();
    const plan = parseHistoricalSectionKeyPlan(raw);
    expect(verifyHistoricalSectionKeyPlan(plan, [source])).toEqual({
      documentCount: 1,
      sectionCount: 3,
      legacyLocatorCount: 2,
      collisionGroups: 1,
      affectedSections: 2,
      newlyAddressableSections: 1,
    });
  });

  it.each([
    ['unsafe section key', (raw: any) => { raw.documents[0].sections[0].sectionKey = '../bad'; }, 'safe identity alphabet'],
    ['oversized section key', (raw: any) => { raw.documents[0].sections[0].sectionKey = `s${'x'.repeat(160)}`; }, 'safe identity alphabet'],
    ['duplicate section key', (raw: any) => { raw.documents[0].sections[1].sectionKey = raw.documents[0].sections[0].sectionKey; }, 'duplicate section key'],
    ['duplicate source signature', (raw: any) => { raw.documents[0].sections[1].sourceSignature = raw.documents[0].sections[0].sourceSignature; }, 'duplicate section source signature'],
    ['unknown alias target', (raw: any) => { raw.documents[0].legacyLocators[0].sectionKey = 'missing'; }, 'unknown section key'],
    ['duplicate legacy alias', (raw: any) => { raw.documents[0].legacyLocators[1].legacySectionId = raw.documents[0].legacyLocators[0].legacySectionId; }, 'duplicate legacy locator'],
    ['mutable policy', (raw: any) => { raw.policy.sourceSignatures = 'identity'; }, 'coverage-only'],
    ['compatibility overclaim', (raw: any) => { raw.policy.legacyResolution = 'deployed_first_target'; }, 'provisionally source-first'],
    ['unsorted section ledger', (raw: any) => { raw.documents[0].sections.reverse(); }, 'authoritative section keys must be sorted'],
  ])('rejects %s', (_label, mutate, message) => {
    const { raw } = fixture();
    mutate(raw);
    expect(() => parseHistoricalSectionKeyPlan(raw)).toThrow(message);
  });

  it('fails closed on changed source bytes, missing coverage, and reordered legacy ownership', () => {
    const changed = fixture();
    changed.source.value.sections[1] = { question_number: '1', question: 'Changed text', answer: '' };
    expect(() => verifyHistoricalSectionKeyPlan(parseHistoricalSectionKeyPlan(changed.raw), [changed.source]))
      .toThrow('source snapshot changed');

    const missing = fixture();
    missing.raw.documents[0].sections.pop();
    const missingPlan = parseHistoricalSectionKeyPlan(missing.raw);
    expect(() => verifyHistoricalSectionKeyPlan(missingPlan, [missing.source])).toThrow('section coverage mismatch');

    const wrongFirst = fixture();
    const first = wrongFirst.raw.documents[0].sections.find(
      (entry: { sourceSignature: string }) => entry.sourceSignature === sha256Canonical(wrongFirst.source.value.sections[0]),
    );
    const nested = wrongFirst.raw.documents[0].sections.find(
      (entry: { sourceSignature: string }) => entry.sourceSignature === sha256Canonical(wrongFirst.source.value.sections[1]),
    );
    [first.sectionKey, nested.sectionKey] = [nested.sectionKey, first.sectionKey];
    wrongFirst.raw.documents[0].sections.sort(
      (left: { sectionKey: string }, right: { sectionKey: string }) => left.sectionKey < right.sectionKey ? -1 : 1,
    );
    const wrongFirstPlan = parseHistoricalSectionKeyPlan(wrongFirst.raw) as HistoricalSectionKeyPlan;
    expect(() => verifyHistoricalSectionKeyPlan(wrongFirstPlan, [wrongFirst.source]))
      .toThrow('provisional source-first key');
  });

  it('fails when the declared collision report is weakened or inflated', () => {
    const { raw, source } = fixture();
    raw.expectedCollisionReport.newlyAddressableSections = 0;
    expect(() => verifyHistoricalSectionKeyPlan(parseHistoricalSectionKeyPlan(raw), [source]))
      .toThrow('collision report changed');
  });

  it('uses the shared URI builder and enforces the encoded URI boundary for colons', () => {
    const valid = fixture();
    valid.raw.documents[0].sections.find((entry: { sectionKey: string }) => entry.sectionKey === 'assigned-0001').sectionKey
      = `a${':'.repeat(115)}`;
    expect(() => parseHistoricalSectionKeyPlan(valid.raw)).not.toThrow();

    const oversized = fixture();
    oversized.raw.documents[0].sections.find((entry: { sectionKey: string }) => entry.sectionKey === 'assigned-0001').sectionKey
      = `a${':'.repeat(116)}`;
    expect(() => parseHistoricalSectionKeyPlan(oversized.raw)).toThrow('within 384 characters after encoding');

    const legacyOversized = fixture();
    legacyOversized.raw.documents[0].legacyLocators[1].legacySectionId = `a${':'.repeat(116)}`;
    expect(() => parseHistoricalSectionKeyPlan(legacyOversized.raw)).toThrow('within 384 characters after encoding');
  });

  it('requires deletion to retire the key permanently and forbids active or alias reuse', () => {
    const original = fixture();
    const previous = parseHistoricalSectionKeyPlan(original.raw);
    const nextRaw = structuredClone(original.raw);
    nextRaw.documents[0].sections = nextRaw.documents[0].sections.filter(
      (entry: { sectionKey: string }) => entry.sectionKey !== 'assigned-0001',
    );
    nextRaw.documents[0].retiredSectionKeys = ['assigned-0001'];
    const nextSource = structuredClone(original.source);
    nextSource.value.sections.splice(1, 1);
    nextRaw.documents[0].sourceCanonicalSha256 = sha256Canonical(nextSource.value);
    nextRaw.expectedCollisionReport = { collisionGroups: 0, affectedSections: 0, newlyAddressableSections: 0 };
    const next = parseHistoricalSectionKeyPlan(successor(previous, nextRaw));
    expect(verifyHistoricalSectionKeyPlan(next, [nextSource])).toMatchObject({ sectionCount: 2, newlyAddressableSections: 0 });
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, next)).not.toThrow();

    const activeReuse = fixture();
    activeReuse.raw.documents[0].retiredSectionKeys = ['assigned-0001'];
    expect(() => parseHistoricalSectionKeyPlan(activeReuse.raw)).toThrow('reuses retired section key');

    const aliasReuse = fixture();
    aliasReuse.raw.documents[0].legacyLocators[0].legacySectionId = 'old-1';
    aliasReuse.raw.documents[0].legacyLocators.sort(
      (left: { legacySectionId: string }, right: { legacySectionId: string }) => left.legacySectionId < right.legacySectionId ? -1 : 1,
    );
    aliasReuse.raw.documents[0].retiredSectionKeys = ['old-1'];
    expect(() => parseHistoricalSectionKeyPlan(aliasReuse.raw)).toThrow('overlaps the legacy alias namespace');
  });

  it('keeps retired keys append-only and unchanged signatures on the same authoritative key', () => {
    const retiredRaw = fixture().raw;
    retiredRaw.documents[0].retiredSectionKeys = ['old-key'];
    const previousWithRetired = parseHistoricalSectionKeyPlan(retiredRaw);
    const removedRetired = structuredClone(retiredRaw);
    removedRetired.documents[0].retiredSectionKeys = [];
    expect(() => verifyHistoricalSectionKeyPlanTransition(
      previousWithRetired,
      parseHistoricalSectionKeyPlan(successor(previousWithRetired, removedRetired)),
    ))
      .toThrow('removed retired section key');

    const original = fixture();
    const movedRaw = structuredClone(original.raw);
    movedRaw.documents[0].sections.find((entry: { sectionKey: string }) => entry.sectionKey === 'assigned-0001').sectionKey
      = 'assigned-0002';
    movedRaw.documents[0].sections.sort((left: { sectionKey: string }, right: { sectionKey: string }) => left.sectionKey < right.sectionKey ? -1 : 1);
    const previous = parseHistoricalSectionKeyPlan(original.raw);
    expect(() => verifyHistoricalSectionKeyPlanTransition(
      previous,
      parseHistoricalSectionKeyPlan(successor(previous, movedRaw)),
    )).toThrow('newly retired keys must exactly equal removed active keys');
  });

  it('carries a content correction signature forward under the same key instead of regenerating or swapping it', () => {
    const original = fixture();
    const previous = parseHistoricalSectionKeyPlan(original.raw);
    const correctedRaw = structuredClone(original.raw);
    const correctedSource = structuredClone(original.source);
    const oldSignature = sha256Canonical(correctedSource.value.sections[2]);
    correctedSource.value.sections[2] = { question_number: '2', question: 'Corrected second question', answer: 'Answer' };
    const correctedEntry = correctedRaw.documents[0].sections.find((entry: { sectionKey: string }) => entry.sectionKey === '2');
    correctedEntry.sourceSignature = sha256Canonical(correctedSource.value.sections[2]);
    correctedEntry.supersededSourceSignatures = [oldSignature];
    correctedRaw.documents[0].sourceCanonicalSha256 = sha256Canonical(correctedSource.value);
    const corrected = parseHistoricalSectionKeyPlan(successor(previous, correctedRaw));
    expect(() => verifyHistoricalSectionKeyPlan(corrected, [correctedSource])).not.toThrow();
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, corrected)).not.toThrow();

    delete correctedEntry.supersededSourceSignatures;
    const missingHistory = parseHistoricalSectionKeyPlan(successor(previous, correctedRaw));
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, missingHistory))
      .toThrow('invalid changed source-signature history delta');
  });

  it('permits an identical canonical predecessor as a no-op but requires exact deltas for a changed successor', () => {
    const original = fixture();
    const previous = parseHistoricalSectionKeyPlan(original.raw);
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, parseHistoricalSectionKeyPlan(structuredClone(original.raw))))
      .not.toThrow();

    const unknownRetirement = successor(previous, structuredClone(original.raw));
    unknownRetirement.documents[0].retiredSectionKeys = ['never-active'];
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, parseHistoricalSectionKeyPlan(unknownRetirement)))
      .toThrow('newly retired keys must exactly equal removed active keys');

    const unchangedExtraHistory = successor(previous, structuredClone(original.raw));
    unchangedExtraHistory.documents[0].sections[0].supersededSourceSignatures = ['a'.repeat(64)];
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, parseHistoricalSectionKeyPlan(unchangedExtraHistory)))
      .toThrow('invalid unchanged source-signature history delta');

    const changedExtraHistory = successor(previous, structuredClone(original.raw));
    const changed = changedExtraHistory.documents[0].sections.find((entry: { sectionKey: string }) => entry.sectionKey === '2');
    const previousSignature = changed.sourceSignature;
    changed.sourceSignature = 'b'.repeat(64);
    changed.supersededSourceSignatures = [previousSignature, 'c'.repeat(64)].sort();
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, parseHistoricalSectionKeyPlan(changedExtraHistory)))
      .toThrow('invalid changed source-signature history delta');

    const newKeyWithHistory = successor(previous, structuredClone(original.raw));
    newKeyWithHistory.documents[0].sections.push({
      sourceSignature: 'd'.repeat(64),
      sectionKey: 'new-key',
      supersededSourceSignatures: ['e'.repeat(64)],
    });
    newKeyWithHistory.documents[0].sections.sort((a: { sectionKey: string }, b: { sectionKey: string }) => a.sectionKey < b.sectionKey ? -1 : 1);
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, parseHistoricalSectionKeyPlan(newKeyWithHistory)))
      .toThrow('new section key new-key cannot begin with superseded');
  });

  it('prevents every previously claimed signature, including history, from moving to another key', () => {
    const original = fixture();
    original.raw.documents[0].sections.find((entry: { sectionKey: string }) => entry.sectionKey === '2')
      .supersededSourceSignatures = ['a'.repeat(64)];
    const previous = parseHistoricalSectionKeyPlan(original.raw);
    const movedHistory = successor(previous, structuredClone(original.raw));
    delete movedHistory.documents[0].sections.find((entry: { sectionKey: string }) => entry.sectionKey === '2')
      .supersededSourceSignatures;
    movedHistory.documents[0].sections.find((entry: { sectionKey: string }) => entry.sectionKey === 'assigned-0001')
      .supersededSourceSignatures = ['a'.repeat(64)];
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, parseHistoricalSectionKeyPlan(movedHistory)))
      .toThrow('moved a previously claimed source signature');
  });

  it('requires newly introduced documents to start without retirement or supersession history', () => {
    const original = fixture();
    const previous = parseHistoricalSectionKeyPlan(original.raw);
    const nextRaw = successor(previous, structuredClone(original.raw));
    nextRaw.documents.push({
      documentId: 'new-document',
      sourcePath: 'data/historical-documents/new-document.json',
      sourceCanonicalSha256: '1'.repeat(64),
      sections: [{ sourceSignature: '2'.repeat(64), sectionKey: '1', supersededSourceSignatures: ['3'.repeat(64)] }],
      legacyLocators: [{ legacySectionId: '1', sectionKey: '1' }],
      retiredSectionKeys: [],
    });
    nextRaw.documents.sort((a: { documentId: string }, b: { documentId: string }) => a.documentId < b.documentId ? -1 : 1);
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, parseHistoricalSectionKeyPlan(nextRaw)))
      .toThrow('New section-key document new-document cannot begin');
  });

  it('enforces one-time genesis and exact predecessor lineage', () => {
    const original = fixture();
    const previous = parseHistoricalSectionKeyPlan(original.raw);
    expect(() => verifyHistoricalSectionKeyPlanGenesis(previous)).not.toThrow();

    const badGenesis = structuredClone(original.raw);
    badGenesis.documents[0].retiredSectionKeys = ['retired-key'];
    expect(() => verifyHistoricalSectionKeyPlanGenesis(parseHistoricalSectionKeyPlan(badGenesis)))
      .toThrow('genesis cannot contain retired keys');

    const wrongPredecessor = structuredClone(original.raw);
    wrongPredecessor.lineage = { mode: 'successor', predecessorPlanSha256: '0'.repeat(64) };
    expect(() => verifyHistoricalSectionKeyPlanTransition(previous, parseHistoricalSectionKeyPlan(wrongPredecessor)))
      .toThrow('exact canonical predecessor');

    const moved = structuredClone(original.raw);
    const movedEntry = moved.documents[0].sections.find((entry: { sectionKey: string }) => entry.sectionKey === 'assigned-0001');
    movedEntry.sectionKey = 'assigned-0002';
    moved.documents[0].sections.sort((a: { sectionKey: string }, b: { sectionKey: string }) => a.sectionKey < b.sectionKey ? -1 : 1);
    expect(() => verifyHistoricalSectionKeyPlanTransition(
      previous,
      parseHistoricalSectionKeyPlan(successor(previous, moved)),
    )).toThrow('newly retired keys must exactly equal removed active keys');
  });

  it('exercises identical, changed-genesis, and exact-successor lineage through the real CLI', () => {
    const tracked = rawTrackedPlan();
    const identical = runCli(structuredClone(tracked), structuredClone(tracked));
    expect(identical.status, identical.stderr).toBe(0);

    const previousRaw = rawTrackedPlan();
    previousRaw.documents[0].retiredSectionKeys = ['retired-key'];
    const changedGenesis = runCli(rawTrackedPlan(), previousRaw);
    expect(changedGenesis.status).not.toBe(0);
    expect(changedGenesis.stderr).toContain('must declare successor lineage');

    const exactPreviousRaw = rawTrackedPlan();
    const exactPrevious = parseHistoricalSectionKeyPlan(exactPreviousRaw);
    const exactSuccessorRaw = successor(exactPrevious, rawTrackedPlan());
    const exactSuccessor = runCli(exactSuccessorRaw, exactPreviousRaw);
    expect(exactSuccessor.status, exactSuccessor.stderr).toBe(0);
  });

  it('keeps production ancestry and PR merge-parent lineage gates distinct', () => {
    expect(deployWorkflow).toContain('fetch-depth: 0');
    expect(deployWorkflow).toContain('git merge-base --is-ancestor "$PREVIOUS_MAIN_SHA" HEAD');
    expect(deployWorkflow).toContain('git show "$PREVIOUS_MAIN_SHA:data/historical-section-key-plan.json"');
    expect(deployWorkflow).not.toContain('git rev-parse HEAD^1)" = "$PREVIOUS_MAIN_SHA"');
    expect(prWorkflow).toContain('fetch-depth: 2');
    expect(prWorkflow).toContain('test "$(git rev-parse HEAD^1)" = "$BASE_SHA"');
  });
});
