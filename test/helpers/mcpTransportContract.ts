export type JsonRecord = Record<string, unknown>;

export interface McpContractClient {
  getServerVersion(): { name?: string; version?: string } | undefined;
  getServerCapabilities(): JsonRecord | undefined;
  listTools(): Promise<{ tools: JsonRecord[] }>;
  listPrompts(): Promise<{ prompts: JsonRecord[] }>;
  listResourceTemplates(): Promise<{ resourceTemplates: JsonRecord[] }>;
  listResources(): Promise<{ resources: JsonRecord[] }>;
}

export interface McpTransportSnapshot {
  server: { name: string; version: string; capabilities: JsonRecord };
  tools: JsonRecord[];
  prompts: JsonRecord[];
  resourceTemplates: JsonRecord[];
  staticResources: JsonRecord[];
  dynamicResourceUris: string[];
}

export interface McpTransportProfile {
  contractVersion: '6' | '7';
  logging: boolean;
}

export interface McpContractFingerprints {
  capabilities: string;
  tools: string;
  prompts: string;
  resourceTemplates: string;
  staticResources: string;
}

const TOOL_ORDER = [
  'bible_lookup',
  'bible_cross_references',
  'parallel_passages',
  'commentary_lookup',
  'classic_text_lookup',
  'primary_source_search',
  'original_language_lookup',
  'bible_verse_morphology',
  'original_language_study',
  'donation_config',
  'verify_donation',
] as const;

const PROMPT_ORDER = [
  'word-study',
  'passage-exegesis',
  'compare-translations',
  'confession-study',
  'primary-source-research',
  'donate',
] as const;

const RESOURCE_TEMPLATE_ORDER = [
  'theologai://documents/{slug}',
  'theologai://strongs/{number}',
] as const;

const STATIC_RESOURCE_ORDER = [
  'theologai://translations',
  'theologai://commentaries',
  'theologai://primary-sources/catalog',
] as const;

// Filled from the four real process/runtime rows and then frozen in this file.
export const EXPECTED_MCP_CONTRACT_FINGERPRINTS: Record<'6' | '7', McpContractFingerprints> = {
  '6': {
    capabilities: '',
    tools: '5a294c67a5faf01f8a91562f06ad55497a281fe52606ccb0f4c15abe7bf9b117',
    prompts: '7e6ab1c22d32a9f520a4a2e2cc917df17827610462ef524b791ad0c06ff3133d',
    resourceTemplates: 'f67c92aa2f3f64ce0a55e0973b61346962edd1533c86024347b63483a04d6ca3',
    staticResources: '1a07ddfb5b7954de0f37d1bec03c0886e6235f63ef5611a557a8cde4424e201b',
  },
  '7': {
    capabilities: '',
    tools: '3db01fdd22ed671ff16a4749768b04a099154a7485c83469184a9c21c2a4e982',
    prompts: 'ce77959ede84ac3e4910e253282c831e7cfaa07976771cc02b88a57a21764df4',
    resourceTemplates: 'f67c92aa2f3f64ce0a55e0973b61346962edd1533c86024347b63483a04d6ca3',
    staticResources: '1a07ddfb5b7954de0f37d1bec03c0886e6235f63ef5611a557a8cde4424e201b',
  },
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`MCP transport contract drift: ${message}`);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function names(records: JsonRecord[], key: string): string[] {
  return records.map(record => String(record[key]));
}

export async function captureMcpTransportSnapshot(client: McpContractClient): Promise<McpTransportSnapshot> {
  const serverVersion = client.getServerVersion();
  const capabilities = client.getServerCapabilities();
  invariant(serverVersion?.name && serverVersion.version, 'initialize did not return complete serverInfo');
  invariant(capabilities, 'initialize did not return server capabilities');

  const [tools, prompts, templates, resources] = await Promise.all([
    client.listTools(),
    client.listPrompts(),
    client.listResourceTemplates(),
    client.listResources(),
  ]);
  const staticSet = new Set<string>(STATIC_RESOURCE_ORDER);
  const staticResources = resources.resources.filter(resource => staticSet.has(String(resource.uri)));
  const dynamicResourceUris = resources.resources
    .filter(resource => !staticSet.has(String(resource.uri)))
    .map(resource => String(resource.uri));

  return deepFreeze(cloneJson({
    server: { name: serverVersion.name, version: serverVersion.version, capabilities },
    tools: tools.tools,
    prompts: prompts.prompts,
    resourceTemplates: templates.resourceTemplates,
    staticResources,
    dynamicResourceUris,
  }));
}

