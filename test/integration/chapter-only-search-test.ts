/**
 * Test Chapter-Only Search Feature
 *
 * Verifies that users can search by chapter (e.g., "Psalm 22")
 * and find parallels if ANY verse in that chapter exists in the database
 *
 * Run with: npx tsx test/integration/chapter-only-search-test.ts
 */

import { parallelPassagesHandler } from '../../src/tools/parallelPassages.js';

console.log('='.repeat(70));
console.log('CHAPTER-ONLY SEARCH TEST');
console.log('='.repeat(70));
console.log();

// Test 1: Psalm 22 (should find Psalm 22:1)
console.log('Test 1: Search "Psalm 22" (chapter-only)');
console.log('-'.repeat(70));

const result1 = await parallelPassagesHandler.handler({
  reference: 'Psalm 22',
  mode: 'quotation',
  includeText: false,
  useCrossReferences: false
});

if (result1.content && result1.content[0]) {
  const text = result1.content[0].text;
  console.log(text);
  console.log();

  if (text.includes('Matthew 27:46') || text.includes('Mark 15:34')) {
    console.log('✓ PASS: Found NT quotations of Psalm 22:1');
  } else {
    console.log('✗ FAIL: Did not find expected parallels');
  }
} else {
  console.log('✗ FAIL: No results returned');
}

console.log();
console.log('='.repeat(70));

// Test 2: Matthew 14 (should find Matthew 14:13-21 - Feeding of 5000)
console.log('Test 2: Search "Matthew 14" (chapter-only)');
console.log('-'.repeat(70));

const result2 = await parallelPassagesHandler.handler({
  reference: 'Matthew 14',
  mode: 'synoptic',
  includeText: false,
  useCrossReferences: false
});

if (result2.content && result2.content[0]) {
  const text = result2.content[0].text;
  console.log(text);
  console.log();

  if (text.includes('Mark 6:30-44') || text.includes('Luke 9:10-17')) {
    console.log('✓ PASS: Found synoptic parallels for Matthew 14 (Feeding of 5000)');
  } else {
    console.log('✗ FAIL: Did not find expected synoptic parallels');
  }
} else {
  console.log('✗ FAIL: No results returned');
}

console.log();
console.log('='.repeat(70));

// Test 3: Isaiah 53 (should find Isaiah 53:5)
console.log('Test 3: Search "Isaiah 53" (chapter-only)');
console.log('-'.repeat(70));

const result3 = await parallelPassagesHandler.handler({
  reference: 'Isaiah 53',
  mode: 'quotation',
  includeText: false,
  useCrossReferences: false
});

if (result3.content && result3.content[0]) {
  const text = result3.content[0].text;
  console.log(text);
  console.log();

  if (text.includes('Matthew 8:17') || text.includes('1peter 2:24') || text.includes('1 Peter 2:24')) {
    console.log('✓ PASS: Found NT quotations of Isaiah 53');
  } else {
    console.log('✗ FAIL: Did not find expected NT quotations');
  }
} else {
  console.log('✗ FAIL: No results returned');
}

console.log();
console.log('='.repeat(70));

// Test 4: Verify specific verse still works
console.log('Test 4: Search "Psalm 22:1" (specific verse - should still work)');
console.log('-'.repeat(70));

const result4 = await parallelPassagesHandler.handler({
  reference: 'Psalm 22:1',
  mode: 'quotation',
  includeText: false,
  useCrossReferences: false
});

if (result4.content && result4.content[0]) {
  const text = result4.content[0].text;

  if (text.includes('Matthew 27:46') || text.includes('Mark 15:34')) {
    console.log('✓ PASS: Specific verse search still works');
  } else {
    console.log('✗ FAIL: Specific verse search broken');
  }
} else {
  console.log('✗ FAIL: No results returned');
}

console.log();
console.log('='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log('Chapter-only search allows users to:');
console.log('  • Search "Psalm 22" instead of "Psalm 22:1"');
console.log('  • Search "Matthew 14" instead of "Matthew 14:13-21"');
console.log('  • Tool finds ANY verse in that chapter if it exists in database');
console.log();
console.log('This makes the tool more user-friendly and intuitive!');
console.log('='.repeat(70));
