/** Fixed production Transform-9 release audit; there is intentionally no endpoint override. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRODUCTION_PROFILE, runHistoricalCoreAuditCli } from './audit-historical-core-preview.js';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runHistoricalCoreAuditCli(process.argv.slice(2), PRODUCTION_PROFILE).then(({ output, probeCount }) => {
    console.log(`PASS: ${probeCount} reviewed core historical works on production; evidence: ${output}`);
  }).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
