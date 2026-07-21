import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UbsSemanticEvidenceBundleRepository } from '../../../src/adapters/data/UbsSemanticEvidenceBundleRepository.js';
import { D1UbsSemanticEvidenceBundleRepository } from '../../../src/adapters/d1/D1UbsSemanticEvidenceBundleRepository.js';
import { buildUbsSemanticAggregateStatements } from '../../../src/adapters/shared/UbsSemanticEvidenceBundleRepository.js';
import {
  UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS,
  UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER,
  queryUbsSemanticEvidenceBundle,
  type UbsSemanticEvidenceBundleRepositoryQuery,
} from '../../../src/kernel/ubsSemanticEvidenceBundle.js';
import { D1_MAX_BOUND_PARAMETERS } from '../../../scripts/ubs-semantics/capacity.js';
import { D1_MAX_STATEMENT_BYTES } from '../../../scripts/d1-seed-utils.js';

const repo = new URL('../../../', import.meta.url);
const artifactIdentity = 'a'.repeat(64);
const dictionarySourceId = 'ubs-hebrew-dictionary-en-v0.9.2';
const domainsSourceId = 'ubs-hebrew-lexical-domains-en-v0.9.2';

function countedSqliteAsD1(db: Database.Database): { db: D1Database; prepareCount: () => number } {
  let prepared = 0;
  return {
    prepareCount: () => prepared,
    db: {
      prepare(sql: string) {
        prepared++;
        const statement = db.prepare(sql);
        const execute = (bindings: unknown[]) => ({
          async all<T>() {
            return { results: statement.all(...bindings) as T[], success: true, meta: {} };
          },
        });
        return {
          bind: (...bindings: unknown[]) => execute(bindings),
          ...execute([]),
        } as unknown as D1PreparedStatement;
      },
    } as D1Database,
  };
}

function query(after?: UbsSemanticEvidenceBundleRepositoryQuery['after']): UbsSemanticEvidenceBundleRepositoryQuery {
  return {
    artifactIdentity,
    sourceIdentity: 'H0001' as UbsSemanticEvidenceBundleRepositoryQuery['sourceIdentity'],
    normalizedReference: 'Genesis 1:1',
    limit: UBS_SEMANTIC_EVIDENCE_BUNDLE_LIMITS.candidatesPerPage,
    order: UBS_SEMANTIC_EVIDENCE_BUNDLE_ORDER,
    ...(after ? { after } : {}),
  };
}

