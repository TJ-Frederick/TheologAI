import { readFile } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
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

afterAll(async () => {
  await Promise.allSettled(
    openConnections.flatMap(({ client, server }) => [client.close(), server.close()]),
  );
});

describe('published project contract', () => {
  it('links the current roadmap and quarantines known historical artifacts', async () => {
    const historicalArtifacts = [
      'TEST_REPORT.md',
      'docs/bible-mcp-prd.md',
      'docs/parallel-passages-tool-spec.md',
      'docs/bible-mcp-architecture.md',
      'docs/bible-mcp-development-plan.md',
      'docs/RELEASE_NOTES_v3.4.0.md',
    ];
    const [readme, roadmap, ...artifacts] = await Promise.all([
      readProjectFile('README.md'),
      readProjectFile('docs/ROADMAP.md'),
      ...historicalArtifacts.map(readProjectFile),
    ]);

    expect(readme).toContain('[docs/ROADMAP.md](docs/ROADMAP.md)');
    expect(roadmap).toContain('# TheologAI roadmap');
    expect(roadmap).toContain('71a3f0d120ffd31c09424ba2a7caef88961d21e3');
    expect(roadmap).toContain('Phase 3 cleanup / PR #11');
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

    expect(tools).toHaveLength(11);
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
      toolCount: 11,
      structuredTools: [
        'bible_cross_references',
        'bible_lookup',
        'bible_verse_morphology',
        'classic_text_lookup',
        'commentary_lookup',
        'donation_config',
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
    expect(documents[0]).toContain('All eleven tools\nadvertise versioned object-root `outputSchema` contracts');
    expect(documents[0]).not.toMatch(/Ten tools also\s+advertise versioned object-root/);
    expect(documents[0]).toContain('work-inventory contract is intentionally bounded at 100 works');
  });

  it('keeps advertised corpus counts sourced from the data manifest', async () => {
    const [readme, developerGuide, confessionSkill, rawManifest] = await Promise.all([
      readProjectFile('README.md'),
      readProjectFile('CLAUDE.md'),
      readProjectFile('skills/confession-study/SKILL.md'),
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

  it('records the current Transform 11 preview and production release states', async () => {
    const [readme, operations, developerGuide] = await Promise.all([
      readProjectFile('README.md'),
      readProjectFile('docs/worker-operations.md'),
      readProjectFile('CLAUDE.md'),
    ]);

    expect(readme).toContain('Production v6/local-only and preview v7/discovery-only currently search and\nretrieve the 35-work Transform-11 collection');
    expect(operations).toContain('current preview Transform-11 / 35-work release');
    expect(operations).toContain('Production is PR #108 merge');
    expect(developerGuide).toContain('both deployed 35-work catalogs');
    expect(developerGuide).toContain('PR #108 is the current production release record');
  });

  it('does not reintroduce retired scope claims', async () => {
    const [readme, historicalTestReport, historicalArchitecture, historicalDevelopment, workerConfig, coordinatorGuide, roadmap] = await Promise.all([
      readProjectFile('README.md'),
      readProjectFile('TEST_REPORT.md'),
      readProjectFile('docs/bible-mcp-architecture.md'),
      readProjectFile('docs/bible-mcp-development-plan.md'),
      readProjectFile('wrangler.toml'),
      readProjectFile('docs/CCEL-UPSTREAM-COORDINATOR.md'),
      readProjectFile('docs/ROADMAP.md'),
    ]);

    expect(readme).not.toMatch(/1,000\+.*CCEL/i);
    expect(readme).not.toMatch(/eighteen locally indexed|18 locally indexed/i);
    expect(readme).not.toMatch(/six public-domain commentar/i);
    expect(readme).toMatch(/Both deployed environments do \*\*not\*\* currently fetch CCEL search\s+results or document bodies/);
    expect(readme).toContain('Production v6/local-only is deployed');
    expect(readme).toContain('preview runs the audited v7/discovery-only contract with CCEL execution disabled');
    expect(readme).toMatch(/Preview and production now serve the 35-work\s+catalog/);
    expect(readme).toContain('35 locally indexed');
    expect(readme).toContain('18 reviewed source-pack editions');
    expect(readme).toContain('The integrated Transform 10 candidate is local-only and unpublished');
    expect(readme).toContain('not wired into runtime or MCP surfaces');
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
    const primarySourceToolRow = readme.split('\n')
      .find(line => line.startsWith('| `primary_source_search` |'));
    expect(primarySourceToolRow).toContain('Production v6/local-only is deployed');
    expect(primarySourceToolRow).toContain('preview runs the audited v7/discovery-only contract');
    expect(primarySourceToolRow).toContain('CCEL execution disabled before adapter, coordinator, or fetch');
    const previewStart = workerConfig.indexOf('[env.preview]');
    expect(previewStart).toBeGreaterThan(0);
    expect(workerConfig.slice(0, previewStart)).toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY = "false"');
    expect(workerConfig.slice(previewStart)).toContain('THEOLOGAI_EXPOSE_CCEL_DISCOVERY = "true"');
    expect(workerConfig.slice(previewStart)).toContain('THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH = "false"');
    expect(workerConfig.slice(previewStart)).toContain('THEOLOGAI_ENABLE_CCEL_COORDINATOR = "false"');
    expect(readme).not.toContain('output schema retains dormant CCEL provider-result');
    expect(historicalTestReport.slice(0, 500)).toContain('Historical test report');
    expect(historicalTestReport.slice(0, 500)).toContain('not the current product contract');
    expect(historicalArchitecture.slice(0, 700)).toContain('Historical architecture plan');
    expect(historicalDevelopment.slice(0, 700)).toContain('Historical development plan');
  });

  it('keeps the current Transform 11 preview baseline distinct from historical preview releases', async () => {
    const [reconciliation, operations] = await Promise.all([
      readProjectFile('docs/PREVIEW-RELEASE-RECONCILIATION.md'),
      readProjectFile('docs/worker-operations.md'),
    ]);
    const activeDeployment = '4148bfb5-dd03-447f-b656-9daa0aee4380';
    const activeVersion = 'ca1376bb-05cc-403b-a396-d2e89403abec';
    const activeD1 = 'theologai-preview-20260724-a';
    const deployedPreview = '3467d062-9097-4ffe-9ff1-db900838f538';
    const deployedPreviewWorker = '8d516c26-6cfe-451c-889a-7dd580b1f4ca';
    const deployedPreviewD1 = 'theologai-preview-20260727-normal-a';
    const deployedPreviewD1Id = '776944d4-60d1-457f-b13e-b4e7898971ca';
    const preparedCandidateD1 = 'theologai-preview-20260728-hierarchy-a';
    const preparedCandidateD1Id = '51890e12-1c3f-421f-b661-9a5ea9637e43';
    const currentPreviewDeployment = '5e812152-355b-4a5f-a123-2485e89f1550';
    const currentPreviewWorker = '06b9a603-8339-42b6-a246-ef9238563043';
    const predecessorDeployment = '7f00a94b-4ff4-47d6-9bee-2efb99673718';
    const predecessorVersion = 'f78d66f1-cefe-46ba-88ba-9ddec259cda4';
    const predecessorD1 = 'theologai-preview-20260722-b';
    const historicalDeployment = '04e7a69a-78d2-447b-ac71-e9fb0bef3695';

    for (const document of [reconciliation, operations]) {
      expect(document).toContain(activeDeployment);
      expect(document).toContain(activeVersion);
      expect(document).toContain(activeD1);
      expect(document).toContain(predecessorDeployment);
      expect(document).toContain(predecessorVersion);
      expect(document).toContain(predecessorD1);
      expect(document).toContain(deployedPreview);
      expect(document).toContain(deployedPreviewWorker);
      expect(document).toContain(deployedPreviewD1);
      expect(document).toContain(deployedPreviewD1Id);
      expect(document).toContain(preparedCandidateD1);
      expect(document).toContain(preparedCandidateD1Id);
      expect(document).toContain(currentPreviewDeployment);
      expect(document).toContain(currentPreviewWorker);
    }
    expect(reconciliation).toContain('historical read-only observation');
    expect(reconciliation).toContain('protected preview release deployed the normal 25-work build');
    expect(reconciliation).toContain('black-box audit passed with no P0-P3 findings');
    expect(operations).toContain('historical, read-only Cloudflare snapshot');
    expect(operations).toContain('protected PR95 preview release deployed Cloudflare deployment');
    expect(operations).toContain('black-box audit passed with no P0-P3 findings');
    expect(operations).toContain('Transform-10 Aquinas\nhierarchy from all normal D1 corpora');
    expect(operations).toContain('CCEL execution remains disabled and Aquinas\nremains inactive');
    expect(operations).not.toContain('prepared but unbound preview\ncandidate retains that inactive authority data');
    expect(operations).toContain(`Its historical Cloudflare deployment\n\`${historicalDeployment}\` served Worker`);
    expect(operations).toContain('This historical release is neither\nthe current preview identity nor the immediate retained predecessor');
    expect(reconciliation).toContain('it makes no production claim');
    expect(reconciliation).toContain('PR #101\'s checked-in preview candidate was unbound when prepared');
    expect(reconciliation).toContain('This is the retained compatible\npreview predecessor');
    expect(reconciliation).toContain('evidence remains authoritative for that predecessor');
    expect(operations).toContain('The retained PR #101 preview predecessor was deployment');
    expect(operations).toContain("PR #122's retained immediate predecessor, not the active preview");
  });

  it('records the completed Transform 11 preview release and unpublished hardening boundary', async () => {
    const documents = await Promise.all([
      readProjectFile('README.md'),
      readProjectFile('docs/D1-DATA-WORKFLOW.md'),
      readProjectFile('docs/PREVIEW-RELEASE-RECONCILIATION.md'),
      readProjectFile('docs/PRIMARY-SOURCE-CATALOG-SCOPE.md'),
      readProjectFile('docs/TRANSFORM11-HISTORICAL-SPINE-ACTIVATION.md'),
      readProjectFile('docs/worker-operations.md'),
      readProjectFile('docs/ROADMAP.md'),
    ]);
    const candidateName = 'theologai-preview-20260728-transform11-a';
    const candidateId = '62b871a6-5b4d-4d9b-8f52-301f6c878f48';
    const corpusIdentity = '29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4';

    for (const document of documents) {
      expect(document).toContain(candidateName);
      expect(document).toContain(candidateId);
      expect(document).toContain('unbound');
    }
    for (const document of documents.slice(0, 6)) expect(document).toContain(corpusIdentity);
    expect(documents[2]).toContain('No seed, migration, repair, or\nresume was repeated');
    expect(documents[4]).toContain('30419373527');
    expect(documents[4]).toContain('f5ef7a40-1b4b-4120-a1bb-70b33630b4a6');
    expect(documents[4]).toContain('30420256210');
    expect(documents[4]).toContain('no `deploy-preview`\nlabel');
    expect(documents[4]).toContain('theologai-production-20260728-hierarchy-a');
    expect(documents[4]).toContain('theologai-production-20260729-transform11-a');
    expect(documents[6]).toContain('30419373527');
    expect(documents[6]).toContain('30420256210');
    expect(documents[6]).toContain('Production was unchanged by that preview release');
    expect(documents[5]).toContain('remained unchanged during the PR #108 production release and\nis now PR #122');
  });

  it('documents the completed PR #108 Transform 11 production cutover and rollback', async () => {
    const [readme, dataWorkflow, catalogScope, reconciliation, operations, roadmap] = await Promise.all([
      readProjectFile('README.md'),
      readProjectFile('docs/D1-DATA-WORKFLOW.md'),
      readProjectFile('docs/PRIMARY-SOURCE-CATALOG-SCOPE.md'),
      readProjectFile('docs/PRODUCTION-RELEASE-RECONCILIATION.md'),
      readProjectFile('docs/worker-operations.md'),
      readProjectFile('docs/ROADMAP.md'),
    ]);
    const liveProduction = {
      deployment: '3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8',
      worker: '291f3292-3fa9-44fc-bf6f-b68fd2f4cef6',
      d1: 'theologai-production-20260729-transform11-a',
      d1Id: '53211f50-a893-4b4c-be1e-bc625a595dc7',
    };
    const rollbackProduction = {
      deployment: '71b76d24-bf5f-490e-adc4-31cf63fb046e',
      worker: 'bae58cd3-cad7-4663-879d-408accf061b0',
      d1: 'theologai-production-20260728-hierarchy-a',
      d1Id: 'f93c3b02-a0bd-4ca1-9697-8ecb4bcf9395',
    };
    const livePreview = {
      deployment: '5e812152-355b-4a5f-a123-2485e89f1550',
      worker: '06b9a603-8339-42b6-a246-ef9238563043',
      d1: 'theologai-preview-20260728-transform11-a',
      d1Id: '62b871a6-5b4d-4d9b-8f52-301f6c878f48',
    };

    const productionCutoverDocuments = [readme, dataWorkflow, catalogScope, reconciliation, operations, roadmap];
    for (const document of productionCutoverDocuments) {
      for (const value of Object.values(liveProduction)) expect(document).toContain(value);
      for (const value of Object.values(rollbackProduction)) expect(document).toContain(value);
      expect(document).toContain('30496350408');
      expect(document).toContain('8da99fd0a161b90a4bd90ab29bde1abf796b3bf6');
    }
    for (const document of [readme, dataWorkflow, reconciliation, operations, roadmap]) {
      for (const value of Object.values(livePreview)) expect(document).toContain(value);
    }
    expect(reconciliation).toContain('completed PR #108 protected production cutover');
    expect(reconciliation).toContain('a59d9a062b2e6c7884de97fd97309878e1cbdc23');
    expect(reconciliation).toContain('5665940735');
    expect(reconciliation).toContain('8742223883');
    expect(reconciliation).toContain('f7bb0275e53a9fe8801ecb3af68f9b74f5df44cab6f20c19cba9b1357d72afd5');
    expect(reconciliation).toContain('b1ceb8f02ef210b5fb2212a9b212108411630efcc28ad3248a51c19c7bb0e1c0');
    expect(reconciliation).toContain('604ce2dee6e14559a1a26c7d0d42e572469ce0e7cf4595be22f1085b9bc9ea05');
    expect(reconciliation).toContain('e74999ea97a78a4fe4a6233be18b6a71cb03a9e2207f5b0fe34f71db09fafb0f');
    expect(reconciliation).toContain('636b09fcd9bb41add56e99b001c41d7ad878594f2d77df8f7b41b51621c32c97');
    expect(reconciliation).toContain('77da8832ab4139a769aae7d87716a3d581407cc2d036b6f7939e306d9b865de5');
    expect(dataWorkflow).toContain('Historical core passed 8/8');
    expect(catalogScope).toContain('Transform-11 spine passed 10/10');
    expect(operations).toContain('primary-source edge stabilization matched on attempt 4');
    expect(roadmap).toContain('independent post-release review returned `SHIP`');
    expect(reconciliation).toContain('primary-source edge stabilization');
    expect(reconciliation).toContain('Transform-11 historical-spine audit');
    expect(dataWorkflow).toContain('PR #122 deployment\n`13393917-fa91-4afc-aeaf-2809db6701a2`, Worker');
    expect(catalogScope).toContain('PR #122 deployment\n`13393917-fa91-4afc-aeaf-2809db6701a2`, Worker');
    expect(dataWorkflow).toContain('immediately preceding primary rollback unit');
    expect(catalogScope).toContain('immediately preceding primary rollback\nunit');
    expect(dataWorkflow).not.toContain('The current preview baseline is\ndeployment `5e812152');
    expect(catalogScope).not.toContain('The current preview baseline is\ndeployment `5e812152');
    expect(dataWorkflow).not.toContain('Retain the PR #101 matched Worker/D1 pair above for rollback.');
    expect(catalogScope).not.toContain('Retain the PR #101 Worker/D1\npair above as rollback.');
    for (const document of [readme, dataWorkflow, operations]) {
      const normalized = document.replace(/\s+/g, ' ');
      expect(normalized).toContain('immediately preceding primary rollback unit');
    }
    expect(readme.replace(/\s+/g, ' ')).toContain('PR #101 is older retained rollback history');
    expect(operations.replace(/\s+/g, ' ')).toContain('PR #101 is older retained rollback history');
    expect(dataWorkflow).toContain('older retained rollback history');
    expect(readme).not.toContain('The PR #101 production assignment is retained as the matched rollback pair.');
    expect(readme).not.toContain("PR #101's former production assignment, retained as the rollback pair");
    expect(readme).not.toContain('The PR #101 Worker/D1 pair above remains the rollback record.');
    expect(operations).not.toContain('The former PR #101 production assignment is the matched rollback pair:');
    expect(operations).not.toContain('The PR #101 Worker/D1 pair above is retained as\nrollback.');
    expect(dataWorkflow).not.toContain('—is now the matched rollback pair.');
    expect(dataWorkflow).not.toContain('The PR #101 candidate, now the retained\nproduction rollback,');
    for (const document of [readme, dataWorkflow, catalogScope, reconciliation, operations, roadmap]) {
      expect(document).not.toContain('Transform-8/9/10 authority');
      expect(document).toContain('Aquinas');
      expect(document).toMatch(/inactive|local-only|exclusion/);
    }
  });

  it('keeps the PR #113 reconciliation cutoff distinct from durable deployed release state', async () => {
    const [roadmap, production, preview] = await Promise.all([
      readProjectFile('docs/ROADMAP.md'),
      readProjectFile('docs/PRODUCTION-RELEASE-RECONCILIATION.md'),
      readProjectFile('docs/PREVIEW-RELEASE-RECONCILIATION.md'),
    ]);
    const reconciliationCutoffCommit = '2f12262c9a37d3588bee9b5071954823c15cbd12';
    const reconciliationCutoffTree = '9922aedb74c690e7a3fcb926b3d621f28fa44535';
    const durablePreview = {
      head: '1105b75cd8537632bdb20e598092f6ba94a6adc0',
      deployment: '5e812152-355b-4a5f-a123-2485e89f1550',
      worker: '06b9a603-8339-42b6-a246-ef9238563043',
      d1: '62b871a6-5b4d-4d9b-8f52-301f6c878f48',
    };
    const durableProduction = {
      merge: '8da99fd0a161b90a4bd90ab29bde1abf796b3bf6',
      deployment: '3d7489d9-7b48-4ad0-bdc6-95ffbda53bd8',
      worker: '291f3292-3fa9-44fc-bf6f-b68fd2f4cef6',
      d1: '53211f50-a893-4b4c-be1e-bc625a595dc7',
    };

    for (const document of [roadmap, production, preview]) {
      const normalized = document.replace(/\s+/g, ' ');
      expect(document).toContain(reconciliationCutoffCommit);
      expect(document).toContain(reconciliationCutoffTree);
      expect(normalized).toContain('At the reconciliation cutoff immediately after PR #113');
      expect(normalized).toContain('and that revision was not deployed');
      expect(normalized).toContain('Production runs for PRs #109–#113 were cancelled and preview jobs skipped');
      expect(document).toContain('PR #109');
      expect(document).toContain('PR #110');
      expect(document).toContain('PR #111');
      expect(document).toContain('PR #112');
      expect(document).toContain('PR #113');
      expect(normalized).toContain('inert canary transaction infrastructure');
      expect(normalized).toContain('synthetic original-language context-capacity evidence');
      expect(normalized).toContain('provisional Norton capacity evidence');
    }
    expect(roadmap).toContain('UBS semantic aggregate foundation / PR #64');
    expect(roadmap).toContain('historical foundation state, not a claim that the\n  aggregate remains inactive today');
    for (const document of [roadmap, preview]) {
      for (const value of Object.values(durablePreview)) expect(document).toContain(value);
    }
    for (const document of [roadmap, production, preview]) {
      for (const value of Object.values(durableProduction)) expect(document).toContain(value);
    }
    expect(preview.replace(/\s+/g, ' ')).toContain('CCEL execution remains disabled before adapter, coordinator, or fetch');
    expect(production).toContain('PR #108 v6/local-only release');
  });

  it('keeps current CCEL rollout status aligned across operator documents', async () => {
    const documents = await Promise.all([
      readProjectFile('docs/CCEL-LIVE-PREVIEW-AUDIT.md'),
      readProjectFile('docs/CCEL-UPSTREAM-COORDINATOR.md'),
      readProjectFile('docs/ccel-search-preflight.md'),
    ]);
    for (const document of documents) {
      const normalized = document.replace(/^>\s?/gm, '').replace(/\s+/g, ' ');

      expect(normalized).toContain('Production remains deployed v6/local-only');
      expect(normalized).toContain(
        'Preview is deployed and audited on the v7/discovery-only contract',
      );
      expect(normalized).toContain(
        'CCEL execution disabled before adapter, coordinator, or fetch',
      );
      expect(normalized).not.toMatch(/deployed preview remains v5\/discovery-only/i);
    }

    const liveAudit = documents[0]!;
    const preflight = documents[2]!;
    expect(liveAudit).toContain('exactly two concurrent `searchDepth: "expanded"` contenders');
    expect(liveAudit).toContain('`searchDepth: "standard"` call');
    expect(liveAudit).toContain('partial, non-error response');
    expect(liveAudit).not.toMatch(/CCEL-only contenders/i);
    expect(preflight).toContain('https://www.ccel.org/home3/search');
    expect(preflight).toContain('Observed canary hypothesis');
    expect(preflight).toContain('not proof that a result query succeeds');
    expect(preflight).toContain('No HTML, query, result, or snippet evidence is retained.');
  });

  it('separates the current schema-0009 preview from historical PR107 evidence', async () => {
    const [canary, reconciliation, readme, preflight, secret, audit, coordinator, operations, productionReconciliation, roadmap] = await Promise.all([
      readProjectFile('docs/CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md'),
      readProjectFile('docs/PREVIEW-RELEASE-RECONCILIATION.md'),
      readProjectFile('README.md'),
      readProjectFile('docs/ccel-search-preflight.md'),
      readProjectFile('docs/CCEL-OPERATOR-SECRET-PROVISIONING.md'),
      readProjectFile('docs/CCEL-LIVE-PREVIEW-AUDIT.md'),
      readProjectFile('docs/CCEL-UPSTREAM-COORDINATOR.md'),
      readProjectFile('docs/worker-operations.md'),
      readProjectFile('docs/PRODUCTION-RELEASE-RECONCILIATION.md'),
      readProjectFile('docs/ROADMAP.md'),
    ]);
    for (const document of [canary, reconciliation, readme]) {
      const normalized = document.replace(/\s+/g, ' ');
      expect(normalized).toContain('06b9a603-8339-42b6-a246-ef9238563043');
      expect(normalized).toContain("PR #115's repository-only");
      expect(normalized).toContain('https://www.ccel.org/home3/search');
      expect(normalized).toMatch(/code\/resource-equivalent (?:`100` )?preview predecessor|code\/resource-equivalent `100` predecessor/);
    }
    expect(canary).toContain('five separately authorized stages');
    expect(canary).toContain('Completion or authorization of any stage does not authorize the next stage.');
    expect(canary).toContain('fresh, separate preview and production D1 candidates');
    expect(canary).toContain('schema `0009`');
    expect(canary).toContain('remote readiness and authority audit');
    expect(canary).toContain('while both candidates remain unbound');
    expect(canary).toContain('prepared preview candidate with current-`main` `100` flags');
    expect(canary).toContain('Only after the preview audit passes');
    expect(canary).toContain('Then perform a read-only environment-isolation\n   verification');
    expect(canary).toMatch(/hard inert\s+schema-`0009` canary gate/);
    expect(canary).toMatch(/before any\s+Wrangler command or\s+Cloudflare read/);
    const canaryOrder = [
      'while both candidates remain unbound',
      'prepared preview candidate with current-`main` `100` flags',
      'Only after the preview audit passes',
      'Then perform a read-only environment-isolation',
      'Stage the operator credential',
      'Run this temporary `111` two-request preview canary transaction',
    ].map(marker => canary.indexOf(marker));
    expect(canaryOrder.every(index => index >= 0)).toBe(true);
    expect(canaryOrder).toEqual([...canaryOrder].sort((left, right) => left - right));
    expect(canary).toContain('resources.script.etag');
    expect(canary).toContain('temporary `111` two-request preview canary transaction');
    expect(reconciliation).toContain('PR #122 completed the\nrequired current-main schema-`0009` preview refresh and audit');
    expect(preflight).toContain('fixed current-main candidate endpoint');
    expect(preflight).toContain('PR #115 introduced this pin in repository code only. PR #122 subsequently');
    expect(preflight).toContain('The v7\ncandidate contract does not supersede');
    expect(secret).toContain('Executing staging is a production Worker-version upload mutation');
    expect(secret).toContain('actual production Worker deployment and traffic mutation');
    expect(secret).toContain('Neither staging nor\npromotion authorizes');
    expect(secret).toContain('separate schema-`0009` D1 sequence must have completed in order');
    expect(secret).toContain('while unbound; the preview candidate bound, deployed, and audited; then the\nproduction candidate bound, deployed, and audited; then a read-only\nenvironment-isolation verification');
    expect(readme).toContain('PR #122 has since completed the schema-`0009` preview');
    expect(readme).toContain('The protected release targeted the prepared preview D1');
    const normalizedAudit = audit.replace(/\s+/g, ' ');
    expect(normalizedAudit).toContain('schema observations prove v6 local-only versus v7 CCEL exposure; they do not prove which endpoint-bearing code revision is deployed');
    expect(normalizedAudit).toContain("does not prove PR #115's repository-only `/home3/search` pin is active");
    expect(coordinator).toContain('The current v7 discovery application contract');
    expect(coordinator).toContain('The historical v5 release selected production v4/local-only');
    expect(coordinator).not.toContain('The v5 discovery application contract is exposed only by');
    expect(readme).not.toContain('This active PR #107 preview Worker');
    expect(readme).not.toContain('The deployed preview and production D1 layers remain schema `0008`');
    expect(reconciliation).not.toContain('the sole active preview\nassignment bound to that exact candidate D1');
    expect(operations).not.toContain('as the sole\nactive preview assignment bound to that exact D1');
    expect(preflight).not.toContain('The active PR #107 Worker');
    expect(preflight).not.toContain('current-main preview refresh and audit is\n  required');
    expect(productionReconciliation).not.toContain('The current preview baseline is\ndeployment `5e812152');
    expect(roadmap).not.toContain('Preview remains\n  PR #107');
    expect(roadmap).not.toContain('Preview now serves deployment\n  `5e812152');
  });

  it('records the schema-0009 preview-only release boundary and production control', async () => {
    const [readme, workflow, reconciliation, canary, operations, config, dataWorkflow, canaryScript] = await Promise.all([
      readProjectFile('README.md'),
      readProjectFile('.github/workflows/pr.yml'),
      readProjectFile('docs/PREVIEW-RELEASE-RECONCILIATION.md'),
      readProjectFile('docs/CCEL-LIVE-PREVIEW-CANARY-TRANSACTION.md'),
      readProjectFile('docs/worker-operations.md'),
      readProjectFile('wrangler.toml'),
      readProjectFile('docs/D1-DATA-WORKFLOW.md'),
      readProjectFile('scripts/ccel-live-preview-canary.ts'),
    ]);
    const previewName = 'theologai-preview-20260811-schema0009-a';
    const previewId = '74f456e2-6951-4003-bb6f-91951342bf8f';
    const productionId = '9bc79346-338b-439e-a2a5-424f4418eb21';
    const productionName = 'theologai-production-20260811-schema0009-a';

    for (const document of [readme, reconciliation, canary, operations, dataWorkflow]) {
      expect(document).toContain(previewName);
      expect(document).toContain(previewId);
      expect(document).toContain(productionId);
      expect(document).toContain('unbound');
    }
    expect(config).toContain(`database_name = "${previewName}"`);
    expect(config).toContain(`database_id = "${previewId}"`);
    expect(config).toContain(`database_name = "${productionName}"`);
    expect(config).toContain(`database_id = "${productionId}"`);
    expect(dataWorkflow).toContain('e1baa04fecbb066860d06f262142e3450823b7d0');
    expect(dataWorkflow).toContain('673af4a75c770c541a8be3c84e77d8f91033bd07');
    expect(dataWorkflow).toContain('ecbd23bb3c692665c7031a8c1fa7733e17a56fbc7e3a167ba4011f6c1cca62d8');
    expect(dataWorkflow).toContain('14e30a32f316f1c7a954a9641f7d1b8bd6608d8e0f4bdc2eaba4c565f472f83d');
    expect(dataWorkflow).toContain('66c148a206b9b0eb1bf7552572570c42dabfd0ba591b63e0cf0d02adda35aa07');
    expect(dataWorkflow).toContain('989dd945ac633ecb1ba83cc80a1b88234cac31d78b3d905ae0242eb66c533eb3');
    expect(dataWorkflow).toContain('49 ordered files, 1,630,260 rows, and 177,923,082 bytes');
    expect(dataWorkflow).toContain('60 tables, 307,617,792 bytes, 35 documents, 4,111');
    expect(dataWorkflow).toContain('zero `historical_sectioned_publications` rows, and one corpus seal');
    expect(canaryScript).toContain("state: 'unrecorded'");
    expect(workflow).toContain('preview-d1-readiness-receipt.json');
    expect(workflow).toContain('Capture production control before preview deployment (read-only)');
    expect(workflow).toContain('Verify production control remained unchanged (read-only)');
    expect(workflow).toContain('Verify production control remained unchanged after preview audits (read-only)');
    expect(workflow).toContain('production-control-after.outcome == \'success\'');
    expect(workflow).toContain('production-control-d1-inventory-before.json');
    expect(workflow).toContain('production-control-d1-inventory-post-audit.json');
    expect(workflow).toContain('production_control_post_audit_sha256');
    expect(workflow).toContain('scripts/production-release-reconciliation.ts capture-control');
    expect(workflow).toContain('scripts/production-release-reconciliation.ts verify-control');
    expect(reconciliation).toContain('checked-in production name/UUID and a fresh read-only D1 inventory');
    expect(reconciliation).toContain('again after every fixed preview\naudit and the final preview Worker identity check');
    expect(reconciliation).toContain('a0f13b5bdbf3ca071dbb7524dea9c6ce80770404');
    expect(reconciliation).toContain('660c06ff31e7d0e2ccbc6fe12204e66c4e793233');
    expect(reconciliation).toContain('31568581322');
    expect(reconciliation).toContain('5864161923');
    expect(reconciliation).toContain('13393917-fa91-4afc-aeaf-2809db6701a2');
    expect(reconciliation).toContain('b2c62527-5759-4c1d-a9a3-8c1d43dddabe');
    expect(reconciliation).toContain('06b9a603-8339-42b6-a246-ef9238563043');
    expect(reconciliation).toContain('5e812152-355b-4a5f-a123-2485e89f1550');
    expect(reconciliation).toContain('481900a3eec516fe06d3252175b63e318783c7230f70311235e4a1dd73198889');
    expect(reconciliation).toContain('31572924302');
    expect(reconciliation).toContain('This evidence-only documentation commit postdates the deployed head.');
    expect(readme).toContain('This evidence-only commit postdates the deployed source');
    expect(operations).toContain('This evidence-only commit postdates that deployment');
    expect(canary).toMatch(/The\s+gate remains `unrecorded` and inert/);
  });
});
