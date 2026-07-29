import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  activeProductionVersionId,
  candidateProductionD1DatabaseName,
  captureProductionPredecessorAnchor,
  reconcileProductionPostMutation,
  activePreviewVersionId,
  candidatePreviewD1DatabaseName,
  capturePreviewPredecessorAnchor,
  observePreviewPostMutation,
  reconcilePreviewPostMutation,
} from '../../../scripts/preview-release-reconciliation.js';

const root = new URL('../../../', import.meta.url);
const predecessorVersion = '123e4567-e89b-42d3-a456-426614174000';
const candidateVersion = '223e4567-e89b-42d3-a456-426614174000';
const predecessorDeployment = '323e4567-e89b-42d3-a456-426614174000';
const candidateDeployment = '423e4567-e89b-42d3-a456-426614174000';
const predecessorD1Id = '94c4938b-7800-4d68-9097-0df33c31fdc1';
const candidateD1Id = '62b871a6-5b4d-4d9b-8f52-301f6c878f48';
const candidateD1Name = 'theologai-preview-20260728-transform11-a';
const productionCandidateD1Id = 'f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395';
const productionCandidateD1Name = 'theologai-production-20260728-hierarchy-a';

function deployments(id = predecessorDeployment, version = predecessorVersion): string {
  return JSON.stringify([{
    id, created_on: '2026-07-23T12:00:00.000Z', versions: [{ version_id: version, percentage: 100 }],
  }]);
}

function versionView(
  version = predecessorVersion,
  d1Id = predecessorD1Id,
  databaseId: string | undefined = d1Id,
): string {
  const binding: Record<string, string> = { name: 'THEOLOGAI_DB', type: 'd1', id: d1Id };
  if (databaseId !== undefined) binding.database_id = databaseId;
  return JSON.stringify({ id: version, resources: { bindings: [binding] } });
}

function inventory(id = candidateD1Id, name = candidateD1Name): string {
  return JSON.stringify([{ uuid: id, name }]);
}

function predecessorConfig(config: string): string {
  return config
    .replace(`database_name = "${candidateD1Name}"`, 'database_name = "theologai-preview-20260722-b"')
    .replace(`database_id = "${candidateD1Id}"`, `database_id = "${predecessorD1Id}"`);
}

