/** Inactive local SQLite adapter for the transform-7 aggregate evidence seam. */
import type Database from 'better-sqlite3';
import { getDatabase } from '../shared/Database.js';
import {
  assembleUbsSemanticAggregatePage,
  buildUbsSemanticAggregateStatements,
} from '../shared/UbsSemanticEvidenceBundleRepository.js';
import type {
  IUbsSemanticEvidenceBundleRepository,
  UbsSemanticEvidenceBundleRepositoryPage,
  UbsSemanticEvidenceBundleRepositoryQuery,
} from '../../kernel/ubsSemanticEvidenceBundle.js';

export class UbsSemanticEvidenceBundleRepository implements IUbsSemanticEvidenceBundleRepository {
  private readonly db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
  }

  async getSemanticEvidenceBundle(
    query: Readonly<UbsSemanticEvidenceBundleRepositoryQuery>,
  ): Promise<UbsSemanticEvidenceBundleRepositoryPage> {
    const statements = buildUbsSemanticAggregateStatements(query);
    // Fixed five-statement assembly; no candidate-dependent N+1 queries.
    const metadata = this.db.prepare(statements.metadata.sql).all(...statements.metadata.bindings) as Record<string, unknown>[];
    const candidates = this.db.prepare(statements.candidates.sql).all(...statements.candidates.bindings) as Record<string, unknown>[];
    const domains = this.db.prepare(statements.domains.sql).all(...statements.domains.bindings) as Record<string, unknown>[];
    const references = this.db.prepare(statements.references.sql).all(...statements.references.bindings) as Record<string, unknown>[];
    const sources = this.db.prepare(statements.sources.sql).all(...statements.sources.bindings) as Record<string, unknown>[];
    return assembleUbsSemanticAggregatePage(query, { metadata, candidates, domains, references, sources });
  }
}
