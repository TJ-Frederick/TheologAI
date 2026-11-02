// Local-only checkout preflight. Run before dependency installation or suites.
const { execFileSync } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const BASELINE = '8fbfccfc73628918cfbcf4ca22676f2f7a0b55ab';
function preflight(env = process.env, cwd = process.cwd()) {
  const check = (value, reason) => { if (!value) throw Error('Validation context refused: ' + reason); };
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = sha => {
    check(/^[0-9a-f]{40}$/.test(sha || ''), 'commit identity');
    git('cat-file', '-e', sha + '^{commit}');
    return sha;
  };
  const head = commit(env.CI_EXPECTED_HEAD);
  check(git('rev-parse', 'HEAD') === head, 'exact checkout');
  const parents = git('rev-list', '--parents', '-n', '1', head).split(' ');
  let baseline;
  if (env.CI_EVENT_NAME === 'pull_request') {
    check(parents.length === 3 && parents[2] === commit(env.CI_PR_HEAD), 'exact PR merge parents');
    baseline = commit(parents[1]);
  } else {
    check(['workflow_dispatch', 'schedule'].includes(env.CI_EVENT_NAME), 'event');
    baseline = commit(parents[1]);
    if (env.CI_LINEAGE_BEFORE) {
      // Production uses the canonical plan's first parent, never an ancestor substitute.
      check(baseline === commit(env.CI_LINEAGE_BEFORE), 'canonical first parent');
      check(env.CI_REF === 'refs/heads/main', 'production main');
    }
  }
  if (['core', 'data'].includes(env.CI_SUITE)) {
    check(git('rev-parse', '--is-shallow-repository') === 'false', 'complete history');
    commit(BASELINE);
    git('merge-base', '--is-ancestor', BASELINE, head);
    check(!git('rev-list', '--objects', '--missing=print', head).split('\n').some(line => line.startsWith('?')), 'complete reachable objects');
  }
  return { head, baseline };
}
if (require.main === module) {
  try {
    const result = preflight();
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `baseline=${result.baseline}\n`);
    console.log(JSON.stringify(result));
  } catch (error) {
    process.stderr.write((error.message.startsWith('Validation context refused:') ? error.message : 'Validation context refused: required Git history unavailable') + '\n');
    process.exitCode = 1;
  }
}
module.exports = { preflight, BASELINE };
