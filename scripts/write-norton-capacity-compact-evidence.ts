#!/usr/bin/env tsx

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildNortonCompactEvidence,
  runNortonCapacityDecisionEvidence,
} from './norton-capacity-decision-evidence.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'docs/evidence/norton-capacity-decision-evidence.json');

if (process.argv.length !== 2) {
  throw new Error('[write-norton-capacity-evidence] accepts no arguments');
}

const full = await runNortonCapacityDecisionEvidence(root);
const compact = buildNortonCompactEvidence(full);
writeFileSync(output, `${JSON.stringify(compact, null, 2)}\n`, { mode: 0o644 });
process.stderr.write(`[write-norton-capacity-evidence] wrote ${output}\n`);
