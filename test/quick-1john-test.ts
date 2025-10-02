/**
 * Quick test for 1 John 5:7 bug fix
 */

import { HelloAOBibleAdapter } from '../src/adapters/helloaoBibleAdapter.js';

console.log('Testing 1 John 5:7 across translations...\n');

const adapter = new HelloAOBibleAdapter();

// Test KJV
console.log('TEST 1: 1 John 5:7 (KJV)');
console.log('-'.repeat(60));
try {
  const result = await adapter.getPassage('1 John 5:7', 'KJV', false);
  console.log(`✓ SUCCESS`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Text: "${result.text}"`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test YLT
console.log('TEST 2: 1 John 5:7 (YLT)');
console.log('-'.repeat(60));
try {
  const result = await adapter.getPassage('1 John 5:7', 'YLT', false);
  console.log(`✓ SUCCESS`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Text: "${result.text}"`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test WEB
console.log('TEST 3: 1 John 5:7 (WEB)');
console.log('-'.repeat(60));
try {
  const result = await adapter.getPassage('1 John 5:7', 'WEB', false);
  console.log(`✓ SUCCESS`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Text: "${result.text}"`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test BSB
console.log('TEST 4: 1 John 5:7 (BSB)');
console.log('-'.repeat(60));
try {
  const result = await adapter.getPassage('1 John 5:7', 'BSB', false);
  console.log(`✓ SUCCESS`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Text: "${result.text}"`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test other books with numbers
console.log('TEST 5: 2 Samuel 22:2 (KJV)');
console.log('-'.repeat(60));
try {
  const result = await adapter.getPassage('2 Samuel 22:2', 'KJV', false);
  console.log(`✓ SUCCESS`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Text: "${result.text}"`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

console.log('='.repeat(60));
console.log('All tests complete!');
console.log();
