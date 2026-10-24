import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createManifest, renderDeploymentConfig, verifyManifest } from '../../../scripts/worker-release-artifact.mjs';

const root = new URL('../../../', import.meta.url).pathname;
const directories: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'theologai-worker-artifact-'));
  directories.push(directory);
  writeFileSync(join(directory, 'worker.js'), 'throw new Error("bundle must never execute on the runner");');
  writeFileSync(join(directory, 'worker.js.map'), '{}');
  return { directory, digest: createManifest(root, directory, 'production') };
}
const digestOf = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

describe('source-bound prebuilt Worker handoff', () => {
  it('verifies code as data and renders an upload-only config preserving production bindings', async () => {
    const { directory, digest } = fixture();
    const output = join(directory, 'upload.json');
    await renderDeploymentConfig(root, directory, 'production', digest, output);
    const config = JSON.parse(readFileSync(output, 'utf8'));
    expect(config).toMatchObject({
      name: 'theologai', main: join(directory, 'worker.js'), no_bundle: true, find_additional_modules: false,
      d1_databases: [{ binding: 'THEOLOGAI_DB', database_id: '9bc79346-338b-439e-a2a5-424f4418eb21' }],
    });
    expect(config.env).toBeUndefined();
    expect(config.build).toBeUndefined();
  });
  it('rejects altered code, an incorrect manifest digest, a missing digest, and a different target', () => {
    const { directory, digest } = fixture();
    expect(() => verifyManifest(root, directory, 'production', '')).toThrow('digest is required');
    expect(() => verifyManifest(root, directory, 'production', '0'.repeat(64))).toThrow('digest mismatch');
    expect(() => verifyManifest(root, directory, 'preview', digest)).toThrow('target mismatch');
    writeFileSync(join(directory, 'worker.js'), 'altered');
    expect(() => verifyManifest(root, directory, 'production', digest)).toThrow('Bundle digest mismatch');
  });
  it.each(['sourceCommit', 'sourceTree', 'configSha256', 'lockSha256'])('rejects a correctly hashed manifest for another %s', field => {
    const { directory } = fixture();
    const path = join(directory, 'release-manifest.json');
    const value = JSON.parse(readFileSync(path, 'utf8'));
    value[field] = '0'.repeat(field.startsWith('source') ? 40 : 64);
    writeFileSync(path, JSON.stringify(value));
    expect(() => verifyManifest(root, directory, 'production', digestOf(path))).toThrow(`${field} mismatch`);
  });
  it('rejects extra files and symbolic links instead of discovering modules on the deploy runner', () => {
    const { directory, digest } = fixture();
    writeFileSync(join(directory, 'unexpected.js'), 'extra module');
    expect(() => verifyManifest(root, directory, 'production', digest)).toThrow('Unexpected artifact directory');
    rmSync(join(directory, 'unexpected.js'));
    rmSync(join(directory, 'worker.js'));
    symlinkSync(join(directory, 'worker.js.map'), join(directory, 'worker.js'));
    expect(() => verifyManifest(root, directory, 'production', digest)).toThrow('Invalid artifact file');
  });
});
