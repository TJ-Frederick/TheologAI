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
const languageDepthPaths = [
  'src/kernel/originalLanguageStudyV3Contract.ts',
  'src/kernel/repositories.ts',
  'src/kernel/types.ts',
  'src/services/languages/OriginalLanguageStudyV3Coordinator.ts',
  'src/adapters/d1/D1MorphologyRepository.ts',
  'src/adapters/data/MorphologyRepository.ts',
  'skills/passage-exegesis/SKILL.md',
  'skills/word-study/SKILL.md',
  'scripts/audit-corpus-release.ts',
  'scripts/original-language-study-release.ts',
  'test/fixtures/original-language-study-v3-release.json',
  'test/helpers/mcpTransportContract.ts',
] as const;
const nodeE2eEntries = [
  ['package.json', '1a931cc4d60bd88d3968388bbfcb90fd08dc0ab6', '5471d433642480d3bbb02f78028d37489ff01e77'],
  ['scripts/node-e2e-fixture.ts', null, 'c0555b9e5f378d6c3c3e0e2419cf17125ffe21f9'],
  ['scripts/test-node-http-e2e.ts', '09fd645ca578c25a22d7e9eba38ce3a7684906ed', 'a6ac7eab37c659a8fdfd6bac9e041debc886e061'],
  ['scripts/test-node-stdio-e2e.ts', 'b824299c4ff760091df61f3773cdb29a1f642b82', '0dd9542494d7c405264c9cebb67204405b06f6e5'],
  ['test/unit/scripts/nodeE2eFixture.test.ts', null, '4b4957ce01ef2784fda529dafef4a833bb631efa'],
] as const;

const corpusPreparationEntries = [
  ['scripts/atomic-publication.ts', '2dd1781bad7806b62c3aa7f9a86b8c02f1ac94da', '9c1f6f82084f0edca35bd717a02a4849e984652c'],
  ['scripts/export-for-d1.ts', '7ee672c6e568795e6237e7a8ea372f28ee6c9aa1', '9444efe472cf3f183ad77af9e4274724920a8501'],
  ['scripts/norton-aquinas-preparation.ts', '5297bdd3cd7c7142c739f78b81eaba5c24c7d875', 'd2bfd0eae7073524e7d0f799cd17884c73586a5a'],
  ['scripts/sqlite-corpus-markers.ts', null, 'f0df49dd3da1f21a5f6dd4af012966f1eb3dbe29'],
  ['scripts/verify-database.ts', 'c3a0b142f1688e5c496f900286b27bc416387c9c', '0d6b30e3a09bb3329e7dc865b77441a3054fe83a'],
  ['test/unit/scripts/d1SeedManifest.test.ts', '69f68ffbb516d38003e23d209eead23412af050e', '41f07a28192fc07542c35e49546f4939880ecaf1'],
  ['test/unit/scripts/languageBuildInfrastructure.test.ts', '6eef2b680c449967eb221c270e25cc4841b4f2ec', '5c4b1e0190a70bb463760cd6885a9e4e853747cc'],
  ['test/unit/scripts/nortonAquinasPreparation.test.ts', '2126b796ed3ad721c447315c1c0e9c2de6c684e6', 'f076d97107ef6c9d4ce735bb4633beee5f62e2ed'],
  ['test/unit/scripts/transform12FtsCorruption.test.ts', '07578fcbc2aeec852ffe134e5ced84c2a96d70cd', 'caf6c822ef0ca6c01b512fbc262f640e42a295b6'],
] as const;

