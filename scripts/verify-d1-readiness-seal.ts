#!/usr/bin/env tsx
/** Bind the deterministic generated seed to the reviewed remote readiness seal. */

import { resolve } from 'node:path';
import { verifyD1ReadinessSealSeed } from './check-remote-d1-readiness.js';

const root = resolve(process.cwd());
verifyD1ReadinessSealSeed(root);
process.stdout.write('Generated D1 seed manifest matches the reviewed readiness seal.\n');
