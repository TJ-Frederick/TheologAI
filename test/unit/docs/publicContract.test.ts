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
    expect(confessionSkill).toContain('Call `primary_source_search` with one bounded local query plan');
    expect(confessionSkill).toContain('Follow each selected canonical `resource_link` with MCP `resources/read`');
    expect(confessionSkill).toContain('Never relabel an issuing, drafting, revising, or');
    expect(confessionSkill).toContain('Never infer a tradition or author attribution');
    expect(confessionSkill).not.toContain('spanning the major Christian traditions');
    expect(confessionSkill).not.toContain('Call `classic_text_lookup` with `{ "query"');
    expect(`${developerGuide}\n${confessionSkill}`).not.toMatch(/18 historical documents/i);
  });

  it('does not reintroduce retired scope claims', async () => {
    const [readme, historicalTestReport, historicalArchitecture, historicalDevelopment] = await Promise.all([
      readProjectFile('README.md'),
      readProjectFile('TEST_REPORT.md'),
      readProjectFile('docs/bible-mcp-architecture.md'),
      readProjectFile('docs/bible-mcp-development-plan.md'),
    ]);

    expect(readme).not.toMatch(/1,000\+.*CCEL/i);
    expect(readme).not.toMatch(/eighteen locally indexed|18 locally indexed/i);
    expect(readme).not.toMatch(/six public-domain commentar/i);
    expect(readme).toContain('do **not** currently fetch CCEL search results or document bodies');
    expect(readme).toContain('CCEL is not requestable in the public input schema and is unreachable from');
    expect(readme).toContain('v3 output schema and structured result are also');
    expect(readme).toContain('strictly local-only; dormant external-provider result shapes remain internal');
    expect(readme).not.toContain('output schema retains dormant CCEL provider-result');
    expect(historicalTestReport.slice(0, 500)).toContain('Historical test report');
    expect(historicalTestReport.slice(0, 500)).toContain('not the current product contract');
    expect(historicalArchitecture.slice(0, 700)).toContain('Historical architecture plan');
    expect(historicalDevelopment.slice(0, 700)).toContain('Historical development plan');
  });
});
