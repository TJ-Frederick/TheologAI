import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  runHistoricalSpineAuditCli,
  SPINE_PRODUCTION_PROFILE,
} from './audit-historical-spine-preview.js';

async function main(): Promise<void> {
  const { output, probeCount } = await runHistoricalSpineAuditCli(process.argv.slice(2), SPINE_PRODUCTION_PROFILE);
  console.log(`PASS: ${probeCount} Transform-11 historical-spine works; evidence: ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
