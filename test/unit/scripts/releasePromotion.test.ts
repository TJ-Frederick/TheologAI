import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const cli = join(process.cwd(), 'scripts/release-promotion.mjs');
const roots: string[] = [];
const config = JSON.parse(readFileSync('release/serving.json', 'utf8'));
const resolver = createRequire(import.meta.url)('../../../.github/scripts/accepted-preview.cjs').resolvePreview;
afterEach(() => roots.splice(0).forEach(root => rmSync(root, {recursive: true, force: true})));

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'release-promotion-'));
  roots.push(root);
  const git = (...args: string[]) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], {cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe']}).trim();
  const write = (path: string, body: string) => {
    mkdirSync(dirname(join(root, path)), {recursive: true});
    writeFileSync(join(root, path), body);
  };
  const commit = (path: string, body: string) => {
    write(path, body);
    git('add', path);
    git('-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','--quiet','-m','fixture');
    return git('rev-parse','HEAD');
  };
  git('init','--quiet');
  const productionSource = commit('data/manifest.json', '{}');
  const record = structuredClone(config);
  record.productionSource = productionSource;
  record.predecessors.production = {...record.predecessors.production, ...record.targets.production};
  commit('release/serving.json',JSON.stringify(record));
  return {root, write, git, run, commit, record};
}

it('classifies the cumulative delta to the serving release through the actual CLI', () => {
  const f = repo();
  expect(f.run('classify')).toBe('docs');
  f.commit('src/formatters/bible.ts','export const value = 1;');
  expect(f.run('classify')).toBe('application');
  f.commit('data/manifest.json','{"source":2}');
  f.commit('README.md','A later documentation change');
  expect(f.run('classify')).toBe('corpus');
});

