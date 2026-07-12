/** Node-only loader for the generated UBS artifact copied into dist/data. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UbsParallelPassageRepository } from '../shared/UbsParallelPassageRepository.js';

export function loadUbsParallelPassageRepository(path?: string): UbsParallelPassageRepository {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const artifactPath = path ?? join(currentDirectory, '..', '..', 'data', 'ubs-parallel-passages.generated.json');
  return new UbsParallelPassageRepository(JSON.parse(readFileSync(artifactPath, 'utf8')) as unknown);
}
