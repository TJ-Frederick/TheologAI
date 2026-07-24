/**
 * Storage-neutral assembly for the bounded transform-7 aggregate repository.
 *
 * The adapter makes exactly five bounded statements per request.  Each nested
 * collection is selected from the same keyset window, so query count never
 * grows with returned candidates and a caller cursor is revalidated by the
 * database rather than trusted from its encoded payload.
 */
import type {
  IUbsSemanticEvidenceBundleRepository,
  UbsSemanticEvidenceBundleCandidateRow,
  UbsSemanticEvidenceBundleRepositoryPage,
  UbsSemanticEvidenceBundleRepositoryQuery,
} from '../../kernel/ubsSemanticEvidenceBundle.js';
import type {
  UbsSemanticDomain,
  UbsSemanticReferenceEvidence,
  UbsSemanticSense,
  UbsSemanticSource,
} from '../../kernel/ubsSemanticDomain.js';

export const UBS_SEMANTIC_AGGREGATE_QUERY_COUNT = 5;
export const UBS_SEMANTIC_AGGREGATE_SOURCE_IDS = Object.freeze({
  dictionary: 'ubs-hebrew-dictionary-en-v0.9.2',
  lexicalDomains: 'ubs-hebrew-lexical-domains-en-v0.9.2',
} as const);

export interface UbsSemanticAggregateStatements {
  readonly metadata: SqlStatement;
  readonly candidates: SqlStatement;
  readonly domains: SqlStatement;
  readonly references: SqlStatement;
  readonly sources: SqlStatement;
}

export interface SqlStatement {
  readonly sql: string;
  readonly bindings: readonly (string | number)[];
}

export interface UbsSemanticAggregateStatementResults {
  readonly metadata: readonly Record<string, unknown>[];
  readonly candidates: readonly Record<string, unknown>[];
  readonly domains: readonly Record<string, unknown>[];
  readonly references: readonly Record<string, unknown>[];
  readonly sources: readonly Record<string, unknown>[];
}

export type UbsSemanticAggregateRepository = IUbsSemanticEvidenceBundleRepository;