it('uses the last accepted release for a historical-search code fix and detects a changed binding', () => {
  const f = repo();
  const previous = f.commit('data/manifest.json','{"source":2}');
  const baseline = {productionSource:previous, targets:f.record.targets, requireVersionTag:true};
  f.write('previous.json',JSON.stringify(baseline));
  f.commit('src/services/historical/LocalPrimarySourceSearchProvider.ts','export const limit = 8;');
  f.commit('test/unit/services/historical/localSearch.test.ts','// Regression coverage');
  expect(f.run('classify','previous.json')).toBe('application');
  f.write('previous.json',JSON.stringify({...baseline,targets:{...baseline.targets,production:baseline.targets.preview}}));
  expect(() => f.run('classify','previous.json')).toThrow();
  f.write('previous.json',JSON.stringify(baseline));
  f.commit('release/serving.json',JSON.stringify({...f.record,targets:{...f.record.targets,production:{...f.record.targets.production,databaseId:'a'.repeat(8)+'-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}}}));
  expect(f.run('classify','previous.json')).toBe('corpus');
});

it('records and consumes a passing protected receipt, refusing a different tree, artifact, D1 or a failed probe', () => {
  const f = repo();
  const db = {binding:'THEOLOGAI_DB', ...config.targets.preview};
  const {deploymentId,versionId} = config.predecessors.preview;
  f.write('identity.json',JSON.stringify({schemaVersion:2,worker:'theologai-preview',deploymentId,deployedVersionId:versionId}));
  const cutover = {worker:'theologai-preview',candidateBindingMatches:true,observedActiveDeploymentId:deploymentId,
    observedActiveVersionId:versionId,candidateD1:db,observedActiveD1:db};
  f.write('cutover.json',JSON.stringify(cutover));
  const checks = ['2025-11-25','2026-07-28'].flatMap(era =>
    Array.from({length:185},(_,i)=>({era,id:'probe-'+i,passed:true})));
  const audit = {mode:'corpus',role:'preview',endpoint:'https://preview-mcp.theologai.xyz/mcp',passed:true,checks};
  f.write('audit.json', JSON.stringify(audit));
  const sha = 'a'.repeat(64);
  const record = (file: string) => f.run('record','corpus',sha,'audit.json',file,'identity.json','cutover.json');
  record('receipt.json');
  const tree = f.git('rev-parse','HEAD^{tree}');
  expect(JSON.parse(f.run('verify','corpus',sha,'receipt.json',tree)).databaseId).toBe(db.databaseId);
  expect(() => f.run('verify','corpus','b'.repeat(64),'receipt.json',tree)).toThrow();
  expect(() => f.run('verify','corpus',sha,'receipt.json','0'.repeat(40))).toThrow();
  f.write('cutover.json',JSON.stringify({...cutover,observedActiveD1:{...db,databaseId:config.targets.production.databaseId}}));
  expect(() => record('bad.json')).toThrow();
  f.write('cutover.json',JSON.stringify(cutover));
  for (const invalid of [
    {...audit, endpoint:'https://worker.test/mcp'},
    {...audit, checks:audit.checks.map(check=>({...check,era:'2025-11-25'}))},
    {...audit, checks:audit.checks.map(check=>({...check,id:'duplicate'}))},
  ]) {
    f.write('audit.json',JSON.stringify(invalid));
    expect(() => record('invalid.json')).toThrow();
  }
  audit.checks[222]!.passed = false;
  f.write('audit.json',JSON.stringify(audit));
  expect(() => record('failed.json')).toThrow();
});

it('rehearses each rollback with its actual database and rejects a mixed pair', () => {
  const f = repo();
  for (const [role, expected] of Object.entries(config.predecessors) as [string,Record<string,string>][]) {
    const anchor = {schemaVersion:3,worker:role === 'preview'?'theologai-preview':'theologai',
      predecessorDeploymentId:expected.deploymentId,predecessorVersionId:expected.versionId,
      predecessorD1:{binding:'THEOLOGAI_DB',databaseId:expected.databaseId}};
    f.write('anchor.json',JSON.stringify(anchor));
    const binding = {type:'d1',name:'THEOLOGAI_DB',id:expected.databaseId};
    const version = {id:expected.versionId,resources:{bindings:[binding]}};
    f.write('version.json',JSON.stringify(version));
    expect(JSON.parse(f.run('rollback-pair',role,'anchor.json','version.json')).databaseId).toBe(expected.databaseId);
    binding.id = 'c'.repeat(36);
    f.write('version.json',JSON.stringify(version));
    expect(() => f.run('rollback-pair',role,'anchor.json','version.json')).toThrow();
  }
});

it('accepts real post-merge metadata shape with an empty inline PR association and refuses a skipped preview', async () => {
  const now = Date.UTC(2026,10,20);
  const sha = 'b'.repeat(40), head = 'a'.repeat(40), tree = 'c'.repeat(40);
  const repo = {owner:'owner',repo:'repo'}, full_name = 'owner/repo';
  const context = {repo,sha,eventName:'workflow_dispatch',ref:'refs/heads/main'};
  const data = (value: unknown) => ({data:value});
  const job = {name:'Deploy Preview',head_sha:head,conclusion:'success'};
  const ownerReview = {state:'approved',user:{id:40179660},environments:[{name:'preview'}]};
  let reviews = [ownerReview];
  const github = {rest:{git:{getCommit:({commit_sha}: {commit_sha:string})=>
    data({sha:commit_sha,tree:{sha:tree},parents:[{sha:'e'.repeat(40)},{sha:head}]})},
    repos:{listPullRequestsAssociatedWithCommit:()=>data([{number:17,merged_at:new Date(now).toISOString(),merge_commit_sha:sha,
      base:{ref:'main'},head:{sha:head,repo:{full_name}}}])},
    actions:{getWorkflowRun:()=>data({id:13,repository:{full_name},head_repository:{full_name},pull_requests:[],head_sha:head,
      event:'pull_request',path:'.github/workflows/pr.yml',run_attempt:1,status:'completed',conclusion:'success',updated_at:new Date(now).toISOString()}),
      listJobsForWorkflowRun:()=>data({total_count:1,jobs:[job]}),
      getReviewsForRun:()=>data(reviews),
      listWorkflowRunArtifacts:()=>data({total_count:2,artifacts:['release-worker','accepted-preview'].map((prefix,i)=>({
        id:20+i,name:prefix+'-13',expired:false,expires_at:new Date(now+60000).toISOString(),digest:'sha256:'+'a'.repeat(64),workflow_run:{id:13,head_sha:head}}))})}}};
  expect(await resolver({github,context,runId:'13',now})).toMatchObject({workerArtifactId:20,receiptArtifactId:21,sourceTree:tree});
  for (const rejected of [[], [{...ownerReview, user:{id:17}}],
    [{...ownerReview, environments:[{name:'production'}]}],
    [ownerReview, {...ownerReview, state:'rejected'}]]) {
    reviews = rejected;
    await expect(resolver({github,context,runId:'13',now})).rejects.toThrow('recorded owner approval');
  }
  reviews = [ownerReview];
  job.conclusion='skipped';
  await expect(resolver({github,context,runId:'13',now})).rejects.toThrow('protected preview');
});

it('replays the protected Worker shell and blocks unsafe provider operations', () => {
  const output = execFileSync('python3', ['test/fixtures/release-workers/replay.py'], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  expect(output.match(/: PASS /g)).toHaveLength(13);
}, 125_000);

it('uses the newest approved production deployment and ignores validation-only runs', async () => {
  const {resolveProductionBaseline} = createRequire(import.meta.url)('../../../.github/scripts/production-baseline.cjs');
  const deployed = 'a'.repeat(40);
  const run = {
    id:21, repository:{full_name:'owner/repo'}, path:'.github/workflows/deploy.yml', head_branch:'main',
    head_sha:deployed, status:'completed', conclusion:'success', event:'workflow_dispatch', run_attempt:1,
  };
  const protectedJob = {name:'Test, Build & Deploy', conclusion:'success', head_sha:deployed,
    steps:[{name:'Record accepted production source and assignment',conclusion:'success'}]};
  const approved = [{state:'approved',user:{id:40179660},environments:[{name:'production'}]}];
  let jobs = [protectedJob];
  let history = [{...run,id:22},run];
  let reviews = approved;
  const github = {rest:{actions:{
    listWorkflowRuns: ({status}: {status:string}) => {
      expect(status).toBe('success');
      return {data:{total_count:history.length,workflow_runs:history}};
    },
    listJobsForWorkflowRun: ({run_id}: {run_id:number}) =>
      ({data:run_id === 22 ? {total_count:1,jobs:[{...protectedJob,conclusion:'skipped'}]} : {total_count:jobs.length,jobs}}),
    getReviewsForRun: () => ({data:reviews}),
  }}};
  const args = {github,context:{repo:{owner:'owner',repo:'repo'},runId:50},reviewed:config,
    readSource:(source:string) => {
      expect(source).toBe(deployed);
      return config;
    }};
  expect(await resolveProductionBaseline(args)).toEqual({
    productionSource:deployed,targets:config.targets,requireVersionTag:true,
  });

  reviews = [];
  await expect(resolveProductionBaseline(args)).rejects.toThrow('owner approval');
  reviews = approved;
  jobs = [{...protectedJob,steps:[]}];
  await expect(resolveProductionBaseline(args)).rejects.toThrow('exact reviewed rebaseline');

  history = [{...run,id:22}];
  expect(await resolveProductionBaseline(args)).toMatchObject({
    productionSource:config.productionSource,requireVersionTag:false,
  });
});
