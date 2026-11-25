import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { hostedCorpusCheckIds, hostedCorpusProfile } from '../../../scripts/hosted-corpus-profile.mjs';

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
  const commit = (paths: string | readonly string[], body: string) => {
    const files = typeof paths === 'string' ? [paths] : paths;
    for (const path of files) write(path, body);
    git('add', '--', ...files);
    git('-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','--quiet','-m','fixture');
    return git('rev-parse','HEAD');
  };
  git('init','--quiet');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@localhost');
  const productionSource = commit('data/manifest.json', '{}');
  const record = structuredClone(config);
  record.productionSource = productionSource;
  record.predecessors.production = {...record.predecessors.production, ...record.targets.production};
  commit('release/serving.json',JSON.stringify(record));
  const mergeCandidate = (base: string, paths: string | readonly string[], contents: string, branchPoint = base) => {
    git('checkout', '--quiet', '--detach', branchPoint);
    const head = commit(paths, contents);
    git('checkout', '--quiet', '--detach', base);
    git('merge', '--quiet', '--no-ff', '-m', 'Synthetic PR merge', head);
    return {base, head, merge: git('rev-parse', 'HEAD')};
  };
  const classifyCandidate = (
    {base, head, merge}: {base: string; head: string; merge: string},
    baseline: {productionSource: string; targets: unknown},
  ) => {
    write('baseline.json', JSON.stringify(baseline));
    write('pr-output', '');
    const result = spawnSync(process.execPath, [cli, 'classify-pr', 'baseline.json'], {
      cwd: root, encoding: 'utf8', env: {...process.env,
        CI_EXPECTED_HEAD: merge, CI_PR_BASE: base, CI_PR_HEAD: head, GITHUB_OUTPUT: join(root, 'pr-output')},
    });
    return {...result, outputs: readFileSync(join(root, 'pr-output'), 'utf8')};
  };
  return {root, write, git, run, commit, record, mergeCandidate, classifyCandidate};
}

const exactMorphologyPaths = [
  'src/adapters/shared/morphologyExpansion.ts',
  'src/kernel/repositories.ts',
  'test/fixtures/expandedMorphology.ts',
  'test/fixtures/mcpCompositionRoot.ts',
] as const;
const exactCachePath = 'src/adapters/shared/HttpClient.ts';
const narrowRuntimePaths = [...exactMorphologyPaths, exactCachePath];
const morphologyPaths = [
  ...exactMorphologyPaths,
  'src/adapters/d1/D1MorphologyRepository.ts',
  'src/adapters/data/MorphologyRepository.ts',
  'src/services/languages/MorphologyService.ts',
  'test/test-topology.json',
  'test/unit/adapters/data/MorphologyRepository.test.ts',
  'test/unit/adapters/repositoryParity.test.ts',
  'test/unit/services/async-compat/asyncParity.test.ts',
  'test/unit/services/languages/MorphologyService.test.ts',
  'test/unit/services/languages/OriginalLanguageStudyService.test.ts',
  'test/unit/services/languages/StrongsUsageService.test.ts',
  'test/worker-runtime/workerMcp.test.ts',
];
const cachePaths = [
  exactCachePath,
  'src/adapters/bible/EsvAdapter.ts',
  'src/adapters/bible/HelloAoAdapter.ts',
  'src/adapters/bible/NetBibleAdapter.ts',
  'src/adapters/commentary/HelloAoCommentaryAdapter.ts',
  'test/unit/adapters/bible/EsvAdapter.test.ts',
  'test/unit/adapters/bible/HelloAoAdapter.test.ts',
  'test/unit/adapters/bible/NetBibleAdapter.test.ts',
  'test/unit/adapters/commentary/HelloAoCommentaryAdapter.test.ts',
  'test/unit/adapters/shared/HttpClient.test.ts',
];

it.each(narrowRuntimePaths)('classifies the exact runtime path %s on its own as application', path => {
  const f = repo();
  f.commit(path, 'runtime change');
  expect(f.run('classify')).toBe('application');
});