export function buildUbsSemanticAggregateStatements(
  query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>,
): UbsSemanticAggregateStatements {
  const base = candidateBaseSql();
  const baseBindings = [query.artifactIdentity, query.sourceIdentity];
  const after = afterPredicate(query);
  const window = candidateWindowSql(base, after.sql);
  const windowBindings = [...baseBindings, ...after.bindings, query.limit];
  const exactBoundary = query.after
    ? `EXISTS (SELECT 1 FROM candidate_base WHERE ${keysetEquality('candidate_base')})`
    : '1';
  const priorShowing = query.after
    ? `(SELECT COUNT(*) FROM candidate_base WHERE ${keysetBeforeOrEqual('candidate_base')})`
    : '0';
  const metadataBindings = query.after
    ? [...baseBindings, query.artifactIdentity, ...after.keysetBindings!, ...expandKeyset(after.keysetBindings!)]
    : [...baseBindings, query.artifactIdentity];
  return {
    metadata: {
      sql: `WITH ${base}
        SELECT
          EXISTS(SELECT 1 FROM ubs_semantic_artifacts WHERE artifact_identity = ?) AS artifact_available,
          (SELECT COUNT(DISTINCT entry_id) FROM candidate_base) AS lexical_entry_total,
          (SELECT COUNT(*) FROM candidate_base) AS semantic_sense_total,
          ${exactBoundary} AS boundary_valid,
          ${priorShowing} AS prior_showing`,
      bindings: metadataBindings,
    },
    candidates: {
      sql: `WITH ${window}
        SELECT c.source_id, c.entry_id, c.entry_source_ordinal, c.lemma, c.part_of_speech_json,
          c.lexical_identities_json, c.sense_id, c.sense_source_ordinal, c.definition_status,
          c.definition, c.definition_exclusion_reasons_json, c.glosses_json,
          (SELECT COUNT(*) FROM ubs_semantic_sense_domains sd
             WHERE sd.artifact_identity = c.artifact_identity AND sd.sense_id = c.sense_id) AS domain_total,
          (SELECT COUNT(DISTINCT r.evidence_key)
             FROM ubs_semantic_reference_evidence r
             JOIN ubs_semantic_normalized_coordinates nc ON nc.evidence_key = r.evidence_key
            WHERE r.artifact_identity = c.artifact_identity AND r.sense_id = c.sense_id
              AND nc.normalized_reference = ?) AS matching_reference_total
        FROM candidate_window c
        ORDER BY c.source_id, c.entry_source_ordinal, c.entry_id, c.sense_source_ordinal, c.sense_id`,
      bindings: [...windowBindings, query.normalizedReference],
    },
    domains: {
      sql: `WITH ${window}, ranked_domains AS (
          SELECT c.sense_id, d.source_id, d.domain_id, d.source_ordinal, d.parent_domain_id, d.label, d.description,
            ROW_NUMBER() OVER (PARTITION BY c.sense_id ORDER BY sd.domain_ordinal, d.domain_id) AS domain_rank
          FROM candidate_window c
          JOIN ubs_semantic_sense_domains sd
            ON sd.artifact_identity = c.artifact_identity AND sd.sense_id = c.sense_id
          JOIN ubs_semantic_domains d
            ON d.artifact_identity = sd.artifact_identity AND d.domain_id = sd.domain_id
        ) SELECT * FROM ranked_domains WHERE domain_rank <= 16
          ORDER BY sense_id, domain_rank`,
      bindings: windowBindings,
    },
    references: {
      sql: `WITH ${window}, matched_evidence AS (
          SELECT c.sense_id, r.source_id, r.evidence_id, r.source_ordinal, r.source_reference,
            ROW_NUMBER() OVER (PARTITION BY c.sense_id ORDER BY r.source_ordinal, r.evidence_id) AS evidence_rank
          FROM candidate_window c
          JOIN ubs_semantic_reference_evidence r
            ON r.artifact_identity = c.artifact_identity AND r.sense_id = c.sense_id
          JOIN ubs_semantic_normalized_coordinates nc
            ON nc.evidence_key = r.evidence_key
          WHERE nc.normalized_reference = ?
          GROUP BY c.sense_id, r.evidence_key
        ) SELECT * FROM matched_evidence WHERE evidence_rank <= 16
          ORDER BY sense_id, evidence_rank`,
      bindings: [...windowBindings, query.normalizedReference],
    },
    sources: {
      sql: `SELECT source_id, source_role, schema_version, transform_version, title, artifact_name,
          artifact_version, language, publisher, license, license_url, source_url, source_commit,
          source_blob, source_sha256, modified, modification_description
        FROM ubs_semantic_sources WHERE artifact_identity = ?
        ORDER BY CASE source_role WHEN 'dictionary' THEN 1 WHEN 'lexical_domains' THEN 2 ELSE 3 END, source_id`,
      bindings: [query.artifactIdentity],
    },
  };
}

