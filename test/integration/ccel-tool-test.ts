/**
 * Retained compatibility marker for the retired pre-v3 classic-text script.
 * Current primary-source integration is covered by the maintained unit,
 * Worker-runtime, MCP contract, and explicitly authorized preview audit suites.
 * This file intentionally has no executable or network behavior.
 */
import { recommendedToolCallsForPrompt } from '../../src/mcp/prompts.js';

export function assertRetiredCcelToolContractGuard(): void {
  const v3 = recommendedToolCallsForPrompt('primary-source-research', { topic: 'guard' });
  const v7 = recommendedToolCallsForPrompt('primary-source-research', { topic: 'guard', authors: 'One,Two' }, {
    exposeCcelDiscovery: true, ccelLiveSearch: false, ccelCoordinator: false,
    contractVersion: '7', liveCcelEnabled: false,
  });
  const v7Calls = JSON.stringify(v7);
  if (JSON.stringify(v3).includes('"ccel"') || v7.length !== 1
    || v7Calls.includes('"providers"') || !v7Calls.includes('"searchDepth":"expanded"')
    || !v7Calls.includes('"expandedLimit":3')) {
    throw new Error('Primary-source CCEL contract guard failed.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) assertRetiredCcelToolContractGuard();
