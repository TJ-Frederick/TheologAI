/** Fixed production wrapper; target selection is not a caller-controlled CLI surface. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runProductionCli } from './verify-preview-worker-deployment.js';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runProductionCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { runProductionCli } from './verify-preview-worker-deployment.js';
