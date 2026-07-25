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

  it('keeps Transform 10 out of document projections while retaining its inactive authority readiness gate', () => {
    const build = readFileSync(join(ROOT, 'scripts/build-database.ts'), 'utf8');
    expect(build).toMatch(/Materializing inactive Aquinas edition hierarchy authority/);
    const transform10 = build.slice(build.indexOf('// ── Transform 10'), build.indexOf('// ── Tier 3'));
    expect(transform10).not.toMatch(/insertDocument|insertSection|insertProfile/);
    const remoteReadiness = readFileSync(join(ROOT, 'scripts/check-remote-d1-readiness.ts'), 'utf8');
    expect(remoteReadiness).toMatch(/historical\.transform10\.exact_profile_and_artifacts/);
    expect(remoteReadiness).toMatch(/transform10ReadinessChecks/);
    expect(remoteReadiness).not.toMatch(/MCP tool|runtime composition/i);
  });
});
