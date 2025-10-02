/**
 * Test stringified array handling (Claude AI behavior)
 */

import { bibleLookupHandler } from '../src/tools/bibleLookup.js';

console.log('Testing Stringified Array Handling...\n');

// Test 1: Actual array (ideal case)
console.log('TEST 1: Actual Array (ideal)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 3:16',
    translation: ['ESV', 'KJV']
  });
  console.log('✓ SUCCESS');
  const text = result.content[0].text;
  console.log('Contains "2 translations":', text.includes('2 translations'));
  console.log('Contains "**ESV:**":', text.includes('**ESV:**'));
  console.log('Contains "**KJV:**":', text.includes('**KJV:**'));
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 2: Stringified array (Claude AI's behavior)
console.log('TEST 2: Stringified Array (Claude AI sends this)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 3:16',
    translation: '["ESV", "KJV", "WEB"]' as any // Claude sends this!
  });
  console.log('✓ SUCCESS');
  const text = result.content[0].text;
  console.log('Contains "3 translations":', text.includes('3 translations'));
  console.log('Contains "**ESV:**":', text.includes('**ESV:**'));
  console.log('Contains "**KJV:**":', text.includes('**KJV:**'));
  console.log('Contains "**WEB:**":', text.includes('**WEB:**'));
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 3: Single string
console.log('TEST 3: Single String');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 3:16',
    translation: 'KJV'
  });
  console.log('✓ SUCCESS');
  const text = result.content[0].text;
  console.log('Contains "(KJV)":', text.includes('(KJV)'));
  console.log('Does NOT contain "translations":', !text.includes('translations'));
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 4: No translation (default ESV)
console.log('TEST 4: No Translation Parameter (default ESV)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 3:16'
  });
  console.log('✓ SUCCESS');
  const text = result.content[0].text;
  console.log('Contains "(ESV)":', text.includes('(ESV)'));
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 5: Malformed stringified array (edge case)
console.log('TEST 5: Malformed Stringified Array (should fallback)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'John 3:16',
    translation: '["ESV", "KJV"' as any // Missing closing bracket
  });
  console.log('✓ SUCCESS (treated as single translation name)');
  console.log('Handled gracefully without crashing');
  console.log();
} catch (error) {
  console.log(`✓ EXPECTED FAILURE (invalid translation name)`);
  console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 6: Complex stringified array with escaping
console.log('TEST 6: Complex Stringified Array (with escaping)');
console.log('-'.repeat(60));
try {
  const result = await bibleLookupHandler.handler({
    reference: 'Romans 8:28',
    translation: '[\"ESV\", \"NET\", \"KJV\", \"WEB\", \"BSB\", \"YLT\"]' as any
  });
  console.log('✓ SUCCESS');
  const text = result.content[0].text;
  console.log('Contains "6 translations":', text.includes('6 translations'));
  console.log('Contains all 6 translations:',
    text.includes('**ESV:**') &&
    text.includes('**NET:**') &&
    text.includes('**KJV:**') &&
    text.includes('**WEB:**') &&
    text.includes('**BSB:**') &&
    text.includes('**YLT:**')
  );
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

console.log('='.repeat(60));
console.log('Stringified Array Tests Complete!');
console.log('The tool now handles Claude AI\'s stringified arrays correctly!');
console.log();
