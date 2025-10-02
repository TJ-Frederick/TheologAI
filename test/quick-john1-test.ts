/**
 * Quick test for John 1:1 issue
 */

import { bibleLookupHandler } from '../src/tools/bibleLookup.js';

console.log('Testing John 1:1 in multiple translations...\n');

// Test ESV
console.log('TEST 1: John 1:1 (ESV)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 1:1',
    translation: 'ESV'
  });
  console.log('✓ SUCCESS');
  console.log('Response type:', typeof result);
  console.log('Response keys:', Object.keys(result));
  console.log('Content:', JSON.stringify(result, null, 2));
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log('Stack:', error instanceof Error ? error.stack : '');
  console.log();
}

// Test KJV
console.log('TEST 2: John 1:1 (KJV)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 1:1',
    translation: 'KJV'
  });
  console.log('✓ SUCCESS');
  console.log('Response:', JSON.stringify(result, null, 2));
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test BSB
console.log('TEST 3: John 1:1 (BSB)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 1:1',
    translation: 'BSB'
  });
  console.log('✓ SUCCESS');
  console.log('Response:', JSON.stringify(result, null, 2));
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

console.log('Tests complete!');
