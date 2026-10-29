import { expect, it } from 'vitest';
import { executionBudget, parseExecutionApproval } from '../../../scripts/corpus-release-operator.js';
import { AllowancePause, CorpusSession, LIMITS, TARGETS } from '../../../scripts/corpus-release.js';

const now = Date.parse('2026-10-29T12:00:00Z');
const approval = { schemaVersion: 'norton-aquinas-execution-approval.v1', status: 'approved', role: 'preview', databaseId: TARGETS.preview.id, exclusiveCandidateSql: true, candidateJobsPaused: true, ownerCustodySha256: 'c'.repeat(64), windowStart: '2026-10-29T00:00:00.000Z', expiresAt: '2026-10-29T14:30:00.000Z', knownRowsRead: 571753, knownRowsWritten: 0, expectedLedgerSha256: 'd'.repeat(64), useRemainingProductionReserve: true };

it('reserves the full preview and analytics margin before assigning remaining production headroom', () => {
    const parsed = parseExecutionApproval(approval, 'preview', now);
    expect(executionBudget(parsed, 571753)).toMatchObject({ effectiveAccountReads: 571753, previewReads: 3660000, analyticsMargin: 200000, productionReadReserve: 568247 });
    expect(executionBudget(parsed, 600000).productionReadReserve).toBe(540000);
    expect(executionBudget(parsed, 1140000).productionReadReserve).toBe(0);
    expect(() => executionBudget(parsed, 1140001)).toThrow('not admitted');
    expect(executionBudget(parsed, 0).effectiveAccountReads).toBe(571753);
    const normal = parseExecutionApproval({ ...approval, useRemainingProductionReserve: undefined }, 'preview', now);
    expect(() => executionBudget(normal, 571753)).toThrow('not admitted');
    expect(executionBudget({ ...normal, knownRowsRead: 0 }, 0).productionReadReserve).toBe(LIMITS.productionReserve);
});

it('refuses the reserve exception for production and any other UTC day', () => {
    expect(() => parseExecutionApproval({ ...approval, role: 'production', databaseId: TARGETS.production.id, previewCustodyUnbroken: true, previewCustodyEvidenceSha256: 'e'.repeat(64) }, 'production', now)).toThrow('October 29 preview');
    expect(() => parseExecutionApproval({ ...approval, windowStart: '2026-10-30T00:00:00.000Z', expiresAt: '2026-10-30T14:30:00.000Z' }, 'preview', now + 86400000)).toThrow('October 29 preview');
    expect(() => parseExecutionApproval({ ...approval, useRemainingProductionReserve: false }, 'preview', now)).toThrow();
});

it('keeps per-operation admission and the analytics margin under the fixed reduced reserve', async () => {
    let reads = 571753, calls = 0;
    const dependencies = { databaseId: TARGETS.preview.id, productionReadReserve: 568247, execute: async () => { calls++; return { rows: [], rowsRead: 1, rowsWritten: 0 }; }, usage: async () => ({ windowStart: approval.windowStart, observedAt: new Date(now).toISOString(), rowsRead: reads, rowsWritten: 0 }), guard: async () => {}, append: async () => {} };
    const session = new CorpusSession(dependencies, undefined, () => now);
    await session.query('SELECT 1', 1);
    reads = LIMITS.dailyReads - 568247 - LIMITS.lagReserve;
    await expect(session.query('SELECT 2', 1)).rejects.toBeInstanceOf(AllowancePause);
    expect(calls).toBe(1);
    expect(session.halted).toBe(false);
    expect(() => new CorpusSession({ ...dependencies, databaseId: TARGETS.production.id }, undefined, () => now)).toThrow('October 29 preview');
    expect(() => new CorpusSession({ ...dependencies, productionReadReserve: -1 }, undefined, () => now)).toThrow('invalid production read reserve');
});
