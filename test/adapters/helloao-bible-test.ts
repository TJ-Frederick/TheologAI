/**
 * HelloAO Bible Adapter Tests
 *
 * Tests the HelloAO Bible translation adapter functionality
 */

import { HelloAOBibleAdapter } from '../../src/adapters/helloaoBibleAdapter.js';

console.log('='.repeat(80));
console.log('HELLOAO BIBLE ADAPTER TESTS');
console.log('='.repeat(80));
console.log();

const adapter = new HelloAOBibleAdapter();

// Test 1: Get list of supported translations
console.log('TEST 1: Get Supported Translations');
console.log('-'.repeat(80));
try {
  const translations = adapter.getSupportedTranslations();
  console.log(`✓ Supported translations: ${translations.join(', ')}`);
  console.log(`  Total: ${translations.length} translations`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 2: Fetch John 3:16 from KJV
console.log('TEST 2: Fetch John 3:16 (KJV)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getPassage('John 3:16', 'KJV', false);
  console.log(`✓ Successfully fetched John 3:16 from KJV`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Translation: ${result.translation}`);
  console.log(`  Text: "${result.text.substring(0, 100)}..."`);
  console.log(`  Citation: ${result.citation.source}`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 3: Fetch John 3:16-17 from WEB
console.log('TEST 3: Fetch John 3:16-17 (WEB)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getPassage('John 3:16-17', 'WEB', false);
  console.log(`✓ Successfully fetched John 3:16-17 from WEB`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Translation: ${result.translation}`);
  console.log(`  Text length: ${result.text.length} characters`);
  console.log(`  First 150 chars: "${result.text.substring(0, 150)}..."`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 4: Fetch John 3:3 from BSB with footnotes
console.log('TEST 4: Fetch John 3:3 (BSB) with Footnotes');
console.log('-'.repeat(80));
try {
  const result = await adapter.getPassage('John 3:3', 'BSB', true);
  console.log(`✓ Successfully fetched John 3:3 from BSB with footnotes`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Translation: ${result.translation}`);
  console.log(`  Text: "${result.text}"`);

  if (result.footnotes && result.footnotes.length > 0) {
    console.log(`  Footnotes found: ${result.footnotes.length}`);
    for (const footnote of result.footnotes) {
      console.log(`    ${footnote.caller}: ${footnote.text}`);
    }
  } else {
    console.log(`  No footnotes found for this verse`);
  }
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 5: Fetch Romans 3:23 from ASV
console.log('TEST 5: Fetch Romans 3:23 (ASV)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getPassage('Romans 3:23', 'ASV', false);
  console.log(`✓ Successfully fetched Romans 3:23 from ASV`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Text: "${result.text}"`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 6: Fetch Genesis 1:1-3 from YLT
console.log('TEST 6: Fetch Genesis 1:1-3 (YLT)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getPassage('Genesis 1:1-3', 'YLT', false);
  console.log(`✓ Successfully fetched Genesis 1:1-3 from YLT`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Translation: ${result.translation}`);
  console.log(`  Text length: ${result.text.length} characters`);
  console.log(`  Text preview: "${result.text.substring(0, 200)}..."`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 7: Fetch Psalm 23:1-6 from DBY
console.log('TEST 7: Fetch Psalm 23:1-6 (DBY)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getPassage('Psalm 23:1-6', 'DBY', false);
  console.log(`✓ Successfully fetched Psalm 23:1-6 from DBY`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Text length: ${result.text.length} characters`);
  console.log(`  Full text:`);
  console.log(`  "${result.text}"`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 8: Test unsupported translation
console.log('TEST 8: Test Unsupported Translation (should fail gracefully)');
console.log('-'.repeat(80));
try {
  await adapter.getPassage('John 3:16', 'NKJV', false);
  console.log(`✗ FAILED: Should have thrown an error for unsupported translation`);
  console.log();
} catch (error) {
  console.log(`✓ Correctly rejected unsupported translation`);
  console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 9: Test invalid reference
console.log('TEST 9: Test Invalid Reference (should fail gracefully)');
console.log('-'.repeat(80));
try {
  await adapter.getPassage('John 99:99', 'KJV', false);
  console.log(`✗ FAILED: Should have thrown an error for invalid reference`);
  console.log();
} catch (error) {
  console.log(`✓ Correctly rejected invalid reference`);
  console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 10: Fetch Matthew 5:1-12 from BSB with footnotes
console.log('TEST 10: Fetch Matthew 5:1-12 (BSB) with Footnotes (Beatitudes)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getPassage('Matthew 5:1-12', 'BSB', true);
  console.log(`✓ Successfully fetched Matthew 5:1-12 from BSB`);
  console.log(`  Reference: ${result.reference}`);
  console.log(`  Text length: ${result.text.length} characters`);
  console.log(`  Text preview: "${result.text.substring(0, 250)}..."`);

  if (result.footnotes && result.footnotes.length > 0) {
    console.log(`  Footnotes found: ${result.footnotes.length}`);
    for (const footnote of result.footnotes.slice(0, 3)) {
      console.log(`    ${footnote.caller} (v${footnote.reference.verse}): ${footnote.text}`);
    }
    if (result.footnotes.length > 3) {
      console.log(`    ... and ${result.footnotes.length - 3} more`);
    }
  } else {
    console.log(`  No footnotes found for this passage`);
  }
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Summary
console.log('='.repeat(80));
console.log('HELLOAO BIBLE ADAPTER TESTS COMPLETE');
console.log('='.repeat(80));
console.log('All tests completed. Review output above for results.');
console.log();
