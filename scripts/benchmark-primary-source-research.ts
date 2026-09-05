import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import type { IHistoricalDocumentRepository } from '../src/kernel/repositories.js';
import { HistoricalDocumentRepository } from '../src/adapters/data/HistoricalDocumentRepository.js';
import { LocalPrimarySourceSearchProvider } from '../src/services/historical/LocalPrimarySourceSearchProvider.js';
import type {
  PrimarySourceSearchMatch,
  PrimarySourceSelection,
} from '../src/services/historical/primarySourceTypes.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const PRIMARY_SOURCE_BENCHMARK_FIXTURE = resolve(
  ROOT,
  'test/fixtures/primary-source-research-quality-benchmark.json',
);

const CASE_KINDS = ['exact_term', 'paraphrase', 'ambiguous', 'catalog_miss', 'no_results'] as const;
type CaseKind = typeof CASE_KINDS[number];
const EXPECTED_STATUSES = ['ok', 'no_results', 'catalog_miss'] as const;
type ExpectedStatus = typeof EXPECTED_STATUSES[number];

export interface BenchmarkAttempt {
  text: string;
  match: PrimarySourceSearchMatch;
  selection: PrimarySourceSelection;
  limit: number;
  expectedStatus: ExpectedStatus;
  work?: string;
  author?: string;
  startYear?: number;
  endYear?: number;
}

export interface BenchmarkAnchor {
  documentId: string;
  sectionKey: string;
  sourceOrdinal: number;
}

export interface PrimarySourceBenchmarkCase {
  id: string;
  kind: CaseKind;
  humanQuestion: string;
  attempts: BenchmarkAttempt[];
  regressionAnchors: BenchmarkAnchor[];
  minimumDistinctWorks?: number;
}

export interface PrimarySourceBenchmarkFixture {
  schemaVersion: 1;
  fixtureRole: string;
  limits: {
    minimumCases: number;
    maximumCases: number;
    maximumAttemptsPerCase: number;
    maximumResultsPerAttempt: number;
  };
  cases: PrimarySourceBenchmarkCase[];
  limitations: string[];
}

export interface PrimarySourceBenchmarkReport {
  schemaVersion: 1;
  status: 'pass' | 'fail';
  database: { documentCount: number; sectionCount: number };
  fixtureRole: string;
  metrics: {
    cases: number;
    attempts: number;
    regressionAnchors: number;
    retrievedAnchors: number;
    exactLocatorReads: number;
    ambiguousCases: number;
    catalogMissCases: number;
    noResultsCases: number;
  };
  caseKinds: Record<CaseKind, number>;
  failures: string[];
  limitations: string[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}

function optionalInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer`);
  return Number(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} keys must be exactly ${expected.join(', ')}`);
  }
}

