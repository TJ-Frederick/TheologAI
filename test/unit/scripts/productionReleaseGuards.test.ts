import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_PROFILE as historicalProfile } from '../../../scripts/audit-historical-core-preview.js';
import { PRODUCTION_PROFILE as languageProfile } from '../../../scripts/audit-original-language-v2-preview.js';

const root = new URL('../../../', import.meta.url);

describe('production release guards', () => {
  it('keeps both post-deploy audit profiles fixed to the production custom domain and 3.6.0', () => {
    expect(languageProfile).toEqual({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '3.6.0',
      audit: 'original-language-v2-production', endpointClass: 'production-custom', label: 'production',
    });
    expect(historicalProfile).toEqual({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '3.6.0',
      audit: 'historical-core-production', endpointClass: 'production-custom', label: 'production',
    });
  });

  it('requires exact checked-in candidate readiness and Worker/D1 proof before fixed audits', async () => {
    const workflow = await readFile(new URL('.github/workflows/deploy.yml', root), 'utf8');
    const mapping = workflow.indexOf('Capture checked-out candidate production D1 mapping (read-only)');
    const readiness = workflow.indexOf('Verify candidate production D1 is compatible (read-only)');
    const predecessor = workflow.indexOf('Capture production predecessor reconciliation anchor (read-only)');
    const versions = workflow.indexOf('Capture production Worker versions before deployment (read-only)');
    const deploy = workflow.indexOf('Deploy to Cloudflare Workers');
    const identity = workflow.indexOf('Verify exact active production Worker version (read-only)');
    const candidateCutover = workflow.indexOf('Require deployed candidate production D1 binding (read-only)');
    const languageAudit = workflow.indexOf('Audit original-language v2 contract on production');
    const historicalAudit = workflow.indexOf('Audit Transform-9 historical core contract on production');
    const reconciliation = workflow.indexOf('Capture production post-mutation reconciliation record (read-only)');
    const stable = workflow.indexOf('Verify production Worker remained active through audit (read-only)');
    const artifact = workflow.indexOf('Upload protected production audit evidence');
    expect([mapping, readiness, predecessor, versions, deploy, identity, candidateCutover, languageAudit, historicalAudit, reconciliation, stable, artifact].every(index => index >= 0)).toBe(true);
    expect(readiness).toBeGreaterThan(mapping);
    expect(predecessor).toBeGreaterThan(readiness);
    expect(versions).toBeGreaterThan(predecessor);
    expect(deploy).toBeGreaterThan(versions);
    expect(identity).toBeGreaterThan(deploy);
    expect(candidateCutover).toBeGreaterThan(identity);
    expect(languageAudit).toBeGreaterThan(candidateCutover);
    expect(historicalAudit).toBeGreaterThan(languageAudit);
    expect(reconciliation).toBeGreaterThan(historicalAudit);
    expect(stable).toBeGreaterThan(reconciliation);
    expect(artifact).toBeGreaterThan(stable);
    expect(workflow).toContain('scripts/production-release-reconciliation.ts candidate-d1-name');
    expect(workflow).toContain('npm run d1:remote:check -- --database "$candidate_d1_name"');
    expect(workflow).toContain('scripts/verify-production-worker-deployment.ts verify-deploy');
    expect(workflow).toContain('scripts/verify-production-worker-deployment.ts verify-audit-stability');
    expect(workflow).toContain('npm run audit:original-language-v2-production');
    expect(workflow).toContain('npm run audit:historical-core-production');
    expect(workflow).not.toContain('d1 create');
    expect(workflow).not.toContain('d1 delete');
  });
});
