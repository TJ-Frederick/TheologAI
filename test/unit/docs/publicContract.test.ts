import { readFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { Server } from '@modelcontextprotocol/server';
import { createTheologAiMcpServer } from '../../../src/mcp/server.js';
import { createWorkerCompositionRoot } from '../../../src/tools/worker/index.js';
import { createCompositionRoot } from '../../../src/tools/v2/index.js';
import { createDeterministicMcpFixture } from '../../fixtures/mcpCompositionRoot.js';
import { createSimpleD1 } from '../../helpers/mockD1.js';
import type { Env } from '../../../src/worker-env.js';

interface DataManifest {
  expectedCounts: {
    documents: number;
    morphology: number;
    strongs: number;
  };
}

const openConnections: Array<{ client: Client; server: Server }> = [];
const PUBLIC_CONTRACT_MARKER = /<!-- theologai-public-contract tools=(\d+) structured=([a-z_,]+) -->/;
const RELEASE_AUTHORITY_MARKER = /<!-- theologai-release-authority v1 role=([a-z-]+) current=([A-Za-z0-9./-]+) -->/;

const releaseAuthorityDocuments = {
  'CLAUDE.md': ['developer-guide', 'docs/CURRENT-RELEASE.md'],
  'CHANGELOG.md': ['historical-changelog', 'docs/CURRENT-RELEASE.md'],
  'README.md': ['project-entrypoint', 'docs/CURRENT-RELEASE.md'],
  'docs/CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md': ['canary-runbook', 'docs/CURRENT-RELEASE.md'],
  'docs/ccel-search-preflight.md': ['architecture-record', 'docs/CURRENT-RELEASE.md'],
  'docs/CURRENT-RELEASE.md': ['current-snapshot', 'self'],
  'docs/CUSTOM-DOMAIN-MIGRATION.md': ['operations-runbook', 'docs/CURRENT-RELEASE.md'],
  'docs/D1-DATA-WORKFLOW.md': ['data-runbook', 'docs/CURRENT-RELEASE.md'],
  'docs/PHASE-3B-PLAN.md': ['delivery-plan', 'docs/CURRENT-RELEASE.md'],
  'docs/PREVIEW-RELEASE-RECONCILIATION.md': ['historical-reconciliation', 'docs/CURRENT-RELEASE.md'],
  'docs/PRIMARY-SOURCE-CATALOG-SCOPE.md': ['catalog-history', 'docs/CURRENT-RELEASE.md'],
  'docs/PRODUCTION-RELEASE-RECONCILIATION.md': ['historical-reconciliation', 'docs/CURRENT-RELEASE.md'],
  'docs/PRODUCTION-ROLLBACK-REHEARSAL.md': ['rollback-rehearsal-runbook', 'docs/CURRENT-RELEASE.md'],
  'docs/ROADMAP.md': ['delivery-roadmap', 'docs/CURRENT-RELEASE.md'],
  'docs/TRANSFORM11-HISTORICAL-SPINE-ACTIVATION.md': ['historical-activation', 'docs/CURRENT-RELEASE.md'],
  'docs/UBS-HEBREW-V0.9.2-DERIVED-NOTICE.md': ['historical-rights-notice', 'docs/CURRENT-RELEASE.md'],
  'docs/UBS-SEMANTICS-FOUNDATION.md': ['historical-foundation', 'docs/CURRENT-RELEASE.md'],
  'docs/worker-operations.md': ['operations-runbook', 'docs/CURRENT-RELEASE.md'],
} as const;

function parseReleaseAuthorityMarker(document: string, path: string) {
  expect(
    document.match(/<!-- theologai-release-authority/g),
    `${path} must contain one authority marker`,
  ).toHaveLength(1);
  const matches = [...document.matchAll(new RegExp(RELEASE_AUTHORITY_MARKER, 'g'))];
  expect(matches, `${path} must contain exactly one closed release-authority marker`).toHaveLength(1);
  return [matches[0][1], matches[0][2]];
}

function parsePublicContractMarker(document: string, path: string) {
  const matches = [...document.matchAll(new RegExp(PUBLIC_CONTRACT_MARKER, 'g'))];
  expect(matches, `${path} must contain exactly one public-contract marker`).toHaveLength(1);
  return {
    toolCount: Number(matches[0][1]),
    structuredTools: matches[0][2].split(',').sort(),
  };
}

async function readProjectFile(path: string): Promise<string> {
  return readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

function prose(document: string): string {
  return document.replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
}

async function readProjectProse(path: string): Promise<string> {
  return prose(await readProjectFile(path));
}

afterAll(async () => {
  await Promise.allSettled(
    openConnections.flatMap(({ client, server }) => [client.close(), server.close()]),
  );
});

describe('published project contract', () => {
  it('routes one closed release-authority graph to the current snapshot', async () => {
    const entries = Object.entries(releaseAuthorityDocuments);
    const documents = await Promise.all(entries.map(([path]) => readProjectFile(path)));

    for (const [index, [path, expectedMarker]] of entries.entries()) {
      expect(parseReleaseAuthorityMarker(documents[index], path)).toEqual(expectedMarker);
    }

    const current = prose(documents[entries.findIndex(([path]) => path === 'docs/CURRENT-RELEASE.md')]);
    expect(current).toContain("repository's sole present-tense release identity authority");
    expect(current).toContain('The gate artifact is not one of the seven release artifacts.');
    expect(current).toContain('Rollback requires a separate owner decision');
  });

  it('links the current roadmap and quarantines known historical artifacts', async () => {
    const historicalArtifacts = [
      'TEST_REPORT.md',
      'docs/bible-mcp-prd.md',
      'docs/parallel-passages-tool-spec.md',
      'docs/bible-mcp-architecture.md',
      'docs/bible-mcp-development-plan.md',
      'docs/RELEASE_NOTES_v3.4.0.md',
    ];
    const [readme, ...artifacts] = await Promise.all([
      readProjectFile('README.md'),
      ...historicalArtifacts.map(readProjectFile),
    ]);

    expect(readme).toContain('[docs/ROADMAP.md](docs/ROADMAP.md)');
    for (const artifact of artifacts) {
      const banner = artifact.slice(0, 700).replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
      expect(banner).toMatch(/Historical/i);
      expect(banner).toMatch(/not\s+the\s+current/i);
      expect(banner).toMatch(/product\s+contract/i);
      expect(banner).toContain('docs/ROADMAP.md');
    }
  });

  it('keeps the README tool and prompt registries aligned with the MCP server', async () => {
    const readme = await readProjectFile('README.md');
    const { root } = createDeterministicMcpFixture();
    const server = createTheologAiMcpServer(root, 'contract-test').server;
    const client = new Client(
      { name: 'public-contract-test', version: '1.0.0' },
      { capabilities: {} },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    openConnections.push({ client, server });

    const [{ tools }, { prompts }] = await Promise.all([
      client.listTools(),
      client.listPrompts(),
    ]);

    expect(tools).toHaveLength(12);
    expect(prompts).toHaveLength(6);
    for (const { name } of [...tools, ...prompts]) {
      expect(readme).toContain(`| \`${name}\` |`);
    }
  });

  it('ties every advertised tool count and structured-output list to both runtime registries', async () => {
    const documentPaths = ['README.md', 'CLAUDE.md', 'CHANGELOG.md'];
    const documents = await Promise.all(documentPaths.map(readProjectFile));
    // Use the real Node composition root here. The deterministic fixture is
    // valuable for protocol calls, but it must not be able to mask Node-only
    // registry drift in the published contract.
    const nodeDatabase = new Database(':memory:');
    nodeDatabase.exec(await readProjectFile('migrations/0001_initial_schema.sql'));
    nodeDatabase.exec(await readProjectFile('migrations/0002_ubs_parallel_passages.sql'));
    nodeDatabase.exec(await readProjectFile('migrations/0003_original_language_usage.sql'));
    nodeDatabase.exec(await readProjectFile('migrations/0004_ubs_hebrew_semantics.sql'));
    nodeDatabase.exec(await readProjectFile('migrations/0005_historical_section_identity_delivery.sql'));
    const nodeTools = createCompositionRoot({ database: nodeDatabase }).tools;
    nodeDatabase.close();
    const workerTools = createWorkerCompositionRoot({
      THEOLOGAI_DB: createSimpleD1(),
      THEOLOGAI_VERSION: 'public-contract-test',
    } as unknown as Env).tools;

    const describeRegistry = (tools: typeof nodeTools) => ({
      toolCount: tools.length,
      structuredTools: tools.filter(tool => tool.outputSchema !== undefined).map(tool => tool.name).sort(),
    });
    const nodeContract = describeRegistry(nodeTools);
    const workerContract = describeRegistry(workerTools);

    expect(workerContract).toEqual(nodeContract);
    expect(nodeContract).toEqual({
      toolCount: 12,
      structuredTools: [
        'bible_cross_references',
        'bible_lookup',
        'bible_verse_morphology',
        'classic_text_lookup',
        'commentary_lookup',
        'donation_config',
        'historical_hierarchy_lookup',
        'original_language_lookup',
        'original_language_study',
        'parallel_passages',
        'primary_source_search',
        'verify_donation',
      ],
    });
    for (const [index, document] of documents.entries()) {
      expect(parsePublicContractMarker(document, documentPaths[index])).toEqual(nodeContract);
    }
    expect(prose(documents[0])).toContain('work-inventory contract is intentionally bounded at 100 works');
  });

  it('keeps advertised corpus counts sourced from the data manifest', async () => {
    const [readme, developerGuide, confessionSkill, rawManifest] = await Promise.all([
      readProjectProse('README.md'),
      readProjectProse('CLAUDE.md'),
      readProjectProse('skills/confession-study/SKILL.md'),
      readProjectFile('data/data-manifest.json'),
    ]);
    const manifest = JSON.parse(rawManifest) as DataManifest;
    const { documents, morphology, strongs } = manifest.expectedCounts;

    expect(readme).toContain(`${documents} locally indexed`);
    expect(readme).toContain(`${morphology.toLocaleString('en-US')} indexed STEPBible morphology rows`);
    expect(readme).toContain(`${strongs.toLocaleString('en-US')} Strong's entries`);
    expect(developerGuide).toContain(`${documents} historical documents`);
    expect(confessionSkill).toContain(`includes ${documents} historical documents`);
    expect(confessionSkill).toContain('Call `primary_source_search` with one bounded, version-appropriate query');
    expect(confessionSkill).toContain('Version 6 uses the explicit local-only `providers: ["local"]` input');
    expect(confessionSkill).toContain('Version 7 is provider-neutral');
    expect(confessionSkill).toContain('`searchDepth: "standard"`');
    expect(confessionSkill).toContain('`searchDepth: "expanded"`');
    expect(confessionSkill).toContain('expanded discovery omitted those bounds');
    expect(confessionSkill).toContain('each selected canonical `resource_link` with MCP `resources/read`');
    expect(confessionSkill).toContain('Never relabel an issuing, drafting, revising, or');
    expect(confessionSkill).toContain('Never infer a tradition or author attribution');
    expect(confessionSkill).not.toContain('spanning the major Christian traditions');
    expect(confessionSkill).not.toContain('Call `classic_text_lookup` with `{ "query"');
    expect(`${developerGuide}\n${confessionSkill}`).not.toMatch(/18 historical documents/i);
  });

  it('documents current transport, disabled discovery and inactive corpus boundaries', async () => {
    const [readme, workerConfig, coordinatorGuide, roadmap, operations] = await Promise.all([
      readProjectProse('README.md'),
      readProjectFile('wrangler.toml'),
      readProjectProse('docs/CCEL-UPSTREAM-COORDINATOR.md'),
      readProjectProse('docs/ROADMAP.md'),
      readProjectProse('docs/worker-operations.md'),
    ]);

    expect(readme).not.toMatch(/1,000\+.*CCEL/i);
    expect(readme).not.toMatch(/eighteen locally indexed|18 locally indexed/i);
    expect(readme).not.toMatch(/six public-domain commentar/i);
    expect(readme).toMatch(/Both deployed environments do \*\*not\*\* currently fetch CCEL search\s+results or document bodies/);
    expect(readme).toContain('Production v6/local-only is deployed');
    expect(readme).toContain('preview runs the audited v7/discovery-only contract with CCEL execution disabled');
    expect(readme).toContain('current release snapshot records the active 35-work assignment');
    expect(readme).toContain('local Norton/Aquinas release candidate');
    expect(readme).toContain('wired into local runtime and MCP surfaces');
    expect(readme).toContain('before adapter');
    expect(readme).toContain('Durable Object lookup/RPC, or fetch');
    expect(readme).toContain('reconnect');
    expect(readme).toContain('reinitialize');
    expect(readme).toMatch(/keeps any requested year bounds on its local\s+queries/);
    expect(readme).toMatch(/Direct v7 queries that combine CCEL with\s+either year field/);
    expect(coordinatorGuide).toContain('Every executable unbounded CCEL provider result begins');
    expect(coordinatorGuide).toContain('A direct CCEL-bearing query with either');
    expect(roadmap).toContain('guided broad topical fallback');
    expect(roadmap).toContain('Direct CCEL-plus-year tool input remains fail-closed');
    const previewStart = workerConfig.indexOf('[env.preview]');
    expect(previewStart).toBeGreaterThan(0);
    expect(workerConfig.slice(0, previewStart)).toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY = "false"');
    expect(workerConfig.slice(previewStart)).toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY = "true"');
    expect(workerConfig.slice(previewStart)).toContain('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "false"');
    expect(workerConfig.slice(previewStart)).toContain('THEOLOGAI_ENABLE_CCEL_COORDINATOR = "false"');
    expect(operations).toContain('[current release snapshot](CURRENT-RELEASE.md)');
    expect(operations).toContain('CCEL execution remains disabled and Aquinas remains inactive');
  });

  it('keeps current CCEL rollout status aligned across operator documents', async () => {
    const documents = await Promise.all([
      readProjectProse('docs/CCEL-LIVE-PREVIEW-AUDIT.md'),
      readProjectProse('docs/CCEL-UPSTREAM-COORDINATOR.md'),
      readProjectProse('docs/ccel-search-preflight.md'),
    ]);
    for (const document of documents.slice(0, 2)) {
      expect(document).toContain('Production remains deployed v6/local-only');
      expect(document).toContain(
        'Preview is deployed and audited on the v7/discovery-only contract',
      );
      expect(document).toContain(
        'CCEL execution disabled before adapter, coordinator, or fetch',
      );
    }

    const liveAudit = documents[0]!;
    const preflight = documents[2]!;
    expect(preflight).toContain('production remained deployed v6/local-only');
    expect(preflight).toContain(
      'preview was deployed and audited on the v7/discovery-only contract',
    );
    expect(preflight).toContain(
      'CCEL execution disabled before adapter, coordinator, or fetch',
    );
    expect(liveAudit).toContain('exactly two concurrent `searchDepth: "expanded"` contenders');
    expect(liveAudit).toContain('`searchDepth: "standard"` call');
    expect(liveAudit).toContain('partial, non-error response');
    expect(liveAudit).toContain('schema observations prove v6 local-only versus v7 CCEL exposure; they do not prove which endpoint-bearing code revision is deployed');
    expect(liveAudit).not.toMatch(/CCEL-only contenders/i);
    expect(preflight).toContain('https://www.ccel.org/home3/search');
    expect(preflight).toContain('not proof that a result query succeeds');
    expect(preflight).toContain('No HTML, query, result, or snippet evidence is retained.');
  });

  it('preserves separate operator admission and ordered environment gates', async () => {
    const [canary, preflight, secret, canaryScript] = await Promise.all([
      readProjectProse('docs/CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md'),
      readProjectProse('docs/ccel-search-preflight.md'),
      readProjectProse('docs/CCEL-OPERATOR-SECRET-PROVISIONING.md'),
      readProjectFile('scripts/ccel-live-preview-canary.ts'),
    ]);
    expect(canary).toContain('five separately authorized stages');
    expect(canary).toContain('[current release snapshot](CURRENT-RELEASE.md)');
    expect(canary).toContain('must be freshly resolved there and from live control-plane reads before any operation');
    expect(canary).toContain('Completion or authorization of any stage does not authorize the next stage.');
    expect(canary).toContain('fresh, separate preview and production D1 candidates');
    expect(canary).toContain('schema `0009`');
    expect(canary).toContain('remote readiness and authority audit');
    expect(canary).toContain('while both candidates remain unbound');
    expect(canary).toContain('prepared preview candidate with current-`main` `100` flags');
    expect(canary).toContain('no retained schema-`0008` reuse or crossing');
    expect(canary).toContain('hard inert schema-`0009` canary gate');
    expect(canary).toContain('before any Wrangler command or Cloudflare read');
    const canaryOrder = [
      'while both candidates remain unbound',
      'prepared preview candidate with current-`main` `100` flags',
      'bind and deploy the exact prepared production candidate',
      'no retained schema-`0008` reuse or crossing',
      'Stage the operator credential',
      'Run this temporary `111` two-request preview canary transaction',
    ].map(marker => canary.indexOf(marker));
    expect(canaryOrder.every(index => index >= 0)).toBe(true);
    expect(canaryOrder).toEqual([...canaryOrder].sort((left, right) => left - right));
    expect(canary).toContain('resources.script.etag');
    expect(canary).toContain('temporary `111` two-request preview canary transaction');
    expect(preflight).toContain('fixed current-main candidate endpoint');
    expect(preflight).toContain('[current release snapshot](CURRENT-RELEASE.md)');
    expect(preflight).toContain('must be freshly resolved there and from live control-plane reads before');
    expect(preflight).toContain('The v7 candidate contract does not supersede');
    expect(secret).toContain('Executing staging is a production Worker-version upload mutation');
    expect(secret).toContain('actual production Worker deployment and traffic mutation');
    expect(secret).toContain('Neither staging nor promotion authorizes');
    expect(secret).toContain('separate schema-`0009` D1 sequence must have completed in order');
    expect(secret).toContain('while unbound; the preview candidate bound, deployed, and audited; then the production candidate bound, deployed, and audited; then a read-only environment-isolation verification');
    expect(canary).toContain('The gate remains `unrecorded` and inert');
    expect(canaryScript).toContain("state: 'unrecorded'");
  });

  it('preserves production control before and after preview deployment and audits', async () => {
    const [workflow, reconciliation] = await Promise.all([
      readProjectFile('.github/workflows/pr.yml'),
      readProjectProse('docs/PREVIEW-RELEASE-RECONCILIATION.md'),
    ]);
    expect(workflow).toContain('scripts/production-release-reconciliation.ts capture-control');
    expect(workflow).toContain('scripts/production-release-reconciliation.ts verify-control');
    expect(workflow).toContain('production-control-after.outcome == \'success\'');
    expect(workflow).toContain('production_control_post_audit_sha256');
    expect(reconciliation).toContain('checked-in production name/UUID and a fresh read-only D1 inventory');
    expect(reconciliation).toContain('again after every fixed preview audit and the final preview Worker identity check');
  });

  it('documents the current IP-only public rate limit', async () => {
    const readme = await readProjectProse('README.md');
    expect(readme).toContain('domain-separated SHA-256 hash of IP only, independent of User-Agent');
    expect(readme).toContain('limiter failures remain fail-open');
  });
});
