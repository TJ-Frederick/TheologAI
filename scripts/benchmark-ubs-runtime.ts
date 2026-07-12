#!/usr/bin/env tsx
/** Report local UBS JSON load/validation cost; this is evidence, not an SLO. */

import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UbsParallelPassageRepository } from '../src/adapters/shared/UbsParallelPassageRepository.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const before = process.memoryUsage();
const started = performance.now();
const bytes = readFileSync(join(root, 'src/data/ubs-parallel-passages.generated.json'));
const repository = new UbsParallelPassageRepository(JSON.parse(bytes.toString('utf8')) as unknown);
const elapsedMs = performance.now() - started;
const after = process.memoryUsage();
const sample = repository.findGroups('Matthew 3:16-17', 1);
process.stdout.write(`${JSON.stringify({
  node: process.version,
  artifactBytes: bytes.byteLength,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  heapDeltaMiB: Number(((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(2)),
  rssDeltaMiB: Number(((after.rss - before.rss) / 1024 / 1024).toFixed(2)),
  sampleGroups: sample.length,
}, null, 2)}\n`);
