import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ALL_FTS, CATALOG_SQL, LEDGER_SQL, PROVIDER_CATALOG, canonicalTableDigest, proveCompleteCorpus, sourcePage, type CorpusProofSource, type ProofExecute, type ProofQuery, type ProofRow } from '../../../scripts/corpus-source-proof.js';
import { assertProofQuery } from '../../../scripts/corpus-proof-transport.js';
import { createHash } from 'node:crypto';

function fixture() {
  const source = new Database(':memory:');
  source.exec(`CREATE TABLE documents(id INTEGER PRIMARY KEY,title TEXT);
    CREATE TABLE document_sections(id INTEGER PRIMARY KEY,document_id INTEGER REFERENCES documents(id),content TEXT);
    CREATE TABLE historical_edition_sections(id INTEGER PRIMARY KEY,content TEXT);
    CREATE TABLE historical_edition_hierarchy_bodies(id INTEGER PRIMARY KEY,content TEXT);
    CREATE VIRTUAL TABLE strongs_fts USING fts5(strongs_number,lemma,transliteration,definition);
    CREATE VIRTUAL TABLE sections_fts USING fts5(content,content='document_sections',content_rowid='id');
    CREATE VIRTUAL TABLE historical_edition_sections_fts USING fts5(content,content='historical_edition_sections',content_rowid='id');
    CREATE VIRTUAL TABLE historical_edition_hierarchy_bodies_fts USING fts5(content,content='historical_edition_hierarchy_bodies',content_rowid='id');
    INSERT INTO documents VALUES(1,'one'); INSERT INTO document_sections VALUES(1,1,'one two three');
    INSERT INTO historical_edition_sections VALUES(1,'one two three'); INSERT INTO historical_edition_hierarchy_bodies VALUES(1,'one two three');
    INSERT INTO strongs_fts(rowid,strongs_number,lemma,transliteration,definition) VALUES(7,'G25','agape','agape','love'),(17,'H7225','beginning','beginning','first');`);
  for (const t of ALL_FTS.slice(1)) source.exec(`INSERT INTO ${t}(${t}) VALUES('rebuild')`);
  const target = new Database(source.serialize()); for(const row of PROVIDER_CATALOG)target.exec(String(row.sql));target.exec("INSERT INTO d1_migrations VALUES(1,'0001.sql','2026-10-27 00:00:00')");
  const tables = ['documents','document_sections','historical_edition_sections','historical_edition_hierarchy_bodies','strongs_fts'].sort();
  const expected: CorpusProofSource = { tables, catalog: source.prepare(CATALOG_SQL).all() as ProofRow[], digests: Object.fromEntries(tables.map(t => [t,canonicalTableDigest(source,t)])), foreignKeyWitnessSha256: 'a'.repeat(64), schemaVersion:'fixture',migrationNames:['0001.sql'],quickCheckReadCeiling:5000 };
  const queries: ProofQuery[] = [];
  const execute: ProofExecute = async q => { assertProofQuery(q);queries.push(q);if(q.kind==='fts-integrity'){target.prepare(q.sql).run();return [];}return target.prepare(q.sql).all() as ProofRow[]; };
  const ledgerSha256=createHash('sha256').update(JSON.stringify(target.prepare(LEDGER_SQL).all())).digest('hex');
  return {source,target,expected,queries,execute,ledgerSha256,close:()=>{source.close();target.close();}};
}
describe('complete fresh application corpus verification',()=>{
  it('compares complete cells and all FTS indexes without a custody carry-forward',async()=>{
    const f=fixture();try{const r=await proveCompleteCorpus(f.source,f.expected,f.execute,f.ledgerSha256);expect(r.tables).toEqual(f.expected.digests);expect(r.ftsIntegrity).toEqual(ALL_FTS);expect(f.queries.filter(q=>q.kind==='fts-integrity')).toHaveLength(4);}finally{f.close();}
  });
  it('normalizes owned FTS physical IDs after comparing every content cell',async()=>{
    const f=fixture();try{f.target.exec("DELETE FROM strongs_fts; INSERT INTO strongs_fts(rowid,strongs_number,lemma,transliteration,definition) VALUES(501,'H7225','beginning','beginning','first'),(900,'G25','agape','agape','love')");await expect(proveCompleteCorpus(f.source,f.expected,f.execute,f.ledgerSha256)).resolves.toBeDefined();}finally{f.close();}
  });
  for(const [name,sql] of [
    ['same-count cell corruption',"UPDATE document_sections SET content='changed' WHERE id=1"],
    ['extra base row',"INSERT INTO document_sections VALUES(2,1,'extra')"],
    ['extra owned FTS document',"INSERT INTO strongs_fts VALUES('G99','extra','extra','extra')"],
    ['unexpected schema',"CREATE TABLE unexpected(id INTEGER PRIMARY KEY)"],
    ['wrong ledger',"UPDATE d1_migrations SET name='different.sql'"],
  ])it('rejects '+name,async()=>{const f=fixture();try{f.target.exec(sql!);await expect(proveCompleteCorpus(f.source,f.expected,f.execute,f.ledgerSha256)).rejects.toThrow();}finally{f.close();}});
  for(const table of ALL_FTS.slice(1))for(const fault of ['missing','orphan','position'])it(`rejects ${table} ${fault} postings`,async()=>{
    const f=fixture();try{
      if(fault==='missing')f.target.exec(`INSERT INTO ${table}(${table},rowid,content) VALUES('delete',1,'one two three')`);
      if(fault==='orphan')f.target.exec(`INSERT INTO ${table}(rowid,content) VALUES(99,'orphan')`);
      if(fault==='position'){f.target.exec(`INSERT INTO ${table}(${table},rowid,content) VALUES('delete',1,'one two three')`);f.target.exec(`INSERT INTO ${table}(rowid,content) VALUES(1,'three two one')`);}
      await expect(proveCompleteCorpus(f.source,f.expected,f.execute,f.ledgerSha256)).rejects.toThrow();
    }finally{f.close();}
  });
  it('rejects a catalog change between the two observations',async()=>{
    const f=fixture();try{await expect(proveCompleteCorpus(f.source,f.expected,async q=>{if(q.label==='catalog-after')f.target.exec('CREATE INDEX changed ON documents(title)');return f.execute(q);},f.ledgerSha256)).rejects.toThrow('catalog changed');}finally{f.close();}
  });
  it('still rejects a comment-only change between the raw catalog observations',async()=>{
    const f=fixture();try{await expect(proveCompleteCorpus(f.source,f.expected,async q=>{
      const rows=await f.execute(q);
      return q.label==='catalog-after'?rows.map(r=>r.name==='documents'?{...r,sql:r.sql+'-- initial observation'}:r):rows;
    },f.ledgerSha256)).rejects.toThrow('catalog changed during proof');}finally{f.close();}
  });
  it('requires indexed, bounded keyset pages',()=>{const f=fixture();try{expect(()=>sourcePage(f.source,'documents',null,0)).toThrow();expect(()=>sourcePage(f.source,'documents;DROP TABLE documents',null)).toThrow();expect(sourcePage(f.source,'documents',null).expected).toHaveLength(1);}finally{f.close();}});
});
