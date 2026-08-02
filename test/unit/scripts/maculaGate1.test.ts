import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  MACULA_ALIGNMENT_CLASSIFICATIONS,
  MACULA_GATE1_CAPACITY_CEILING_BYTES,
  MACULA_GATE1_SCHEMA_PATH,
  MACULA_GATE1_SCHEMA_SHA256,
  MACULA_GATE1_TABLES,
  MACULA_GATE1_XML_MAX_BYTES,
  SEAL_TRIGGER_SQL,
  assessMaculaGate1Capacity,
  buildMaculaGate1SyntheticEvidence,
  canonicalCoordinateKey,
  classifyMaculaAlignment,
  deterministicMaculaId,
  insertSyntheticMaculaRows,
  parseMaculaGate1CliArgs,
  parseMaculaGate1Evidence,
  parseMaculaGate1Plan,
  parseSyntheticMaculaXml,
  proveMaculaSidecarSchema,
  publicParticipantAggregate,
  readMaculaGate1Plan,
  sealMaculaSidecar,
  syntheticWorkerdConfig,
  syntheticWorkerdEnvironment,
  validateMaculaBookAlignmentCoverage,
  validateMaculaContextTokenInvariant,
  validateMaculaGraph,
  validateSyntheticWorkerdArgv,
  validateSyntheticWorkerdConfig,
} from '../../../scripts/macula-gate1.js';

const root = resolve(new URL('../../../', import.meta.url).pathname);
const fixtures = join(root, 'test/fixtures/macula-gate1');
const hebrew = { corpus: 'hebrew' as const, book: 1, chapter: 1, verse: 1, orthographicWordOrdinal: 1 };
const greek = { corpus: 'greek' as const, book: 40, chapter: 1, verse: 1, orthographicWordOrdinal: 1 };
const planFixture = () => JSON.parse(readFileSync(join(root, 'data/biblical-languages/macula/GATE1-SYNTHETIC-PLAN.json'), 'utf8')) as Record<string, unknown>;

