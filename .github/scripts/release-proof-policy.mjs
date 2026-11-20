/** Verify the captured proof input against the exact checked-out source. */
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as corpus from '../../scripts/application-release-policy.mjs';

export function policyForIdentity(identity) {
  if (identity !== corpus.POLICY.policy) throw Error('Release policy refused: unknown identity');
  return {id: corpus.POLICY.policy, module: corpus, hardReadCap: corpus.POLICY.hardReadCap};
}

export function requireSameReleasePolicy(selected, identity) {
  if (policyForIdentity(identity).id !== selected.id) throw Error('Release policy refused: cross-policy substitution');
}

export function selectReleaseProofPolicy(root) {
  const classification = corpus.classifyApplicationRelease(root);
  return {...policyForIdentity(classification.releasePolicy), classification};
}

export function verifySourcePlanPolicy(root, directory, digest) {
  const selected = selectReleaseProofPolicy(root);
  const bytes = readFileSync(join(directory, 'plan.json'));
  if (!/^[a-f0-9]{64}$/.test(digest) || createHash('sha256').update(bytes).digest('hex') !== digest) throw Error('Release policy refused: source plan digest');
  const plan = JSON.parse(bytes);
  if (plan.schemaVersion !== 'theologai-application-corpus-source-plan.v1' || JSON.stringify(plan.classification) !== JSON.stringify(selected.classification)) throw Error('Release policy refused: exact source plan identity');
  requireSameReleasePolicy(selected, plan.releasePolicy);
  return selected.id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, directory, digest, ...extra] = process.argv.slice(2);
  if (command !== 'verify-source-plan' || !directory || !digest || extra.length) throw Error('Release policy refused: exact CLI arguments');
  process.stdout.write(verifySourcePlanPolicy(process.cwd(), directory, digest) + '\n');
}
