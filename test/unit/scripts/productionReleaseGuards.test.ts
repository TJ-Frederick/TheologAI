import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_PROFILE as historicalProfile } from '../../../scripts/audit-historical-core-preview.js';
import { SPINE_PRODUCTION_PROFILE } from '../../../scripts/audit-historical-spine-preview.js';
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
    expect(SPINE_PRODUCTION_PROFILE).toMatchObject({
      endpoint: 'https://mcp.theologai.xyz/mcp', hostname: 'mcp.theologai.xyz', serverVersion: '3.6.0',
      audit: 'historical-spine-production', endpointClass: 'production-custom', label: 'production',
    });
  });

  it('requires exact generated candidate readiness and Worker/D1 proof before the fixed corpus audit',async()=>{
    const workflow=parse(await readFile(new URL('.github/workflows/deploy.yml',root),'utf8'));
    const steps=workflow.jobs.deploy.steps,position=(term:string)=>{const byId=steps.findIndex((step:any)=>step.id===term);return byId>=0?byId:steps.findIndex((step:any)=>step.run?.includes(term));};
    const ordered=['candidate-d1-name','operator.ts verify --role production','capture-predecessor','production-worker-deploy','production-worker-candidate-cutover','production-corpus-live','production-worker-audit-identity','production-final-observation','production-final-post-audit-identity','production-audit-evidence'];
    const indices=ordered.map(position);expect(indices.every(index=>index>=0)).toBe(true);expect(indices).toEqual([...indices].sort((x,y)=>x-y));
    expect(JSON.stringify(steps)).not.toMatch(/d1 create|d1 delete|npm run d1:remote:check|npm run audit:(historical|original-language|primary-source-edge)/);
    const current=position('operator.ts verify-preview-current');expect(current).toBeLessThan(position('production-worker-deploy'));expect(current).toBeGreaterThan(position('capture-control'));
    expect(steps.find((s:any)=>s.id==='production-worker-deploy').with.command).toContain('corpus-wrangler.toml');
  });

  it('uses the protected corpus consumer twice and validates the preview server version in the receipt adapter',async()=>{
    const workflow=await readFile(new URL('.github/workflows/deploy.yml',root),'utf8');const adapter=await readFile(new URL('scripts/corpus-release-artifact.ts',root),'utf8');
    expect((workflow.match(/operator.ts consume-preview/g)??[])).toHaveLength(2);expect(adapter).toContain("live.serverVersion === '3.6.0-preview'");expect(workflow).toContain('digest-mismatch: error');expect(workflow).toContain('trustedCorpusPreviewRun');
  });

  it('revalidates the exact gate artifact before dependencies, secrets, Cloudflare, or D1 and retains release evidence plus the bounded proof journal', async () => {
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

    const deployJob=parse(workflow).jobs.deploy;const uploads=deployJob.steps.filter((step:any)=>step.uses?.startsWith('actions/upload-artifact@'));
    expect(uploads).toHaveLength(7);expect(uploads.some((step:any)=>step.with.name.startsWith('corpus-production-proof-'))).toBe(true);
    for(const upload of uploads){expect(upload.uses).toBe('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a');expect(upload.with['retention-days']).toBe(30);expect(String(upload.with.path)).not.toContain('production-deployment-plan');}

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
    expect(workflow).toContain("id: production-audit-evidence\n        if: ${{ steps.production-worker-deploy.outcome == 'success' && steps.production-worker-candidate-cutover.outcome == 'success' && steps.production-corpus-live.outcome == 'success' && steps.production-worker-audit-identity.outcome == 'success' && steps.preview-control-after-production-audits.outcome == 'success' && steps.final-environment-isolation.outcome == 'success' && steps.production-final-observation.outcome == 'success' && steps.production-final-post-audit-identity.outcome == 'success' }}");
    expect(workflow).toContain('Capture preview control before production deployment (read-only)');
    expect(workflow).toContain('Verify preview control remained unchanged after production deployment (read-only)');
    expect(workflow).toContain('Verify preview control remained unchanged after production audits (read-only)');
    expect(workflow).toContain('Capture final corpus environment isolation receipt (read-only)');
    expect(workflow).toContain('corpus-verification.json');
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
    expect(workflow).toContain("id: production-corpus-live\n        if: ${{ steps.production-worker-candidate-cutover.outcome == 'success' }}");
    expect(workflow).toContain("id: production-worker-audit-identity\n        if: ${{ steps.production-corpus-live.outcome == 'success' }}");
  });
});
