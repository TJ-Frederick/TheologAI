/** Fixed production endpoint wrapper; it intentionally has no URL/profile override. */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PRODUCTION_PROFILE, runOriginalLanguageV3AuditCli } from './audit-original-language-v3-preview.js';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runOriginalLanguageV3AuditCli(process.argv.slice(2), PRODUCTION_PROFILE).then(({ output, caseCount, promptCaseCount }) => {
    console.log(`PASS: ${caseCount}/${caseCount} tool cases and ${promptCaseCount}/${promptCaseCount} prompt cases; evidence: ${output}`);
  }).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