describe('preview release reconciliation evidence', () => {
  it('uses an independently fixed production root binding for exact candidate reconciliation', async () => {
    const config = await readFile(new URL('wrangler.toml', root), 'utf8');
    const productionInventory = JSON.stringify([{ uuid: productionCandidateD1Id, name: productionCandidateD1Name }]);
    const anchor = captureProductionPredecessorAnchor({
      deploymentsText: deployments(), predecessorVersionViewText: versionView(predecessorVersion, predecessorD1Id),
      wranglerConfigText: config, d1InventoryText: productionInventory,
    });
    expect(anchor).toMatchObject({
      worker: 'theologai', candidateD1: { binding: 'THEOLOGAI_DB', databaseName: productionCandidateD1Name, databaseId: productionCandidateD1Id },
      predecessorD1: { binding: 'THEOLOGAI_DB', databaseId: predecessorD1Id }, d1Changed: true,
    });
    expect(candidateProductionD1DatabaseName({ wranglerConfigText: config, d1InventoryText: productionInventory })).toBe(productionCandidateD1Name);
    expect(activeProductionVersionId(deployments())).toBe(predecessorVersion);
    expect(reconcileProductionPostMutation({
      predecessorAnchorText: JSON.stringify(anchor), postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, productionCandidateD1Id), wranglerConfigText: config,
    })).toMatchObject({ worker: 'theologai', candidateBindingMatches: true, candidateConfigMatchesAnchor: true });
    expect(() => reconcileProductionPostMutation({
      predecessorAnchorText: JSON.stringify(anchor), postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, predecessorD1Id), wranglerConfigText: config,
    })).toThrow('does not match the checked-out readiness-tested candidate D1');
  });

  it('captures distinct observed predecessor and readiness-tested candidate D1 identities', async () => {
    const config = await readFile(new URL('wrangler.toml', root), 'utf8');
    const anchor = capturePreviewPredecessorAnchor({
      deploymentsText: deployments(), predecessorVersionViewText: versionView(), wranglerConfigText: config, d1InventoryText: inventory(),
    });
    expect(anchor).toMatchObject({
      schemaVersion: 3,
      worker: 'theologai-preview',
      predecessorVersionId: predecessorVersion,
      predecessorDeploymentId: predecessorDeployment,
      predecessorD1: { binding: 'THEOLOGAI_DB', databaseId: predecessorD1Id },
      candidateD1: { binding: 'THEOLOGAI_DB', databaseName: candidateD1Name, databaseId: candidateD1Id },
      d1Changed: true,
    });
    expect(anchor.candidateD1InventorySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(anchor.predecessorDeploymentsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(anchor.predecessorVersionViewSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(candidatePreviewD1DatabaseName({ wranglerConfigText: config, d1InventoryText: inventory() })).toBe(candidateD1Name);
    expect(activePreviewVersionId(deployments())).toBe(predecessorVersion);
  });

  it('records only a sole active candidate-bound cutover without attempting rollback or cleanup', async () => {
    const config = await readFile(new URL('wrangler.toml', root), 'utf8');
    const anchor = capturePreviewPredecessorAnchor({
      deploymentsText: deployments(), predecessorVersionViewText: versionView(), wranglerConfigText: config, d1InventoryText: inventory(),
    });
    const result = reconcilePreviewPostMutation({
      predecessorAnchorText: JSON.stringify(anchor),
      postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, candidateD1Id),
      wranglerConfigText: config,
    });
    expect(result).toMatchObject({
      schemaVersion: 3,
      worker: 'theologai-preview',
      predecessorVersionId: predecessorVersion,
      predecessorDeploymentId: predecessorDeployment,
      predecessorD1: { binding: 'THEOLOGAI_DB', databaseId: predecessorD1Id },
      observedActiveVersionId: candidateVersion,
      observedActiveDeploymentId: candidateDeployment,
      observedActiveD1: { binding: 'THEOLOGAI_DB', databaseId: candidateD1Id },
      candidateD1: { binding: 'THEOLOGAI_DB', databaseName: candidateD1Name, databaseId: candidateD1Id },
      d1Changed: true,
      candidateConfigMatchesAnchor: true,
      candidateBindingMatches: true,
    });
    expect(result.predecessorAnchorSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.postMutationDeploymentsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.observedActiveVersionViewSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed for malformed, swapped, or missing D1 identities while allowing a same-D1 release', async () => {
    const originalConfig = await readFile(new URL('wrangler.toml', root), 'utf8');
    const config = originalConfig;
    expect(() => capturePreviewPredecessorAnchor({
      deploymentsText: JSON.stringify([{ id: predecessorDeployment, created_on: '2026-07-23T12:00:00.000Z', versions: [{ version_id: predecessorVersion, percentage: 99 }] }]),
      predecessorVersionViewText: versionView(), wranglerConfigText: config, d1InventoryText: inventory(),
    })).toThrow('not a sole 100% version');

    expect(() => capturePreviewPredecessorAnchor({
      deploymentsText: deployments(), predecessorVersionViewText: versionView(candidateVersion), wranglerConfigText: config, d1InventoryText: inventory(),
    })).toThrow('identity does not match the active deployment');
    expect(() => capturePreviewPredecessorAnchor({
      deploymentsText: deployments(),
      predecessorVersionViewText: JSON.stringify({ id: predecessorVersion, resources: { bindings: [
        { name: 'THEOLOGAI_DB', type: 'd1', id: predecessorD1Id, database_id: predecessorD1Id },
        { name: 'THEOLOGAI_DB', type: 'd1', id: predecessorD1Id, database_id: predecessorD1Id },
      ] } }), wranglerConfigText: config, d1InventoryText: inventory(),
    })).toThrow('exactly one THEOLOGAI_DB binding');
    expect(() => capturePreviewPredecessorAnchor({
      deploymentsText: deployments(), predecessorVersionViewText: JSON.stringify({
        id: predecessorVersion, resources: { bindings: [{ name: 'THEOLOGAI_DB', type: 'd1', id: predecessorD1Id }] },
      }),
      wranglerConfigText: config, d1InventoryText: inventory(),
    })).toThrow('version D1 binding keys are malformed');
    expect(() => capturePreviewPredecessorAnchor({
      deploymentsText: deployments(), predecessorVersionViewText: versionView(predecessorVersion, predecessorD1Id, candidateD1Id),
      wranglerConfigText: config, d1InventoryText: inventory(),
    })).toThrow('id/database_id is not one canonical UUID');
    expect(() => candidatePreviewD1DatabaseName({
      wranglerConfigText: config, d1InventoryText: inventory(candidateD1Id, 'swapped-preview-name'),
    })).toThrow('does not match the read-only inventory ID/name mapping');
    const sameD1Anchor = capturePreviewPredecessorAnchor({
      deploymentsText: deployments(), predecessorVersionViewText: versionView(), wranglerConfigText: predecessorConfig(originalConfig),
      d1InventoryText: inventory(predecessorD1Id, 'theologai-preview-20260722-b'),
    });
    expect(sameD1Anchor.d1Changed).toBe(false);
  });

  it('allows a same-D1 code-only deployment when the post-deploy binding still equals its candidate', async () => {
    const config = predecessorConfig(await readFile(new URL('wrangler.toml', root), 'utf8'));
    const anchor = capturePreviewPredecessorAnchor({
      deploymentsText: deployments(), predecessorVersionViewText: versionView(), wranglerConfigText: config,
      d1InventoryText: inventory(predecessorD1Id, 'theologai-preview-20260722-b'),
    });
    const result = reconcilePreviewPostMutation({
      predecessorAnchorText: JSON.stringify(anchor), postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, predecessorD1Id), wranglerConfigText: config,
    });
    expect(result).toMatchObject({
      d1Changed: false,
      observedActiveVersionId: candidateVersion,
      candidateBindingMatches: true,
      candidateConfigMatchesAnchor: true,
    });
  });

  it('fails closed for a malformed anchor, candidate drift, or retained-old-D1 drift while retaining a verdict', async () => {
    const config = await readFile(new URL('wrangler.toml', root), 'utf8');
    const anchor = capturePreviewPredecessorAnchor({
      deploymentsText: deployments(), predecessorVersionViewText: versionView(), wranglerConfigText: config, d1InventoryText: inventory(),
    });
    expect(() => reconcilePreviewPostMutation({
      predecessorAnchorText: JSON.stringify({ ...anchor, unexpected: true }), postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, candidateD1Id), wranglerConfigText: config,
    })).toThrow('predecessor anchor keys are malformed');
    expect(() => reconcilePreviewPostMutation({
      predecessorAnchorText: JSON.stringify({ ...anchor, d1Changed: false }), postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, candidateD1Id), wranglerConfigText: config,
    })).toThrow('predecessor anchor is not canonical');
    const oldD1Observation = observePreviewPostMutation({
      predecessorAnchorText: JSON.stringify(anchor), postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, predecessorD1Id), wranglerConfigText: config,
    });
    expect(oldD1Observation).toMatchObject({
      observedActiveD1: { binding: 'THEOLOGAI_DB', databaseId: predecessorD1Id },
      candidateD1: { binding: 'THEOLOGAI_DB', databaseId: candidateD1Id },
      d1Changed: true,
      candidateConfigMatchesAnchor: true,
      candidateBindingMatches: false,
    });
    expect(JSON.stringify(oldD1Observation)).not.toContain('resources');
    expect(() => reconcilePreviewPostMutation({
      predecessorAnchorText: JSON.stringify(anchor), postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, predecessorD1Id), wranglerConfigText: config,
    })).toThrow('does not match the checked-out readiness-tested candidate D1');
    const changedConfig = config.replace(`database_name = "${candidateD1Name}"`, 'database_name = "different-preview"');
    expect(observePreviewPostMutation({
      predecessorAnchorText: JSON.stringify(anchor), postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, candidateD1Id), wranglerConfigText: changedConfig,
    }).candidateConfigMatchesAnchor).toBe(false);
    expect(() => reconcilePreviewPostMutation({
      predecessorAnchorText: JSON.stringify(anchor), postMutationDeploymentsText: deployments(candidateDeployment, candidateVersion),
      observedActiveVersionViewText: versionView(candidateVersion, candidateD1Id),
      wranglerConfigText: changedConfig,
    })).toThrow('no longer matches the captured candidate readiness anchor');
  });

  it('keeps exact-name candidate readiness and candidate-binding proof ahead of both black-box audits', async () => {
    const workflow = await readFile(new URL('.github/workflows/pr.yml', root), 'utf8');
    const mapping = workflow.indexOf('Capture checked-out candidate preview D1 mapping (read-only)');
    const readiness = workflow.indexOf('Verify candidate preview D1 is compatible (read-only)');
    const predecessor = workflow.indexOf('Capture preview predecessor reconciliation anchor (read-only)');
    const candidateCutover = workflow.indexOf('Require deployed candidate preview D1 binding (read-only)');
    const originalLanguageAudit = workflow.indexOf('Audit original-language v2 contract on preview');
    const historicalAudit = workflow.indexOf('Audit Transform-9 historical core contract on preview');
    expect(mapping).toBeGreaterThan(-1);
    expect(readiness).toBeGreaterThan(mapping);
    expect(predecessor).toBeGreaterThan(readiness);
    expect(candidateCutover).toBeGreaterThan(predecessor);
    expect(originalLanguageAudit).toBeGreaterThan(candidateCutover);
    expect(historicalAudit).toBeGreaterThan(candidateCutover);
    expect(workflow).toContain('npx --no-install wrangler d1 list --json > "$RUNNER_TEMP/preview-d1-inventory.json"');
    expect(workflow).toContain('--database "$candidate_d1_name" --env preview');
    expect(workflow).toContain('observe-post-mutation');
    expect(workflow).toContain('Upload preview candidate cutover observation');
    expect(workflow).toContain('Hash sanitized preview reconciliation evidence');
    expect(workflow).toContain('candidate_cutover_observation_sha256');
    expect(workflow).toContain('post_mutation_reconciliation_sha256');
  });
});