it.each([
  ['expanded morphology', morphologyPaths],
  ['provider cache', cachePaths],
  ['expanded morphology and provider cache', [...morphologyPaths, ...cachePaths]],
] as const)('classifies %s as application while ordinary PR CI still selects full validation', (_slice, paths) => {
  const f = repo();
  const pr = f.mergeCandidate(f.git('rev-parse', 'HEAD'), paths, 'runtime changes');
  const release = f.classifyCandidate(pr, {productionSource: f.record.productionSource, targets: f.record.predecessors});
  expect(release.status, release.stderr).toBe(0);
  expect(release.outputs).toContain('mode=application\n');

  const ci = spawnSync(process.execPath, [join(process.cwd(), 'scripts/classify-ci-changes.mjs')], {
    cwd: f.root, encoding: 'utf8', env: {...process.env,
      CI_EVENT_NAME: 'pull_request', CI_EXPECTED_HEAD: pr.merge, CI_PR_HEAD: pr.head, CI_FORCE_FULL: 'false',
      GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: ''},
  });
  expect(ci.status, ci.stderr).toBe(0);
  expect(JSON.parse(ci.stdout)).toEqual({
    mode: 'full', data: true, serving: true, reason: 'corpus-delivery-or-unclassified-path',
  });
});

it.each([
  'data/data-manifest.json',
  'data/biblical-languages/stepbible-lexicons/tbesh-hebrew.txt',
  'src/databases/strongs-schema.sql',
  'migrations/0001_initial_schema.sql',
  'scripts/build-database.ts',
  'scripts/prepare-production-d1-candidate.ts',
  'src/kernel/books.ts',
  'src/adapters/shared/morphologyExpansionHelper.ts',
  'test/fixtures/anotherFixture.ts',
])('preserves corpus classification when runtime changes include %s', path => {
  const f = repo();
  f.commit([...narrowRuntimePaths, path], 'mixed changes');
  expect(f.run('classify')).toBe('corpus');
});

const unknownRenamePath = 'src/adapters/shared/OtherClient.ts';
it.each([
  [exactCachePath, unknownRenamePath],
  [unknownRenamePath, exactCachePath],
])('treats the rename %s to %s as corpus when either endpoint is unclassified', (from, to) => {
  const f = repo();
  const accepted = f.commit(from, 'same content on both sides of rename');
  f.write('accepted.json', JSON.stringify({productionSource: accepted, targets: f.record.targets}));
  f.git('mv', from, to);
  f.git('commit', '--quiet', '-m', 'rename fixture');
  expect(f.git('diff', '--name-status', '--find-renames', accepted, 'HEAD')).toBe(`R100\t${from}\t${to}`);
  expect(f.run('classify', 'accepted.json')).toBe('corpus');
});

