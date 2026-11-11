import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { it, expect,vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Native } from '../../helpers/corpusNative.js';
import {CorpusProofTransport} from '../../../scripts/corpus-proof-transport.js';
import {ALL_FTS as FTS} from '../../../scripts/corpus-source-proof.js';
import {POLICY} from '../../../scripts/norton-aquinas-release-policy.mjs';
import {corpusTransportFixture} from '../../helpers/corpusTransportFixture.js';
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
                vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
                const fixture=corpusTransportFixture({role:'preview',advance:()=>vi.setSystemTime(Date.now()+1000),query:async(sql)=>native.exec(sql)});
                const admission=new CorpusProofTransport({policy:POLICY.policy,role:'preview',token:'synthetic-reader',readBudget:3560000,eventFile:join(dir,'admit-'+controls+'.jsonl'),fetch:fixture.fetch,historicalExceptions:false});
                await admission.start();
                const session=new CorpusProofTransport({policy:POLICY.policy,role:'preview',token:'synthetic-operator',readBudget:16384,eventFile:join(dir,'failure-'+controls+'.jsonl'),fetch:fixture.fetch,historicalExceptions:false});
                await session.startIntegrity(admission.protectedAdmission());
                const query={kind:'fts-integrity' as const,label:'fts:'+table,sql:`INSERT INTO "${table}"("${table}",rank) VALUES('integrity-check',1)`,readCeiling:4096,writeCeiling:1};
                await expect(session.execute(query),table+'/'+fault).rejects.toThrow();
                expect(session.metering.unknownAttempts).toBe(1);expect(session.metering.requests).toBe(1);
                await expect(session.execute(query)).rejects.toThrow('halted');expect(session.metering.requests).toBe(1);
                const events=readFileSync(join(dir,'failure-'+controls+'.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));expect(events.some(e=>e.kind==='halted')).toBe(true);
                vi.useRealTimers();
                controls++;
            }
        }
        expect(controls).toBe(11);
    }
    finally {
        vi.useRealTimers();source.close();
        await native.close();
        rmSync(dir, { recursive: true, force: true });
    }
}, 30000);
