// Offline operator preparation check. This never installs, repairs, authenticates or grants authority.
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { delimiter, dirname, join, resolve, sep } = require('node:path');
const { BASELINE } = require('./validation-context.cjs');

const check = (condition, reason) => { if (!condition) throw Error('Operator readiness refused: ' + reason); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value);

function argumentsFor(argv) {
  const allowed = new Set(['--source', '--tree', '--base', '--toolchain', '--artifact-directory', '--plan-sha256']);
  const values = {};
  check(argv.length % 2 === 0, 'argument pairs');
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    check(allowed.has(key) && !Object.hasOwn(values, key) && value && !value.startsWith('--'), 'arguments');
    values[key] = value;
  }
  for (const key of ['--source', '--tree', '--base']) check(hex(values[key], 40), 'source tree and base identities');
  check(values['--toolchain'], 'isolated toolchain required');
  check(Boolean(values['--artifact-directory']) === Boolean(values['--plan-sha256']), 'artifact directory and digest together');
  if (values['--plan-sha256']) check(hex(values['--plan-sha256'], 64), 'plan digest');
  return { source: values['--source'], tree: values['--tree'], base: values['--base'], toolchain: values['--toolchain'],
    artifactDirectory: values['--artifact-directory'], planSha256: values['--plan-sha256'] };
}

// An allowlist, not a copy of the caller's environment. No auth, Node preload/path or Git overrides survive.
function childEnvironment() {
  return { PATH: [dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter), LANG: 'C',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
    GIT_ASKPASS: '/usr/bin/false' };
}

function command(file, args, cwd, reason, timeout = 60_000, maxBuffer = 8 * 1024 * 1024) {
  try {
    return execFileSync(file, args, { cwd, env: childEnvironment(), encoding: 'utf8', timeout, maxBuffer,
      stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw Error('Operator readiness refused: ' + reason); }
}

const gitRaw = (root, args, reason) => command('git', ['--no-replace-objects', '-c', 'protocol.allow=never', '-c', 'core.fsmonitor=false', ...args], root, reason);
const gitAt = (root, args, reason) => gitRaw(root, args, reason).trim();

function noObjectLinks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    check(!entry.isSymbolicLink(), 'independent object files required');
    if (entry.isDirectory()) noObjectLinks(path);
  }
}

function verifyCheckout(root, expected, baseline = BASELINE) {
  root = realpathSync(root);
  const gitDirectory = join(root, '.git');
  check(existsSync(gitDirectory) && lstatSync(gitDirectory).isDirectory() && !lstatSync(gitDirectory).isSymbolicLink(), 'independent operator clone required');
  const configNames = gitAt(root, ['config', '--file', join(gitDirectory, 'config'), '--no-includes', '--name-only', '--list'], 'repository configuration');
  check(!configNames.split('\n').some(name => /^(?:include\.path|includeif\..*\.path|core\.worktree|extensions\.worktreeconfig)$/i.test(name)), 'external repository configuration refused');
  check(!configNames.split('\n').some(name => /^(?:extensions\.partialclone|remote\..*\.(?:promisor|partialclonefilter))$/i.test(name)), 'partial clone metadata refused');
  check(realpathSync(resolve(root, gitAt(root, ['rev-parse', '--git-common-dir'], 'Git common directory'))) === realpathSync(gitDirectory), 'independent Git common directory required');
  check(gitAt(root, ['rev-parse', '--show-toplevel'], 'repository root') === root, 'operator repository root');
  check(gitAt(root, ['rev-parse', '--is-shallow-repository'], 'shallow history check') === 'false', 'complete operator history required');
  for (const path of ['objects/info/alternates', 'objects/info/http-alternates', 'info/grafts']) {
    check(!existsSync(join(gitDirectory, path)), 'shared objects and grafts refused');
  }
  check(!gitAt(root, ['for-each-ref', '--format=%(refname)', 'refs/replace'], 'replacement refs check'), 'replacement refs refused');
  const objectDirectory = join(gitDirectory, 'objects');
  check(lstatSync(objectDirectory).isDirectory() && !lstatSync(objectDirectory).isSymbolicLink(), 'independent object directory required');
  noObjectLinks(objectDirectory);
  const files = gitAt(root, ['ls-files', '-v', '-z'], 'checkout index flags').split('\0').filter(Boolean);
  check(files.every(file => file.startsWith('H ')), 'complete ordinary checkout index required');
  for (const identity of [expected.source, expected.base, baseline]) {
    check(hex(identity, 40), 'required history identity');
    gitAt(root, ['cat-file', '-e', identity + '^{commit}'], 'required baseline or source object unavailable');
  }
  check(gitAt(root, ['rev-parse', 'HEAD'], 'source commit') === expected.source, 'exact source checkout');
  check(gitAt(root, ['rev-parse', 'HEAD^{tree}'], 'source tree') === expected.tree, 'exact source tree');
  gitAt(root, ['merge-base', '--is-ancestor', baseline, expected.base], 'release baseline ancestry');
  gitAt(root, ['merge-base', '--is-ancestor', expected.base, expected.source], 'approved base ancestry');
  const changes = gitAt(root, ['status', '--porcelain=v1', '--untracked-files=normal'], 'clean checkout check').split('\n').filter(Boolean);
  // The existing release action creates this exact untracked link (node_modules/ ignores directories only).
  const preparedLink = () => {
    try { return expected.toolchain && lstatSync(join(root, 'node_modules')).isSymbolicLink()
      && realpathSync(join(root, 'node_modules')) === realpathSync(join(resolve(expected.toolchain), 'node_modules')); }
    catch { return false; }
  };
  check(changes.every(line => line === '?? node_modules' && preparedLink()), 'clean source checkout required');
  const reachable = gitAt(root, ['rev-list', '--objects', '--missing=print', expected.source, expected.base, baseline], 'reachable history objects');
  check(!reachable.split('\n').some(line => line.startsWith('?')), 'complete reachable history objects required');
  gitAt(root, ['fsck', '--full', '--strict', '--no-reflogs', '--no-dangling', expected.source, expected.base, baseline], 'full private history integrity check');
}

