import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../../worker-env.js';
import {
  initialCcelCoordinatorState,
  resetCcelCoordinatorState,
  snapshotCcelCoordinatorState,
  transitionCcelAdmission,
  transitionCcelOutcome,
  type CcelAdmissionDecision,
  type CcelAdmissionToken,
  type CcelAttemptOutcome,
  type CcelCoordinatorPersistenceState,
  type CcelCoordinatorSnapshot,
  type CcelOutcomeRecord,
} from '../../services/historical/CcelUpstreamCoordinator.js';

interface CoordinatorRow extends Record<string, string | number | null> {
  state: string;
  next_allowed_at_ms: number;
  backoff_until_ms: number;
  last_observed_at_ms: number;
  attempt_sequence: number;
  last_outcome_sequence: number;
  operator_epoch: number;
  transient_failures: number;
  probe_attempt_id: number | null;
  probe_lease_until_ms: number;
}

/**
 * One named instance is the coordination atom for the single CCEL origin.
 *
 * This intentionally serializes a very low upstream allowance (one attempt per
 * ten seconds). It never performs a fetch and its SQLite schema cannot store
 * query, URL, HTML, snippets, client identity, or arbitrary metadata.
 */
export class CcelGlobalCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.transactionSync(() => this.migrate());
    });
  }

  admit(): CcelAdmissionDecision {
    return this.ctx.storage.transactionSync(() => {
      const previous = this.readState();
      const transition = transitionCcelAdmission(previous, Date.now());
      // The reservation is synchronously durable before RPC returns, so a
      // caller cannot begin its fetch without next_allowed_at_ms being stored.
      // Rejected calls do not amplify writes: their safety boundary is the
      // absolute reservation/backoff already stored by an earlier transition.
      if (transition.decision.kind === 'admitted'
          || transition.state.state !== previous.state) {
        this.writeState(transition.state);
      }
      return transition.decision;
    });
  }

  recordOutcome(token: CcelAdmissionToken, outcome: CcelAttemptOutcome): CcelOutcomeRecord {
    return this.ctx.storage.transactionSync(() => {
      const transition = transitionCcelOutcome(this.readState(), token, outcome, Date.now());
      this.writeState(transition.state);
      return transition.result;
    });
  }

  snapshot(): CcelCoordinatorSnapshot {
    return this.ctx.storage.transactionSync(() => snapshotCcelCoordinatorState(this.readState()));
  }

  /** Internal-only operator pathway; no public HTTP or MCP route calls it. */
  resetAfterOperatorReview(): CcelCoordinatorSnapshot {
    return this.ctx.storage.transactionSync(() => {
      const state = resetCcelCoordinatorState(this.readState(), Date.now());
      this.writeState(state);
      return snapshotCcelCoordinatorState(state);
    });
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ccel_coordinator_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        state TEXT NOT NULL CHECK (state IN (
          'closed', 'transient_backoff', 'rate_limited',
          'latched_policy', 'latched_interface'
        )),
        next_allowed_at_ms INTEGER NOT NULL CHECK (next_allowed_at_ms >= 0),
        backoff_until_ms INTEGER NOT NULL CHECK (backoff_until_ms >= 0),
        last_observed_at_ms INTEGER NOT NULL CHECK (last_observed_at_ms >= 0),
        attempt_sequence INTEGER NOT NULL CHECK (attempt_sequence >= 0),
        last_outcome_sequence INTEGER NOT NULL CHECK (last_outcome_sequence >= 0),
        operator_epoch INTEGER NOT NULL CHECK (operator_epoch >= 0),
        transient_failures INTEGER NOT NULL CHECK (transient_failures >= 0),
        probe_attempt_id INTEGER,
        probe_lease_until_ms INTEGER NOT NULL CHECK (probe_lease_until_ms >= 0)
      );
    `);
    const migration = this.ctx.storage.sql
      .exec<{ version: number }>(
        'SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations',
      )
      .one();
    if (migration.version < 1) {
      const initial = initialCcelCoordinatorState();
      this.ctx.storage.sql.exec(
        `INSERT INTO ccel_coordinator_state (
          singleton, state, next_allowed_at_ms, backoff_until_ms,
          last_observed_at_ms, attempt_sequence, last_outcome_sequence,
          operator_epoch, transient_failures, probe_attempt_id,
          probe_lease_until_ms
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        initial.state,
        initial.nextAllowedAtMs,
        initial.backoffUntilMs,
        initial.lastObservedAtMs,
        initial.attemptSequence,
        initial.lastOutcomeSequence,
        initial.operatorEpoch,
        initial.transientFailures,
        initial.probeAttemptId,
        initial.probeLeaseUntilMs,
      );
      this.ctx.storage.sql.exec(
        'INSERT INTO _sql_schema_migrations (id, applied_at_ms) VALUES (1, ?)',
        Date.now(),
      );
    }
  }

  private readState(): CcelCoordinatorPersistenceState {
    const row = this.ctx.storage.sql.exec<CoordinatorRow>(`
      SELECT state, next_allowed_at_ms, backoff_until_ms,
        last_observed_at_ms, attempt_sequence, last_outcome_sequence,
        operator_epoch, transient_failures, probe_attempt_id,
        probe_lease_until_ms
      FROM ccel_coordinator_state
      WHERE singleton = 1
    `).one();
    return {
      state: row.state as CcelCoordinatorPersistenceState['state'],
      nextAllowedAtMs: row.next_allowed_at_ms,
      backoffUntilMs: row.backoff_until_ms,
      lastObservedAtMs: row.last_observed_at_ms,
      attemptSequence: row.attempt_sequence,
      lastOutcomeSequence: row.last_outcome_sequence,
      operatorEpoch: row.operator_epoch,
      transientFailures: row.transient_failures,
      probeAttemptId: row.probe_attempt_id,
      probeLeaseUntilMs: row.probe_lease_until_ms,
    };
  }

  private writeState(state: CcelCoordinatorPersistenceState): void {
    this.ctx.storage.sql.exec(
      `UPDATE ccel_coordinator_state SET
        state = ?, next_allowed_at_ms = ?, backoff_until_ms = ?,
        last_observed_at_ms = ?, attempt_sequence = ?,
        last_outcome_sequence = ?, operator_epoch = ?,
        transient_failures = ?, probe_attempt_id = ?,
        probe_lease_until_ms = ?
      WHERE singleton = 1`,
      state.state,
      state.nextAllowedAtMs,
      state.backoffUntilMs,
      state.lastObservedAtMs,
      state.attemptSequence,
      state.lastOutcomeSequence,
      state.operatorEpoch,
      state.transientFailures,
      state.probeAttemptId,
      state.probeLeaseUntilMs,
    );
  }
}
