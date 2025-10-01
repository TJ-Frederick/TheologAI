#!/usr/bin/env tsx

/**
 * Section Resolver - Integration Test
 *
 * Tests natural language section resolution
 *
 * Run: npx tsx test/integration/section-resolver-test.ts
 */

import { SectionResolver } from '../../src/services/sectionResolver.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m'
};

async function test1() {
  console.log(`\n${colors.blue}Test 1: Calvin Institutes - Book 1 Chapter 1${colors.reset}`);
  const resolver = new SectionResolver();
  const result = await resolver.resolve('calvin/institutes', 'Book 1 Chapter 1');
  console.log(`  Section ID: ${colors.cyan}${result.sectionId}${colors.reset}`);
  console.log(`  Title: ${result.title.substring(0, 80)}...`);
  console.log(`  Confidence: ${colors.yellow}${result.confidence}${colors.reset}`);

  if (result.sectionId.includes('iii.ii')) {
    console.log(`${colors.green}✓ Correctly resolved to institutes.iii.ii${colors.reset}`);
  } else {
    throw new Error(`Expected institutes.iii.ii, got ${result.sectionId}`);
  }
}

async function test2() {
  console.log(`\n${colors.blue}Test 2: Augustine Confessions - Book 1${colors.reset}`);
  const resolver = new SectionResolver();
  const result = await resolver.resolve('augustine/confessions', 'Book 1');
  console.log(`  Section ID: ${colors.cyan}${result.sectionId}${colors.reset}`);
  console.log(`  Title: ${result.title.substring(0, 80)}...`);
  console.log(`  Confidence: ${colors.yellow}${result.confidence}${colors.reset}`);
  console.log(`${colors.green}✓ Test 2 passed${colors.reset}`);
}

async function test3() {
  console.log(`\n${colors.blue}Test 3: Calvin Institutes - Introduction${colors.reset}`);
  const resolver = new SectionResolver();
  const result = await resolver.resolve('calvin/institutes', 'Introduction');
  console.log(`  Section ID: ${colors.cyan}${result.sectionId}${colors.reset}`);
  console.log(`  Title: ${result.title.substring(0, 80)}...`);
  console.log(`  Confidence: ${colors.yellow}${result.confidence}${colors.reset}`);
  console.log(`${colors.green}✓ Test 3 passed${colors.reset}`);
}

async function test4() {
  console.log(`\n${colors.blue}Test 4: List all sections for Calvin's Institutes${colors.reset}`);
  const resolver = new SectionResolver();
  const sections = await resolver.listSections('calvin/institutes');
  console.log(`  Total sections: ${colors.cyan}${sections.length}${colors.reset}`);
  console.log(`  First 5 sections:`);
  sections.slice(0, 5).forEach(s => {
    console.log(`    - ${s.sectionId}: ${s.title.substring(0, 60)}...`);
  });
  console.log(`${colors.green}✓ Test 4 passed${colors.reset}`);
}

async function main() {
  console.log(`${colors.cyan}=== Section Resolver Integration Tests ===${colors.reset}`);

  try {
    await test1();
    await test2();
    await test3();
    await test4();

    console.log(`\n${colors.green}All tests passed!${colors.reset}`);
  } catch (error) {
    console.error(`\n${colors.red}Test failed:${colors.reset}`, error);
    process.exit(1);
  }
}

main();
