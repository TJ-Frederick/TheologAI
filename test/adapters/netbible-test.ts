#!/usr/bin/env tsx

/**
 * NET Bible API Adapter - Integration Test Script
 *
 * Tests NET Bible API adapter for fetching Bible passages with translator notes.
 *
 * Run: npm run test:netbible
 */

import { NETBibleAdapter } from '../../src/adapters/netBibleApi.js';

// ANSI color codes for output
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
  console.log(`${colors.blue}=== NET Bible API Adapter - Integration Tests ===${colors.reset}\n`);

  const adapter = new NETBibleAdapter();

  // Test 1: Basic verse lookup
  await runTest('Basic verse lookup - John 3:16', async () => {
    const result = await adapter.getPassage('John 3:16');

    if (!result.reference || result.reference !== 'John 3:16') {
      throw new Error('Invalid reference in response');
    }
    if (!result.text || result.text.length === 0) {
      throw new Error('Empty text response');
    }
    if (!result.text.toLowerCase().includes('god')) {
      throw new Error('Expected text content not found');
    }
    if (!result.html || result.html.length === 0) {
      throw new Error('Empty HTML response');
    }

    console.log(`  ${colors.dim}Text: ${result.text.substring(0, 100)}...${colors.reset}`);
    console.log(`  ${colors.dim}Notes: ${result.notes.length} found${colors.reset}`);
  });

  // Test 2: Verse with rich translator notes
  await runTest('Verse with rich notes - John 1:1', async () => {
    const result = await adapter.getPassage('John 1:1');

    if (!result.text || result.text.length === 0) {
      throw new Error('Empty text response');
    }
    if (!result.text.toLowerCase().includes('word') && !result.text.toLowerCase().includes('beginning')) {
      throw new Error('Expected text content not found');
    }

    console.log(`  ${colors.dim}Text: ${result.text.substring(0, 100)}...${colors.reset}`);
    console.log(`  ${colors.dim}Notes: ${result.notes.length} found${colors.reset}`);

    // Display first note if available
    if (result.notes.length > 0) {
      const firstNote = result.notes[0];
      console.log(`  ${colors.dim}First note [${firstNote.type}]: ${firstNote.text.substring(0, 80)}...${colors.reset}`);
    }
  });

  // Test 3: Verse range
  await runTest('Verse range - Romans 8:28-30', async () => {
    const result = await adapter.getPassage('Romans 8:28-30');

    if (!result.text || result.text.length < 50) {
      throw new Error('Text too short for verse range');
    }

    console.log(`  ${colors.dim}Text length: ${result.text.length} chars${colors.reset}`);
    console.log(`  ${colors.dim}Notes: ${result.notes.length} found${colors.reset}`);
  });

  // Test 4: Old Testament verse
  await runTest('Old Testament verse - Genesis 1:1', async () => {
    const result = await adapter.getPassage('Genesis 1:1');

    if (!result.text || result.text.length === 0) {
      throw new Error('Empty text response');
    }
    if (!result.text.toLowerCase().includes('beginning') && !result.text.toLowerCase().includes('created')) {
      throw new Error('Expected text content not found');
    }

    console.log(`  ${colors.dim}Text: ${result.text.substring(0, 100)}...${colors.reset}`);
    console.log(`  ${colors.dim}Notes: ${result.notes.length} found${colors.reset}`);
  });

  // Test 5: Psalm verse
  await runTest('Psalm verse - Psalm 23:1', async () => {
    const result = await adapter.getPassage('Psalm 23:1');

    if (!result.text || result.text.length === 0) {
      throw new Error('Empty text response');
    }
    if (!result.text.toLowerCase().includes('lord') && !result.text.toLowerCase().includes('shepherd')) {
      throw new Error('Expected text content not found');
    }

    console.log(`  ${colors.dim}Text: ${result.text}${colors.reset}`);
    console.log(`  ${colors.dim}Notes: ${result.notes.length} found${colors.reset}`);
  });

  // Test 6: Caching mechanism
  await runTest('Caching - Second request should be faster', async () => {
    const ref = 'Ephesians 2:8';

    // First request (cache miss)
    const start1 = Date.now();
    const result1 = await adapter.getPassage(ref);
    const duration1 = Date.now() - start1;

    // Second request (cache hit)
    const start2 = Date.now();
    const result2 = await adapter.getPassage(ref);
    const duration2 = Date.now() - start2;

    if (result1.text !== result2.text) {
      throw new Error('Cached result does not match original');
    }

    console.log(`  ${colors.dim}First request: ${duration1}ms${colors.reset}`);
    console.log(`  ${colors.dim}Second request: ${duration2}ms (cached)${colors.reset}`);
    console.log(`  ${colors.dim}Speedup: ${(duration1 / Math.max(duration2, 1)).toFixed(1)}x${colors.reset}`);
  });

  // Test 7: Error handling - Empty reference
  await runTest('Error handling - Empty reference', async () => {
    try {
      await adapter.getPassage('');
      throw new Error('Expected error was not thrown');
    } catch (error) {
      if (!(error instanceof Error)) {
        throw new Error('Expected Error instance');
      }
      if (!error.message.includes('empty') && !error.message.includes('cannot be empty')) {
        throw new Error(`Unexpected error message: ${error.message}`);
      }
      // Expected error occurred
    }
  });

  // Test 8: Error handling - Invalid reference
  await runTest('Error handling - Invalid reference', async () => {
    try {
      await adapter.getPassage('InvalidBook 999:999');
      throw new Error('Expected error was not thrown');
    } catch (error) {
      if (!(error instanceof Error)) {
        throw new Error('Expected Error instance');
      }
      if (!error.message.includes('Invalid') && !error.message.includes('No passage')) {
        throw new Error(`Unexpected error message: ${error.message}`);
      }
      // Expected error occurred
    }
  });

  // Test 9: Configuration check
  await runTest('Configuration - Adapter is configured', async () => {
    if (!adapter.isConfigured()) {
      throw new Error('Adapter should be configured (no API key needed)');
    }
  });

  // Test 10: Copyright notice
  await runTest('Copyright notice - Valid attribution', async () => {
    const copyright = adapter.getCopyrightNotice();

    if (!copyright || copyright.length === 0) {
      throw new Error('Copyright notice is empty');
    }
    if (!copyright.includes('NET Bible') && !copyright.includes('Biblical Studies Press')) {
      throw new Error('Copyright notice does not mention NET Bible or publisher');
    }

    console.log(`  ${colors.dim}${copyright}${colors.reset}`);
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
