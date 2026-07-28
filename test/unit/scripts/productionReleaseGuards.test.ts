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
    expect(historicalProfile).toMatchObject({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '3.6.0',
      audit: 'historical-core-production', endpointClass: 'production-custom', label: 'production',
      primarySource: {
        contractVersion: '6', schemaVersion: '6', openWorldHint: false,
        providerEnum: ['local'], providerMaximum: 1,
        inputSchemaSha256: '37849624bac2e884106050fcff39851e40cac31969b4f7511f516f78348fea87',
        outputSchemaSha256: '25758f8d06c43c3f2961fa7b35ba1d62a548df923589b391c65204813a6511b8',
        externalDiscoveryBoundary: 'rejected_at_input_schema',
      },
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
    const stable = workflow.indexOf('Verify production Worker remained active through audit (read-only)');
    const finalObservation = workflow.indexOf('Capture final production routing/binding observation (read-only)');
    const finalArtifact = workflow.indexOf('Upload final production routing/binding observation');
    const artifact = workflow.indexOf('Upload protected production audit evidence');
    expect([mapping, readiness, predecessor, versions, deploy, identity, candidateCutover, languageAudit, historicalAudit, stable, finalObservation, finalArtifact, artifact].every(index => index >= 0)).toBe(true);
    expect(readiness).toBeGreaterThan(mapping);
    expect(predecessor).toBeGreaterThan(readiness);
    expect(versions).toBeGreaterThan(predecessor);
    expect(deploy).toBeGreaterThan(versions);
    expect(identity).toBeGreaterThan(deploy);
    expect(candidateCutover).toBeGreaterThan(identity);
    expect(languageAudit).toBeGreaterThan(candidateCutover);
    expect(historicalAudit).toBeGreaterThan(languageAudit);
    expect(stable).toBeGreaterThan(historicalAudit);
    expect(finalObservation).toBeGreaterThan(stable);
    expect(finalArtifact).toBeGreaterThan(finalObservation);
    expect(artifact).toBeGreaterThan(finalArtifact);
    expect(workflow).toContain('scripts/production-release-reconciliation.ts candidate-d1-name');
    expect(workflow).toContain('npm run d1:remote:check -- --database "$candidate_d1_name"');
    expect(workflow).toContain('scripts/verify-production-worker-deployment.ts verify-deploy');
    expect(workflow).toContain('scripts/verify-production-worker-deployment.ts verify-audit-stability');
    expect(workflow).toContain('npm run audit:original-language-v2-production');
    expect(workflow).toContain('npm run audit:historical-core-production');
    expect(workflow).not.toContain('d1 create');
    expect(workflow).not.toContain('d1 delete');
  });

  it('retains a non-strict final routing observation after every attempted deploy, while requiring it for a successful release', async () => {
    const workflow = await readFile(new URL('.github/workflows/deploy.yml', root), 'utf8');
    const historicalAuditScript = await readFile(new URL('../../../scripts/audit-historical-core-preview.ts', import.meta.url), 'utf8');
    const finalObservation = workflow.indexOf('Capture final production routing/binding observation (read-only)');
    const finalArtifact = workflow.indexOf('Upload final production routing/binding observation');
    const protectedEvidence = workflow.indexOf('Upload protected production audit evidence');
    const observationBlock = workflow.slice(finalObservation, finalArtifact);
    const finalArtifactBlock = workflow.slice(finalArtifact, protectedEvidence);

    expect(finalObservation).toBeGreaterThan(workflow.indexOf('Deploy to Cloudflare Workers'));
    expect(observationBlock).toContain("steps.production-worker-deploy.outcome != 'skipped'");
    expect(observationBlock).toContain("steps.production-predecessor.outcome == 'success'");
    expect(observationBlock).not.toContain('continue-on-error');
    expect(observationBlock).toContain('observe-post-mutation');
    expect(observationBlock).not.toContain('reconcile-post-mutation');
    expect(finalArtifactBlock).toContain("steps.production-worker-deploy.outcome != 'skipped'");
    expect(finalArtifactBlock).toContain('if-no-files-found: warn');

    // A failed deploy never becomes green because its action failed. A deploy
    // that otherwise passed its strict gates is also terminal if final
    // routing/binding evidence could not be captured or hashed.
    expect(workflow).toContain("id: production-audit-evidence\n        if: ${{ steps.production-worker-deploy.outcome == 'success' && steps.production-worker-candidate-cutover.outcome == 'success' && steps.production-original-language-v2-audit.outcome == 'success' && steps.production-historical-core-audit.outcome == 'success' && steps.production-worker-audit-identity.outcome == 'success' && steps.production-final-observation.outcome == 'success' }}");
    expect(historicalAuditScript).toContain('${profile.label} expanded-discovery/catalog execution invariant drifted');
    expect(historicalAuditScript).not.toContain('preview expanded-discovery/catalog execution invariant drifted');

    // Strict cutover, fixed audits, audit-stability proof, and protected
    // evidence remain unavailable unless the deploy action itself succeeded.
    expect(workflow).toContain("id: production-worker-pre-audit-identity\n        if: ${{ steps.production-worker-deploy.outcome == 'success' }}");
    expect(workflow).toContain("id: production-worker-candidate-cutover\n        if: ${{ steps.production-worker-deploy.outcome == 'success' && steps.production-worker-pre-audit-identity.outcome == 'success' }}");
    expect(workflow).toContain("id: production-original-language-v2-audit\n        if: ${{ steps.production-worker-candidate-cutover.outcome == 'success' }}");
    expect(workflow).toContain("id: production-historical-core-audit\n        if: ${{ steps.production-worker-candidate-cutover.outcome == 'success' && steps.production-original-language-v2-audit.outcome == 'success' }}");
    expect(workflow).toContain("id: production-worker-audit-identity\n        if: ${{ steps.production-worker-candidate-cutover.outcome == 'success' && steps.production-original-language-v2-audit.outcome == 'success' && steps.production-historical-core-audit.outcome == 'success' }}");
  });
});
