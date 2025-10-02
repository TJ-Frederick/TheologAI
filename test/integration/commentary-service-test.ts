#!/usr/bin/env tsx

/**
 * Commentary Service - Integration Test Script
 *
 * Tests the full commentary service with NET Bible integration.
 *
 * Run: npx tsx test/integration/commentary-service-test.ts
 */

import { CommentaryService } from '../../src/services/commentaryService.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m'
};

async function main() {
  console.log(`${colors.blue}=== Commentary Service - Integration Test ===${colors.reset}\n`);

  const service = new CommentaryService();

  // Test 1: John 3:16
  console.log(`${colors.cyan}Test 1: Looking up commentary for John 3:16${colors.reset}`);
  try {
    const result = await service.lookup({ reference: 'John 3:16' });
    console.log(`${colors.green}✓ Success${colors.reset}`);
    console.log(`Reference: ${result.reference}`);
    console.log(`Commentator: ${result.commentator}`);
    console.log(`\nCommentary:\n${result.text.substring(0, 500)}...`);
    console.log(`\nCitation: ${result.citation.source}`);
    console.log(`URL: ${result.citation.url}\n`);
  } catch (error) {
    console.log(`${colors.yellow}Note: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}\n`);
  }

  // Test 2: Romans 8:28
  console.log(`${colors.cyan}Test 2: Looking up commentary for Romans 8:28${colors.reset}`);
  try {
    const result = await service.lookup({ reference: 'Romans 8:28' });
    console.log(`${colors.green}✓ Success${colors.reset}`);
    console.log(`Reference: ${result.reference}`);
    console.log(`Commentator: ${result.commentator}`);
    console.log(`\nCommentary:\n${result.text.substring(0, 500)}...`);
    console.log(`\nCitation: ${result.citation.source}\n`);
  } catch (error) {
    console.log(`${colors.yellow}Note: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}\n`);
  }

  // Test 3: Verse with no notes
  console.log(`${colors.cyan}Test 3: Looking up commentary for a verse with fewer notes${colors.reset}`);
  try {
    const result = await service.lookup({ reference: 'Philemon 1:25' });
    console.log(`${colors.green}✓ Success${colors.reset}`);
    console.log(`Reference: ${result.reference}`);
    console.log(`\nCommentary:\n${result.text.substring(0, 400)}...`);
  } catch (error) {
    console.log(`${colors.yellow}Note: ${error instanceof Error ? error.message : 'Unknown error'}${colors.reset}\n`);
  }

  console.log(`${colors.blue}=== Test Complete ===${colors.reset}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
