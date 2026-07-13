#!/usr/bin/env tsx
/** Verify an ignored D1 seed artifact without contacting Cloudflare. */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndVerifyD1SeedManifest } from './d1-seed-manifest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = loadAndVerifyD1SeedManifest(ROOT, join(ROOT, 'scripts', 'd1-seed'));
console.error(`[verify-d1-seed] Verified ${seed.totals.fileCount} local seed files and ${seed.totals.rowCount.toLocaleString()} rows.`);