describe('transform-7 UBS semantic aggregate repositories', () => {
  const db = new Database(':memory:');
  const node = new UbsSemanticEvidenceBundleRepository(db);
  let d1: D1UbsSemanticEvidenceBundleRepository;
  let d1PrepareCount: () => number;

  beforeAll(() => {
    db.pragma('foreign_keys = ON');
    db.exec(readFileSync(new URL('migrations/0004_ubs_hebrew_semantics.sql', repo), 'utf8'));
    db.prepare(`INSERT INTO ubs_semantic_artifacts VALUES (?, 'theologai-ubs-hebrew-semantic-compiled.v1', 1, 7, '{}', '{}', '{}')`)
      .run(artifactIdentity);
    const insertSource = db.prepare(`INSERT INTO ubs_semantic_sources (
      artifact_identity, source_id, source_role, schema_version, transform_version, title,
      artifact_name, artifact_version, language, source_url, source_commit, source_blob,
      source_sha256, license, license_url, publisher, modified, modification_description
    ) VALUES (?, ?, ?, 'ubs-semantics.v1', 7, ?, ?, '0.9.2', 'Hebrew', ?, ?, ?, ?,
      'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/',
      'United Bible Societies', 1, 'Pinned source was deterministically compiled.')`);
    insertSource.run(
      artifactIdentity, dictionarySourceId, 'dictionary', 'UBS Hebrew Dictionary',
      'UBSHebrewDic-v0.9.2-en.JSON', 'https://example.invalid/dictionary', '1'.repeat(40),
      '2'.repeat(40), '3'.repeat(64),
    );
    insertSource.run(
      artifactIdentity, domainsSourceId, 'lexical_domains', 'UBS Hebrew Dictionary Lexical Domains',
      'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON', 'https://example.invalid/domains', '4'.repeat(40),
      '5'.repeat(40), '6'.repeat(64),
    );
    const insertDomain = db.prepare(`INSERT INTO ubs_semantic_domains VALUES (?, ?, ?, ?, NULL, ?, NULL)`);
    for (let ordinal = 1; ordinal <= 17; ordinal++) {
      insertDomain.run(artifactIdentity, domainsSourceId, `domain-${String(ordinal).padStart(2, '0')}`, ordinal, `Domain ${ordinal}`);
    }
    db.prepare(`INSERT INTO ubs_semantic_entries VALUES (?, ?, 'entry-one', 'source-entry-one', 1, 'אָלֶף', '["noun"]')`)
      .run(artifactIdentity, dictionarySourceId);
    db.prepare(`INSERT INTO ubs_semantic_entry_identities VALUES (?, 'entry-one', 'H0001')`).run(artifactIdentity);
    const insertSense = db.prepare(`INSERT INTO ubs_semantic_senses VALUES (?, ?, ?, ?, 'entry-one', ?, 'published', ?, '[]', '["Synthetic gloss"]')`);
    const insertSenseDomain = db.prepare(`INSERT INTO ubs_semantic_sense_domains VALUES (?, ?, ?, ?)`);
    for (let ordinal = 1; ordinal <= 10; ordinal++) {
      const senseId = `sense-${String(ordinal).padStart(2, '0')}`;
      insertSense.run(artifactIdentity, dictionarySourceId, senseId, `source-${senseId}`, ordinal, `Synthetic definition ${ordinal}`);
      if (ordinal === 1) {
        for (let domainOrdinal = 1; domainOrdinal <= 17; domainOrdinal++) {
          insertSenseDomain.run(artifactIdentity, senseId, `domain-${String(domainOrdinal).padStart(2, '0')}`, domainOrdinal);
        }
      }
    }
    const insertEvidence = db.prepare(`INSERT INTO ubs_semantic_reference_evidence VALUES (?, ?, ?, ?, 'sense-01', ?, ?, '01001001000001', '', 1, 'GEN', 1, 1)`);
    const insertCoordinate = db.prepare(`INSERT INTO ubs_semantic_normalized_coordinates VALUES (?, ?, 1, 1, 'GEN', 1, 1, 'Genesis 1:1')`);
    for (let ordinal = 1; ordinal <= 17; ordinal++) {
      const evidenceId = `evidence-${String(ordinal).padStart(2, '0')}`;
      insertEvidence.run(ordinal, artifactIdentity, dictionarySourceId, evidenceId, ordinal, `Genesis 1:1 note ${ordinal}`);
      insertCoordinate.run(ordinal, ordinal);
    }
    const counted = countedSqliteAsD1(db);
    d1 = new D1UbsSemanticEvidenceBundleRepository(counted.db);
    d1PrepareCount = counted.prepareCount;
  });

  afterAll(() => db.close());

  it('returns candidate-first evidence with honest nested caps and continuation', async () => {
    const first = await queryUbsSemanticEvidenceBundle(node, {
      artifactIdentity, sourceIdentity: 'H0001' as any, normalizedReference: 'Genesis 1:1',
    });
    expect(first.coverage).toMatchObject({
      lexicalEntryTotal: 1, semanticSenseTotal: 10,
      candidateWindow: { priorCount: 0, returnedCount: 8, consumedCount: 8, totalCount: 10, hasMore: true },
      completeForReturnedWindow: false,
    });
    expect(first.coverage.incompleteReasons).toEqual(expect.arrayContaining(['candidate_window', 'domain_evidence', 'reference_evidence']));
    expect(first.candidates[0]).toMatchObject({
      domainTotal: 17, matchingReferenceTotal: 17,
    });
    expect(first.candidates[0]!.domains).toHaveLength(16);
    expect(first.candidates[0]!.matchingReferences).toHaveLength(16);
    const second = await queryUbsSemanticEvidenceBundle(node, {
      artifactIdentity, sourceIdentity: 'H0001' as any, normalizedReference: 'Genesis 1:1',
      page: { cursor: first.coverage.candidateWindow.nextCursor },
    });
    expect(second.coverage.candidateWindow).toMatchObject({
      priorCount: 8, returnedCount: 2, consumedCount: 10, totalCount: 10, hasMore: false,
    });
    expect([...first.candidates, ...second.candidates].map(candidate => candidate.sense.senseId))
      .toEqual(Array.from({ length: 10 }, (_, index) => `sense-${String(index + 1).padStart(2, '0')}`));
  });

  it('has Node/D1 parity and always executes exactly five D1 statements', async () => {
    const expected = await node.getSemanticEvidenceBundle(query());
    const before = d1PrepareCount();
    await expect(d1.getSemanticEvidenceBundle(query())).resolves.toEqual(expected);
    expect(d1PrepareCount() - before).toBe(5);
  });

  it('validates a continuation keyset against the current server result set', async () => {
    await expect(node.getSemanticEvidenceBundle(query({
      keyset: [dictionarySourceId, '1', 'entry-one', '1', 'sense-01'],
      priorShowing: 0,
    }))).rejects.toThrow('current server-validated boundary');
  });

  it('uses the lexical-identity candidate index in the aggregate candidate query plan', () => {
    const statement = buildUbsSemanticAggregateStatements(query()).candidates;
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...statement.bindings) as Array<{ detail: string }>;
    expect(plan.map(row => row.detail).join('\n')).toContain('idx_ubs_semantic_identity_candidate');
  });

  it('keeps every fixed aggregate statement below the D1 bind and SQL-size limits', () => {
    const statements = buildUbsSemanticAggregateStatements(query({
      keyset: [dictionarySourceId, '1', 'entry-one', '1', 'sense-01'],
      priorShowing: 1,
    }));
    expect(Object.keys(statements).sort()).toEqual([
      'candidates', 'domains', 'metadata', 'references', 'sources',
    ]);
    for (const statement of Object.values(statements)) {
      expect(statement.bindings.length).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS);
      expect(Buffer.byteLength(statement.sql, 'utf8')).toBeLessThanOrEqual(D1_MAX_STATEMENT_BYTES);
    }
  });
});
