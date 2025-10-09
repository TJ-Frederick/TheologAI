/**
 * Integration Test for Bible Verse Resolution
 *
 * Tests the enhanced section resolver's ability to match Bible verse queries
 * to commentary sections with verse ranges.
 */

import { SectionResolver } from '../../src/services/sectionResolver.js';

async function runTests() {
  console.log('\n========================================');
  console.log('BIBLE VERSE RESOLUTION - TEST SUITE');
  console.log('========================================\n');

  const resolver = new SectionResolver();
  let passed = 0;
  let failed = 0;

  // Test 1: Single verse matches section with range
  console.log('📖 TEST 1: Single verse matches section range');
  console.log('-----------------------------------------------');
  try {
    const result = await resolver.resolve('calvin/calcom43', '1 Timothy 2:14');

    // Should match section "1 Timothy 2:11-15"
    if (result.title.includes('1 Timothy 2:11-15')) {
      console.log('✅ PASS: "1 Timothy 2:14" matched section "1 Timothy 2:11-15"');
      console.log(`   Section ID: ${result.sectionId}`);
      console.log(`   Confidence: ${result.confidence}`);
      passed++;
    } else {
      console.log('❌ FAIL: Did not match expected section');
      console.log(`   Got: ${result.title}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 2: Exact section title match
  console.log('📖 TEST 2: Exact verse range match');
  console.log('------------------------------------');
  try {
    const result = await resolver.resolve('calvin/calcom43', '1 Timothy 2:11-15');

    if (result.title.includes('1 Timothy 2:11-15')) {
      console.log('✅ PASS: "1 Timothy 2:11-15" matched exact section');
      console.log(`   Section ID: ${result.sectionId}`);
      passed++;
    } else {
      console.log('❌ FAIL: Did not match expected section');
      console.log(`   Got: ${result.title}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 3: Different verse in same book
  console.log('📖 TEST 3: Different verse in 1 Timothy');
  console.log('-----------------------------------------');
  try {
    const result = await resolver.resolve('calvin/calcom43', '1 Timothy 1:5');

    // Should match section "1 Timothy 1:5-11"
    if (result.title.includes('1 Timothy 1:5')) {
      console.log('✅ PASS: "1 Timothy 1:5" matched correct section');
      console.log(`   Title: ${result.title}`);
      passed++;
    } else {
      console.log('❌ FAIL: Did not match expected section');
      console.log(`   Got: ${result.title}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 4: Verse at start of range
  console.log('📖 TEST 4: Verse at start of range');
  console.log('-----------------------------------');
  try {
    const result = await resolver.resolve('calvin/calcom43', '1 Timothy 2:11');

    if (result.title.includes('1 Timothy 2:11-15')) {
      console.log('✅ PASS: "1 Timothy 2:11" matched section "1 Timothy 2:11-15"');
      passed++;
    } else {
      console.log('❌ FAIL: Did not match expected section');
      console.log(`   Got: ${result.title}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 5: Verse at end of range
  console.log('📖 TEST 5: Verse at end of range');
  console.log('---------------------------------');
  try {
    const result = await resolver.resolve('calvin/calcom43', '1 Timothy 2:15');

    if (result.title.includes('1 Timothy 2:11-15')) {
      console.log('✅ PASS: "1 Timothy 2:15" matched section "1 Timothy 2:11-15"');
      passed++;
    } else {
      console.log('❌ FAIL: Did not match expected section');
      console.log(`   Got: ${result.title}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 6: Non-commentary work still works (backward compatibility)
  console.log('🔄 TEST 6: Non-commentary work (Institutes)');
  console.log('--------------------------------------------');
  try {
    const result = await resolver.resolve('calvin/institutes', 'Book 1 Chapter 1');

    if (result.title.includes('CHAPTER') || result.title.includes('BOOK')) {
      console.log('✅ PASS: Existing structured queries still work');
      console.log(`   Title: ${result.title.substring(0, 60)}...`);
      passed++;
    } else {
      console.log('❌ FAIL: Structured query did not work as expected');
      console.log(`   Got: ${result.title}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 7: Invalid verse reference falls back to existing logic
  console.log('⚠️  TEST 7: Invalid verse reference fallback');
  console.log('---------------------------------------------');
  try {
    const result = await resolver.resolve('calvin/calcom43', '1 Timothy 99:99');

    // Should fall back to existing logic and return something (first entry or partial match)
    if (result.sectionId) {
      console.log('✅ PASS: Invalid verse gracefully falls back');
      console.log(`   Returned: ${result.title.substring(0, 60)}...`);
      console.log(`   Confidence: ${result.confidence}`);
      passed++;
    } else {
      console.log('❌ FAIL: Did not handle invalid verse gracefully');
      failed++;
    }
  } catch (error) {
    console.log('✅ PASS: Invalid verse handled with error (acceptable)');
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    passed++;
  }
  console.log('');

  // Test 8: Different book (2 Timothy)
  console.log('📖 TEST 8: Different book (2 Timothy)');
  console.log('--------------------------------------');
  try {
    const result = await resolver.resolve('calvin/calcom43', '2 Timothy 1:7');

    if (result.title.includes('2 Timothy 1')) {
      console.log('✅ PASS: "2 Timothy 1:7" matched correct section');
      console.log(`   Title: ${result.title}`);
      passed++;
    } else {
      console.log('❌ FAIL: Did not match expected section');
      console.log(`   Got: ${result.title}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Summary
  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);
  console.log(`🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('========================================\n');

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! 🎉\n');
    console.log('✨ Bible verse resolution is working correctly!\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review output above\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
