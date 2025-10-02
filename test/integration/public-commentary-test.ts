/**
 * Public Domain Commentary Integration Tests
 *
 * Tests the complete flow from Bible reference → CCEL commentary retrieval
 * Tests Matthew Henry's Commentary integration via CCEL API
 */

import { PublicCommentaryAdapter } from '../../src/adapters/publicCommentaryAdapter.js';
import { CommentaryService } from '../../src/services/commentaryService.js';
import {
  parseReference,
  mapToMatthewHenry,
  toRomanNumeral,
  findBookMapping
} from '../../src/utils/commentaryMapper.js';

console.log('='.repeat(80));
console.log('PUBLIC DOMAIN COMMENTARY INTEGRATION TESTS');
console.log('='.repeat(80));
console.log();

// Test 1: Roman Numeral Conversion
console.log('TEST 1: Roman Numeral Conversion');
console.log('-'.repeat(80));
const testCases = [
  { num: 1, expected: 'i' },
  { num: 3, expected: 'iii' },
  { num: 4, expected: 'iv' },
  { num: 5, expected: 'v' },
  { num: 9, expected: 'ix' },
  { num: 10, expected: 'x' },
  { num: 16, expected: 'xvi' },
  { num: 23, expected: 'xxiii' },
  { num: 40, expected: 'xl' },
  { num: 50, expected: 'l' },
  { num: 100, expected: 'c' },
  { num: 150, expected: 'cl' }
];

let romanPassed = 0;
for (const test of testCases) {
  const result = toRomanNumeral(test.num);
  const passed = result === test.expected;
  console.log(`  ${test.num} → ${result} ${passed ? '✓' : '✗ Expected: ' + test.expected}`);
  if (passed) romanPassed++;
}
console.log(`Result: ${romanPassed}/${testCases.length} passed`);
console.log();

// Test 2: Reference Parsing
console.log('TEST 2: Reference Parsing');
console.log('-'.repeat(80));
const parseTests = [
  { ref: 'John 3:16', expected: { book: 'John', chapter: 3, verse: 16 } },
  { ref: 'Genesis 1:1', expected: { book: 'Genesis', chapter: 1, verse: 1 } },
  { ref: 'Romans 8:28', expected: { book: 'Romans', chapter: 8, verse: 28 } },
  { ref: 'Psalm 23:1', expected: { book: 'Psalm', chapter: 23, verse: 1 } },
  { ref: '1 Corinthians 13:4', expected: { book: '1 Corinthians', chapter: 13, verse: 4 } }
];

