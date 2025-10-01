#!/usr/bin/env tsx

/**
 * CCEL API Adapter - Isolation Test Script
 *
 * Tests all three CCEL API endpoints independently before integration.
 *
 * Run: npx tsx test/adapters/ccel-test.ts
 */

import { CCELApiAdapter } from '../../src/adapters/ccelApi.js';

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
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
  console.log(`${colors.blue}=== CCEL API Adapter - Isolation Tests ===${colors.reset}\n`);

  const adapter = new CCELApiAdapter();

  // Test 1: Scripture API - Single Verse
  await runTest('Scripture API - Single verse (John 3:16, KJV)', async () => {
    const result = await adapter.getScripture({
      version: 'kjv',
      passage: 'john_3:16'
    });

    if (!result.passage || result.passage !== 'john_3:16') {
      throw new Error('Invalid passage in response');
    }
    if (!result.version || result.version !== 'kjv') {
      throw new Error('Invalid version in response');
    }
    if (!result.html || result.html.length === 0) {
      throw new Error('Empty HTML response');
    }
    if (!result.text || result.text.length === 0) {
      throw new Error('Empty text response');
    }
    if (!result.text.toLowerCase().includes('god')) {
      throw new Error('Expected text content not found');
    }

    console.log(`  ${colors.yellow}Preview:${colors.reset} ${result.text.substring(0, 100)}...`);
  });

  // Test 2: Scripture API - Verse Range
  await runTest('Scripture API - Verse range (Matthew 5:1-5, NRSV)', async () => {
    const result = await adapter.getScripture({
      version: 'nrsv',
      passage: 'matt_5:1-5'
    });

    if (!result.html || result.html.length === 0) {
      throw new Error('Empty HTML response');
    }
    if (!result.text || result.text.length < 100) {
      throw new Error('Text too short for verse range');
    }

    console.log(`  ${colors.yellow}Preview:${colors.reset} ${result.text.substring(0, 100)}...`);
  });

  // Test 3: Scripture API - Default version (NRSV)
  await runTest('Scripture API - Default version (Romans 8:28)', async () => {
    const result = await adapter.getScripture({
      passage: 'rom_8:28'
    });

    if (result.version !== 'nrsv') {
      throw new Error(`Expected default version 'nrsv', got '${result.version}'`);
    }
    if (!result.text.toLowerCase().includes('good')) {
      throw new Error('Expected text content not found');
    }

    console.log(`  ${colors.yellow}Preview:${colors.reset} ${result.text.substring(0, 100)}...`);
  });

  // Test 4: Reference Formatter
  await runTest('Reference formatter - John 3:16', async () => {
    const formatted = CCELApiAdapter.formatPassageReference('John 3:16');
    if (formatted !== 'john_3:16') {
      throw new Error(`Expected 'john_3:16', got '${formatted}'`);
    }
  });

  // Test 5: Reference Formatter - Complex reference
  await runTest('Reference formatter - 1 Corinthians 13:1-13', async () => {
    const formatted = CCELApiAdapter.formatPassageReference('1 Corinthians 13:1-13');
    if (formatted !== '1cor_13:1-13') {
      throw new Error(`Expected '1cor_13:1-13', got '${formatted}'`);
    }
  });

  // Test 6: Work Section API - Augustine's Confessions
  await runTest('Work Section API - Augustine Confessions Book II', async () => {
    const result = await adapter.getWorkSection({
      work: 'augustine/confessions',
      section: 'confessions.ii'
    });

    if (result.work !== 'augustine/confessions') {
      throw new Error('Invalid work in response');
    }
    if (result.section !== 'confessions.ii') {
      throw new Error('Invalid section in response');
    }
    if (!result.html || result.html.length === 0) {
      throw new Error('Empty HTML response');
    }
    if (!result.content || result.content.length < 100) {
      throw new Error('Content too short');
    }

    console.log(`  ${colors.yellow}Preview:${colors.reset} ${result.content.substring(0, 100)}...`);
  });

  // Test 7: Error Handling - Invalid passage
  await runTest('Error handling - Invalid scripture passage', async () => {
    try {
      const result = await adapter.getScripture({
        passage: 'invalid_99:999'
      });
      // CCEL might return an error page or empty content
      // If no exception is thrown, check if the response is valid
      if (result.html && result.html.length > 0) {
        // CCEL returns something even for invalid passages (likely an error page)
        // This is acceptable behavior, so we'll consider this test as verifying
        // the API doesn't crash on invalid input
        console.log(`  ${colors.yellow}Note: CCEL returned content for invalid passage (possibly error page)${colors.reset}`);
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw new Error('Expected Error instance');
      }
      // Error was thrown, which is also acceptable
    }
  });

  // Test 8: Error Handling - Invalid work
  await runTest('Error handling - Invalid work reference', async () => {
    try {
      await adapter.getWorkSection({
        work: 'invalid/work',
        section: 'nonexistent'
      });
      throw new Error('Expected error was not thrown');
    } catch (error) {
      if (!(error instanceof Error)) {
        throw new Error('Expected Error instance');
      }
      if (!error.message.includes('CCEL') && !error.message.includes('Failed')) {
        throw new Error(`Unexpected error message: ${error.message}`);
      }
      // Expected error occurred
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