it.each([
  ['production', 'databaseId', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
  ['preview', 'databaseName', 'different-preview-database'],
])('keeps a %s %s change on the corpus route alongside runtime changes', (role, field, value) => {
  const f = repo();
  f.commit(narrowRuntimePaths, 'runtime changes');
  expect(f.run('classify')).toBe('application');
  f.record.targets[role][field] = value;
  f.commit('release/serving.json', JSON.stringify(f.record));
  expect(f.run('classify')).toBe('corpus');
});

it('classifies the cumulative delta to the serving release through the actual CLI', () => {
  const f = repo();
  expect(f.run('classify')).toBe('docs');
  for (const path of [
    '.github/scripts/production-baseline.cjs',
    'scripts/release-promotion.mjs',
    'test/fixtures/release-workers/replay.py',
    'test/unit/scripts/releasePromotion.test.ts',
    'docs/CURRENT-RELEASE.md',
  ]) f.commit(path, 'reviewed production bookkeeping');
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

it.each([
  ['README.md', '.github/workflows/pr.yml', 'docs'],
  ['data/manifest.json', 'README.md', 'corpus'],
  ['src/formatters/bible.ts', 'README.md', 'application'],
])('classifies pending %s plus a PR changing %s as %s', (pendingPath, prPath, expected) => {
  const f = repo();
  const pending = f.commit(pendingPath, 'pending');
  const pr = f.mergeCandidate(pending, prPath, 'PR change');
  const result = f.classifyCandidate(pr, {productionSource: f.record.productionSource, targets: f.record.predecessors});
  const tree = f.git('rev-parse', `${pr.merge}^{tree}`);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({mode: expected, tree, sameTree: true});
  expect(result.outputs).toBe(`mode=${expected}\ntested_tree=${tree}\nsame_tree=true\n`);
});

it('reclassifies after production advances and emits no decision for an unavailable baseline or wrong merge parents', () => {
  const f = repo();
  const pendingCorpus = f.commit('data/manifest.json', '{"corpus":"pending"}');
  const pr = f.mergeCandidate(pendingCorpus, 'README.md', 'PR docs');
  const reviewed = {productionSource: f.record.productionSource, targets: f.record.predecessors};
  const advanced = {productionSource: pendingCorpus, targets: f.record.targets};
  expect(f.classifyCandidate(pr, reviewed).outputs).toContain('mode=corpus\n');
  expect(f.classifyCandidate(pr, advanced).outputs).toContain('mode=docs\n');
  for (const result of [
    f.classifyCandidate(pr, {...advanced, productionSource: '0'.repeat(40)}),
    f.classifyCandidate({...pr, base: f.record.productionSource}, reviewed),
    f.classifyCandidate({...pr, head: pr.base}, reviewed),
    f.classifyCandidate({...pr, merge: pr.head}, reviewed),
  ]) {
    expect(result.status).not.toBe(0);
    expect(result.outputs).toBe('');
  }
});

it('reports separate PR-head and tested trees when the pinned base adds a change absent from the head', () => {
  const f = repo();
  const branchPoint = f.git('rev-parse', 'HEAD');
  const base = f.commit('README.md', 'base change');
  const pr = f.mergeCandidate(base, 'src/formatters/bible.ts', 'application change', branchPoint);
  const result = f.classifyCandidate(pr, {productionSource: f.record.productionSource, targets: f.record.predecessors});
  expect(result.status, result.stderr).toBe(0);
  expect(result.outputs).toContain('mode=application\n');
  expect(result.outputs).toContain('same_tree=false\n');
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
  expect(() => f.run('verify','application',sha,'receipt.json',tree)).toThrow();
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

  const focused = { ...audit, profile: hostedCorpusProfile, checks: ['2025-11-25', '2026-07-28']
    .flatMap(era => hostedCorpusCheckIds.map(id => ({ era, id, passed: true }))) };
  f.write('audit.json', JSON.stringify(focused));
  record('focused.json');
  expect(JSON.parse(f.run('verify','corpus',sha,'focused.json',tree))).toMatchObject({
    checks:24, corpusProfile:hostedCorpusProfile,
  });
  focused.checks[0]!.id = 'unexpected-check';
  f.write('audit.json', JSON.stringify(focused));
  expect(() => record('missing-focused-probe.json')).toThrow();
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

// Each matrix retains the same per-phase checks and has its own bounded CI runner window.
it.each([['cutover', 11], ['baseline', 10]] as const)('replays protected Worker %s decisions', (group, cases) => {
  const output = execFileSync('python3', ['test/fixtures/release-workers/replay.py', '--group', group], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  expect(output.match(/: PASS /g)).toHaveLength(cases);
}, 125_000);

it('uses the newest approved production deployment and ignores validation-only runs', async () => {
  const {resolveProductionBaseline} = createRequire(import.meta.url)('../../../.github/scripts/production-baseline.cjs');
  const deployed = '94352f2a2c65b11c5756a69a3f7b0318ef8c8230';
  const sourceTree = 'e1315f775601b9404e95a2ced6de89ed5f034fc5';
  const productionAssignment = {
    deploymentId:'bbc8d4b1-a8bc-4af9-8adf-cf4e07669afb',
    versionId:'3a74b8d2-03aa-4667-bffa-f18be5c850af',
    ...config.targets.production,
  };
  const receipt = {productionSource:deployed, sourceTree, ...productionAssignment};
  const run = {
    id:45488723004, repository:{full_name:'owner/repo'}, path:'.github/workflows/deploy.yml', head_branch:'main',
    head_sha:deployed, status:'completed', conclusion:'success', event:'workflow_dispatch', run_attempt:1,
    run_number:config.productionRunNumber + 1,
  };
  const older = {...run, id:41645812927, run_number:141, run_attempt:2,
    head_sha:'701ab6295f033105ec306f7878a85e294cba0f6d'};
  const reviewedCutover = {...run, id:45324148171, run_number:config.productionRunNumber, head_sha:config.productionSource};
  const validation = {...run, id:22, run_number:run.run_number + 1};
  const docs = {...run, id:23, run_number:run.run_number + 2};
  const upload = {name:'Retain sanitized release evidence',conclusion:'success'};
  const protectedJob = {name:'Test, Build & Deploy', conclusion:'success', head_sha:deployed,
    steps:[{name:'Record accepted production source and assignment',conclusion:'success'},upload]};
  const approved = [{state:'approved',user:{id:40179660},environments:[{name:'production'}]}];
  const now = Date.parse('2026-11-24T19:00:00Z');
  const member = 'release-evidence/accepted-production.json';
  function zip(members: Array<[string, string]>): Buffer {
    return execFileSync('python3', ['-c', `
import io, json, sys, warnings, zipfile
warnings.filterwarnings('ignore', category=UserWarning)
out = io.BytesIO()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, value in json.load(sys.stdin):
        archive.writestr(name, value)
sys.stdout.buffer.write(out.getvalue())
`], {input:JSON.stringify(members)});
  }
  const archiveFor = (value = receipt) => zip([
    ['release-evidence/production-final-routing.json', '{}'],
    ['operator-corpus-challenge.json.admission.jsonl', '{}\n'],
    [member, JSON.stringify(value)],
  ]);
  const artifactFor = (bytes: Buffer) => ({
    id:100, name:`production-release-evidence-${run.id}`, expired:false, expires_at:'2026-12-24T19:00:00Z',
    workflow_run:{id:run.id,head_sha:deployed},
    size_in_bytes:bytes.length, digest:'sha256:' + createHash('sha256').update(bytes).digest('hex'),
  });
  let archive = archiveFor();
  let artifacts = [artifactFor(archive)];
  let jobs = [protectedJob];
  let history = [docs, validation, reviewedCutover, older];
  let reviews = approved;
  const github = {rest:{actions:{
    listWorkflowRuns: ({status}: {status:string}) => {
      expect(status).toBe('success');
      return {data:{total_count:history.length,workflow_runs:history}};
    },
    listJobsForWorkflowRun: ({run_id}: {run_id:number}) => {
      const roster = run_id === docs.id ? [] : run_id === validation.id
        ? [{...protectedJob,conclusion:'skipped'}] : jobs;
      expect([docs.id, validation.id, run.id]).toContain(run_id);
      return {data:{total_count:roster.length,jobs:roster}};
    },
    getReviewsForRun: () => ({data:reviews}),
    listWorkflowRunArtifacts: ({run_id}: {run_id:number}) => {
      expect(run_id).toBe(run.id);
      return {data:{artifacts,total_count:artifacts.length}};
    },
    downloadArtifact: ({artifact_id,archive_format}: {artifact_id:number;archive_format:string}) => {
      expect(artifact_id).toBe(100);
      expect(archive_format).toBe('zip');
      return {data:archive};
    },
  }}};
  const args = {github,context:{repo:{owner:'owner',repo:'repo'},runId:50},reviewed:config,now,
    readTree:(source:string) => {
      expect(source).toBe(deployed);
      return sourceTree;
    },
    readSource:(source:string) => {
      expect(source).toBe(deployed);
      return config;
    }};
  const reviewedBaseline = {
    productionSource:config.productionSource,targets:config.targets,requireVersionTag:false,
    productionAssignment:config.predecessors.production,
  };
  expect(await resolveProductionBaseline(args)).toEqual(reviewedBaseline);
  // The failed cutover is normally absent from the success-filtered response.
  history = [docs, validation, older];
  expect(await resolveProductionBaseline(args)).toEqual(reviewedBaseline);

  history = [older, validation, run, docs];
  expect(await resolveProductionBaseline(args)).toEqual({
    productionSource:deployed,targets:config.targets,requireVersionTag:true,sourceTree,productionAssignment,
    artifactProvenance:{runId:run.id,artifactId:100,digest:artifacts[0].digest},
  });

  reviews = [];
  await expect(resolveProductionBaseline(args)).rejects.toThrow('owner approval');
  reviews = approved;
  jobs = [{...protectedJob,steps:[]}];
  await expect(resolveProductionBaseline(args)).rejects.toThrow('exact reviewed rebaseline');

  jobs = [{...protectedJob,steps:[protectedJob.steps[0],{...upload,conclusion:'failure'}]}];
  await expect(resolveProductionBaseline(args)).rejects.toThrow(/45488723004.*upload did not succeed/);
  jobs = [protectedJob];
  artifacts = [];
  await expect(resolveProductionBaseline(args)).rejects.toThrow(/45488723004.*Missing or ambiguous native/);
  const good = artifactFor(archive);
  for (const [bad, error] of [
    [{...good, expired:true}, /45488723004.*expired/],
    [{...good, expires_at:'2026-11-24T19:00:00Z'}, /45488723004.*expired/],
    [{...good, workflow_run:{...good.workflow_run,id:21}}, /45488723004.*unrelated/],
    [{...good, workflow_run:{...good.workflow_run,head_sha:'2'.repeat(40)}}, /45488723004.*unrelated/],
    [{...good, size_in_bytes:32 * 1024 * 1024}, /45488723004.*size is out of bounds/],
  ] as const) {
    artifacts = [bad];
    await expect(resolveProductionBaseline(args)).rejects.toThrow(error);
  }
  artifacts = [good, {...good,id:101}];
  await expect(resolveProductionBaseline(args)).rejects.toThrow(/45488723004.*Missing or ambiguous native/);
  artifacts = [{...good,digest:'sha256:'+'0'.repeat(64)}];
  await expect(resolveProductionBaseline(args)).rejects.toThrow(/45488723004.*digest/);

  for (const path of [member, 'accepted-production.json', 'other/accepted-production.json']) {
    archive = zip([[member,JSON.stringify(receipt)],[path,JSON.stringify(receipt)]]);
    artifacts = [artifactFor(archive)];
    await expect(resolveProductionBaseline(args)).rejects.toThrow(/45488723004.*ambiguous accepted-production.json/);
  }
  archive = zip([['accepted-production.json',JSON.stringify(receipt)]]);
  artifacts = [artifactFor(archive)];
  await expect(resolveProductionBaseline(args)).rejects.toThrow(/45488723004.*ambiguous accepted-production.json/);

  for (const [patch, message] of [
    [{productionSource:'0'.repeat(40)}, 'source or tree'],
    [{sourceTree:'0'.repeat(40)}, 'source or tree'],
    [{databaseId:config.targets.preview.databaseId}, 'D1 identity'],
    [{databaseName:config.targets.preview.databaseName}, 'D1 identity'],
    [{deploymentId:'invalid'}, 'Worker or deployment'],
    [{versionId:'invalid'}, 'Worker or deployment'],
  ] as const) {
    archive = archiveFor({...receipt,...patch});
    artifacts = [artifactFor(archive)];
    await expect(resolveProductionBaseline(args)).rejects.toThrow(message);
  }

  const rebaseline = {
    ...config, productionSource:deployed, productionRunNumber:run.run_number,
    predecessors:{...config.predecessors,production:productionAssignment},
  };
  artifacts = [];
  expect(await resolveProductionBaseline({...args,reviewed:rebaseline})).toEqual({
    ...reviewedBaseline, productionSource:deployed, productionAssignment,
  });

  history = [docs, validation];
  expect(await resolveProductionBaseline(args)).toEqual(reviewedBaseline);
});
