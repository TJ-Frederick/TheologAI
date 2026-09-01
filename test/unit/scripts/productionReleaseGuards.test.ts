import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_PROFILE as historicalProfile } from '../../../scripts/audit-historical-core-preview.js';
import { SPINE_PRODUCTION_PROFILE } from '../../../scripts/audit-historical-spine-preview.js';
import { PRODUCTION_PROFILE as languageProfile } from '../../../scripts/audit-original-language-v3-preview.js';

const root = new URL('../../../', import.meta.url);

describe('production release guards', () => {
  it('keeps all post-deploy audit profiles fixed to the production custom domain and 4.0.0', () => {
    expect(languageProfile).toEqual({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '4.0.0',
      audit: 'original-language-v3-production', endpointClass: 'production-custom', label: 'production',
    });
    expect(historicalProfile).toMatchObject({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '4.0.0',
      audit: 'historical-core-production', endpointClass: 'production-custom', label: 'production',
      primarySource: {
        contractVersion: '6', schemaVersion: '6', openWorldHint: false,
        providerEnum: ['local'], providerMaximum: 1,
        inputSchemaSha256: '37849624bac2e884106050fcff39851e40cac31969b4f7511f516f78348fea87',
        outputSchemaSha256: '25758f8d06c43c3f2961fa7b35ba1d62a548df923589b391c65204813a6511b8',
        externalDiscoveryBoundary: 'rejected_at_input_schema',
      },
    });
    expect(SPINE_PRODUCTION_PROFILE).toMatchObject({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '4.0.0',
      audit: 'historical-spine-production', endpointClass: 'production-custom', label: 'production',
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
    const languageAudit = workflow.indexOf('Audit original-language v3 depth contract on production');
    const historicalAudit = workflow.indexOf('Audit Transform-9 historical core contract on production');
    const spineAudit = workflow.indexOf('Audit Transform-11 historical spine contract on production');
    const stable = workflow.indexOf('Verify production Worker remained active through audit (read-only)');
    const finalObservation = workflow.indexOf('Capture final production routing/binding observation (read-only)');
    const finalArtifact = workflow.indexOf('Upload final production routing/binding observation');
    const artifact = workflow.indexOf('Upload protected production audit evidence');
    expect([mapping, readiness, predecessor, versions, deploy, identity, candidateCutover, languageAudit, historicalAudit, spineAudit, stable, finalObservation, finalArtifact, artifact].every(index => index >= 0)).toBe(true);
    expect(readiness).toBeGreaterThan(mapping);
    expect(predecessor).toBeGreaterThan(readiness);
    expect(versions).toBeGreaterThan(predecessor);
    expect(deploy).toBeGreaterThan(versions);
    expect(identity).toBeGreaterThan(deploy);
    expect(candidateCutover).toBeGreaterThan(identity);
    expect(languageAudit).toBeGreaterThan(candidateCutover);
    expect(historicalAudit).toBeGreaterThan(languageAudit);
    expect(spineAudit).toBeGreaterThan(historicalAudit);
    expect(stable).toBeGreaterThan(spineAudit);
    expect(finalObservation).toBeGreaterThan(stable);
    expect(finalArtifact).toBeGreaterThan(finalObservation);
    expect(artifact).toBeGreaterThan(finalArtifact);
    expect(workflow).toContain('scripts/production-release-reconciliation.ts candidate-d1-name');
    expect(workflow).toContain('npm run d1:remote:check -- --database "$candidate_d1_name"');
    expect(workflow).toContain('scripts/verify-production-worker-deployment.ts verify-deploy');
    expect(workflow).toContain('scripts/verify-production-worker-deployment.ts verify-audit-stability');
    expect(workflow).toContain('npm run audit:original-language-v3-production');
    expect(workflow).toContain('npm run audit:historical-core-production');
    expect(workflow).toContain('npm run audit:historical-spine-production');
    expect(workflow).not.toContain('d1 create');
    expect(workflow).not.toContain('d1 delete');
  });

  it('verifies the protected receipt against the preview-suffixed server identity', async () => {
    const workflow = await readFile(new URL('.github/workflows/deploy.yml', root), 'utf8');
    expect((workflow.match(/process\.stdout\.write\(packageJson\.version \+ '-preview'\)/g) ?? [])).toHaveLength(2);
    expect((workflow.match(/--expected-server-version "\$preview_server_version"/g) ?? [])).toHaveLength(2);
    expect(workflow).not.toContain('process.stdout.write(packageJson.version)');
    expect(workflow).not.toContain('--expected-server-version "$server_version"');
  });

  it('revalidates the exact gate artifact before dependencies, secrets, Cloudflare, or D1 and retains seven release artifacts', async () => {
    const workflow = await readFile(new URL('.github/workflows/deploy.yml', root), 'utf8');
    const deployStart = workflow.indexOf('  deploy:');
    const resolveContext = workflow.indexOf('Resolve production release comparison context', deployStart);
    const downloadPlan = workflow.indexOf('Download verified production deployment plan gate', deployStart);
    const revalidatePlan = workflow.indexOf('Revalidate production deployment plan after approval', deployStart);
    const npmInstall = workflow.indexOf('- run: npm ci --no-audit', deployStart);
    const customDomain = workflow.indexOf('Detect production custom-domain declaration change', deployStart);
    const firstCloudflareRead = workflow.indexOf('Capture checked-out candidate production D1 mapping (read-only)', deployStart);
    const deployMutation = workflow.indexOf('Deploy to Cloudflare Workers', deployStart);
    expect([deployStart, resolveContext, downloadPlan, revalidatePlan, npmInstall, customDomain, firstCloudflareRead, deployMutation].every(index => index >= 0)).toBe(true);
    expect(resolveContext).toBeLessThan(downloadPlan);
    expect(downloadPlan).toBeLessThan(revalidatePlan);
    expect(revalidatePlan).toBeLessThan(npmInstall);
    expect(npmInstall).toBeLessThan(customDomain);
    expect(customDomain).toBeLessThan(firstCloudflareRead);
    expect(firstCloudflareRead).toBeLessThan(deployMutation);

    const preRevalidation = workflow.slice(deployStart, revalidatePlan);
    expect(preRevalidation).not.toMatch(/npm ci|secrets\.|wrangler|cloudflare|d1\b/i);
    const revalidationToInstall = workflow.slice(revalidatePlan, npmInstall);
    expect(revalidationToInstall).toContain('production-deployment-plan.mjs verify');
    expect(revalidationToInstall).toContain('value.classificationSucceeded !== true');
    expect(revalidationToInstall).toContain('value.deployRequired !== true');
    expect(revalidationToInstall).not.toMatch(/secrets\.|wrangler|cloudflare|d1\b/i);

    const deployJob = workflow.slice(deployStart);
    expect((deployJob.match(/uses: actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/g) ?? [])).toHaveLength(7);
    expect((deployJob.match(/retention-days: 30/g) ?? [])).toHaveLength(7);
    const releaseUploads = [...deployJob.matchAll(/      - name: Upload [^\n]+[\s\S]*?(?=\n      - name:|$)/g)].map(match => match[0]);
    expect(releaseUploads).toHaveLength(7);
    for (const upload of releaseUploads) {
      expect(upload).not.toContain('production-deployment-plan.json');
      expect(upload).not.toContain('production-deployment-plan.sha256');
      expect(upload).not.toContain('retention-days: 1\n');
    }
  });

  it('retains a non-strict final routing observation after every attempted deploy, while requiring it for a successful release', async () => {
    const workflow = await readFile(new URL('.github/workflows/deploy.yml', root), 'utf8');
    const historicalAuditScript = await readFile(new URL('../../../scripts/audit-historical-core-preview.ts', import.meta.url), 'utf8');
    const finalObservation = workflow.indexOf('Capture final production routing/binding observation (read-only)');
    const finalArtifact = workflow.indexOf('Upload final production routing/binding observation');
    const finalPostAuditIdentity = workflow.indexOf('Verify final production identity after audited release (read-only)');
    const protectedEvidence = workflow.indexOf('Upload protected production audit evidence');
    const observationBlock = workflow.slice(finalObservation, finalArtifact);
    const finalArtifactBlock = workflow.slice(finalArtifact, protectedEvidence);

    expect(finalObservation).toBeGreaterThan(workflow.indexOf('Deploy to Cloudflare Workers'));
    expect(observationBlock).toContain("steps.production-worker-deploy.outcome != 'skipped'");
    expect(observationBlock).toContain("steps.production-predecessor.outcome == 'success'");
    expect(observationBlock).not.toContain('continue-on-error');
    expect(observationBlock).toContain('observe-post-mutation');
    expect(observationBlock).not.toContain('production-audited-identity');
    expect(observationBlock).not.toContain('reconcile-post-mutation');
    expect(finalArtifactBlock).toContain("steps.production-worker-deploy.outcome != 'skipped'");
    expect(finalArtifactBlock).toContain('if-no-files-found: warn');
    expect(finalPostAuditIdentity).toBeGreaterThan(finalArtifact);
    expect(finalPostAuditIdentity).toBeLessThan(protectedEvidence);

    // A failed deploy never becomes green because its action failed. A deploy
    // that otherwise passed its strict gates is also terminal if final
    // routing/binding evidence could not be captured or hashed.
    expect(workflow).toContain("id: production-audit-evidence\n        if: ${{ steps.production-worker-deploy.outcome == 'success' && steps.production-worker-candidate-cutover.outcome == 'success' && steps.production-primary-source-edge-stabilization-gate.outcome == 'success' && steps.production-original-language-v3-audit.outcome == 'success' && steps.production-historical-core-audit.outcome == 'success' && steps.production-historical-spine-audit.outcome == 'success' && steps.production-worker-audit-identity.outcome == 'success' && steps.preview-control-after-production-audits.outcome == 'success' && steps.final-environment-isolation.outcome == 'success' && steps.production-final-observation.outcome == 'success' && steps.production-final-post-audit-identity.outcome == 'success' }}");
    expect(workflow).toContain('Capture preview control before production deployment (read-only)');
    expect(workflow).toContain('Verify preview control remained unchanged after production deployment (read-only)');
    expect(workflow).toContain('Verify preview control remained unchanged after production audits (read-only)');
    expect(workflow).toContain('Capture final schema-0009 environment isolation receipt (read-only)');
    expect(workflow).toContain('production-d1-readiness-receipt.json');
    expect(workflow).toContain('--production-audited-identity "$RUNNER_TEMP/production-worker-deployment-identity.json"');
    expect(workflow).toContain('Verify final production identity after audited release (read-only)');
    expect(workflow).toContain('scripts/production-release-reconciliation.ts observe-final-post-audit');
    expect(workflow).toContain("steps.production-final-post-audit-identity.outcome == 'success'");
    expect(workflow).toContain('production-worker-final-post-audit-identity.json');
    expect(historicalAuditScript).toContain('${profile.label} expanded-discovery/catalog execution invariant drifted');
    expect(historicalAuditScript).not.toContain('preview expanded-discovery/catalog execution invariant drifted');

    // Strict cutover, fixed audits, audit-stability proof, and protected
    // evidence remain unavailable unless the deploy action itself succeeded.
    expect(workflow).toContain("id: production-worker-pre-audit-identity\n        if: ${{ steps.production-worker-deploy.outcome == 'success' }}");
    expect(workflow).toContain("id: production-worker-candidate-cutover\n        if: ${{ steps.production-worker-deploy.outcome == 'success' && steps.production-worker-pre-audit-identity.outcome == 'success' && steps.preview-control-after-production-deploy.outcome == 'success' }}");
    expect(workflow).toContain("id: production-primary-source-edge-stabilization-gate\n        if: ${{ always() && steps.production-worker-candidate-cutover.outcome == 'success' }}");
    expect(workflow).toContain("id: production-original-language-v3-audit\n        if: ${{ steps.production-primary-source-edge-stabilization-gate.outcome == 'success' }}");
    expect(workflow).toContain("id: production-historical-core-audit\n        if: ${{ steps.production-primary-source-edge-stabilization-gate.outcome == 'success' && steps.production-original-language-v3-audit.outcome == 'success' }}");
    expect(workflow).toContain("id: production-historical-spine-audit\n        if: ${{ steps.production-primary-source-edge-stabilization-gate.outcome == 'success' && steps.production-original-language-v3-audit.outcome == 'success' && steps.production-historical-core-audit.outcome == 'success' }}");
    expect(workflow).toContain("id: production-worker-audit-identity\n        if: ${{ steps.production-primary-source-edge-stabilization-gate.outcome == 'success' && steps.production-original-language-v3-audit.outcome == 'success' && steps.production-historical-core-audit.outcome == 'success' && steps.production-historical-spine-audit.outcome == 'success' }}");
  });
});
