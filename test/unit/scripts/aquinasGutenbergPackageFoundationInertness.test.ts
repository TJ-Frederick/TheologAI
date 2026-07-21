import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const foundationPath = 'src/kernel/sectionedEditionCollectionPackageFoundation.ts';
const foundationReference = /sectionedEditionCollectionPackageFoundation/;

describe('Aquinas Gutenberg package foundation remains inert', () => {
  it('is absent from public kernel exports and every runtime source import', () => {
    expect(read('src/kernel/index.ts')).not.toMatch(foundationReference);
    expect(read('src/index.ts')).not.toMatch(foundationReference);
    expect(read('src/worker.ts')).not.toMatch(foundationReference);
    expect(runtimeSourceFiles().filter(path => path !== foundationPath && foundationReference.test(read(path)))).toEqual([]);
  });

  it('has no package, worker, catalog, database, dry-output, or materialization registration', () => {
    for (const path of ['package.json', 'wrangler.toml', 'data/data-manifest.json', 'src/worker.ts', 'src/worker-server.ts']) {
      expect(read(path), path).not.toMatch(foundationReference);
    }
  });
});

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function runtimeSourceFiles(directory = resolve(repoRoot, 'src')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(path);
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
    return [relative(repoRoot, path)];
  });
}
