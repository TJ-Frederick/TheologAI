/** Inactive Cloudflare D1 adapter for the transform-7 aggregate evidence seam. */
import {
  assembleUbsSemanticAggregatePage,
  buildUbsSemanticAggregateStatements,
} from '../shared/UbsSemanticEvidenceBundleRepository.js';
import type {
  IUbsSemanticEvidenceBundleRepository,
  UbsSemanticEvidenceBundleRepositoryPage,
  UbsSemanticEvidenceBundleRepositoryQuery,
} from '../../kernel/ubsSemanticEvidenceBundle.js';

export class D1UbsSemanticEvidenceBundleRepository implements IUbsSemanticEvidenceBundleRepository {
  constructor(private readonly db: D1Database) {}

  async getSemanticEvidenceBundle(
    query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>,
  ): Promise<UbsSemanticEvidenceBundleRepositoryPage> {
    const statements = buildUbsSemanticAggregateStatements(query);
    // Keep this exactly five statements, even for an empty page or continuation.
    const [metadata, candidates, domains, references, sources] = await Promise.all([
      this.db.prepare(statements.metadata.sql).bind(...statements.metadata.bindings).all<Record<string, unknown>>(),
      this.db.prepare(statements.candidates.sql).bind(...statements.candidates.bindings).all<Record<string, unknown>>(),
      this.db.prepare(statements.domains.sql).bind(...statements.domains.bindings).all<Record<string, unknown>>(),
      this.db.prepare(statements.references.sql).bind(...statements.references.bindings).all<Record<string, unknown>>(),
      this.db.prepare(statements.sources.sql).bind(...statements.sources.bindings).all<Record<string, unknown>>(),
    ]);
    return assembleUbsSemanticAggregatePage(query, {
      metadata: metadata.results,
      candidates: candidates.results,
      domains: domains.results,
      references: references.results,
      sources: sources.results,
    });
  }
}
