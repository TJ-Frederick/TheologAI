import { DurableObject } from 'cloudflare:workers';
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
  type CcelOperatorResetResult,
  type CcelTerminalAttempt,
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
  terminal_sequence: number;
  terminal_retired_through_attempt_id: number;
}

interface TerminalAttemptRow extends Record<string, string | number | null> {
  record_sequence: number;
  attempt_id: number;
  operator_epoch: number;
  outcome_kind: string;
  retry_after_seconds: number | null;
}

/**
 * One named instance is the coordination atom for the single CCEL origin.
 *
 * This intentionally serializes a very low upstream allowance (one attempt per
 * ten seconds). It never performs a fetch and its SQLite schema cannot store
 * query, URL, HTML, snippets, client identity, or arbitrary metadata.
 */
type CoordinatorRuntimeEnv = Record<string, never>;

export class CcelGlobalCoordinator extends DurableObject<CoordinatorRuntimeEnv> {
  constructor(ctx: DurableObjectState, env: CoordinatorRuntimeEnv) {
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
        this.writeState(transition.state, false);
      }
      return transition.decision;
    });
  }

  recordOutcome(token: CcelAdmissionToken, outcome: CcelAttemptOutcome): CcelOutcomeRecord {
    return this.ctx.storage.transactionSync(() => {
      const previous = this.readState();
      const transition = transitionCcelOutcome(previous, token, outcome, Date.now());
      if (transition.state.terminalSequence !== previous.terminalSequence
          || transition.state.state !== previous.state) {
        this.writeState(transition.state, true);
      }
      return transition.result;
    });
  }

  snapshot(): CcelCoordinatorSnapshot {
    return this.ctx.storage.transactionSync(() => snapshotCcelCoordinatorState(this.readState()));
  }

  /** Authenticated operator pathway. Exact state+epoch makes replay harmless. */
  resetAfterOperatorReview(
    expectedState: 'latched_policy' | 'latched_interface',
    expectedOperatorEpoch: number,
  ): CcelOperatorResetResult {
    return this.ctx.storage.transactionSync(() => {
      const previous = this.readState();
      const snapshot = snapshotCcelCoordinatorState(previous);
      if (previous.state !== 'latched_policy' && previous.state !== 'latched_interface') {
        return { applied: false, reason: 'not_latched', snapshot };
      }
      if (previous.state !== expectedState) {
        return { applied: false, reason: 'state_mismatch', snapshot };
      }
      if (previous.operatorEpoch !== expectedOperatorEpoch) {
        return { applied: false, reason: 'epoch_mismatch', snapshot };
      }
      const state = resetCcelCoordinatorState(previous, Date.now());
      this.writeState(state, true);
      return { applied: true, reason: 'applied', snapshot: snapshotCcelCoordinatorState(state) };
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
        probe_lease_until_ms INTEGER NOT NULL CHECK (probe_lease_until_ms >= 0),
        terminal_sequence INTEGER NOT NULL CHECK (terminal_sequence >= 0),
        terminal_retired_through_attempt_id INTEGER NOT NULL CHECK (
          terminal_retired_through_attempt_id >= 0
        )
      );
      CREATE TABLE IF NOT EXISTS ccel_terminal_attempts (
        record_sequence INTEGER PRIMARY KEY CHECK (record_sequence >= 1),
        attempt_id INTEGER NOT NULL CHECK (attempt_id >= 1),
        operator_epoch INTEGER NOT NULL CHECK (operator_epoch >= 0),
        outcome_kind TEXT NOT NULL CHECK (outcome_kind IN (
          'success', 'transient_failure', 'rate_limited',
          'policy_failure', 'interface_failure'
        )),
        retry_after_seconds INTEGER CHECK (
          (outcome_kind = 'rate_limited' AND retry_after_seconds BETWEEN 1 AND 86400)
          OR (outcome_kind != 'rate_limited' AND retry_after_seconds IS NULL)
        ),
        UNIQUE (operator_epoch, attempt_id)
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
          probe_lease_until_ms, terminal_sequence,
          terminal_retired_through_attempt_id
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        initial.terminalSequence,
        initial.terminalRetiredThroughAttemptId,
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
        probe_lease_until_ms, terminal_sequence,
        terminal_retired_through_attempt_id
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
      terminalSequence: row.terminal_sequence,
      terminalRetiredThroughAttemptId: row.terminal_retired_through_attempt_id,
      terminalAttempts: this.readTerminalAttempts(),
    };
  }

  private readTerminalAttempts(): CcelTerminalAttempt[] {
    return this.ctx.storage.sql.exec<TerminalAttemptRow>(`
      SELECT record_sequence, attempt_id, operator_epoch, outcome_kind,
        retry_after_seconds
      FROM ccel_terminal_attempts
      ORDER BY record_sequence
    `).toArray().map(row => ({
      recordSequence: row.record_sequence,
      attemptId: row.attempt_id,
      operatorEpoch: row.operator_epoch,
      outcomeKind: row.outcome_kind as CcelTerminalAttempt['outcomeKind'],
      retryAfterSeconds: row.retry_after_seconds,
    }));
  }

  private writeState(state: CcelCoordinatorPersistenceState, terminalsChanged: boolean): void {
    this.ctx.storage.sql.exec(
      `UPDATE ccel_coordinator_state SET
        state = ?, next_allowed_at_ms = ?, backoff_until_ms = ?,
        last_observed_at_ms = ?, attempt_sequence = ?,
        last_outcome_sequence = ?, operator_epoch = ?,
        transient_failures = ?, probe_attempt_id = ?,
        probe_lease_until_ms = ?, terminal_sequence = ?,
        terminal_retired_through_attempt_id = ?
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
      state.terminalSequence,
      state.terminalRetiredThroughAttemptId,
    );
    if (!terminalsChanged) return;
    this.ctx.storage.sql.exec('DELETE FROM ccel_terminal_attempts');
    for (const terminal of state.terminalAttempts) {
      this.ctx.storage.sql.exec(
        `INSERT INTO ccel_terminal_attempts (
          record_sequence, attempt_id, operator_epoch, outcome_kind,
          retry_after_seconds
        ) VALUES (?, ?, ?, ?, ?)`,
        terminal.recordSequence,
        terminal.attemptId,
        terminal.operatorEpoch,
        terminal.outcomeKind,
        terminal.retryAfterSeconds,
      );
    }
  }
}
