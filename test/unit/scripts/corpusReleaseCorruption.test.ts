import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Native } from '../../helpers/corpusNative.js';
import { CorpusSession, FTS, TARGETS } from '../../../scripts/corpus-release.js';
it('rejects eleven missing/orphan/position/owned-content corruption controls using the actual rank-1 operation and halts each session', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'corpus-fts-')), native = new Native(join(dir, 'native')), source = new Database(':memory:');const manifest=JSON.parse(readFileSync('data/data-manifest.json','utf8'));for(const m of manifest.materializations.d1.migrations)source.exec(readFileSync(m.path,'utf8'));
    let controls = 0;
    try {
        for (const table of FTS) {
            const definition = (source.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(table) as {
                sql: string;
            }).sql;
            const external = table !== 'strongs_fts', base = table === 'sections_fts' ? 'document_sections' : table === 'historical_edition_sections_fts' ? 'historical_edition_sections' : 'historical_edition_hierarchy_bodies';
            const fields = table === 'sections_fts' ? 'title,content,topics' : table === 'historical_edition_sections_fts' ? 'edition_id,section_key,heading,content' : 'hierarchy_id,body_key,heading,content';
            const values = table === 'sections_fts' ? "'heading','one two three','topic'" : table === 'historical_edition_sections_fts' ? "'edition','section','heading','one two three'" : "'hierarchy','body','heading','one two three'";
            for (const fault of external ? ['missing', 'orphan', 'position'] : ['position', 'extra-owned-content']) {
                const db = new Database(':memory:');
                db.unsafeMode(true);
                if (external)
                    db.exec(`CREATE TABLE ${base}(id INTEGER PRIMARY KEY,edition_id TEXT,section_key TEXT,hierarchy_id TEXT,body_key TEXT,title TEXT,heading TEXT,content TEXT,topics TEXT)`);
                db.exec(definition);
                if (external) {
                    db.exec(`INSERT INTO ${base}(id,edition_id,section_key,hierarchy_id,body_key,title,heading,content,topics) VALUES(1,'edition','section','hierarchy','body','heading','heading','one two three','topic');INSERT INTO ${table}(${table}) VALUES('rebuild');`);
                }
                else
                    db.exec("INSERT INTO strongs_fts(rowid,strongs_number,lemma,transliteration,definition) VALUES(1,'G0001','λόγος','logos','one two three')");
                db.exec(`INSERT INTO ${table}(${table},rank) VALUES('integrity-check',1)`);
                if (fault === 'missing')
                    db.exec(`INSERT INTO ${table}(${table},rowid,${fields}) VALUES('delete',1,${values})`);
                if (fault === 'orphan')
                    db.exec(`INSERT INTO ${table}(rowid,${fields}) VALUES(2,${values})`);
                if (fault === 'position')
                    db.exec(external ? `UPDATE ${base} SET content='three two one' WHERE id=1` : "UPDATE strongs_fts_content SET c3='three two one' WHERE id=1");
                if (fault === 'extra-owned-content')
                    db.exec("INSERT INTO strongs_fts_content(id,c0,c1,c2,c3) VALUES(2,'G0002','λόγος','logos','one two three')");
                const path = join(dir, 'broken.db');
                writeFileSync(path, db.serialize());
                db.close();
                await native.load(path);
                const now = Date.parse('2026-10-27T12:00:00Z');
                const session = new CorpusSession({ databaseId:TARGETS.preview.id, execute: sql => native.exec(sql), usage: async () => ({ windowStart: '2026-10-27T00:00:00.000Z', observedAt: new Date(now).toISOString(), rowsRead: 0, rowsWritten: 0 }), guard: async () => { }, append: async () => { } }, undefined, () => now);
                await expect(session.query(`INSERT INTO ${table}(${table},rank) VALUES('integrity-check',1)`, 1024, 1025), table + '/' + fault).rejects.toThrow();
                expect(session.halted).toBe(true);
                controls++;
            }
        }
        expect(controls).toBe(11);
    }
    finally {
        source.close();
        await native.close();
        rmSync(dir, { recursive: true, force: true });
    }
}, 30000);
