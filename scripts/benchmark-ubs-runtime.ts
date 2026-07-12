#!/usr/bin/env tsx
/** Report local UBS JSON load/validation and retained-heap cost; evidence, not an SLO. */

import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UbsParallelPassageRepository } from '../src/adapters/shared/UbsParallelPassageRepository.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!globalThis.gc) throw new Error('Run with node --expose-gc --import tsx');
globalThis.gc();
const before = process.memoryUsage();
const started = performance.now();
let bytes: Buffer | undefined = readFileSync(join(root, 'src/data/ubs-parallel-passages.generated.json'));
const artifactBytes = bytes.byteLength;
let artifact: unknown = JSON.parse(bytes.toString('utf8'));
const repository = new UbsParallelPassageRepository(artifact);
const elapsedMs = performance.now() - started;
artifact = undefined;
bytes = undefined;
globalThis.gc();
const after = process.memoryUsage();
const sample = repository.findGroups('Matthew 3:16-17', 1);
process.stdout.write(`${JSON.stringify({
  node: process.version,
  artifactBytes,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  retainedHeapDeltaMiB: Number(((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(2)),
  retainedRssDeltaMiB: Number(((after.rss - before.rss) / 1024 / 1024).toFixed(2)),
  sampleGroups: sample.length,
}, null, 2)}\n`);