/** Convert five statement result sets to the strict kernel repository page. */
export function assembleUbsSemanticAggregatePage(
  query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>,
  results: UbsSemanticAggregateStatementResults,
): UbsSemanticEvidenceBundleRepositoryPage {
  if (results.metadata.length !== 1) throw new Error('UBS semantic aggregate metadata query must return exactly one row');
  const metadata = results.metadata[0]!;
  if (number(metadata.artifact_available, 'artifact availability') !== 1) {
    throw new Error('UBS semantic aggregate artifact is unavailable');
  }
  const lexicalEntryTotal = nonNegative(number(metadata.lexical_entry_total, 'lexical entry total'), 'lexical entry total');
  const semanticSenseTotal = nonNegative(number(metadata.semantic_sense_total, 'semantic sense total'), 'semantic sense total');
  const priorShowing = nonNegative(number(metadata.prior_showing, 'authoritative prior showing'), 'authoritative prior showing');
  if (query.after && (number(metadata.boundary_valid, 'cursor boundary validity') !== 1
    || priorShowing !== query.after.priorShowing)) {
    throw new Error('UBS semantic aggregate cursor is not a current server-validated boundary');
  }
  if (!query.after && (number(metadata.boundary_valid, 'first-page boundary validity') !== 1 || priorShowing !== 0)) {
    throw new Error('UBS semantic aggregate first page has an invalid boundary');
  }
  const sources = results.sources.map(row => mapSource(row, query.artifactIdentity));
  if (sources.length !== 2 || sources[0]?.sourceId !== UBS_SEMANTIC_AGGREGATE_SOURCE_IDS.dictionary
    || sources[1]?.sourceId !== UBS_SEMANTIC_AGGREGATE_SOURCE_IDS.lexicalDomains) {
    throw new Error('UBS semantic aggregate source provenance is incomplete');
  }
  const domainsBySense = group(results.domains.map(mapDomainRow));
  const referencesBySense = group(results.references.map(mapReferenceRow));
  const items = results.candidates.map(row => mapCandidate(
    row, domainsBySense.get(text(row.sense_id, 'candidate sense ID')) ?? [],
    referencesBySense.get(text(row.sense_id, 'candidate sense ID')) ?? [], query.normalizedReference,
  ));
  if (items.length > query.limit || items.length > 8 || priorShowing + items.length > semanticSenseTotal) {
    throw new Error('UBS semantic aggregate candidate window exceeds its authoritative bounds');
  }
  return {
    items,
    lexicalEntryTotal,
    semanticSenseTotal,
    boundary: {
      artifactIdentity: query.artifactIdentity,
      sourceIdentity: query.sourceIdentity,
      normalizedReference: query.normalizedReference,
      order: query.order,
      priorShowing,
      ...(query.after ? { after: { keyset: [...query.after.keyset] as [string, string, string, string, string] } } : {}),
    },
    sources,
  };
}

function candidateBaseSql(): string {
  return `candidate_base AS (
    SELECT e.artifact_identity, e.source_id, e.entry_id, e.source_ordinal AS entry_source_ordinal,
      e.lemma, e.part_of_speech_json,
      (SELECT json_group_array(lexical_identity) FROM (
        SELECT lexical_identity FROM ubs_semantic_entry_identities ii
         WHERE ii.artifact_identity = e.artifact_identity AND ii.entry_id = e.entry_id
         ORDER BY lexical_identity
      )) AS lexical_identities_json,
      s.sense_id, s.source_ordinal AS sense_source_ordinal, s.definition_status, s.definition,
      s.definition_exclusion_reasons_json, s.glosses_json
    FROM ubs_semantic_entry_identities i INDEXED BY idx_ubs_semantic_identity_candidate
    JOIN ubs_semantic_entries e ON e.artifact_identity = i.artifact_identity AND e.entry_id = i.entry_id
    JOIN ubs_semantic_senses s ON s.artifact_identity = e.artifact_identity AND s.entry_id = e.entry_id
    WHERE i.artifact_identity = ? AND i.lexical_identity = ?
  )`;
}

function candidateWindowSql(base: string, predicate: string): string {
  return `${base}, candidate_window AS (
    SELECT * FROM candidate_base WHERE ${predicate}
    ORDER BY source_id, entry_source_ordinal, entry_id, sense_source_ordinal, sense_id
    LIMIT ?
  )`;
}

function afterPredicate(query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>): {
  sql: string;
  bindings: readonly (string | number)[];
  keysetBindings?: readonly (string | number)[];
} {
  if (!query.after) return { sql: '1', bindings: [] };
  const [sourceId, entryOrdinal, entryId, senseOrdinal, senseId] = query.after.keyset;
  const ordinals = [Number(entryOrdinal), Number(senseOrdinal)];
  if (!ordinals.every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('UBS semantic aggregate cursor keyset has invalid ordinal components');
  }
  const keysetBindings: readonly (string | number)[] = [sourceId, ordinals[0]!, entryId, ordinals[1]!, senseId];
  return { sql: keysetAfter('candidate_base'), bindings: expandKeyset(keysetBindings), keysetBindings };
}

