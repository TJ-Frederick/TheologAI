import { CcelSearchAdapter } from '../../src/adapters/commentary/CcelSearchAdapter.js';
import { recommendedToolCallsForPrompt } from '../../src/mcp/prompts.js';
import { createPrimarySourceSearchDescriptor } from '../../src/mcp/primarySourceSearchDescriptor.js';

/** Retired CCEL adapter path must remain disabled and network-inert. */
export async function assertRetiredCcelScriptIsNetworkInert(): Promise<void> {
  let fetched = false;
  const adapter = new CcelSearchAdapter({
    fetchImpl: async () => { fetched = true; throw new Error('unexpected fetch'); },
  });
  const result = await adapter.search({ text: 'inert compatibility guard' }, {
    admit: async () => { throw new Error('unexpected coordinator access'); },
    recordOutcome: async () => { throw new Error('unexpected coordinator access'); },
    snapshot: async () => { throw new Error('unexpected coordinator access'); },
  });
  if (result.status !== 'disabled' || result.searched || fetched) {
    throw new Error('Dormant CCEL adapter guard failed.');
  }
}

/** Retired classic-text path must preserve the prompt/v7 expandedLimit guard. */
export function assertRetiredCcelToolContractGuard(): void {
  const v3 = recommendedToolCallsForPrompt('primary-source-research', { topic: 'guard' });
  const v7 = recommendedToolCallsForPrompt(
    'primary-source-research',
    { topic: 'guard', authors: 'One,Two' },
    createPrimarySourceSearchDescriptor('7'),
  );
  const v7Calls = JSON.stringify(v7);
  if (JSON.stringify(v3).includes('"ccel"') || v7.length !== 1
    || v7Calls.includes('"providers"') || !v7Calls.includes('"searchDepth":"expanded"')
    || !v7Calls.includes('"expandedLimit":3')) {
    throw new Error('Primary-source CCEL contract guard failed.');
  }
}
