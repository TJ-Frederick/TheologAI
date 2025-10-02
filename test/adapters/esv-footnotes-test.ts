#!/usr/bin/env tsx

/**
 * ESV Footnotes - Integration Test Script
 *
 * Tests ESV HTML endpoint with footnote extraction.
 *
 * Run: npx tsx test/adapters/esv-footnotes-test.ts
 */

import { ESVAdapter } from '../../src/adapters/esvApi.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  const startTime = Date.now();

  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, passed: true, duration });
    console.log(`${colors.green}✓${colors.reset} ${name} ${colors.cyan}(${duration}ms)${colors.reset}`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMessage, duration });
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    console.log(`  ${colors.red}Error: ${errorMessage}${colors.reset}`);
  }
}

async function main() {
  console.log(`${colors.blue}=== ESV Footnotes - Integration Tests ===${colors.reset}\n`);

  const adapter = new ESVAdapter();

  if (!adapter.isConfigured()) {
    console.log(`${colors.red}ESV API key not configured. Skipping tests.${colors.reset}`);
    process.exit(1);
  }

  // Test 1: Verse with textual variant - Romans 8:28
  await runTest('Romans 8:28 - Textual variant footnote', async () => {
    const result = await adapter.getPassageWithNotes('Romans 8:28');

    if (!result.footnotes || result.footnotes.length === 0) {
      throw new Error('Expected footnotes but got none');
    }

    const hasVariant = result.footnotes.some(f =>
      f.type === 'variant' && f.text.toLowerCase().includes('manuscripts')
    );

    if (!hasVariant) {
      throw new Error('Expected variant footnote not found');
    }

    console.log(`  ${colors.dim}Footnotes found: ${result.footnotes.length}${colors.reset}`);
    console.log(`  ${colors.dim}First note: ${result.footnotes[0].text.substring(0, 60)}...${colors.reset}`);
  });

  // Test 2: John 3:16 - Translation alternative
  await runTest('John 3:16 - Translation alternative', async () => {
    const result = await adapter.getPassageWithNotes('John 3:16');

    if (!result.footnotes || result.footnotes.length === 0) {
      throw new Error('Expected footnotes but got none');
    }

    console.log(`  ${colors.dim}Footnotes found: ${result.footnotes.length}${colors.reset}`);
    console.log(`  ${colors.dim}Note: ${result.footnotes[0].text}${colors.reset}`);
  });

  // Test 3: Matthew 17:20-21 - Verse with multiple footnotes
  await runTest('Matthew 17:20-21 - Multiple footnotes', async () => {
    const result = await adapter.getPassageWithNotes('Matthew 17:20-21');

    if (!result.footnotes || result.footnotes.length === 0) {
      throw new Error('Expected footnotes but got none');
    }

    console.log(`  ${colors.dim}Footnotes found: ${result.footnotes.length}${colors.reset}`);
    result.footnotes.forEach((note, idx) => {
      console.log(`  ${colors.dim}[${note.marker}] ${note.type}: ${note.text.substring(0, 50)}...${colors.reset}`);
    });
  });

  // Test 4: Genesis 1:1 - Verse with no footnotes
  await runTest('Genesis 1:1 - No footnotes (expected)', async () => {
    const result = await adapter.getPassageWithNotes('Genesis 1:1');

    if (result.footnotes.length > 0) {
      console.log(`  ${colors.yellow}Note: Genesis 1:1 has ${result.footnotes.length} footnote(s)${colors.reset}`);
    } else {
      console.log(`  ${colors.dim}No footnotes (as expected)${colors.reset}`);
    }

    // This should not throw - it's valid to have no footnotes
  });

  // Test 5: Caching test
  await runTest('Caching - Second request faster', async () => {
    const ref = 'Ephesians 2:8';

    // First request
    const start1 = Date.now();
    const result1 = await adapter.getPassageWithNotes(ref);
    const duration1 = Date.now() - start1;

    // Second request (should be cached)
    const start2 = Date.now();
    const result2 = await adapter.getPassageWithNotes(ref);
    const duration2 = Date.now() - start2;

    if (result1.html !== result2.html) {
      throw new Error('Cached result differs from original');
    }

    console.log(`  ${colors.dim}First: ${duration1}ms, Second: ${duration2}ms (cached)${colors.reset}`);
    console.log(`  ${colors.dim}Speedup: ${(duration1 / Math.max(duration2, 1)).toFixed(1)}x${colors.reset}`);
  });

  // Test 6: Error handling - invalid reference
  await runTest('Error handling - Invalid reference', async () => {
    try {
      await adapter.getPassageWithNotes('InvalidBook 999:999');
      throw new Error('Expected error was not thrown');
    } catch (error) {
      if (!(error instanceof Error)) {
        throw new Error('Expected Error instance');
      }
      if (!error.message.includes('Invalid') && !error.message.includes('No passages')) {
        throw new Error(`Unexpected error message: ${error.message}`);
      }
    }
  });

  // Print summary
  console.log(`\n${colors.blue}=== Test Summary ===${colors.reset}`);
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  if (failed > 0) {
    console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  }
  console.log(`Total: ${total}`);
  console.log(`Duration: ${totalDuration}ms`);

  if (failed > 0) {
    console.log(`\n${colors.red}Some tests failed!${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}All tests passed!${colors.reset}`);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