export function validatePrimarySourceBenchmarkFixture(value: unknown): PrimarySourceBenchmarkFixture {
  const root = record(value, 'benchmark fixture');
  exactKeys(root, ['schemaVersion', 'fixtureRole', 'limits', 'cases', 'limitations'], 'benchmark fixture');
  if (root.schemaVersion !== 1) throw new Error('benchmark fixture schemaVersion must be 1');
  const fixtureRole = nonEmptyString(root.fixtureRole, 'benchmark fixtureRole');
  if (!fixtureRole.includes('not human-reviewed scholarly relevance judgments')) {
    throw new Error('benchmark fixtureRole must disclaim scholarly relevance judgment');
  }

  const limitsValue = record(root.limits, 'benchmark limits');
  exactKeys(limitsValue, ['minimumCases', 'maximumCases', 'maximumAttemptsPerCase', 'maximumResultsPerAttempt'], 'benchmark limits');
  const limits = {
    minimumCases: positiveInteger(limitsValue.minimumCases, 'minimumCases'),
    maximumCases: positiveInteger(limitsValue.maximumCases, 'maximumCases'),
    maximumAttemptsPerCase: positiveInteger(limitsValue.maximumAttemptsPerCase, 'maximumAttemptsPerCase'),
    maximumResultsPerAttempt: positiveInteger(limitsValue.maximumResultsPerAttempt, 'maximumResultsPerAttempt'),
  };
  if (limits.minimumCases !== 30 || limits.maximumCases !== 50) {
    throw new Error('benchmark case-count policy must remain 30..50');
  }
  if (limits.maximumAttemptsPerCase > 2 || limits.maximumResultsPerAttempt > 5) {
    throw new Error('benchmark query and result windows must remain bounded to 2 attempts and 5 results');
  }
  if (!Array.isArray(root.cases) || root.cases.length < limits.minimumCases || root.cases.length > limits.maximumCases) {
    throw new Error(`benchmark must contain ${limits.minimumCases}..${limits.maximumCases} cases`);
  }

  const ids = new Set<string>();
  const cases = root.cases.map((candidate, caseIndex): PrimarySourceBenchmarkCase => {
    const item = record(candidate, `case ${caseIndex}`);
    const optional = item.minimumDistinctWorks === undefined ? [] : ['minimumDistinctWorks'];
    exactKeys(item, ['id', 'kind', 'humanQuestion', 'attempts', 'regressionAnchors', ...optional], `case ${caseIndex}`);
    const id = nonEmptyString(item.id, `case ${caseIndex} id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) throw new Error(`case ${caseIndex} id is invalid or duplicated`);
    ids.add(id);
    if (!CASE_KINDS.includes(item.kind as CaseKind)) throw new Error(`case ${id} kind is invalid`);
    const kind = item.kind as CaseKind;
    const humanQuestion = nonEmptyString(item.humanQuestion, `case ${id} humanQuestion`);
    if (!Array.isArray(item.attempts) || item.attempts.length < 1 || item.attempts.length > limits.maximumAttemptsPerCase) {
      throw new Error(`case ${id} attempts must contain 1..${limits.maximumAttemptsPerCase} queries`);
    }
    const attempts = item.attempts.map((candidateAttempt, attemptIndex): BenchmarkAttempt => {
      const attempt = record(candidateAttempt, `case ${id} attempt ${attemptIndex}`);
      const optionalKeys = ['work', 'author', 'startYear', 'endYear'].filter(key => attempt[key] !== undefined);
      exactKeys(attempt, ['text', 'match', 'selection', 'limit', 'expectedStatus', ...optionalKeys], `case ${id} attempt ${attemptIndex}`);
      const text = nonEmptyString(attempt.text, `case ${id} attempt ${attemptIndex} text`);
      if (Array.from(text).length > 160) throw new Error(`case ${id} query text exceeds 160 characters`);
      if (attempt.match !== 'all_terms' && attempt.match !== 'phrase') throw new Error(`case ${id} match is invalid`);
      if (attempt.selection !== 'relevance' && attempt.selection !== 'work_diversity') throw new Error(`case ${id} selection is invalid`);
      const limit = positiveInteger(attempt.limit, `case ${id} limit`);
      if (limit > limits.maximumResultsPerAttempt) throw new Error(`case ${id} limit exceeds benchmark policy`);
      if (!EXPECTED_STATUSES.includes(attempt.expectedStatus as ExpectedStatus)) throw new Error(`case ${id} expectedStatus is invalid`);
      return {
        text,
        match: attempt.match,
        selection: attempt.selection,
        limit,
        expectedStatus: attempt.expectedStatus as ExpectedStatus,
        ...(attempt.work === undefined ? {} : { work: nonEmptyString(attempt.work, `case ${id} work`) }),
        ...(attempt.author === undefined ? {} : { author: nonEmptyString(attempt.author, `case ${id} author`) }),
        ...(optionalInteger(attempt.startYear, `case ${id} startYear`) === undefined ? {} : { startYear: Number(attempt.startYear) }),
        ...(optionalInteger(attempt.endYear, `case ${id} endYear`) === undefined ? {} : { endYear: Number(attempt.endYear) }),
      };
    });
    if (!Array.isArray(item.regressionAnchors)) throw new Error(`case ${id} regressionAnchors must be an array`);
    const regressionAnchors = item.regressionAnchors.map((candidateAnchor, anchorIndex): BenchmarkAnchor => {
      const anchor = record(candidateAnchor, `case ${id} anchor ${anchorIndex}`);
      exactKeys(anchor, ['documentId', 'sectionKey', 'sourceOrdinal'], `case ${id} anchor ${anchorIndex}`);
      return {
        documentId: nonEmptyString(anchor.documentId, `case ${id} anchor documentId`),
        sectionKey: nonEmptyString(anchor.sectionKey, `case ${id} anchor sectionKey`),
        sourceOrdinal: positiveInteger(anchor.sourceOrdinal, `case ${id} anchor sourceOrdinal`),
      };
    });
    const positive = kind === 'exact_term' || kind === 'paraphrase' || kind === 'ambiguous';
    if (positive !== (regressionAnchors.length > 0)) throw new Error(`case ${id} anchor policy does not match its kind`);
    if (kind === 'paraphrase') {
      const finalTerms = attempts.at(-1)!.text.trim().split(/\s+/u);
      if (finalTerms.length > 4) throw new Error(`case ${id} final reformulation must contain at most four terms`);
    }
    const minimumDistinctWorks = item.minimumDistinctWorks === undefined
      ? undefined
      : positiveInteger(item.minimumDistinctWorks, `case ${id} minimumDistinctWorks`);
    if ((kind === 'ambiguous') !== (minimumDistinctWorks !== undefined)) {
      throw new Error(`case ${id} ambiguity must be represented by an explicit distinct-work floor`);
    }
    return { id, kind, humanQuestion, attempts, regressionAnchors, ...(minimumDistinctWorks ? { minimumDistinctWorks } : {}) };
  });

  const kindCounts = Object.fromEntries(CASE_KINDS.map(kind => [kind, cases.filter(item => item.kind === kind).length])) as Record<CaseKind, number>;
  for (const [kind, minimum] of Object.entries({ exact_term: 10, paraphrase: 8, ambiguous: 4, catalog_miss: 2, no_results: 3 }) as Array<[CaseKind, number]>) {
    if (kindCounts[kind] < minimum) throw new Error(`benchmark needs at least ${minimum} ${kind} cases`);
  }
  if (!Array.isArray(root.limitations) || root.limitations.length < 3) throw new Error('benchmark limitations must contain at least three disclosures');
  const limitations = root.limitations.map((item, index) => nonEmptyString(item, `limitation ${index}`));
  return { schemaVersion: 1, fixtureRole, limits, cases, limitations };
}

export function loadPrimarySourceBenchmarkFixture(path = PRIMARY_SOURCE_BENCHMARK_FIXTURE): PrimarySourceBenchmarkFixture {
  return validatePrimarySourceBenchmarkFixture(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

export async function runPrimarySourceBenchmark(
  fixture: PrimarySourceBenchmarkFixture,
  repository: IHistoricalDocumentRepository,
  databaseShape?: { documentCount: number; sectionCount: number },
): Promise<PrimarySourceBenchmarkReport> {
  const provider = new LocalPrimarySourceSearchProvider(repository);
  const documents = await repository.listDocuments();
  const failures: string[] = [];
  let attempts = 0;
  let retrievedAnchors = 0;
  let exactLocatorReads = 0;

  for (const benchmarkCase of fixture.cases) {
    const observed = new Set<string>();
    let greatestDistinctWorkCount = 0;
    for (const attempt of benchmarkCase.attempts) {
      attempts += 1;
      let result;
      try {
        result = await provider.search(attempt);
      } catch (error) {
        failures.push(`${benchmarkCase.id}: query failed: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (result.status !== attempt.expectedStatus) {
        failures.push(`${benchmarkCase.id}: expected ${attempt.expectedStatus} for "${attempt.text}" but received ${result.status}`);
      }
      const localHits = result.hits.filter(hit => hit.provider === 'local');
      greatestDistinctWorkCount = Math.max(greatestDistinctWorkCount, new Set(localHits.map(hit => hit.locator.documentId)).size);
      for (const hit of localHits) observed.add(`${hit.locator.documentId}#${hit.locator.sectionKey}@${hit.locator.sourceOrdinal}`);
    }

    if (benchmarkCase.minimumDistinctWorks !== undefined && greatestDistinctWorkCount < benchmarkCase.minimumDistinctWorks) {
      failures.push(`${benchmarkCase.id}: expected at least ${benchmarkCase.minimumDistinctWorks} distinct works but observed ${greatestDistinctWorkCount}`);
    }
    for (const anchor of benchmarkCase.regressionAnchors) {
      const identity = `${anchor.documentId}#${anchor.sectionKey}@${anchor.sourceOrdinal}`;
      if (observed.has(identity)) retrievedAnchors += 1;
      else failures.push(`${benchmarkCase.id}: retrieval window omitted anchor ${identity}`);
      try {
        const section = await repository.resolveSection(anchor.documentId, anchor.sectionKey);
        if (!section || section.sourceOrdinal !== anchor.sourceOrdinal || section.section.content.trim().length === 0) {
          failures.push(`${benchmarkCase.id}: exact locator ${identity} resolved with mismatched identity or empty content`);
        } else {
          exactLocatorReads += 1;
        }
      } catch (error) {
        failures.push(`${benchmarkCase.id}: exact locator ${identity} did not resolve: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const caseKinds = Object.fromEntries(CASE_KINDS.map(kind => [kind, fixture.cases.filter(item => item.kind === kind).length])) as Record<CaseKind, number>;
  const regressionAnchors = fixture.cases.reduce((sum, item) => sum + item.regressionAnchors.length, 0);
  return {
    schemaVersion: 1,
    status: failures.length === 0 ? 'pass' : 'fail',
    database: databaseShape ?? { documentCount: documents.length, sectionCount: 0 },
    fixtureRole: fixture.fixtureRole,
    metrics: {
      cases: fixture.cases.length,
      attempts,
      regressionAnchors,
      retrievedAnchors,
      exactLocatorReads,
      ambiguousCases: caseKinds.ambiguous,
      catalogMissCases: caseKinds.catalog_miss,
      noResultsCases: caseKinds.no_results,
    },
    caseKinds,
    failures,
    limitations: fixture.limitations,
  };
}

function databaseArgument(args: string[]): string {
  if (args.length === 0) {
    return resolve(process.env.THEOLOGAI_TEST_DATABASE_PATH ?? resolve(ROOT, 'data/theologai.db'));
  }
  if (args.length === 2 && args[0] === '--database') {
    const value = args[1];
    if (!value) throw new Error('Usage: benchmark-primary-source-research --database <path>');
    return resolve(value);
  }
  throw new Error('Usage: benchmark-primary-source-research --database <path>');
}

export async function runPrimarySourceBenchmarkCli(args = process.argv.slice(2)): Promise<void> {
  const databasePath = databaseArgument(args);
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const documentCount = (database.prepare('SELECT COUNT(*) AS count FROM documents').get() as { count: number }).count;
    const sectionCount = (database.prepare('SELECT COUNT(*) AS count FROM document_sections').get() as { count: number }).count;
    const report = await runPrimarySourceBenchmark(
      loadPrimarySourceBenchmarkFixture(),
      new HistoricalDocumentRepository(database),
      { documentCount, sectionCount },
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status !== 'pass') process.exitCode = 1;
  } finally {
    database.close();
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) {
  runPrimarySourceBenchmarkCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
