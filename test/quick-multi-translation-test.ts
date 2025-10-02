/**
 * Test multi-translation support
 */

import { bibleLookupHandler } from '../src/tools/bibleLookup.js';

console.log('Testing Multi-Translation Support...\n');

// Test 1: Single translation (backward compatibility)
console.log('TEST 1: Single Translation (John 1:1, ESV)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 1:1',
    translation: 'ESV'
  });
  console.log('✓ SUCCESS');
  console.log(result.content[0].text.substring(0, 200));
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 2: Multiple translations (array)
console.log('TEST 2: Multiple Translations (John 1:1, [ESV, KJV, WEB, BSB])');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 1:1',
    translation: ['ESV', 'KJV', 'WEB', 'BSB']
  });
  console.log('✓ SUCCESS');
  console.log(result.content[0].text);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 3: Two translations
console.log('TEST 3: Two Translations (Romans 8:28, [ESV, KJV])');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'Romans 8:28',
    translation: ['ESV', 'KJV']
  });
  console.log('✓ SUCCESS');
  console.log(result.content[0].text);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 4: Default translation (no parameter)
console.log('TEST 4: Default Translation (John 3:16)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 3:16'
  });
  console.log('✓ SUCCESS');
  console.log(result.content[0].text.substring(0, 150));
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

console.log('='.repeat(60));
console.log('Multi-Translation Tests Complete!');
console.log();