function keysetAfter(alias: string): string {
  return `(${alias}.source_id > ? OR (${alias}.source_id = ? AND (${alias}.entry_source_ordinal > ? OR
    (${alias}.entry_source_ordinal = ? AND (${alias}.entry_id > ? OR (${alias}.entry_id = ? AND
      (${alias}.sense_source_ordinal > ? OR (${alias}.sense_source_ordinal = ? AND ${alias}.sense_id > ?))))))))`;
}

function keysetEquality(alias: string): string {
  return `${alias}.source_id = ? AND ${alias}.entry_source_ordinal = ? AND ${alias}.entry_id = ?
    AND ${alias}.sense_source_ordinal = ? AND ${alias}.sense_id = ?`;
}

function keysetBeforeOrEqual(alias: string): string {
  return `(${alias}.source_id < ? OR (${alias}.source_id = ? AND (${alias}.entry_source_ordinal < ? OR
    (${alias}.entry_source_ordinal = ? AND (${alias}.entry_id < ? OR (${alias}.entry_id = ? AND
      (${alias}.sense_source_ordinal < ? OR (${alias}.sense_source_ordinal = ? AND ${alias}.sense_id <= ?))))))))`;
}

function expandKeyset([sourceId, entryOrdinal, entryId, senseOrdinal, senseId]: readonly (string | number)[]): readonly (string | number)[] {
  return [sourceId, sourceId, entryOrdinal, entryOrdinal, entryId, entryId, senseOrdinal, senseOrdinal, senseId];
}

function group<T extends { senseId: string }>(values: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) grouped.set(value.senseId, [...(grouped.get(value.senseId) ?? []), value]);
  return grouped;
}

function mapCandidate(
  row: Record<string, unknown>, domains: UbsSemanticDomain[], references: UbsSemanticReferenceEvidence[], normalizedReference: string,
): UbsSemanticEvidenceBundleCandidateRow {
  const sourceId = text(row.source_id, 'candidate source ID');
  const entryId = text(row.entry_id, 'candidate entry ID');
  const senseId = text(row.sense_id, 'candidate sense ID');
  const domainTotal = nonNegative(number(row.domain_total, 'candidate domain total'), 'candidate domain total');
  const matchingReferenceTotal = nonNegative(number(row.matching_reference_total, 'candidate reference total'), 'candidate reference total');
  if (domains.length > 16 || references.length > 16 || domains.length > domainTotal || references.length > matchingReferenceTotal) {
    throw new Error('UBS semantic aggregate nested window exceeds its source-attested total');
  }
  return {
    entry: {
      sourceId, entryId, sourceOrdinal: positive(number(row.entry_source_ordinal, 'entry source ordinal'), 'entry source ordinal'),
      lemma: text(row.lemma, 'entry lemma'), partOfSpeech: stringArray(row.part_of_speech_json, 'entry parts of speech'),
      lexicalIdentities: stringArray(row.lexical_identities_json, 'entry lexical identities') as any,
    },
    sense: {
      sourceId, entryId, senseId, sourceOrdinal: positive(number(row.sense_source_ordinal, 'sense source ordinal'), 'sense source ordinal'),
      definitionStatus: definitionStatus(row.definition_status),
      ...(row.definition === null ? {} : { definition: text(row.definition, 'sense definition') }),
      definitionExclusionReasons: stringArray(row.definition_exclusion_reasons_json, 'sense exclusion reasons') as any,
      glosses: stringArray(row.glosses_json, 'sense glosses'),
      domainRefs: domains.map(domain => ({ sourceId: domain.sourceId, domainId: domain.domainId })),
    } as UbsSemanticSense,
    domains,
    domainTotal,
    matchingReferences: references.map(reference => ({ ...reference, normalizedReference })),
    matchingReferenceTotal,
  };
}

function mapDomainRow(row: Record<string, unknown>): UbsSemanticDomain & { senseId: string } {
  return {
    senseId: text(row.sense_id, 'domain sense ID'), sourceId: text(row.source_id, 'domain source ID'),
    domainId: text(row.domain_id, 'domain ID'), sourceOrdinal: positive(number(row.source_ordinal, 'domain ordinal'), 'domain ordinal'),
    ...(row.parent_domain_id === null ? {} : { parentDomainId: text(row.parent_domain_id, 'domain parent ID') }),
    label: text(row.label, 'domain label'),
    ...(row.description === null ? {} : { description: text(row.description, 'domain description') }),
  };
}