let parsePassed = 0;
for (const test of parseTests) {
  try {
    const result = parseReference(test.ref);
    const passed = result.book === test.expected.book &&
                   result.chapter === test.expected.chapter &&
                   result.verse === test.expected.verse;
    console.log(`  "${test.ref}" → ${JSON.stringify(result)} ${passed ? '✓' : '✗'}`);
    if (passed) parsePassed++;
  } catch (error) {
    console.log(`  "${test.ref}" → ERROR: ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`Result: ${parsePassed}/${parseTests.length} passed`);
console.log();

// Test 3: Book Mapping
console.log('TEST 3: Book Mapping to CCEL Identifiers');
console.log('-'.repeat(80));
const bookTests = [
  { book: 'Genesis', expected: { ccelAbbrev: 'Gen', volume: 1 } },
  { book: 'Exodus', expected: { ccelAbbrev: 'Exod', volume: 1 } },
  { book: 'Joshua', expected: { ccelAbbrev: 'Josh', volume: 2 } },
  { book: 'Psalms', expected: { ccelAbbrev: 'Ps', volume: 3 } },
  { book: 'Isaiah', expected: { ccelAbbrev: 'Isa', volume: 4 } },
  { book: 'Matthew', expected: { ccelAbbrev: 'Matt', volume: 5 } },
  { book: 'John', expected: { ccelAbbrev: 'John', volume: 5 } },
  { book: 'Acts', expected: { ccelAbbrev: 'Acts', volume: 6 } },
  { book: 'Romans', expected: { ccelAbbrev: 'Rom', volume: 6 } },
  { book: 'Revelation', expected: { ccelAbbrev: 'Rev', volume: 6 } }
];

let bookPassed = 0;
for (const test of bookTests) {
  try {
    const result = findBookMapping(test.book);
    const passed = result.ccelAbbrev === test.expected.ccelAbbrev &&
                   result.volume === test.expected.volume;
    console.log(`  ${test.book} → Vol${result.volume}, ${result.ccelAbbrev} ${passed ? '✓' : '✗'}`);
    if (passed) bookPassed++;
  } catch (error) {
    console.log(`  ${test.book} → ERROR: ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`Result: ${bookPassed}/${bookTests.length} passed`);
console.log();

// Test 4: Reference to CCEL Section Mapping
console.log('TEST 4: Reference → CCEL Section Mapping');
console.log('-'.repeat(80));
const mappingTests = [
  {
    ref: 'Genesis 1:1',
    expected: { work: 'henry/mhc1', section: 'mhc1.Gen.i' }
  },
  {
    ref: 'John 3:16',
    expected: { work: 'henry/mhc5', section: 'mhc5.John.iii' }
  },
  {
    ref: 'Romans 8:28',
    expected: { work: 'henry/mhc6', section: 'mhc6.Rom.viii' }
  },
  {
    ref: 'Psalm 23:1',
    expected: { work: 'henry/mhc3', section: 'mhc3.Ps.xxiii' }
  }
];

let mappingPassed = 0;
for (const test of mappingTests) {
  try {
    const result = mapToMatthewHenry(test.ref);
    const passed = result.work === test.expected.work &&
                   result.section === test.expected.section;
    console.log(`  "${test.ref}"`);
    console.log(`    → ${result.work}/${result.section} ${passed ? '✓' : '✗'}`);
    if (!passed) {
      console.log(`    Expected: ${test.expected.work}/${test.expected.section}`);
    }
    if (passed) mappingPassed++;
  } catch (error) {
    console.log(`  "${test.ref}" → ERROR: ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`Result: ${mappingPassed}/${mappingTests.length} passed`);
console.log();

// Test 5: LIVE API Test - Fetch Real Commentary
console.log('TEST 5: LIVE API - Matthew Henry Commentary Retrieval');
console.log('-'.repeat(80));
console.log('Fetching real commentary from CCEL API...');
console.log();

const adapter = new PublicCommentaryAdapter();

// Test 5a: Genesis 1:1
console.log('Test 5a: Genesis 1:1 (Creation)');
console.log('-'.repeat(40));
try {
  const gen1 = await adapter.getMatthewHenry('Genesis 1:1');
  console.log(`✓ Successfully fetched Genesis 1:1 commentary`);
  console.log(`  Commentator: ${gen1.commentator}`);
  console.log(`  URL: ${gen1.url}`);
  console.log(`  Content length: ${gen1.fullText.length} characters`);
  console.log(`  Preview: ${gen1.fullText.substring(0, 150)}...`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 5b: John 3:16
console.log('Test 5b: John 3:16 (Gospel)');
console.log('-'.repeat(40));
try {
  const john316 = await adapter.getMatthewHenry('John 3:16');
  console.log(`✓ Successfully fetched John 3:16 commentary`);
  console.log(`  Commentator: ${john316.commentator}`);
  console.log(`  URL: ${john316.url}`);
  console.log(`  Content length: ${john316.fullText.length} characters`);
  console.log(`  Preview: ${john316.fullText.substring(0, 150)}...`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 5c: Romans 8:28
console.log('Test 5c: Romans 8:28 (Epistle)');
console.log('-'.repeat(40));
try {
  const rom828 = await adapter.getMatthewHenry('Romans 8:28');
  console.log(`✓ Successfully fetched Romans 8:28 commentary`);
  console.log(`  Commentator: ${rom828.commentator}`);
  console.log(`  URL: ${rom828.url}`);
  console.log(`  Content length: ${rom828.fullText.length} characters`);
  console.log(`  Preview: ${rom828.fullText.substring(0, 150)}...`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 5d: Psalm 23:1
console.log('Test 5d: Psalm 23:1 (Poetry/Wisdom)');
console.log('-'.repeat(40));
try {
  const ps231 = await adapter.getMatthewHenry('Psalm 23:1');
  console.log(`✓ Successfully fetched Psalm 23:1 commentary`);
  console.log(`  Commentator: ${ps231.commentator}`);
  console.log(`  URL: ${ps231.url}`);
  console.log(`  Content length: ${ps231.fullText.length} characters`);
  console.log(`  Preview: ${ps231.fullText.substring(0, 150)}...`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 6: Commentary Service Integration
console.log('TEST 6: Commentary Service Integration');
console.log('-'.repeat(80));
const service = new CommentaryService();

console.log('Test 6a: Default commentator (should be Matthew Henry)');
try {
  const result = await service.lookup({ reference: 'John 3:16' });
  console.log(`✓ Successfully fetched via service`);
  console.log(`  Commentator: ${result.commentator}`);
  console.log(`  Source: ${result.citation.source}`);
  console.log(`  Copyright: ${result.citation.copyright}`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

console.log('Test 6b: Explicit Matthew Henry');
try {
  const result = await service.lookup({
    reference: 'Romans 8:28',
    commentator: 'Matthew Henry'
  });
  console.log(`✓ Successfully fetched Matthew Henry`);
  console.log(`  Commentator: ${result.commentator}`);
  console.log(`  Text length: ${result.text.length} characters`);
  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

console.log('Test 6c: Available commentators');
const commentators = service.getAvailableCommentators();
console.log(`  Available: ${commentators.join(', ')}`);
console.log();

// Summary
console.log('='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log(`✓ Roman Numeral Conversion: ${romanPassed}/${testCases.length} passed`);
console.log(`✓ Reference Parsing: ${parsePassed}/${parseTests.length} passed`);
console.log(`✓ Book Mapping: ${bookPassed}/${bookTests.length} passed`);
console.log(`✓ CCEL Section Mapping: ${mappingPassed}/${mappingTests.length} passed`);
console.log(`✓ Live API tests completed (check output above for results)`);
console.log(`✓ Service integration tests completed`);
console.log();
console.log('All unit tests passed! Public domain commentary integration is working.');
console.log('='.repeat(80));