const PROBE = `
  import {createRequire} from 'node:module';
  import {readFileSync,lstatSync} from 'node:fs';
  import {createHash} from 'node:crypto';
  import {join} from 'node:path';
  import {pathToFileURL} from 'node:url';
  const [toolchain,root,artifactDirectory,digest]=process.argv.slice(1);
  const require=createRequire(join(toolchain,'package.json'));
  const Database=require('better-sqlite3');
  const memory=new Database(':memory:');
  const sqliteVersion=memory.prepare('SELECT sqlite_version() AS version').get().version;
  if(memory.prepare('SELECT 1 AS ready').get().ready!==1)throw Error('native runtime');
  memory.close();
  const policy=await import(pathToFileURL(join(root,'scripts/application-release-policy.mjs')));
  const classification=policy.classifyApplicationRelease(root);
  await import(pathToFileURL(join(root,'scripts/operator-corpus-proof.ts')));
  let artifact={status:'not_performed',hostedProvenance:'not_verified'};
  if(artifactDirectory){
    const dir=lstatSync(artifactDirectory);if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('artifact directory');
    const bytes=(name,max)=>{const file=join(artifactDirectory,name),s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('artifact file');return readFileSync(file);};
    const hash=b=>createHash('sha256').update(b).digest('hex');
    const planBytes=bytes('plan.json',512*1024);if(hash(planBytes)!==digest)throw Error('plan digest');
    const plan=JSON.parse(planBytes);
    if(plan.schemaVersion!=='theologai-application-corpus-source-plan.v1'||JSON.stringify(plan.classification)!==JSON.stringify(classification)
      ||plan.integrityCommands!==4||!Number.isSafeInteger(plan.readBudget)||plan.readBudget<1||plan.readBudget>3510997)throw Error('plan identity');
    const sourceSha256=hash(bytes('source.db',400*1024*1024));if(sourceSha256!==plan.sourceSha256)throw Error('database digest');
    const database=new Database(join(artifactDirectory,'source.db'),{readonly:true,fileMustExist:true});
    try{const metadata=Object.fromEntries(database.prepare('SELECT key,value FROM theologai_metadata').all().map(r=>[r.key,r.value]));
      if(metadata.schema_version!==policy.SCHEMA||metadata.corpus_manifest_sha256!==policy.CORPUS)throw Error('database identity');
    }finally{database.close();}
    artifact={status:'local_bindings_checked',planSha256:digest,sourceSha256,hostedProvenance:'not_verified'};
  }
  console.log(JSON.stringify({sqliteVersion,artifact}));
`;

