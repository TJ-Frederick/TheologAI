/** Fixed production endpoint wrapper; it intentionally has no URL/profile override. */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PRODUCTION_PROFILE } from './audit-historical-core-preview.js';
import { runPrimarySourceEdgeStabilizationCli } from './audit-primary-source-edge-stabilization.js';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPrimarySourceEdgeStabilizationCli(process.argv.slice(2), PRODUCTION_PROFILE).then(({ output, evidence }) => {
    console.log(`PASS: production primary-source contract stabilized on attempt ${evidence.matchedAttempt}; evidence: ${output}`);
  }).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
