/**
 * Retained compatibility marker for the retired ad-hoc CCEL adapter script.
 *
 * Use `npm run test:ccel` for deterministic tests. Live preview verification
 * is separately gated behind `npm run audit:ccel-preview -- ...`; this file
 * intentionally performs no network request when executed directly.
 */
import { CcelSearchAdapter } from '../../src/adapters/commentary/CcelSearchAdapter.js';

export async function assertRetiredCcelScriptIsNetworkInert(): Promise<void> {
  let fetched = false;
  const adapter = new CcelSearchAdapter({ fetchImpl: async () => { fetched = true; throw new Error('unexpected fetch'); } });
  const result = await adapter.search({ text: 'inert compatibility guard' }, {
    admit: async () => { throw new Error('unexpected coordinator access'); },
    recordOutcome: async () => { throw new Error('unexpected coordinator access'); },
    snapshot: async () => { throw new Error('unexpected coordinator access'); },
  });
  if (result.status !== 'disabled' || result.searched || fetched) throw new Error('Dormant CCEL adapter guard failed.');
}

if (import.meta.url === `file://${process.argv[1]}`) await assertRetiredCcelScriptIsNetworkInert();
