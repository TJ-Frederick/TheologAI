import { Miniflare } from 'miniflare';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { unstable_splitSqlQuery } from 'wrangler';
import Database from 'better-sqlite3';
export const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const split = unstable_splitSqlQuery;
export type Meter = {
    rowsRead: number;
    rowsWritten: number;
    rows: any[];
    error?: string;
    elapsedMs?: number;
};
const script = `export class Probe {
  constructor(s) { this.sql = s.storage.sql; }
  async fetch(request) {
    const { statements } = await request.json(); const output = [];
    for (const statement of statements) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const bindings = typeof statement === 'string' ? [] : statement.bindings;
      const started = performance.now();
      try { const cursor = this.sql.exec(sql, ...bindings); const rows = cursor.toArray();
        output.push({ rows, rowsRead: cursor.rowsRead, rowsWritten: cursor.rowsWritten, elapsedMs: performance.now()-started });
      } catch(e) { output.push({ error:String(e), rows:[], rowsRead:0, rowsWritten:0, elapsedMs:performance.now()-started }); break; }
    }
    return Response.json({ output });
  }
} export default { fetch() { return new Response('local-only'); } };`;
const files = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(path, e.name)) : [join(path, e.name)]);
/** Only local DO storage. Never configures D1 remote bindings, credentials, or an external fetch. */
export class Native {
    mf: Miniflare;
    private closed = false;
    constructor(readonly directory: string) {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        this.mf = this.start();
    }
    private start() { this.closed = false; return new Miniflare({ script, modules: true, compatibilityDate: '2026-07-29', durableObjects: { PROBE: { className: 'Probe', useSQLite: true } }, durableObjectsPersist: this.directory }); }
    async load(source: string) {
        await this.exec('CREATE TABLE IF NOT EXISTS initialize_only(id INTEGER PRIMARY KEY)');
        await this.mf.dispose();
        const sqlite = files(this.directory).filter(p => /\/[0-9a-f]{64}\.sqlite$/.test(p));
        if (sqlite.length !== 1)
            throw Error('Ambiguous isolated runtime database');
        for (const suffix of ['-wal', '-shm'])
            rmSync(sqlite[0] + suffix, { force: true });
        copyFileSync(source, sqlite[0]);
        this.mf = this.start();
    }
    async many(statements: string[], allowError = false): Promise<Meter[]> {
        const ns = await this.mf.getDurableObjectNamespace('PROBE');
        const response = await ns.get(ns.idFromName('fixture')).fetch('https://local.test/', { method: 'POST', body: JSON.stringify({ statements }) });
        const { output } = await response.json() as {
            output: Meter[];
        };
        if (!allowError && (output.length !== statements.length || output.some(x => x.error)))
            throw Error(output.find(x => x.error)?.error ?? 'Incomplete local operation');
        return output;
    }
    async exec(sql: string, allowError = false): Promise<Meter> {
        const result = await this.many(split(sql), allowError);
        return { rows: result.at(-1)?.rows ?? [], rowsRead: result.reduce((s, r) => s + r.rowsRead, 0), rowsWritten: result.reduce((s, r) => s + r.rowsWritten, 0), elapsedMs: result.reduce((s, r) => s + (r.elapsedMs ?? 0), 0), ...(result.some(r => r.error) ? { error: result.find(r => r.error)!.error } : {}) };
    }
    async bound(sql: string, bindings: any[]): Promise<Meter> {
        const output = await this.many([{ sql, bindings }] as any);
        return output[0];
    }
    async close() { if (this.closed)
        return; this.closed = true; await this.mf.dispose(); }
    async save(path: string) {
        await this.close();
        const sqlite = files(this.directory).filter(p => /\/[0-9a-f]{64}\.sqlite$/.test(p));
        if (sqlite.length !== 1)
            throw Error('Ambiguous local snapshot');
        const db = new Database(sqlite[0]);
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
        copyFileSync(sqlite[0], path);
    }
}
