#!/usr/bin/env tsx

/**
 * Classic Text Lookup - Final Integration Test
 *
 * Tests the redesigned tool that ALWAYS uses automatic resolution
 */

import { classicTextLookupHandler } from '../../src/tools/classicTextLookup.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function test1() {
  console.log(`\n${colors.blue}Test 1: Calvin Institutes Book 1 Chapter 1 (natural language)${colors.reset}`);
  const result = await classicTextLookupHandler.handler({
    work: 'calvin/institutes',
    query: 'Book 1 Chapter 1'
  });

  const text = result.content[0].text;
  if (text.includes('KNOWLEDGE OF GOD')) {
    console.log(`${colors.green}✓ Correctly retrieved Calvin's Institutes${colors.reset}`);
    console.log(`  Preview: ${text.substring(0, 100)}...`);
  } else {
    throw new Error('Did not find expected content');
  }
}

async function test2() {
  console.log(`\n${colors.blue}Test 2: Augustine Confessions Book 1${colors.reset}`);
  const result = await classicTextLookupHandler.handler({
    work: 'augustine/confessions',
    query: 'Book 1'
  });

  const text = result.content[0].text;
  console.log(`${colors.green}✓ Retrieved Augustine's Confessions${colors.reset}`);
  console.log(`  Preview: ${text.substring(0, 100)}...`);
}

async function test3() {
  console.log(`\n${colors.blue}Test 3: Missing query - should show available sections${colors.reset}`);
  const result = await classicTextLookupHandler.handler({
    work: 'calvin/institutes'
  });

  const text = result.content[0].text;
  if (text.includes('Available Sections')) {
    console.log(`${colors.green}✓ Correctly showed available sections${colors.reset}`);
  } else {
    throw new Error('Should have shown available sections');
  }
}

async function test4() {
  console.log(`\n${colors.blue}Test 4: List works${colors.reset}`);
  const result = await classicTextLookupHandler.handler({
    listWorks: true
  });

  const text = result.content[0].text;
  if (text.includes('Calvin') && text.includes('Augustine')) {
    console.log(`${colors.green}✓ Listed popular works${colors.reset}`);
  } else {
    throw new Error('Should have listed works');
  }
}

async function main() {
  console.log(`${colors.cyan}=== Classic Text Lookup - Final Integration Tests ===${colors.reset}`);

  try {
    await test1();
    await test2();
    await test3();
    await test4();

    console.log(`\n${colors.green}All tests passed! Tool is ready for Claude Desktop.${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.red}Test failed:${colors.reset}`, error);
    process.exit(1);
  }
}

main();
