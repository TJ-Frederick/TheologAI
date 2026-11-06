import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';
import {it,expect} from 'vitest';
import {optimizePreorderTrigger} from '../../../scripts/norton-aquinas-preparation.js';
it('preserves the terminal graph predicate on fifteen adversarial graph and ordering controls', () => {
    const source = new Database(':memory:');
    const manifest=JSON.parse(readFileSync('data/data-manifest.json','utf8'));for(const migration of manifest.materializations.d1.migrations)source.exec(readFileSync(migration.path,'utf8'));
    const trigger = (source.prepare("SELECT sql FROM sqlite_master WHERE name='historical_edition_hierarchy_node_preorder_insert'").get() as {sql:string}).sql;
    source.close();
    const predicate = (sql:string) => sql.slice(sql.indexOf('WITH RECURSIVE'),sql.lastIndexOf('  );')).replaceAll('NEW.hierarchy_id', "'h'");
    const original = predicate(trigger), optimized = predicate(optimizePreorderTrigger(trigger));
    const db = new Database(':memory:');
    db.exec('CREATE TABLE historical_edition_hierarchy_nodes(hierarchy_id TEXT,node_key TEXT,parent_node_key TEXT,flat_ordinal INTEGER,sibling_ordinal INTEGER); CREATE INDEX children ON historical_edition_hierarchy_nodes(hierarchy_id,parent_node_key);');
    const insert = db.prepare("INSERT INTO historical_edition_hierarchy_nodes VALUES('h',?,?,?,?)");
    const base:(string|number|null)[][] = [['r',null,1,1],['a','r',2,1],['aa','a',3,1],['b','r',4,2],['bb','b',5,1]];
    let cases=0;
    const test=(rows:typeof base,rejects:boolean)=>{db.exec('DELETE FROM historical_edition_hierarchy_nodes');for(const row of rows)insert.run(...row);expect(db.prepare(original).all().length>0).toBe(rejects);expect(db.prepare(optimized).all().length>0).toBe(rejects);cases++;};
    try {
        test(base,false);
        for(let i=0;i<base.length;i++)for(let j=i+1;j<base.length;j++){const rows=structuredClone(base);[rows[i][2],rows[j][2]]=[rows[j][2],rows[i][2]];test(rows,true);}
        test([...base,['lost','absent',6,1]],true);
        test([...base,['c','d',6,1],['d','c',7,1]],true);
        test([...base,['root2',null,6,2]],false);
        test(base.map(r=>r[0]==='a'?[r[0],r[1],r[2],2]:r[0]==='b'?[r[0],r[1],r[2],1]:r),true);
        expect(cases).toBe(15);
    } finally { db.close(); }
});


import {PreparedCorpusSession,createPreparationExecutor,TARGETS} from '../../../scripts/norton-aquinas-preparation.js';
const now=Date.parse('2026-11-03T12:00:00Z');
function session(options:{read?:number;write?:number;execute?:any;append?:any}={}){
 const entries:any[]=[];let calls=0;
 const s=new PreparedCorpusSession({databaseId:TARGETS.production.id,guard:async()=>{},usage:async()=>({windowStart:'2026-11-03T00:00:00.000Z',observedAt:new Date(now).toISOString(),rowsRead:options.read??100,rowsWritten:options.write??0}),append:options.append??(async(e:any)=>{entries.push(e);}),execute:options.execute??(async()=>{calls++;return {rows:[],rowsRead:1,rowsWritten:0};})},()=>now);
 return {s,entries,calls:()=>calls};
}
it('rejects the wrong preparation target before any dispatch',()=>{
 expect(()=>new PreparedCorpusSession({databaseId:'62b871a6-5b4d-4d9b-8f52-301f6c878f48',execute:async()=>({rows:[],rowsRead:0,rowsWritten:0}),guard:async()=>{},usage:async()=>({} as any),append:async()=>{}})).toThrow('target');
});
it.each([{read:3799999,write:0},{read:0,write:80000}])('refuses per-operation daily admission before dispatch %j',async usage=>{const f=session(usage);await expect(f.s.query('SELECT 1',2,1)).rejects.toThrow('not admitted');expect(f.calls()).toBe(0);expect(f.entries).toEqual([]);});
it('records intent before dispatch and refuses a second operation after an unknown outcome',async()=>{const f=session({execute:async()=>{throw Error('unknown');}});await expect(f.s.query('SELECT 1',8)).rejects.toThrow('unknown');expect(f.entries).toHaveLength(1);expect(f.entries[0].state).toBe('intent');await expect(f.s.query('SELECT 1',8)).rejects.toThrow('halted');});
it.each(['partial','retry','secondary'])('halts without retry for %s batch metadata',async defect=>{
 let calls=0;const execute=createPreparationExecutor(async()=>{calls++;return Response.json({success:true,errors:[],result:defect==='partial'?[]:[{success:true,results:[],meta:{rows_read:1,rows_written:0,total_attempts:defect==='retry'?2:1,served_by_primary:defect!=='secondary'}}]});});
 const f=session({execute});await expect(f.s.query('SELECT 1',8)).rejects.toThrow('unknown');await expect(f.s.query('SELECT 1',8)).rejects.toThrow('halted');expect(calls).toBe(1);expect(f.entries).toHaveLength(1);
});
it('retains already metered preflight reads for cumulative admission',async()=>{const f=session({execute:async()=>({rows:[],rowsRead:249999,rowsWritten:0})});await f.s.query('SELECT 1',249999);await expect(f.s.query('SELECT 2',2)).rejects.toThrow('not admitted');expect(f.s.reads).toBe(249999);expect(f.entries).toHaveLength(2);});

it('retains the separately reserved discovery reads in the same preparation role',async()=>{
 const entries:any[]=[];let calls=0;const s=new PreparedCorpusSession({priorReadsReserved:32,databaseId:TARGETS.production.id,guard:async()=>{},usage:async()=>({windowStart:'2026-11-03T00:00:00.000Z',observedAt:new Date(now).toISOString(),rowsRead:32,rowsWritten:0}),append:async e=>{entries.push(e);},execute:async()=>{calls++;return{rows:[],rowsRead:249968,rowsWritten:0};}},()=>now);
 await s.query('SELECT 1',249968);await expect(s.query('SELECT 2',1)).rejects.toThrow('not admitted');expect(calls).toBe(1);expect(s.reads).toBe(249968);expect(entries).toHaveLength(2);
 expect(()=>new PreparedCorpusSession({...s.dependencies,priorReadsReserved:-1})).toThrow('prior preparation reservation');
});
