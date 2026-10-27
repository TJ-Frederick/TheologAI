import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Transform 10 hierarchy inertness', () => {
  it('does not register hierarchy authority in active Node or Worker composition paths', () => {
    const activePaths = [
      'src/server.ts',
      'src/worker-server.ts',
      'src/tools/v2/index.ts',
      'src/tools/worker/index.ts',
      'src/mcp/primarySourceCatalog.ts',
      'src/adapters/d1/index.ts',
    ];
    for (const path of activePaths) {
      expect(readFileSync(join(ROOT, path), 'utf8'), path).not.toMatch(/HistoricalHierarchy|historical_(?:hierarchy|edition_hierarchy)/i);
    }
  });

  it('keeps Transform 10 out of normal materialization, document projections, and active runtime paths', () => {
    const build = readFileSync(join(ROOT, 'scripts/build-database.ts'), 'utf8');
    expect(build).toMatch(/dormant generic hierarchical authority foundation/);
    const transform10 = build.slice(build.indexOf('// ── Transform 10'), build.indexOf('// ── Tier 3'));
    expect(transform10).not.toMatch(/loadApprovedAquinasHierarchy|materializeHistoricalHierarchy|insertDocument|insertSection|insertProfile/);
    expect(build).toMatch(/assertNormalAquinasHierarchyExclusion\(db\);/);
    expect(build.indexOf('assertNormalAquinasHierarchyExclusion(db);')).toBeGreaterThan(build.indexOf('Unexpected table counts'));
    const remoteReadiness = readFileSync(join(ROOT, 'scripts/check-remote-d1-readiness.ts'), 'utf8');
    expect(remoteReadiness).toMatch(/normalAquinasHierarchyExclusionChecks/);
    expect(remoteReadiness).toMatch(/normalTransform10ExclusionReadinessChecks/);
    expect(remoteReadiness).not.toMatch(/historical\.transform10\.exact_profile_and_artifacts/);
    expect(remoteReadiness).not.toMatch(/MCP tool|runtime composition/i);
  });
});