function reviewedTransition(
  f: ReturnType<typeof repo>,
  entries: ReadonlyArray<readonly [string, string | null, string]>,
  {additionalPath, additionalContents = 'additional change', changedBefore, changedAfter, executable, omitted}: {
    additionalPath?: string;
    additionalContents?: string;
    changedBefore?: string;
    changedAfter?: string;
    executable?: string;
    omitted?: string;
  } = {},
) {
  // Classification uses commit tree entries. Supply those directly so this test
  // works without the historical harness files or a full checkout's history.
  const entry = (path: string, blob: string, mode = '100644') =>
    f.git('update-index', '--add', '--info-only', '--cacheinfo', mode, blob, path);
  const commitTree = (parent: string, ...additionalParents: string[]) => {
    const tree = f.git('write-tree', '--missing-ok');
    return f.git('commit-tree', tree, '-p', parent, ...additionalParents.flatMap(sha => ['-p', sha]), '-m', 'Reviewed transition fixture');
  };
  for (const [path, before] of entries) {
    if (before) entry(path, path === changedBefore ? 'a'.repeat(40) : before);
  }
  const base = commitTree(f.git('rev-parse', 'HEAD'));
  for (const [path, , after] of entries) {
    if (path === changedAfter) {
      f.write(path, 'unreviewed change');
      f.git('add', '--', path);
    } else if (path !== omitted) {
      entry(path, after, path === executable ? '100755' : '100644');
    }
  }
  if (additionalPath) {
    f.write(additionalPath, additionalContents);
    f.git('add', '--', additionalPath);
  }
  const head = commitTree(base);
  const merge = commitTree(base, head);
  f.git('update-ref', '--no-deref', 'HEAD', merge);
  return {base, head, merge};
}

it.each([
  [undefined, 'docs'],
  ['src/formatters/bible.ts', 'application'],
  ['data/manifest.json', 'corpus'],
  ['scripts/another-build-script.ts', 'corpus'],
] as const)('classifies the exact Node E2E transition plus %s as %s', (additionalPath, mode) => {
  const f = repo();
  const pr = reviewedTransition(f, nodeE2eEntries, {additionalPath});
  const baseline = {productionSource: pr.base, targets: f.record.targets};
  const release = f.classifyCandidate(pr, baseline);
  expect(release.status, release.stderr).toBe(0);
  expect(release.outputs).toContain(`mode=${mode}\n`);
  expect(f.run('classify', 'baseline.json')).toBe(mode);
});

it('keeps ordinary PR CI full for Node E2E maintenance', () => {
  const f = repo();
  const pr = f.mergeCandidate(f.git('rev-parse', 'HEAD'), nodeE2eEntries.map(([path]) => path), 'test harness changes');
  expect(classifyOrdinaryCi(f.root, pr)).toEqual({
    mode: 'full', data: true, serving: true, reason: 'corpus-delivery-or-unclassified-path',
  });
});

it.each(['package', 'mode', 'partial'] as const)('keeps a %s mismatch in the Node E2E transition on the corpus route', mutation => {
  const f = repo();
  const pr = reviewedTransition(f, nodeE2eEntries, {
    changedAfter: mutation === 'package' ? 'package.json' : undefined,
    executable: mutation === 'mode' ? 'scripts/test-node-http-e2e.ts' : undefined,
    omitted: mutation === 'partial' ? 'scripts/node-e2e-fixture.ts' : undefined,
  });
  const release = f.classifyCandidate(pr, {productionSource: pr.base, targets: f.record.targets});
  expect(release.status, release.stderr).toBe(0);
  expect(release.outputs).toContain('mode=corpus\n');
});

it.each([
  [undefined, 'docs'],
  ['src/formatters/bible.ts', 'application'],
  ['data/manifest.json', 'corpus'],
  ['migrations/0011_example.sql', 'corpus'],
  ['scripts/another-build-script.ts', 'corpus'],
] as const)('classifies exact corpus preparation maintenance plus %s as %s', (additionalPath, mode) => {
  const f = repo();
  const pr = reviewedTransition(f, corpusPreparationEntries, {additionalPath});
  const release = f.classifyCandidate(pr, {productionSource: pr.base, targets: f.record.targets});
  expect(release.status, release.stderr).toBe(0);
  expect(release.outputs).toContain(`mode=${mode}\n`);
  expect(f.run('classify', 'baseline.json')).toBe(mode);
});