function verifyReadiness(input) {
  const root = realpathSync(input.root ?? process.cwd());
  verifyCheckout(root, input);
  const pin = gitAt(root, ['show', input.base + ':.nvmrc'], 'approved runtime pin');
  check(/^22\.\d+\.\d+$/.test(pin) && process.versions.node === pin, 'exact approved Node executable required');
  const installationPath = resolve(input.toolchain);
  const toolchain = realpathSync(installationPath);
  check(!existsSync(join(toolchain, '.npmrc')), 'isolated toolchain configuration required');
  const digests = {};
  for (const name of ['package.json', 'package-lock.json']) {
    const path = join(toolchain, name), stat = lstatSync(path);
    check(stat.isFile() && !stat.isSymbolicLink() && stat.size < 2 * 1024 * 1024, 'toolchain manifest file');
    const bytes = readFileSync(path);
    const trusted = gitRaw(root, ['show', input.base + ':.github/release-toolchain/' + name], 'approved toolchain manifest');
    check(bytes.equals(Buffer.from(trusted, 'utf8')), 'exact approved isolated toolchain files required');
    digests[name] = hash(bytes);
  }
  const modules = realpathSync(join(toolchain, 'node_modules'));
  check(modules.startsWith(toolchain + sep) && !lstatSync(join(toolchain, 'node_modules')).isSymbolicLink(), 'isolated installed dependency directory required');
  check(realpathSync(join(root, 'node_modules')) === modules && lstatSync(join(root, 'node_modules')).isSymbolicLink(), 'source must use only isolated release dependencies');
  check(!existsSync(join(modules, 'vitest')), 'application test graph refused');
  const tsx = realpathSync(require.resolve('tsx', { paths: [toolchain] }));
  check(tsx.startsWith(modules + sep), 'installed isolated tsx required');
  const temporary = mkdtempSync(join(tmpdir(), 'theologai-operator-readiness-'));
  try {
    const userConfig = join(temporary, 'user.npmrc'), globalConfig = join(temporary, 'global.npmrc');
    writeFileSync(userConfig, ''); writeFileSync(globalConfig, '');
    const npm = realpathSync(join(dirname(process.execPath), 'npm'));
    // npm's installed graph is path-sensitive on macOS /var aliases; retain the declared installation prefix.
    const graph = JSON.parse(command(process.execPath, [npm, 'ls', '--prefix', installationPath, '--all', '--json', '--offline', '--ignore-scripts',
      '--userconfig=' + userConfig, '--globalconfig=' + globalConfig, '--cache=' + join(temporary, 'npm-cache')], temporary, 'installed release dependency graph', 30_000, 4 * 1024 * 1024));
    const declared = JSON.parse(readFileSync(join(toolchain, 'package.json'), 'utf8')).dependencies;
    check(!graph.problems?.length && Object.entries(declared).every(([name, version]) => graph.dependencies?.[name]?.version === version), 'declared installed release dependencies');
    const probe = JSON.parse(command(process.execPath, ['--import', tsx, '--input-type=module', '-e', PROBE, toolchain, root,
      input.artifactDirectory ? resolve(input.artifactDirectory) : '', input.planSha256 ?? ''], root, 'isolated native module or source artifact readiness', 60_000));
    return { checkedAt: new Date().toISOString(), grantsOperation: false, sourceCommit: input.source, sourceTree: input.tree, baseCommit: input.base,
      git: 'independent complete clean source and required history verified', node: process.version,
      toolchain: { manifestSha256: digests['package.json'], lockSha256: digests['package-lock.json'], installedGraph: 'valid',
        sqliteVersion: probe.sqliteVersion, operatorModuleLoaded: true, installedFileIntegrity: 'not_cryptographically_verified', audit: 'not_performed_by_this_offline_check' },
      artifact: probe.artifact, liveGitHubAndCloud: 'not_checked', authority: 'none' };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (require.main === module) {
  try { console.log(JSON.stringify(verifyReadiness(argumentsFor(process.argv.slice(2))), null, 2)); }
  catch (error) {
    const reason = /^Operator readiness refused: [a-zA-Z0-9 /_-]+$/.test(error.message) ? error.message : 'Operator readiness refused: local preparation check failed';
    process.stderr.write(reason + '\n'); process.exitCode = 1;
  }
}
module.exports = { argumentsFor, childEnvironment, verifyCheckout, verifyReadiness };
