import { it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync, symlinkSync, openSync, readSync, writeSync, closeSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { SOURCE_RECOVERY, reconstructNortonSource, verifyRecoveredNortonInputs } from '../../../.github/scripts/reconstruct-norton-source.js';
const roots: string[] = [], sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
afterEach(() => { for (const r of roots.splice(0))
    rmSync(r, { recursive: true, force: true }); });
function empty() { const r = mkdtempSync(join(tmpdir(), 'original-source-test-')); roots.push(r); mkdirSync(join(r, 'source')); return r; }
function badRoot(name: string, mutate: (b: Buffer) => Buffer) { const r = empty(), out = join(r, SOURCE_RECOVERY.directory); mkdirSync(out, { recursive: true }); const b = readFileSync(join(process.cwd(), SOURCE_RECOVERY.directory, name)); writeFileSync(join(out, name), mutate(b)); return r; }
it('pins the release-specific55 original pages and metadata archive', () => { const p = readFileSync(join(SOURCE_RECOVERY.directory, 'statistics-pages.json')), v = JSON.parse(p.toString()); expect(p.length).toBe(307777); expect(sha(p)).toBe(SOURCE_RECOVERY.statisticsSha256); expect(v.pages).toHaveLength(55); expect(new Set(v.pages.map((p: any) => p.page)).size).toBe(55); expect(sha(readFileSync(join(SOURCE_RECOVERY.directory, 'original-metadata.zip')))).toBe(SOURCE_RECOVERY.metadataSha256); });
it.each(['modified-page', 'application-page'])('refuses%s payload before any source write', fault => { const r = badRoot('statistics-pages.json', b => { const p = JSON.parse(b.toString()); if (fault === 'application-page')
    p.pages[0].page = 2;
else
    p.pages[0].base64 = 'A' + p.pages[0].base64.slice(1); return Buffer.from(JSON.stringify(p)); }), directory = empty(); expect(() => reconstructNortonSource(r, directory, 'absent-bundle')).toThrow('pinned recovery payload'); expect(readdirSync(join(directory, 'source'))).toEqual([]); });
it('refuses an unknown or modified metadata manifest before accepting original evidence', () => { const r = badRoot('original-metadata-files.json', b => Buffer.from(b.toString().replace('"worker/README.md"', '"unexpected-metadata"'))); expect(() => verifyRecoveredNortonInputs(r, empty())).toThrow('pinned recovery payload'); });
it('refuses a symlink source instead of following it', () => { const r = empty(), target = join(r, 'outside'); writeFileSync(target, 'not a database'); symlinkSync(target, join(r, 'source/source.db')); expect(() => reconstructNortonSource(process.cwd(), r, 'absent-bundle')).toThrow('bounded regular file'); expect(readFileSync(target, 'utf8')).toBe('not a database'); });
// These actual-database cases run in the source-only Ubuntu PR rehearsal, reusing its one fresh build.
const recoveryRoot = process.env.THEOLOGAI_NORTON_RECOVERY_ROOT ?? process.cwd();
const actual = process.env.THEOLOGAI_NORTON_RECOVERY_DATABASE, bundle = process.env.THEOLOGAI_NORTON_RECOVERY_BUNDLE;
function fixture() { const r = empty(); copyFileSync(actual!, join(r, 'source/source.db')); return r; }
it.runIf(!!actual && !!bundle)('recovers the complete exact source and immutable original metadata with no fresh remote claim', () => { const r = fixture(); const result = reconstructNortonSource(recoveryRoot, r, bundle!); expect(result.originalDatabaseSha256).toBe(SOURCE_RECOVERY.databaseSha256); expect(result.freshRemoteProof).toBe(false); expect(verifyRecoveredNortonInputs(recoveryRoot, r).artifact.id).toBe(13505817745); });
it.runIf(!!actual && !!bundle)('refuses corruption outside55 pages before publishing recovery metadata', () => { const r = fixture(), path = join(r, 'source/source.db'), db = new Database(path, { readonly: true }), page = (db.prepare("SELECT pageno FROM dbstat WHERE name='theologai_metadata' AND pagetype='leaf' LIMIT 1").get() as {
    pageno: number;
}).pageno; db.close(); const fd = openSync(path, 'r+'); try {
    const b = Buffer.alloc(4096);
    readSync(fd, b, 0, 4096, (page - 1) * 4096);
    const at = b.indexOf(Buffer.from('0010_active_aquinas_hierarchy_publication'));
    expect(at).toBeGreaterThanOrEqual(0);
    b[at + 5] ^= 1;
    writeSync(fd, b, 0, 4096, (page - 1) * 4096);
}
finally {
    closeSync(fd);
} const before = sha(readFileSync(path)); expect(() => reconstructNortonSource(recoveryRoot, r, bundle!)).toThrow('whole original database bytes'); expect(sha(readFileSync(path))).toBe(before); expect(existsSync(join(r, 'source-recovery.json'))).toBe(false); expect(readdirSync(join(r, 'source')).some(n => n.startsWith('.original-'))).toBe(false); });
it.runIf(!!actual && !!bundle)('refuses a pinned page owned by an application table before any reconstruction writes', () => { const r = fixture(), path = join(r, 'source/source.db'), db = new Database(path); db.unsafeMode(true); db.pragma('writable_schema = ON'); db.prepare("UPDATE sqlite_schema SET name='recovery_application_page',tbl_name='recovery_application_page',sql=replace(sql,'sqlite_stat4','recovery_application_page') WHERE name='sqlite_stat4'").run(); db.pragma('schema_version = 999'); db.close(); const before = sha(readFileSync(path)); expect(() => reconstructNortonSource(recoveryRoot, r, bundle!)).toThrow('statistics/freelist pages only'); expect(sha(readFileSync(path))).toBe(before); expect(existsSync(join(r, 'source-recovery.json'))).toBe(false); });