describe('MACULA Gate-1 replacement architecture', () => {
  it('pins a closed v2 plan, exact schema bytes, six tables, four target states, rights, and inertness', () => {
    const plan = readMaculaGate1Plan(root);
    expect(plan.schema).toEqual({ path: MACULA_GATE1_SCHEMA_PATH, sha256: MACULA_GATE1_SCHEMA_SHA256 });
    expect(plan.tables).toEqual(MACULA_GATE1_TABLES);
    expect(plan.participantTargetResolutions).toEqual(['exact_token', 'orthographic_word', null, 'dangling']);
    expect(plan.ambiguousRuntimeSegmentCountPolicy).toBe('null_until_one_runtime_candidate_is_selected');
    expect(plan.contextTokenInvariant).toBe('pre_seal_token_count_equals_source_segment_count_for_every_context');
    expect((plan.danglingParticipantPolicy as Record<string, unknown>).futureAuthoritativeTotals).toEqual({
      exact_token: 144_418, orthographic_word: 2_380, null: 6, dangling: 9,
      reproductionStatus: 'future_only_not_claimed_by_synthetic_evidence',
    });
    for (const mutate of [
      (value: Record<string, unknown>) => { value.unreviewed = true; },
      (value: Record<string, unknown>) => { (value.schema as Record<string, unknown>).sha256 = '0'.repeat(64); },
      (value: Record<string, unknown>) => { (value.tables as string[]).push('seventh_table'); },
      (value: Record<string, unknown>) => { (value.participantTargetResolutions as unknown[])[2] = 'null'; },
      (value: Record<string, unknown>) => { (value.inertness as Record<string, unknown>).network = 'allowed'; },
    ]) { const value = planFixture(); mutate(value); expect(() => parseMaculaGate1Plan(value)).toThrow('[macula-gate1]'); }
  });

  it('classifies orthographic contexts from real segment cardinality and never treats invalid inputs as segmentation conflicts', () => {
    expect(classifyMaculaAlignment({ ...hebrew, sourceSegments: ['אָ', 'ב'] }, [{ ...hebrew, runtimeSegments: ['אָ', 'ב'] }])).toEqual({ classification: 'validated_normalized_alignment', sourceSegmentCount: 2, runtimeSegmentCount: 2, runtimeCandidateCount: 1 });
    expect(classifyMaculaAlignment({ ...hebrew, sourceSegments: ['a'] }, [])).toMatchObject({ classification: 'missing_runtime' });
    expect(classifyMaculaAlignment({ ...hebrew, sourceSegments: ['a'] }, [{ ...hebrew, runtimeSegments: ['a'] }, { ...hebrew, runtimeSegments: ['a','b'] }])).toMatchObject({ classification: 'ambiguous_runtime', runtimeSegmentCount: null, runtimeCandidateCount: 2 });
    expect(classifyMaculaAlignment({ ...hebrew, sourceSegments: ['a', 'b'] }, [{ ...hebrew, runtimeSegments: ['ab'] }])).toMatchObject({ classification: 'segmentation_conflict', sourceSegmentCount: 2, runtimeSegmentCount: 1 });
    expect(classifyMaculaAlignment({ ...hebrew, sourceSegments: ['a'] }, [{ ...hebrew, runtimeSegments: ['b'] }])).toMatchObject({ classification: 'text_conflict' });
    expect(classifyMaculaAlignment(undefined, [{ ...greek, runtimeSegments: ['runtime'] }])).toEqual({ classification: 'runtime_only', sourceSegmentCount: 0, runtimeSegmentCount: 1, runtimeCandidateCount: 1 });
    expect(() => classifyMaculaAlignment({ ...hebrew, sourceSegments: [] }, [{ ...hebrew, runtimeSegments: ['a'] }])).toThrow('non-empty segments');
    expect(() => classifyMaculaAlignment({ ...hebrew, sourceSegments: ['a'] }, [{ ...hebrew, orthographicWordOrdinal: 2, runtimeSegments: ['a'] }])).toThrow('same canonical coordinate');
  });

  it('validates canonical coordinate safety and exact 39/27 corpus ownership across all 66 books', () => {
    expect(canonicalCoordinateKey(hebrew)).toBe('hebrew:01:001:001:001');
    expect(canonicalCoordinateKey(greek)).toBe('greek:40:001:001:001');
    expect(() => canonicalCoordinateKey({ ...hebrew, chapter: Number.MAX_SAFE_INTEGER + 1 })).toThrow('safe integer');
    expect(() => canonicalCoordinateKey({ ...hebrew, corpus: 'greek' })).toThrow('cross-corpus');
    const rows = Array.from({ length: 66 }, (_, index) => ({ book: index + 1, corpus: (index < 39 ? 'hebrew' : 'greek') as 'hebrew' | 'greek', classification: MACULA_ALIGNMENT_CLASSIFICATIONS[index % 6]! }));
    expect(validateMaculaBookAlignmentCoverage(rows).size).toBe(66);
    expect(() => validateMaculaBookAlignmentCoverage(rows.map((row, index) => index === 0 ? { ...row, corpus: 'greek' } : row))).toThrow('cross-corpus');
    expect(() => validateMaculaBookAlignmentCoverage([...rows.slice(0, 65), { ...rows[64]!, book: 65 }])).toThrow('duplicate');
  });

  it('streams reviewed synthetic fixtures with direct-parent grammar and coordinate counter ordinals', async () => {
    const parsedGreek = await parseSyntheticMaculaXml(join(fixtures, 'greek.synthetic.xml'), fixtures, 'greek');
    const parsedHebrew = await parseSyntheticMaculaXml(join(fixtures, 'hebrew.synthetic.xml'), fixtures, 'hebrew');
    expect(parsedGreek.tokens.map(token => [token.book, token.sourceMorphOrdinal])).toEqual([[40, 1], [40, 1]]);
    expect(parsedHebrew.tokens.map(token => token.lang)).toEqual(['H', 'A']);
    expect(parsedGreek.tokens[0]!.alignmentOnlyText.normalize('NFC')).toBe('λόγος');
    expect(parsedHebrew.participantReferences).toEqual([{ sourceTokenId: 'h-2', relationship: 'participantref', targetSourceId: 'missing-synthetic' }]);
  });

  it('fails closed on malformed coordinates, nested words, declarations, entities, invalid UTF-8, traversal, and symlinks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'macula-parser-'));
    try {
      const cases: Array<[string, string | Buffer]> = [
        ['unsafe.synthetic.xml', '<sentence><wg><w xml:id="x" ref="GEN 9007199254740992:1!1">x</w></wg></sentence>'],
        ['nested.synthetic.xml', '<sentence><wg><w xml:id="x" ref="GEN 1:1!1"><w xml:id="y" ref="GEN 1:1!2">y</w></w></wg></sentence>'],
        ['duplicate-decl.synthetic.xml', '<?xml version="1.0" encoding="UTF-8"?><?xml version="1.0" encoding="UTF-8"?><sentence/>'],
        ['bad-decl.synthetic.xml', '<?xml version="1.0"?><sentence/>'],
        ['space-after-decl-question.synthetic.xml', '<?xml version="1.0" encoding="UTF-8"? ><sentence/>'],
        ['space-after-open.synthetic.xml', '< sentence></sentence>'],
        ['space-before-close-marker.synthetic.xml', '<sentence>< /sentence>'],
        ['space-after-close-marker.synthetic.xml', '<sentence></ sentence>'],
        ['space-before-pi-marker.synthetic.xml', '< ?xml version="1.0" encoding="UTF-8"?><sentence/>'],
        ['space-after-pi-marker.synthetic.xml', '<? xml version="1.0" encoding="UTF-8"?><sentence/>'],
        ['space-after-empty-slash.synthetic.xml', '<sentence/ >'],
        ['dtd.synthetic.xml', '<!DOCTYPE sentence SYSTEM "https://example.invalid/x"><sentence/>'],
        ['entity.synthetic.xml', '<sentence><wg><w xml:id="x" ref="GEN 1:1!1">&amp;</w></wg></sentence>'],
        ['cdata-close-text.synthetic.xml', '<sentence><wg><w xml:id="x" ref="GEN 1:1!1">x]]>y</w></wg></sentence>'],
        ['attribute-angle.synthetic.xml', '<sentence><wg><w xml:id="x<y" ref="GEN 1:1!1">x</w></wg></sentence>'],
        ['bad-id.synthetic.xml', '<sentence><wg><w xml:id="bad:id" ref="GEN 1:1!1">x</w></wg></sentence>'],
        ['prohibited-char.synthetic.xml', Buffer.concat([Buffer.from('<sentence><wg><w xml:id="x" ref="GEN 1:1!1">'),Buffer.from([0]),Buffer.from('</w></wg></sentence>')])],
        ['invalid.synthetic.xml', Buffer.from([0x3c,0x73,0x65,0x6e,0x74,0x65,0x6e,0x63,0x65,0x3e,0xc3,0x28])],
      ];
      for (const [name, bytes] of cases) { const path = join(dir, name); writeFileSync(path, bytes); await expect(parseSyntheticMaculaXml(path, dir, 'hebrew'), name).rejects.toThrow(); }
      await expect(parseSyntheticMaculaXml(join(fixtures, 'hebrew.synthetic.xml'), dir, 'hebrew')).rejects.toThrow('escapes');
      const target = join(dir, 'target.synthetic.xml'); const link = join(dir, 'link.synthetic.xml'); writeFileSync(target, '<sentence/>'); symlinkSync(target, link);
      await expect(parseSyntheticMaculaXml(link, dir, 'hebrew')).rejects.toThrow('symlinks');
      const splitDelimiter=join(dir,'split-delimiter.synthetic.xml'); writeFileSync(splitDelimiter,`<sentence><wg><w xml:id="x" ref="GEN 1:1!1">${'x'.repeat(70_000)}]]>y</w></wg></sentence>`); await expect(parseSyntheticMaculaXml(splitDelimiter,dir,'hebrew')).rejects.toThrow('literal ]]>');
      const trailing=join(dir,'trailing.synthetic.xml'); writeFileSync(trailing,'<?xml version="1.0" encoding="UTF-8"?><sentence   ><wg   ><w xml:id="x" ref="GEN 1:1!1"   >x</w   ></wg   ></sentence   >'); await expect(parseSyntheticMaculaXml(trailing,dir,'hebrew')).resolves.toMatchObject({tokens:[{sourceTokenId:'x'}]});
      const trailingEmpty=join(dir,'trailing-empty.synthetic.xml'); writeFileSync(trailingEmpty,'<sentence   />'); await expect(parseSyntheticMaculaXml(trailingEmpty,dir,'hebrew')).resolves.toMatchObject({tokens:[]});
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('enforces the byte ceiling while streaming at the exact boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'macula-size-'));
    try {
      const prefix = '<?xml version="1.0" encoding="UTF-8"?><sentence><wg><w xml:id="x" ref="GEN 1:1!1">'; const suffix = '</w></wg></sentence>';
      const exact = `${prefix}${'x'.repeat(MACULA_GATE1_XML_MAX_BYTES - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))}${suffix}`;
      expect(Buffer.byteLength(exact)).toBe(MACULA_GATE1_XML_MAX_BYTES);
      writeFileSync(join(dir, 'exact.synthetic.xml'), exact); await expect(parseSyntheticMaculaXml(join(dir, 'exact.synthetic.xml'), dir, 'hebrew')).resolves.toMatchObject({ tokens: [{ sourceTokenId: 'x' }] });
      writeFileSync(join(dir, 'large.synthetic.xml'), `${exact}x`); await expect(parseSyntheticMaculaXml(join(dir, 'large.synthetic.xml'), dir, 'hebrew')).rejects.toThrow('byte ceiling');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('executes and introspects the exact schema, closed counts, four private states, public exclusion, graph checks, and sealing', () => {
    expect(proveMaculaSidecarSchema(root)).toEqual({ schemaSha256: MACULA_GATE1_SCHEMA_SHA256, counts: { source_file: 2, reference_context: 7, syntax_group: 3, token: 7, participant_ref: 4, group_reference: 7 }, publicResolvedRows: 2, contextTokenInvariantViolations:0, contextTokenNegativeProofDetected:true, sealedTriggerCount: 18 });
    const db = new Database(':memory:');
    try {
      db.exec(readFileSync(join(root, MACULA_GATE1_SCHEMA_PATH), 'utf8')); const ids = insertSyntheticMaculaRows(db); expect(validateMaculaGraph(db)).toEqual({ foreignKeyViolations: 0, parentCycles: 0, orphanGroups: 0, contextTokenViolations:0 }); expect(validateMaculaContextTokenInvariant(db)).toBe(0);
      expect(db.prepare("SELECT runtime_segment_count FROM reference_context WHERE alignment_classification='ambiguous_runtime'").get()).toEqual({runtime_segment_count:null}); expect(db.prepare("SELECT count(*) AS count FROM token t JOIN reference_context c ON c.reference_context_id=t.reference_context_id AND c.corpus=t.corpus WHERE c.alignment_classification='runtime_only'").get()).toEqual({count:0});
      expect(db.prepare("SELECT coalesce(target_resolution,'null') AS state,count(*) AS count FROM participant_ref GROUP BY target_resolution ORDER BY state").all()).toEqual([{state:'dangling',count:1},{state:'exact_token',count:1},{state:'null',count:1},{state:'orthographic_word',count:1}]);
      expect(db.prepare('SELECT target_resolution FROM public_resolved_participant_ref ORDER BY target_resolution').all()).toEqual([{target_resolution:'exact_token'},{target_resolution:'orthographic_word'}]);
      expect(() => db.prepare('UPDATE syntax_group SET parent_syntax_group_id=? WHERE syntax_group_id=?').run(ids.groups[1], ids.groups[0])).not.toThrow(); expect(() => validateMaculaGraph(db)).toThrow('parent cycle'); db.prepare('UPDATE syntax_group SET parent_syntax_group_id=NULL WHERE syntax_group_id=?').run(ids.groups[0]);
      sealMaculaSidecar(db); expect((db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type='trigger'").get() as {count:number}).count).toBe(18); expect(SEAL_TRIGGER_SQL).toContain('seal_group_reference_delete');
      expect(() => db.prepare('DELETE FROM token').run()).toThrow(/readonly|sealed/i); db.pragma('query_only = OFF'); expect(() => db.prepare('DELETE FROM token').run()).toThrow('macula sidecar sealed');
    } finally { db.close(); }
  });

  it('uses deterministic SQL-enforced ID shapes for every row builder', () => {
    for (const table of MACULA_GATE1_TABLES) expect(deterministicMaculaId(table, ['synthetic'])).toMatch(/^[a-z]{2}:[0-9a-f]{32}$/);
    expect(deterministicMaculaId('token',['a','b'])).not.toBe(deterministicMaculaId('token',['a\0b']));
    const db = new Database(':memory:'); try { db.exec(readFileSync(join(root, MACULA_GATE1_SCHEMA_PATH), 'utf8')); expect(() => db.prepare("INSERT INTO source_file VALUES ('bad','hebrew','x','"+'0'.repeat(64)+"',1)").run()).toThrow(); expect(() => db.prepare('INSERT INTO source_file VALUES (?,?,?,?,?)').run(`sf:${'z'.repeat(32)}`,'hebrew','z','0'.repeat(64),1)).toThrow(); } finally { db.close(); }
  });

  it('validates exact Workerd config, ordered argv, real paths, and a minimal non-inherited environment', () => {
    const op = mkdtempSync(join(tmpdir(), 'macula-workerd-'));
    try {
      for (const dir of ['state','home','xdg','tmp']) mkdirSync(join(op,dir)); for (const file of ['worker.mjs','wrangler.toml','schema.sql']) writeFileSync(join(op,file), file === 'wrangler.toml' ? syntheticWorkerdConfig(op) : 'x');
      const config = readFileSync(join(op,'wrangler.toml'),'utf8'); expect(() => validateSyntheticWorkerdConfig(config,op)).not.toThrow(); expect(() => validateSyntheticWorkerdConfig(`${config}\n[[d1_databases]]`,op)).toThrow('single-binding');
      const argv = ['d1','execute','MACULA_SYNTHETIC_DB','--local','--persist-to',join(op,'state'),'--config',join(op,'wrangler.toml'),'--file',join(op,'schema.sql'),'--json']; expect(() => validateSyntheticWorkerdArgv(argv,op)).not.toThrow();
      for (const bad of [[...argv,'--remote'],argv.filter(value=>value!=='--json'),argv.map(value=>value==='--local'?'--remote=true':value),[...argv.slice(0,-1),'--env','preview','--json']]) expect(() => validateSyntheticWorkerdArgv(bad,op)).toThrow('exact ordered');
      expect(syntheticWorkerdEnvironment(op)).toEqual({HOME:join(op,'home'),XDG_CONFIG_HOME:join(op,'xdg'),TMPDIR:join(op,'tmp'),WRANGLER_LOG_PATH:join(op,'wrangler.log'),WRANGLER_SEND_METRICS:'false',NO_COLOR:'1'});
      expect(syntheticWorkerdEnvironment(op)).not.toHaveProperty('NODE_OPTIONS'); expect(syntheticWorkerdEnvironment(op)).not.toHaveProperty('HTTPS_PROXY');
    } finally { rmSync(op,{recursive:true,force:true}); }
  });

  it('builds closed evidence bound to schema proof without claiming authoritative reproduction', async () => {
    const evidence = await buildMaculaGate1SyntheticEvidence(root); expect(evidence).toMatchObject({schemaVersion:'theologai-macula-gate1-synthetic-evidence.v2',schemaProof:{schemaSha256:MACULA_GATE1_SCHEMA_SHA256},alignment:{canonicalBooks:66,hebrewBooks:39,greekBooks:27},workerd:{status:'not_run'},inertness:{historicalAuditOpened:false,corpusAcquired:false,runtimeActivated:false,releaseEligible:false}});
    expect(JSON.stringify(evidence)).not.toMatch(/144418|2380|sourceTokenId|targetSourceId|alignmentOnlyText/); expect(publicParticipantAggregate()).toEqual({counts:[{relationship:'participantref',count:4},{relationship:'subjref',count:5}],releaseEligible:false});
    const workerd={status:'synthetic_local_workerd_proof_passed',schemaSha256:MACULA_GATE1_SCHEMA_SHA256,tableCounts:{source_file:2,reference_context:7,syntax_group:3,token:7,participant_ref:4,group_reference:7},alignmentClassCount:6,validatedContextRows:2,privateParticipantStateCount:4,publicResolvedRows:2,runtimeOnlyContextWithoutSourceToken:true,contextTokenInvariantNegativeDetected:true,contextTokenInvariantFinalViolations:0,crossSourceFailure:true,postSealMutationFailure:true,rowsRead:null,rowsReadObservation:'not_reported_by_local_wrangler_d1_meta',observedMetadataKeys:['duration']};
    const contradiction=structuredClone(evidence); contradiction.workerd={...workerd,rowsReadObservation:'reported_by_local_wrangler_d1_meta'}; expect(()=>parseMaculaGate1Evidence(contradiction)).toThrow('contradicts');
    const negative=structuredClone(evidence); negative.workerd={...workerd,rowsRead:-1,rowsReadObservation:'reported_by_local_wrangler_d1_meta'}; expect(()=>parseMaculaGate1Evidence(negative)).toThrow('nonnegative safe integer');
    const metadata=structuredClone(evidence); metadata.workerd={...workerd,observedMetadataKeys:['z','a','a']}; expect(()=>parseMaculaGate1Evidence(metadata)).toThrow('sorted, and unique');
  });

  it('keeps the planning ceiling, CLI, and every canonical surface inert', () => {
    expect(assessMaculaGate1Capacity(MACULA_GATE1_CAPACITY_CEILING_BYTES).pass).toBe(true); expect(()=>assessMaculaGate1Capacity(MACULA_GATE1_CAPACITY_CEILING_BYTES+1)).toThrow('not a Cloudflare limit'); expect(parseMaculaGate1CliArgs([])).toEqual({workerd:false}); expect(parseMaculaGate1CliArgs(['--workerd'])).toEqual({workerd:true}); expect(()=>parseMaculaGate1CliArgs(['--remote'])).toThrow('usage:');
    for(const path of ['src/index.ts','src/worker.ts','src/server.ts','src/worker-server.ts','src/mcp/tools.ts','src/tools/v2/index.ts','src/tools/worker/index.ts','data/data-manifest.json','wrangler.toml']){const text=readFileSync(join(root,path),'utf8');expect(text,path).not.toMatch(/macula-gate1|GATE1-SYNTHETIC-PLAN/i);}
    expect(MACULA_GATE1_TABLES).toHaveLength(6); expect(readFileSync(join(root,MACULA_GATE1_SCHEMA_PATH),'utf8')).not.toMatch(/CREATE TABLE (?!source_file|reference_context|syntax_group|token|participant_ref|group_reference)/);
  });
});
