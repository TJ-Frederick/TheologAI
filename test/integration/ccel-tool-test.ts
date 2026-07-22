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
  if (JSON.stringify(v3).includes('"ccel"') || v7.slice(1).length !== 1) {
    throw new Error('Primary-source CCEL contract guard failed.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) assertRetiredCcelToolContractGuard();