export async function fingerprintMcpTransportSnapshot(
  snapshot: McpTransportSnapshot,
): Promise<McpContractFingerprints> {
  return {
    capabilities: await sha256(snapshot.server.capabilities),
    tools: await sha256(snapshot.tools),
    prompts: await sha256(snapshot.prompts),
    resourceTemplates: await sha256(snapshot.resourceTemplates),
    staticResources: await sha256(snapshot.staticResources),
  };
}

export async function assertMcpTransportContract(
  snapshot: McpTransportSnapshot,
  profile: McpTransportProfile,
  expectedFingerprints: McpContractFingerprints = EXPECTED_MCP_CONTRACT_FINGERPRINTS[profile.contractVersion],
): Promise<void> {
  invariant(snapshot.server.name === 'theologai-bible-server', `unexpected server name ${snapshot.server.name}`);
  invariant(JSON.stringify(names(snapshot.tools, 'name')) === JSON.stringify(TOOL_ORDER), 'tool order or membership changed');
  invariant(JSON.stringify(names(snapshot.prompts, 'name')) === JSON.stringify(PROMPT_ORDER), 'prompt order or membership changed');
  invariant(
    JSON.stringify(names(snapshot.resourceTemplates, 'uriTemplate')) === JSON.stringify(RESOURCE_TEMPLATE_ORDER),
    'resource-template order or membership changed',
  );
  invariant(
    JSON.stringify(names(snapshot.staticResources, 'uri')) === JSON.stringify(STATIC_RESOURCE_ORDER),
    'static resource prefix changed',
  );

  const expectedCapabilities = {
    tools: {}, resources: {}, prompts: {}, ...(profile.logging ? { logging: {} } : {}),
  };
  invariant(
    canonicalize(snapshot.server.capabilities) === canonicalize(expectedCapabilities),
    'unexpected server capability or logging profile',
  );

  const primary = snapshot.tools.find(tool => tool.name === 'primary_source_search');
  invariant(primary, 'primary_source_search is missing');
  const schemaVersion = (primary.outputSchema as JsonRecord | undefined)?.properties as JsonRecord | undefined;
  const advertisedVersion = (schemaVersion?.schemaVersion as JsonRecord | undefined)?.const;
  invariant(advertisedVersion === profile.contractVersion, `primary_source_search must advertise v${profile.contractVersion}`);
  invariant(
    (primary.annotations as JsonRecord | undefined)?.openWorldHint === (profile.contractVersion === '7'),
    `primary_source_search openWorldHint drifted for v${profile.contractVersion}`,
  );

  const bibleLookup = snapshot.tools.find(tool => tool.name === 'bible_lookup');
  invariant(bibleLookup, 'bible_lookup is missing');
  const bibleOutputProperties = (bibleLookup.outputSchema as JsonRecord | undefined)?.properties as JsonRecord | undefined;
  const passages = bibleOutputProperties?.passages as JsonRecord | undefined;
  const passageProperties = (passages?.items as JsonRecord | undefined)?.properties as JsonRecord | undefined;
  const footnoteDelivery = passageProperties?.footnoteDelivery as JsonRecord | undefined;
  const deliveryProperties = footnoteDelivery?.properties as JsonRecord | undefined;
  invariant(
    canonicalize((deliveryProperties?.status as JsonRecord | undefined)?.enum)
      === canonicalize(['structured', 'inline', 'none', 'unavailable']),
    'bible_lookup footnoteDelivery status contract drifted',
  );

  const comparePrompt = snapshot.prompts.find(prompt => prompt.name === 'compare-translations');
  invariant(comparePrompt, 'compare-translations is missing');
  const comparisonArguments = comparePrompt.arguments as JsonRecord[] | undefined;
  const translationsArgument = comparisonArguments?.find(argument => argument.name === 'translations');
  invariant(
    typeof translationsArgument?.description === 'string'
      && translationsArgument.description.includes('ESV, NET, KJV, WEB, BSB, ASV, YLT, or DBY'),
    'compare-translations supported-translation contract drifted',
  );

  const fingerprints = await fingerprintMcpTransportSnapshot(snapshot);
  const expected = expectedFingerprints;
  for (const key of Object.keys(expected) as Array<keyof McpContractFingerprints>) {
    if (!expected[key]) continue;
    invariant(fingerprints[key] === expected[key], `${key} fingerprint drifted for v${profile.contractVersion}`);
  }
}

export function cloneMcpTransportSnapshot(snapshot: McpTransportSnapshot): McpTransportSnapshot {
  return cloneJson(snapshot);
}
