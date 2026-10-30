/** Source-bound prebuilt Worker handoff. Never imports or executes the bundle. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TARGETS = {
  production: { config: 'wrangler.toml', entry: 'worker.js' },
  preview: { config: 'wrangler.toml', entry: 'worker.js' },
  coordinator: { config: 'wrangler.ccel-coordinator.toml', entry: 'ccel-coordinator-worker.js' },
};
const MAX_BYTES = 16 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, ref) => execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8' }).trim();
function fileBytes(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error(`Invalid artifact file: ${path}`);
  return readFileSync(path);
}
function targetFor(target) {
  if (!Object.hasOwn(TARGETS, target)) throw new Error('Unknown release target');
  return TARGETS[target];
}
function identity(root, target) {
  const { config } = targetFor(target);
  return {
    schemaVersion: 'theologai-worker-artifact.v1', target,
    sourceCommit: git(root, 'HEAD'), sourceTree: git(root, 'HEAD^{tree}'),
    configSha256: sha256(fileBytes(join(root, config))),
    lockSha256: sha256(fileBytes(join(root, 'package-lock.json'))),
  };
}
export function createManifest(root, directory, target) {
  const { entry } = targetFor(target);
  const files = Object.fromEntries([entry, `${entry}.map`].map(name => [name, sha256(fileBytes(join(directory, name)))]));
  const manifest = { ...identity(root, target), files };
  writeFileSync(join(directory, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return sha256(fileBytes(join(directory, 'release-manifest.json')));
}
export function verifyManifest(root, directory, target, expectedHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash ?? '')) throw new Error('Expected manifest digest is required');
  const bytes = fileBytes(join(directory, 'release-manifest.json'));
  if (sha256(bytes) !== expectedHash) throw new Error('Release manifest digest mismatch');
  const manifest = JSON.parse(bytes);
  const expected = identity(root, target);
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify([...Object.keys(expected), 'files'].sort())) {
    throw new Error('Unexpected release manifest fields');
  }
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) throw new Error(`Release artifact ${key} mismatch`);
  }
  const { entry } = targetFor(target);
  const names = [entry, `${entry}.map`].sort();
  if (JSON.stringify(Object.keys(manifest.files ?? {}).sort()) !== JSON.stringify(names)) throw new Error('Unexpected bundle files');
  // README is Wrangler-generated build guidance, never deployed or executed.
  if (readdirSync(directory).some(name => ![...names, 'release-manifest.json', 'README.md'].includes(name))) {
    throw new Error('Unexpected artifact directory content');
  }
  for (const name of names) {
    if (sha256(fileBytes(join(directory, name))) !== manifest.files[name]) throw new Error(`Bundle digest mismatch: ${name}`);
  }
  return manifest;
}
export async function renderDeploymentConfig(root, directory, target, expectedHash, output) {
  verifyManifest(root, directory, target, expectedHash);
  const { parse } = await import('smol-toml');
  const { config, entry } = targetFor(target);
  const source = parse(fileBytes(join(root, config)).toString('utf8'));
  const selected = target === 'preview' ? { ...source, ...source.env?.preview } : { ...source };
  // No local custom build, asset hooks, module discovery, or alternate manifests
  // may turn a credential-bearing upload back into an application build.
  for (const key of ['build', 'assets', 'site', 'rules', 'base_dir', 'unsafe', 'containers']) {
    if (key in source || key in selected) throw new Error(`Release config requires review for ${key}`);
  }
  delete selected.env;
  delete selected.$schema;
  selected.main = resolve(directory, entry);
  selected.no_bundle = true;
  selected.find_additional_modules = false;
  // Paths are relative to the source config, not RUNNER_TEMP.
  for (const db of selected.d1_databases ?? []) {
    if (db.migrations_dir) db.migrations_dir = resolve(root, db.migrations_dir);
  }
  writeFileSync(output, `${JSON.stringify(selected, null, 2)}\n`, { flag: 'wx' });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, target, directory, expectedHash, output] = process.argv.slice(2);
  const root = process.cwd();
  if (command === 'create') process.stdout.write(`${createManifest(root, directory, target)}\n`);
  else if (command === 'verify') verifyManifest(root, directory, target, expectedHash);
  else if (command === 'render' && output) await renderDeploymentConfig(root, directory, target, expectedHash, output);
  else throw new Error('Usage: worker-release-artifact.mjs create|verify|render TARGET DIRECTORY [SHA256 [OUTPUT]]');
}
