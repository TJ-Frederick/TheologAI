import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import Database from 'better-sqlite3';

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
    expect(contract.statusValues).toEqual(['exact_context', 'lexical_candidates', 'unavailable']);
    expect(contract.invariants.join(' ')).toContain('TBESH Meaning is withheld');
    expect(contract.beginnerExample.status).toBe('lexical_candidates');
    expect(contract.expertExample.status).toBe('exact_context');
    expect(contract.expertExample.alignmentEvidence.status).toBe('verified_token_alignment');
    expect(contract.expertExample.referenceEvidence).toMatchObject({
      sourceId: 'synthetic-hebrew-dictionary',
      senseId: contract.expertExample.senseId,
    });
    const validate = new Ajv2020({ strict: true }).compile(contract.schema);
    expect(validate(contract.beginnerExample), validate.errors?.map((error: any) => error.message).join('; ')).toBe(true);
    expect(validate(contract.expertExample), validate.errors?.map((error: any) => error.message).join('; ')).toBe(true);
    expect(contract.beginnerExample.reason).toBe('reference_alignment_unproven');
    expect(contract.expertExample.meaning.domains[0].label).toBeTruthy();
    expect(contract.expertExample.lexicalIdentities).toEqual(['H0001']);
    expect(JSON.stringify(contract.expertExample.lexicalIdentities)).not.toContain('A0001');
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

  it('marks both named future source artifacts as unapproved and not vendored', () => {
    const notice = readFileSync(new URL('docs/templates/UBS-SEMANTICS-NOTICE-TEMPLATE.md', repo), 'utf8');
    expect(notice).toContain('UBSHebrewDic-v0.9.2-en.JSON');
    expect(notice).toContain('UBSHebrewDicLexicalDomains-v0.9.2-en.JSON');
    expect(notice).not.toContain('UBSGreek');
    expect(notice).toContain('source bytes are unapproved and not vendored');
    expect(notice).toContain('CC BY-SA 4.0');
  });
});
