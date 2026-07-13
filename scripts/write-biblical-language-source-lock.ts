#!/usr/bin/env tsx

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomically } from './atomic-publication.js';
import { sourceLockProjection } from './biblical-language-sources.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
writeFileAtomically(
  join(ROOT, 'data/biblical-languages/SOURCE.json'),
  `${JSON.stringify(sourceLockProjection(), null, 2)}\n`,
);
console.error('[write-biblical-language-source-lock] Wrote the deterministic biblical-language source lock.');
