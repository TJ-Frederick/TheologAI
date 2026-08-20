import { describe, expect, it } from 'vitest';
import {
  assertMcpTransportContract,
  cloneMcpTransportSnapshot,
  fingerprintMcpTransportSnapshot,
  type McpTransportSnapshot,
} from '../../helpers/mcpTransportContract.js';

function descriptor(name: string, version = '1') {
  return {
    name,
    description: `${name} descriptor`,
    inputSchema: { type: 'object', properties: { value: { type: 'string' } }, additionalProperties: false },
    outputSchema: { type: 'object', properties: { schemaVersion: { const: version } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  };
}

function snapshot(version: '6' | '7', logging = false): McpTransportSnapshot {
  const toolNames = [
    'bible_lookup', 'bible_cross_references', 'parallel_passages', 'commentary_lookup',
    'classic_text_lookup', 'primary_source_search', 'original_language_lookup',
    'bible_verse_morphology', 'original_language_study', 'donation_config', 'verify_donation',
  ];
  const tools = toolNames.map(name => descriptor(name, name === 'primary_source_search' ? version : '1'));
  tools[5]!.annotations.openWorldHint = version === '7';
  return {
    server: {
      name: 'theologai-bible-server', version: 'test',
      capabilities: { tools: {}, resources: {}, prompts: {}, ...(logging ? { logging: {} } : {}) },
    },
    tools,
    prompts: ['word-study', 'passage-exegesis', 'compare-translations', 'confession-study', 'primary-source-research', 'donate']
      .map(name => ({ name, description: `${name} prompt` })),
    resourceTemplates: [
      { uriTemplate: 'theologai://documents/{slug}', name: 'Historical Document' },
      { uriTemplate: 'theologai://strongs/{number}', name: "Strong's Dictionary Entry" },
    ],
    staticResources: [
      { uri: 'theologai://translations', name: 'Bible Translations' },
      { uri: 'theologai://commentaries', name: 'Commentaries' },
      { uri: 'theologai://primary-sources/catalog', name: 'Local Primary-source Catalog' },
    ],
    dynamicResourceUris: ['theologai://documents/example'],
  };
}

describe('MCP transport contract oracle', () => {
  it.each([
    ['v6 HTTP', '6', false],
    ['v6 stdio', '6', true],
    ['v7 Workerd', '7', false],
  ] as const)('accepts the exact %s profile and keeps captured inputs immutable', async (_name, version, logging) => {
    const actual = snapshot(version, logging);
    const expected = await fingerprintMcpTransportSnapshot(actual);
    await expect(assertMcpTransportContract(actual, { contractVersion: version, logging }, expected)).resolves.toBeUndefined();
    const clone = cloneMcpTransportSnapshot(actual);
    clone.dynamicResourceUris.push('theologai://documents/runtime-specific');
    expect(actual.dynamicResourceUris).toEqual(['theologai://documents/example']);
  });

  it.each([
    ['tool order', (value: McpTransportSnapshot) => value.tools.reverse()],
    ['non-primary schema', (value: McpTransportSnapshot) => { value.tools[0]!.outputSchema = { type: 'string' }; }],
    ['non-primary annotations', (value: McpTransportSnapshot) => { value.tools[0]!.annotations = { openWorldHint: true }; }],
    ['unexpected capability', (value: McpTransportSnapshot) => { value.server.capabilities.experimental = {}; }],
    ['prompt removal', (value: McpTransportSnapshot) => value.prompts.pop()],
    ['template addition', (value: McpTransportSnapshot) => value.resourceTemplates.push({ uriTemplate: 'extra://{id}' })],
    ['primary v6/v7 drift', (value: McpTransportSnapshot) => {
      ((value.tools[5]!.outputSchema as any).properties.schemaVersion as any).const = '7';
    }],
  ])('rejects %s drift', async (_name, mutate) => {
    const actual = snapshot('6');
    const expected = await fingerprintMcpTransportSnapshot(actual);
    mutate(actual);
    await expect(assertMcpTransportContract(actual, { contractVersion: '6', logging: false }, expected)).rejects.toThrow(
      /MCP transport contract drift/,
    );
  });

  it('fingerprints complete public metadata while excluding dynamic resource data', async () => {
    const first = snapshot('6');
    const second = cloneMcpTransportSnapshot(first);
    second.dynamicResourceUris.push('theologai://documents/another-runtime-only-document');
    expect(await fingerprintMcpTransportSnapshot(second)).toEqual(await fingerprintMcpTransportSnapshot(first));
    (second.tools[5]!.description as string) += ' changed';
    expect((await fingerprintMcpTransportSnapshot(second)).tools)
      .not.toBe((await fingerprintMcpTransportSnapshot(first)).tools);
  });
});
