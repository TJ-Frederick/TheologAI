#!/usr/bin/env tsx

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildOriginalLanguageCompactEvidence,
  runOriginalLanguageContextCapacity,
} from './original-language-context-capacity.js';

if (process.argv.length !== 2) {
  throw new Error('[write-original-language-context-capacity-evidence] accepts no arguments');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs/evidence/original-language-context-capacity-evidence.json');
const compact = buildOriginalLanguageCompactEvidence(runOriginalLanguageContextCapacity(root));
writeFileSync(output, `${JSON.stringify(compact, null, 2)}\n`, { mode: 0o644 });
process.stderr.write(`[write-original-language-context-capacity-evidence] wrote ${output}\n`);