it('keeps ordinary PR CI full for corpus preparation maintenance', () => {
  const f = repo();
  const pr = f.mergeCandidate(f.git('rev-parse', 'HEAD'), corpusPreparationEntries.map(([path]) => path), 'preparation changes');
  expect(classifyOrdinaryCi(f.root, pr)).toEqual({
    mode: 'full', data: true, serving: true, reason: 'corpus-delivery-or-unclassified-path',
  });
});

it.each([
  {changedBefore: 'scripts/export-for-d1.ts'},
  {changedAfter: 'scripts/export-for-d1.ts'},
  {changedAfter: 'test/unit/scripts/d1SeedManifest.test.ts'},
  {executable: 'scripts/export-for-d1.ts'},
  {omitted: 'scripts/sqlite-corpus-markers.ts'},
])('keeps a corpus preparation transition mismatch on the corpus route (%j)', change => {
  const f = repo();
  const pr = reviewedTransition(f, corpusPreparationEntries, change);
  const release = f.classifyCandidate(pr, {productionSource: pr.base, targets: f.record.targets});
  expect(release.status, release.stderr).toBe(0);
  expect(release.outputs).toContain('mode=corpus\n');
});

it('keeps a partial corpus preparation test change on the corpus route', () => {
  const f = repo();
  const pr = f.mergeCandidate(f.git('rev-parse', 'HEAD'), 'test/unit/scripts/d1SeedManifest.test.ts', 'test changes');
  const release = f.classifyCandidate(pr, {productionSource: pr.base, targets: f.record.targets});
  expect(release.status, release.stderr).toBe(0);
  expect(release.outputs).toContain('mode=corpus\n');
});

it.each(['preview', 'production'] as const)('keeps a %s binding change on the corpus route with exact corpus preparation maintenance', role => {
  const f = repo();
  const changed = structuredClone(f.record);
  changed.targets[role].databaseId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const pr = reviewedTransition(f, corpusPreparationEntries, {
    additionalPath: 'release/serving.json',
    additionalContents: JSON.stringify(changed),
  });
  const release = f.classifyCandidate(pr, {productionSource: pr.base, targets: f.record.targets});
  expect(release.status, release.stderr).toBe(0);
  expect(release.outputs).toContain('mode=corpus\n');
});

function classifyOrdinaryCi(root: string, pr: {merge: string; head: string}) {
  const ci = spawnSync(process.execPath, [join(process.cwd(), 'scripts/classify-ci-changes.mjs')], {
    cwd: root, encoding: 'utf8', env: {...process.env,
      CI_EVENT_NAME: 'pull_request', CI_EXPECTED_HEAD: pr.merge, CI_PR_HEAD: pr.head, CI_FORCE_FULL: 'false',
      GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: ''},
  });
  expect(ci.status, ci.stderr).toBe(0);
  return JSON.parse(ci.stdout);
}

it('treats v3 depth and its MCP checks as an application release while ordinary CI stays full', () => {
  const f = repo();
  const pr = f.mergeCandidate(f.git('rev-parse', 'HEAD'), languageDepthPaths, 'application and MCP validation');
  const release = f.classifyCandidate(pr, {productionSource: f.record.productionSource, targets: f.record.predecessors});
  expect(release.status, release.stderr).toBe(0);
  expect(release.outputs).toContain('mode=application\n');
  expect(classifyOrdinaryCi(f.root, pr)).toMatchObject({mode: 'full', data: true, serving: true});
});

it.each(['migrations/0001_initial_schema.sql', 'data/manifest.json', 'scripts/verify-database.ts',
  'src/kernel/otherLanguageContract.ts', 'test/fixtures/other-language-fixture.json', 'package-lock.json'])
('keeps the corpus gate when v3 depth also changes %s', path => {
  const f = repo();
  f.commit([...languageDepthPaths, path], 'mixed application and corpus change');
  expect(f.run('classify')).toBe('corpus');
});

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

  expect(classifyOrdinaryCi(f.root, pr)).toEqual({
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
