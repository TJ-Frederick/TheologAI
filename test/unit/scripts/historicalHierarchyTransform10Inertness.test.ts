import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Transform 13 active hierarchy boundaries', () => {
  it('registers the hierarchy through the Node and Worker composition roots', () => {
    for (const path of ['src/tools/v2/index.ts', 'src/tools/worker/index.ts']) {
      const source = readFileSync(join(ROOT, path), 'utf8');
      expect(source, path).toContain('HistoricalHierarchyRepository');
      expect(source, path).toContain('HistoricalHierarchyService');
    }
  });

  it('materializes the active packet while retaining the legacy-document boundary', () => {
    const build = readFileSync(join(ROOT, 'scripts/build-database.ts'), 'utf8');
    expect(build).toContain('loadActiveAquinasHierarchy(sourceRegistry)');
    expect(build).toContain('materializeHistoricalHierarchy(db, activeAquinasHierarchy)');
    expect(build).toContain('loadActiveAquinasHierarchyPublication(activeAquinasHierarchy)');
    expect(build).not.toContain('assertNormalAquinasHierarchyExclusion');
    expect(build).not.toContain('loadApprovedAquinasHierarchy');
    const remoteReadiness = readFileSync(join(ROOT, 'scripts/check-remote-d1-readiness.ts'), 'utf8');
    expect(remoteReadiness).toContain('historical.aquinas.active_publication');
    expect(remoteReadiness).toContain('historical.aquinas.no_legacy_projection');
    expect(remoteReadiness).toContain('historical.aquinas.fts_parity');
  });
});
