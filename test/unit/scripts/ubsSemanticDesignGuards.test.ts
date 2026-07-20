import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import Database from 'better-sqlite3';
import {
  UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS,
} from '../../../src/kernel/ubsSemanticDomain.js';
import {
  createUbsSemanticDraftContinuationCursor,
  serializeValidatedUbsSemanticDraftOutput,
} from '../../../src/kernel/ubsSemanticDraftOutput.js';

const repo = new URL('../../../', import.meta.url);

describe('source-free UBS semantic design guards', () => {
  it('keeps 0004 as a non-executable design fixture', () => {
    const draft = readFileSync(new URL('test/fixtures/ubs-semantics/0004_ubs_hebrew_semantics.draft.sql', repo), 'utf8');
    expect(draft).toContain('DESIGN FIXTURE ONLY. NOT AN EXECUTABLE MIGRATION');
    expect(existsSync(new URL('migrations/0004_ubs_hebrew_semantics.sql', repo))).toBe(false);
    expect(readdirSync(new URL('migrations/', repo))).toEqual([
      '0001_initial_schema.sql',
      '0002_ubs_parallel_passages.sql',
      '0003_original_language_usage.sql',
    ]);
  });

  it('does not advance the data schema or materialization transform', () => {
    const manifest = JSON.parse(readFileSync(new URL('data/data-manifest.json', repo), 'utf8')) as {
      schemaVersion: string;
      materializations: { d1: { transformVersion: number; migrations: Array<{ path: string }> } };
    };
    expect(manifest.schemaVersion).toBe('0003_original_language_usage');
    expect(manifest.materializations.d1.transformVersion).toBe(6);
    expect(manifest.materializations.d1.migrations.map(item => item.path)).not.toContain('migrations/0004_ubs_hebrew_semantics.sql');
  });

  it('keeps the relational design internally valid and strict in an in-memory fixture', () => {
    const draft = readFileSync(new URL('test/fixtures/ubs-semantics/0004_ubs_hebrew_semantics.draft.sql', repo), 'utf8');
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(draft);
    const insertSource = db.prepare(`INSERT INTO ubs_semantic_sources (
      source_id, source_role, schema_version, artifact_identity, title,
      artifact_name, artifact_version, language, publisher, license, license_url,
      source_url, source_commit, source_blob, source_sha256, transform_version,
      modified, modification_note
    ) VALUES (?, ?, 'ubs-semantics.v1', ?, ?, ?, '0.9.2', 'Hebrew',
      'United Bible Societies', 'CC BY-SA 4.0',
      'https://creativecommons.org/licenses/by-sa/4.0/', ?, ?, ?, ?, 7, 1, ?)`);
    insertSource.run(
      'synthetic-dictionary', 'dictionary', '1'.repeat(64), 'Synthetic dictionary',
      'UBSHebrewDic-v0.9.2-en.JSON', 'https://example.invalid/dictionary',
      '2'.repeat(40), '3'.repeat(40), '4'.repeat(64), 'Invented only.',
    );
    insertSource.run(
      'synthetic-domains', 'lexical_domains', '1'.repeat(64), 'Synthetic domains',
      'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON', 'https://example.invalid/domains',
      '5'.repeat(40), '6'.repeat(40), '7'.repeat(64), 'Invented only.',
    );
    expect(() => db.prepare(`UPDATE ubs_semantic_sources SET source_sha256 = 'not-a-hash' WHERE source_role = 'dictionary'`).run()).toThrow();
    expect(() => db.prepare(`UPDATE ubs_semantic_sources SET artifact_identity = 'short' WHERE source_role = 'dictionary'`).run()).toThrow();
    expect(() => db.prepare(`UPDATE ubs_semantic_sources SET artifact_version = '0.9.3' WHERE source_role = 'dictionary'`).run()).toThrow();
    expect(() => db.prepare(`UPDATE ubs_semantic_sources SET transform_version = 8 WHERE source_role = 'dictionary'`).run()).toThrow();
    expect(() => db.prepare(`UPDATE ubs_semantic_sources SET title = '' WHERE source_role = 'dictionary'`).run()).toThrow();
    db.prepare(`INSERT INTO ubs_semantic_entries VALUES (?, 'dictionary', ?, 1, ?, NULL, NULL)`)
      .run('synthetic-dictionary', 'entry.one', 'SYNTHETIC LEMMA');
    expect(() => db.prepare(`UPDATE ubs_semantic_entries SET entry_id = 'entry..invalid' WHERE entry_id = 'entry.one'`).run()).toThrow();
    const identity = db.prepare(`INSERT INTO ubs_semantic_entry_identities VALUES (?, ?, ?)`);
    expect(() => identity.run('synthetic-dictionary', 'entry.one', 'G0001')).toThrow();
    expect(() => identity.run('synthetic-dictionary', 'entry.one', 'A000001')).toThrow();
    expect(() => identity.run('synthetic-dictionary', 'entry.one', 'A0000')).toThrow();
    expect(() => identity.run('synthetic-dictionary', 'entry.one', 'A0001')).not.toThrow();
    expect(() => db.prepare(`INSERT INTO ubs_semantic_domains VALUES (?, 'lexical_domains', ?, 1, ?, ?, NULL)`)
      .run('synthetic-domains', 'child', 'missing-parent', 'Invented child')).toThrow();
    expect(() => db.prepare(`INSERT INTO ubs_semantic_domains VALUES (?, 'lexical_domains', ?, 1, NULL, ?, NULL)`)
      .run('synthetic-domains', '-invalid', 'Invented invalid')).toThrow();
    expect(() => db.prepare(`INSERT INTO ubs_semantic_domains VALUES (?, 'lexical_domains', ?, 1, NULL, ?, NULL)`)
      .run('synthetic-dictionary', 'wrong-role', 'Invented invalid')).toThrow();
    expect(() => db.prepare(`INSERT INTO ubs_semantic_domains VALUES (?, 'lexical_domains', ?, 1, NULL, ?, NULL)`)
      .run('synthetic-domains', 'invalid-', 'Invented invalid')).toThrow();
    db.prepare(`INSERT INTO ubs_semantic_domains VALUES (?, 'lexical_domains', ?, 1, NULL, ?, NULL)`)
      .run('synthetic-domains', 'root', 'Synthetic root');
    db.prepare(`INSERT INTO ubs_semantic_domains VALUES (?, 'lexical_domains', ?, 2, ?, ?, NULL)`)
      .run('synthetic-domains', 'child', 'root', 'Synthetic child');
    expect(() => db.prepare(`INSERT INTO ubs_semantic_senses VALUES (?, 'dictionary', ?, ?, 1, ?, ?)`)
      .run('synthetic-dictionary', 'entry.one', 'sense.invalid', 'Synthetic definition', '{}')).toThrow();
    db.prepare(`INSERT INTO ubs_semantic_senses VALUES (?, 'dictionary', ?, ?, 1, ?, ?)`)
      .run('synthetic-dictionary', 'entry.one', 'sense.one', 'Synthetic definition', '["Synthetic gloss"]');
    db.prepare(`INSERT INTO ubs_semantic_sense_domains VALUES (?, 'dictionary', ?, ?, 'lexical_domains', ?)`)
      .run('synthetic-dictionary', 'sense.one', 'synthetic-domains', 'child');
    expect(() => db.prepare(`INSERT INTO ubs_semantic_reference_evidence VALUES (?, 'dictionary', ?, ?, 1, ?, ?, ?)`)
      .run('synthetic-dictionary', 'sense.one', 'reference.invalid', 'SYN 1:1', ' ', 'source_attested_sense_reference')).toThrow();
    db.close();
  });

  it('keeps the draft output honest for beginners and experts', () => {
    const contract = JSON.parse(readFileSync(new URL('test/fixtures/ubs-semantics/structured-output-contract.draft.json', repo), 'utf8')) as any;
    expect(contract.$comment).toContain('DESIGN FIXTURE ONLY');
    expect(contract.statusValues).toEqual(['reference_aligned_source_candidate', 'lexical_candidates', 'unavailable']);
    expect(contract.invariants.join(' ')).toContain('TBESH Meaning is withheld');
    expect(contract.beginnerExample.status).toBe('lexical_candidates');
    expect(contract.expertExample.status).toBe('reference_aligned_source_candidate');
    expect(contract.expertExample.alignmentEvidence.status).toBe('verified_token_alignment');
    expect(contract.expertExample.alignmentEvidence.proofContract).toBe('theologai-exact-hebrew-token-alignment.v1');
    expect(contract.expertExample.referenceEvidence).toMatchObject({
      sourceId: 'synthetic-hebrew-dictionary',
      senseId: contract.expertExample.senseId,
    });
    const validate = new Ajv2020({ strict: true }).compile(contract.schema);
    const request = {
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1',
      artifactIdentity: contract.expertExample.provenance.transformation.artifactIdentity,
      expectedAlignment: structuredClone(contract.expertExample.alignmentEvidence),
    };
    expect(validate(contract.beginnerExample), validate.errors?.map((error: any) => error.message).join('; ')).toBe(true);
    expect(validate(contract.expertExample), validate.errors?.map((error: any) => error.message).join('; ')).toBe(true);
    expect(serializeValidatedUbsSemanticDraftOutput(contract.beginnerExample, request))
      .toBe(JSON.stringify(contract.beginnerExample));
    expect(serializeValidatedUbsSemanticDraftOutput(contract.expertExample, request))
      .toBe(JSON.stringify(contract.expertExample));
    expect(contract.beginnerExample.reason).toBe('reference_alignment_unproven');
    expect(contract.expertExample.meaning.domains[0].label).toBeTruthy();
    expect(contract.expertExample.identity).toEqual({ publicStrongs: 'H1', sourceIdentity: 'H0001' });
    expect(JSON.stringify(contract.expertExample.identity)).not.toContain('A0001');
    expect(contract.beginnerExample.resultWindow).toMatchObject({
      priorCount: 0, returnedCount: 1, consumedCount: 1, totalCount: 2, hasMore: true,
    });
    expect(contract.beginnerExample.resultWindow.continuation).toMatchObject({
      operation: 'semantic_candidates', artifactIdentity: contract.beginnerExample.provenance.transformation.artifactIdentity,
      query: { publicStrongs: 'H1', sourceIdentity: 'H0001', normalizedReference: 'Synthetic 1:1' },
    });
    expect(contract.beginnerExample.resultWindow.continuation.cursor)
      .toBe(createUbsSemanticDraftContinuationCursor(request, 1));
    expect(contract.expertExample.resultWindow).toEqual({
      priorCount: 0, returnedCount: 1, consumedCount: 1, totalCount: 1, hasMore: false,
    });
    for (const example of [contract.beginnerExample, contract.expertExample]) {
      expect(example.resultWindow.priorCount + example.resultWindow.returnedCount)
        .toBe(example.resultWindow.consumedCount);
      expect(example.resultWindow.hasMore)
        .toBe(example.resultWindow.consumedCount < example.resultWindow.totalCount);
      expect(Buffer.byteLength(JSON.stringify(example), 'utf8')).toBeLessThanOrEqual(UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.responseBytes);
      expect(example.responseWindow).toEqual({ unit: 'utf8_bytes', maximum: 32768, truncated: false });
    }
    expect(contract.expertExample.withheldEvidence).toEqual([
      { source: 'TBESH', field: 'Meaning', status: 'withheld_rights_boundary' },
      { source: 'UBS Hebrew dictionary', field: 'A#### lexical identities', status: 'withheld_public_v1_scope' },
    ]);
    const missingWithholding = structuredClone(contract.expertExample);
    missingWithholding.withheldEvidence.pop();
    expect(validate(missingWithholding)).toBe(false);
    const extraWithholding = structuredClone(contract.expertExample);
    extraWithholding.withheldEvidence.push({ source: 'other', field: 'other', status: 'other' });
    expect(validate(extraWithholding)).toBe(false);
    const noMeaning = structuredClone(contract.expertExample); delete noMeaning.meaning;
    expect(validate(noMeaning)).toBe(false);
    const noPlainLanguage = structuredClone(contract.expertExample); delete noPlainLanguage.plainLanguage;
    expect(validate(noPlainLanguage)).toBe(false);
    const noReason = structuredClone(contract.beginnerExample); delete noReason.reason;
    expect(validate(noReason)).toBe(false);
    const publicPadding = structuredClone(contract.expertExample); publicPadding.identity.publicStrongs = 'H0001';
    expect(validate(publicPadding)).toBe(false);
    const publicA = structuredClone(contract.expertExample); publicA.identity.sourceIdentity = 'A0001';
    expect(validate(publicA)).toBe(false);
    const missingContinuation = structuredClone(contract.beginnerExample); delete missingContinuation.resultWindow.continuation;
    expect(validate(missingContinuation)).toBe(false);
    const terminalContinuation = structuredClone(contract.expertExample);
    terminalContinuation.resultWindow.continuation = contract.beginnerExample.resultWindow.continuation;
    expect(validate(terminalContinuation)).toBe(false);
    const oversizedPlainLanguage = structuredClone(contract.expertExample);
    oversizedPlainLanguage.plainLanguage = 'x'.repeat(UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.plainLanguageCharacters + 1);
    expect(validate(oversizedPlainLanguage)).toBe(false);
    const tooManyCandidates = structuredClone(contract.beginnerExample);
    tooManyCandidates.candidates = Array.from(
      { length: UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.candidatesPerResponse + 1 },
      () => structuredClone(contract.beginnerExample.candidates[0]),
    );
    expect(validate(tooManyCandidates)).toBe(false);
    const oversizedDefinition = structuredClone(contract.expertExample);
    oversizedDefinition.meaning.definition = 'x'.repeat(UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.definitionCharacters + 1);
    expect(validate(oversizedDefinition)).toBe(false);
    const tooManyGlosses = structuredClone(contract.expertExample);
    tooManyGlosses.meaning.glosses = Array.from(
      { length: UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.glossesPerSense + 1 }, (_, index) => `gloss-${index}`,
    );
    expect(validate(tooManyGlosses)).toBe(false);
    const wrongSourcePair = structuredClone(contract.expertExample);
    wrongSourcePair.provenance.sources.reverse();
    expect(validate(wrongSourcePair)).toBe(false);
    for (const source of contract.expertExample.provenance.sources) {
      expect(source).toMatchObject({
        sourceVersion: '0.9.2', sourceUrl: expect.stringMatching(/^https:\/\//),
        sourceCommit: expect.stringMatching(/^[0-9a-f]{40}$/),
        sourceBlob: expect.stringMatching(/^[0-9a-f]{40}$/), sourceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        publisher: 'United Bible Societies', license: 'CC BY-SA 4.0',
        modificationDescription: expect.any(String),
      });
    }
    const missingSourceUrl = structuredClone(contract.expertExample);
    delete missingSourceUrl.provenance.sources[0].sourceUrl;
    expect(validate(missingSourceUrl)).toBe(false);
    const missingEvidenceIdentity = structuredClone(contract.expertExample);
    delete missingEvidenceIdentity.referenceEvidence.senseId;
    expect(validate(missingEvidenceIdentity)).toBe(false);
    expect(contract.expertExample.provenance.transformation.artifactIdentity).toMatch(/^[0-9a-f]{64}$/);
  });

  it('guards relational and serialized-byte invariants that JSON Schema cannot express', () => {
    const contract = JSON.parse(readFileSync(new URL('test/fixtures/ubs-semantics/structured-output-contract.draft.json', repo), 'utf8')) as any;
    const validate = new Ajv2020({ strict: true }).compile(contract.schema);
    const request = {
      publicStrongs: 'H1', normalizedReference: 'Synthetic 1:1',
      artifactIdentity: contract.beginnerExample.provenance.transformation.artifactIdentity,
      expectedAlignment: structuredClone(contract.expertExample.alignmentEvidence),
    };
    const guard = (output: unknown, expected: RegExp): void => {
      expect(validate(output), validate.errors?.map((error: any) => error.message).join('; ')).toBe(true);
      expect(() => serializeValidatedUbsSemanticDraftOutput(output, request)).toThrow(expected);
    };

    const wrongDerivedIdentity = structuredClone(contract.beginnerExample);
    wrongDerivedIdentity.identity.sourceIdentity = 'H0002';
    guard(wrongDerivedIdentity, /derived request identity/);

    const wrongTopReference = structuredClone(contract.beginnerExample);
    wrongTopReference.normalizedReference = 'Synthetic 1:2';
    guard(wrongTopReference, /normalized reference does not match/);

    const wrongProvenanceArtifact = structuredClone(contract.beginnerExample);
    wrongProvenanceArtifact.provenance.transformation.artifactIdentity = '8'.repeat(64);
    guard(wrongProvenanceArtifact, /provenance artifact/);

    for (const mutate of [
      (value: any) => { value.resultWindow.continuation.cursor = value.resultWindow.continuation.cursor.replace(/.$/, '0'); },
      (value: any) => { value.resultWindow.continuation.artifactIdentity = '8'.repeat(64); },
      (value: any) => { value.resultWindow.continuation.query.publicStrongs = 'H2'; },
      (value: any) => { value.resultWindow.continuation.query.sourceIdentity = 'H0002'; },
      (value: any) => { value.resultWindow.continuation.query.normalizedReference = 'Synthetic 1:2'; },
    ]) {
      const wrongContinuationBinding = structuredClone(contract.beginnerExample);
      mutate(wrongContinuationBinding);
      guard(wrongContinuationBinding, /continuation is not bound/);
    }

    const wrongArithmetic = structuredClone(contract.beginnerExample);
    wrongArithmetic.resultWindow.consumedCount = 2;
    guard(wrongArithmetic, /arithmetic/);

    const wrongHasMore = structuredClone(contract.beginnerExample);
    wrongHasMore.resultWindow.totalCount = 1;
    guard(wrongHasMore, /hasMore/);

    const missingContinuation = structuredClone(contract.beginnerExample);
    delete missingContinuation.resultWindow.continuation;
    expect(() => serializeValidatedUbsSemanticDraftOutput(missingContinuation, request))
      .toThrow(/continuation must be present if and only if/);

    const unexpectedContinuation = structuredClone(contract.expertExample);
    unexpectedContinuation.resultWindow.continuation = contract.beginnerExample.resultWindow.continuation;
    expect(() => serializeValidatedUbsSemanticDraftOutput(unexpectedContinuation, request))
      .toThrow(/continuation must be present if and only if/);

    const wrongCandidateCount = structuredClone(contract.beginnerExample);
    wrongCandidateCount.resultWindow.returnedCount = 2;
    wrongCandidateCount.resultWindow.consumedCount = 2;
    wrongCandidateCount.resultWindow.totalCount = 3;
    guard(wrongCandidateCount, /candidate count/);

    const wrongAlignedCount = structuredClone(contract.expertExample);
    wrongAlignedCount.resultWindow.priorCount = 1;
    wrongAlignedCount.resultWindow.consumedCount = 2;
    wrongAlignedCount.resultWindow.totalCount = 2;
    guard(wrongAlignedCount, /exactly one terminal item/);

    const wrongEvidenceReference = structuredClone(contract.expertExample);
    wrongEvidenceReference.referenceEvidence.normalizedReference = 'Synthetic 1:2';
    guard(wrongEvidenceReference, /reference evidence/);

    const unrelatedToken = structuredClone(contract.expertExample);
    unrelatedToken.alignmentEvidence.morphologyTokenIdentity = 'attacker-chosen-token';
    guard(unrelatedToken, /trusted alignment proof identity/);

    const unrelatedVerifier = structuredClone(contract.expertExample);
    unrelatedVerifier.alignmentEvidence.verifierVersion = 2;
    guard(unrelatedVerifier, /trusted alignment proof identity/);

    for (const mutate of [
      (value: any) => { value.alignmentEvidence.artifactIdentity = '8'.repeat(64); },
      (value: any) => { value.alignmentEvidence.artifactSources.dictionary.sourceSha256 = '9'.repeat(64); },
      (value: any) => { value.alignmentEvidence.normalizedReference = 'Synthetic 1:2'; },
      (value: any) => { value.alignmentEvidence.morphologyTokenCoordinates.position = 2; },
      (value: any) => { value.alignmentEvidence.morphologyTokenWitness.text = 'ARBITRARY TOKEN'; },
      (value: any) => { value.alignmentEvidence.entryId = 'other-entry'; },
    ]) {
      const staleOrCrossBoundProof = structuredClone(contract.expertExample);
      mutate(staleOrCrossBoundProof);
      guard(staleOrCrossBoundProof, /trusted alignment proof identity/);
    }

    const coordinateOnly = structuredClone(contract.expertExample);
    coordinateOnly.alignmentEvidence.status = 'coordinate_attested_unpromoted';
    delete coordinateOnly.alignmentEvidence.proofContract;
    expect(validate(coordinateOnly)).toBe(false);

    const swappedSource = structuredClone(contract.expertExample);
    swappedSource.referenceEvidence.sourceId = 'other-dictionary-source';
    guard(swappedSource, /trusted alignment proof identity/);

    const swappedEvidence = structuredClone(contract.expertExample);
    swappedEvidence.referenceEvidence.evidenceId = 'other-reference-evidence';
    guard(swappedEvidence, /trusted alignment proof identity/);

    const swappedSense = structuredClone(contract.expertExample);
    swappedSense.senseId = 'other-sense';
    swappedSense.referenceEvidence.senseId = 'other-sense';
    guard(swappedSense, /trusted alignment proof identity/);

    const noTrustedAlignment = { ...request, expectedAlignment: undefined };
    expect(() => serializeValidatedUbsSemanticDraftOutput(contract.expertExample, noTrustedAlignment))
      .toThrow(/requires a trusted expected alignment assertion/);

    for (const hostileReference of [
      'Synthetic\u0085 1:1',
      'Synthetic\u202e 1:1',
      'Synthetic\u200e 1:1',
      'Synthetic\u200b 1:1',
      'Synthetic\ud800 1:1',
      `Synthetic${String.fromCodePoint(0x10ffff)} 1:1`,
    ]) {
      expect(() => serializeValidatedUbsSemanticDraftOutput(
        contract.expertExample, { ...request, normalizedReference: hostileReference },
      )).toThrow(/forbidden control|forbidden Unicode noncharacter/);
    }

    const unavailableWithItem = {
      audience: 'beginner', status: 'unavailable', plainLanguage: 'No publishable evidence.',
      reason: 'no_publishable_semantic_evidence',
      resultWindow: { priorCount: 0, returnedCount: 1, consumedCount: 1, totalCount: 1, hasMore: false },
      responseWindow: { unit: 'utf8_bytes', maximum: 32768, truncated: false },
      withheldEvidence: structuredClone(contract.beginnerExample.withheldEvidence),
    };
    guard(unavailableWithItem, /empty terminal result window/);

    const oversizedButSchemaValid = structuredClone(contract.beginnerExample);
    oversizedButSchemaValid.candidates = Array.from({ length: 8 }, (_, candidateIndex) => ({
      senseId: `synthetic-sense-${candidateIndex}`,
      meaning: {
        definition: 'd'.repeat(UBS_SEMANTIC_DRAFT_OUTPUT_LIMITS.definitionCharacters),
        glosses: Array.from({ length: 16 }, (_, index) => `${String(index).padStart(2, '0')}${'g'.repeat(998)}`),
        domains: Array.from({ length: 16 }, (_, index) => ({
          domainId: `synthetic-domain-${candidateIndex}-${index}`,
          label: 'l'.repeat(1_000),
          description: 'x'.repeat(5_000),
        })),
      },
    }));
    Object.assign(oversizedButSchemaValid.resultWindow, {
      priorCount: 0, returnedCount: 8, consumedCount: 8, totalCount: 8, hasMore: false,
    });
    delete oversizedButSchemaValid.resultWindow.continuation;
    expect(validate(oversizedButSchemaValid), validate.errors?.map((error: any) => error.message).join('; ')).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(oversizedButSchemaValid), 'utf8')).toBeGreaterThan(1_048_576);
    expect(() => serializeValidatedUbsSemanticDraftOutput(oversizedButSchemaValid, request))
      .toThrow(/serialized UTF-8 bytes/);
  });

  it('redirects the former template to the completed, still runtime-inert notice', () => {
    const notice = readFileSync(new URL('docs/templates/UBS-SEMANTICS-NOTICE-TEMPLATE.md', repo), 'utf8');
    expect(notice).toContain('UBSHebrewDic-v0.9.2-en.JSON');
    expect(notice).toContain('UBSHebrewDicLexicalDomains-v0.9.2-en.JSON');
    expect(notice).not.toContain('UBSGreek');
    expect(notice).toContain('derived-material notice');
    expect(notice).not.toContain('source bytes are unapproved and not vendored');
    expect(notice).toContain('CC BY-SA 4.0');
  });
});
