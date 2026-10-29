import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { it, expect } from 'vitest';
import { mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCorpusPreviewArtifact, verifyCorpusPreviewArtifact } from '../../../scripts/corpus-release-artifact.js';
import { buildSourceProof, CorpusSession, verifyCorpus, PROVIDER_CATALOG, TARGETS } from '../../../scripts/corpus-release.js';
import { auditCorpusRelease } from '../../../scripts/audit-corpus-release.js';
import { Native } from '../../helpers/corpusNative.js';
import { corpusMcp } from '../../helpers/corpusMcp.js';
it.skipIf(!existsSync('data/theologai.db'))('binds a real complete proof and real corpus live audit to trusted protected provenance and exact assignment', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'corpus-artifact-')), source = buildSourceProof(process.cwd(), 'data/theologai.db');
    const native = new Native(join(dir, 'native'));
    const path = join(dir, 'fixture.db');
    copyFileSync('data/theologai.db', path);
    const fixture = new Database(path);
    for (const row of PROVIDER_CATALOG)
        fixture.exec(String(row.sql));
    source.migrationNames.forEach((name, i) => fixture.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(?,?,?)').run(i + 1, name, '2026-10-27 10:00:00'));
    fixture.close();
    const db = new Database('data/theologai.db', { readonly: true });
    const now = Date.parse('2026-10-27T12:00:00Z'), control = { databaseId: TARGETS.preview.id, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), unbound: true as const, ownerCustodySha256: 'c'.repeat(64), bindingInventorySha256: 'd'.repeat(64) };
    try {
        await native.load(path);
        const session = new CorpusSession({ databaseId:TARGETS.preview.id, execute: sql => native.exec(sql), usage: async () => ({ windowStart: '2026-10-27T00:00:00.000Z', observedAt: new Date(now).toISOString(), rowsRead: 0, rowsWritten: 0 }), guard: async () => { }, append: async () => { } }, undefined, () => now);
        const verification = await verifyCorpus(source, db, session, { role: 'preview', sourceCommit: control.sourceCommit, sourceTree: control.sourceTree, expectedLedger: source.migrationNames.map((name,i)=>({id:i+1,name,applied_at:'2026-10-27 10:00:00'})), captureControl: async () => control });
        const live = await auditCorpusRelease({ role: 'preview', endpoint: 'https://preview-mcp.theologai.xyz/mcp', serverVersion: '3.6.0-preview', databasePath: 'data/theologai.db', root: process.cwd(), fetch: corpusMcp(native, true, () => { }) });
        const assignment = { worker: 'theologai-preview' as const, deploymentId: '11111111-1111-4111-8111-111111111111', versionId: '22222222-2222-4222-8222-222222222222', versionNumber: 1, databaseId: TARGETS.preview.id };
        const ledger = (await native.exec('SELECT id,name,applied_at FROM d1_migrations ORDER BY id LIMIT 11')).rows;
        const input = { repository: 'owner/TheologAI', pullRequest: 1, workflowRunId: 2, sourceCommit: verification.sourceCommit, sourceTree: verification.sourceTree, verification, live, assignment, control, ledger };
        const artifact = createCorpusPreviewArtifact(input, source, now);
        const expected = { repository: input.repository, pullRequest: 1, workflowRunId: 2, sourceCommit: input.sourceCommit, sourceTree: input.sourceTree, protectedProducerSucceeded: true as const, currentPreviewAssignment: assignment, custodyStillHeld: true as const };
        expect(verifyCorpusPreviewArtifact(artifact, live, source, expected, now)).toEqual(artifact);
        expect(() => verifyCorpusPreviewArtifact(artifact, live, source, { ...expected, workflowRunId: 3 }, now)).toThrow('provenance');
        expect(() => verifyCorpusPreviewArtifact(artifact, live, source, { ...expected, currentPreviewAssignment: { ...assignment, versionNumber: 2 } }, now)).toThrow('assignment');
        const incomplete = structuredClone(live);
        incomplete.checks[0] = incomplete.checks[1];
        expect(() => createCorpusPreviewArtifact({ ...input, live: incomplete }, source, now)).toThrow('inventory');
        expect(() => verifyCorpusPreviewArtifact({ ...artifact, privatePreparation: 'passed' }, live, source, expected, now)).toThrow();
        writeFileSync('../implementation-artifact.json', JSON.stringify({ ...artifact, localOnly: true, syntheticProvenance: true }, null, 2));
    }
    finally {
        db.close();
        await native.close();
        rmSync(dir, { recursive: true, force: true });
    }
}, 120000);