function mapReferenceRow(row: Record<string, unknown>): UbsSemanticReferenceEvidence & { senseId: string } {
  return {
    senseId: text(row.sense_id, 'reference sense ID'), sourceId: text(row.source_id, 'reference source ID'),
    evidenceId: text(row.evidence_id, 'reference evidence ID'), sourceOrdinal: positive(number(row.source_ordinal, 'reference ordinal'), 'reference ordinal'),
    sourceReference: text(row.source_reference, 'reference source locator'),
    normalizedReference: '', evidenceKind: 'source_attested_sense_reference',
  };
}

function mapSource(row: Record<string, unknown>, artifactIdentity: string): UbsSemanticSource {
  const role = sourceRole(row.source_role);
  const transformVersion = number(row.transform_version, 'source transform version');
  const modified = number(row.modified, 'source modified flag');
  if (transformVersion !== 7 || modified !== 1) throw new Error('UBS semantic source transform or modified flag is invalid');
  const artifactName = text(row.artifact_name, 'source artifact name');
  const publisher = text(row.publisher, 'source publisher');
  const license = text(row.license, 'source license');
  const licenseUrl = text(row.license_url, 'source license URL');
  if ((role === 'dictionary' && artifactName !== 'UBSHebrewDic-v0.9.2-en.JSON')
    || (role === 'lexical_domains' && artifactName !== 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON')
    || publisher !== 'United Bible Societies' || license !== 'CC BY-SA 4.0'
    || licenseUrl !== 'https://creativecommons.org/licenses/by-sa/4.0/') {
    throw new Error('UBS semantic source immutable provenance fields are invalid');
  }
  const common = {
    sourceId: text(row.source_id, 'source ID'),
    schemaVersion: text(row.schema_version, 'source schema version') as 'ubs-semantics.v1',
    artifactIdentity,
    title: text(row.title, 'source title'),
    artifactVersion: text(row.artifact_version, 'source artifact version') as '0.9.2',
    language: text(row.language, 'source language') as 'Hebrew', publisher: publisher as 'United Bible Societies',
    license: license as 'CC BY-SA 4.0', licenseUrl: licenseUrl as 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: text(row.source_url, 'source URL'), sourceCommit: text(row.source_commit, 'source commit'),
    sourceBlob: text(row.source_blob, 'source blob'), sourceSha256: text(row.source_sha256, 'source hash'),
    transformVersion: transformVersion as 7,
    modified: true as const,
    modificationNote: text(row.modification_description, 'source modification description'),
  };
  return role === 'dictionary'
    ? { ...common, sourceRole: 'dictionary', artifactName: 'UBSHebrewDic-v0.9.2-en.JSON' }
    : { ...common, sourceRole: 'lexical_domains', artifactName: 'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON' };
}

function sourceRole(value: unknown): 'dictionary' | 'lexical_domains' {
  const result = text(value, 'source role');
  if (result !== 'dictionary' && result !== 'lexical_domains') throw new Error('UBS semantic aggregate source role is invalid');
  return result;
}

function definitionStatus(value: unknown): UbsSemanticSense['definitionStatus'] {
  const result = text(value, 'sense definition status');
  if (result !== 'published' && result !== 'absent_in_source' && result !== 'excluded_unresolved_markup') {
    throw new Error('UBS semantic aggregate definition status is invalid');
  }
  return result;
}

function stringArray(value: unknown, label: string): string[] {
  if (typeof value !== 'string') throw new Error(`${label} JSON is absent`);
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error(`${label} JSON is malformed`);
  return parsed;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be text`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value;
}

function nonNegative(value: number, label: string): number {
  if (value < 0) throw new Error(`${label} must not be negative`);
  return value;
}

function positive(value: number, label: string): number {
  if (value < 1) throw new Error(`${label} must be positive`);
  return value;
}
