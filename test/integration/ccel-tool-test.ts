#!/usr/bin/env tsx

/**
 * CCEL Integration Test
 *
 * Tests the classic_text_lookup tool integration
 *
 * Run: npx tsx test/integration/ccel-tool-test.ts
 */

import { classicTextLookupHandler } from '../../src/tools/classicTextLookup.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function test1() {
  console.log(`\n${colors.blue}Test 1: List popular works${colors.reset}`);
  const result = await classicTextLookupHandler.handler({ listWorks: true });
  console.log(result.content[0].text.substring(0, 300) + '...');
  console.log(`${colors.green}✓ Test 1 passed${colors.reset}`);
}

async function test2() {
  console.log(`\n${colors.blue}Test 2: Look up Augustine's Confessions${colors.reset}`);
  const result = await classicTextLookupHandler.handler({
    work: 'augustine/confessions',
    section: 'confessions.ii'
  });
  console.log(result.content[0].text.substring(0, 300) + '...');
  console.log(`${colors.green}✓ Test 2 passed${colors.reset}`);
}

async function test3() {
  console.log(`\n${colors.blue}Test 3: Search for works about grace${colors.reset}`);
  const result = await classicTextLookupHandler.handler({
    query: 'grace'
  });
  console.log(result.content[0].text.substring(0, 300) + '...');
  console.log(`${colors.green}✓ Test 3 passed${colors.reset}`);
}

async function test4() {
  console.log(`\n${colors.blue}Test 4: Error handling - missing work${colors.reset}`);
  const result = await classicTextLookupHandler.handler({});
  console.log(result.content[0].text.substring(0, 200) + '...');
  console.log(`${colors.green}✓ Test 4 passed${colors.reset}`);
}

async function main() {
  console.log(`${colors.cyan}=== CCEL Tool Integration Tests ===${colors.reset}`);

  try {
    await test1();
    await test2();
    await test3();
    await test4();

    console.log(`\n${colors.green}All integration tests passed!${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.red}Test failed:${colors.reset}`, error);
    process.exit(1);
  }
}

main();
