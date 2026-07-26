/** Fixed production endpoint wrapper; it intentionally has no URL/profile override. */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PRODUCTION_PROFILE, runOriginalLanguageV2AuditCli } from './audit-original-language-v2-preview.js';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runOriginalLanguageV2AuditCli(process.argv.slice(2), PRODUCTION_PROFILE).then(({ output, caseCount }) => {
    console.log(`PASS: ${caseCount}/${caseCount} original_language_study v2 production cases; evidence: ${output}`);
  }).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
