/**
 * Live Commentary Sample Test
 *
 * Fetches actual commentary from CCEL and displays formatted output
 * Tests real-world usage scenarios
 */

import { CommentaryService } from '../../src/services/commentaryService.js';

console.log('='.repeat(80));
console.log('LIVE MATTHEW HENRY COMMENTARY SAMPLES');
console.log('='.repeat(80));
console.log();

const service = new CommentaryService();

// Sample 1: John 3:16 - Most famous verse
console.log('SAMPLE 1: John 3:16 - "For God so loved the world..."');
console.log('='.repeat(80));
try {
  const result = await service.lookup({
    reference: 'John 3:16',
    commentator: 'Matthew Henry'
  });

  console.log(result.text);
  console.log();
} catch (error) {
  console.log(`ERROR: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Sample 2: Genesis 1:1 - Creation
console.log('SAMPLE 2: Genesis 1:1 - "In the beginning..."');
console.log('='.repeat(80));
try {
  const result = await service.lookup({
    reference: 'Genesis 1:1',
    commentator: 'Matthew Henry'
  });

  console.log(result.text);
  console.log();
} catch (error) {
  console.log(`ERROR: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Sample 3: Psalm 23:1 - The Lord is my shepherd
console.log('SAMPLE 3: Psalm 23:1 - "The Lord is my shepherd..."');
console.log('='.repeat(80));
try {
  const result = await service.lookup({
    reference: 'Psalm 23:1',
    commentator: 'Matthew Henry'
  });

  console.log(result.text);
  console.log();
} catch (error) {
  console.log(`ERROR: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Sample 4: Romans 8:28 - All things work together for good
console.log('SAMPLE 4: Romans 8:28 - "All things work together for good..."');
console.log('='.repeat(80));
try {
  const result = await service.lookup({
    reference: 'Romans 8:28',
    commentator: 'Matthew Henry'
  });

  console.log(result.text);
  console.log();
} catch (error) {
  console.log(`ERROR: ${error instanceof Error ? error.message : error}`);
  console.log();
}

console.log('='.repeat(80));
console.log('LIVE COMMENTARY SAMPLES COMPLETE');
console.log('='.repeat(80));
