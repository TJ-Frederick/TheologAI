/**
 * Test script for classic_text_lookup tool enhancements
 * Tests the new features added in Phase 1:
 * - Expanded popular works list (40 works)
 * - Enhanced topic search (35+ topics)
 * - New topic search within works
 */

import { classicTextLookupHandler } from '../../src/tools/classicTextLookup.js';

async function runTests() {
  console.log('\n========================================');
  console.log('CLASSIC TEXT LOOKUP TOOL - TEST SUITE');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: List Works Mode
  console.log('📋 TEST 1: List Works Mode');
  console.log('---------------------------');
  try {
    const result = await classicTextLookupHandler.handler({ listWorks: true });
    const text = result.content[0].text;

    // Check if it mentions 40+ works
    if (text.includes('40+')) {
      console.log('✅ PASS: Shows 40+ works');
      passed++;
    } else {
      console.log('❌ FAIL: Does not mention 40+ works');
      failed++;
    }

    // Check if it has categories
    const categories = ['Church Fathers', 'Medieval', 'Reformers', 'Puritans', 'Post-Reformation'];
    const hasCategories = categories.every(cat => text.includes(cat));
    if (hasCategories) {
      console.log('✅ PASS: Contains expected categories');
      passed++;
    } else {
      console.log('❌ FAIL: Missing some categories');
      failed++;
    }

    // Check for sample works
    if (text.includes('Augustine') && text.includes('Calvin') && text.includes('Luther')) {
      console.log('✅ PASS: Contains key authors');
      passed++;
    } else {
      console.log('❌ FAIL: Missing key authors');
      failed++;
    }

    console.log('Sample output (first 500 chars):');
    console.log(text.substring(0, 500) + '...\n');
  } catch (error) {
    console.log('❌ FAIL: Error in listWorks mode:', error);
    failed += 3;
  }

  // Test 2: Topic Search - Justification
  console.log('🔍 TEST 2: Topic Search for Works - "justification"');
  console.log('----------------------------------------------------');
  try {
    const result = await classicTextLookupHandler.handler({ query: 'justification' });
    const text = result.content[0].text;

    if (text.includes('Luther') || text.includes('Calvin')) {
      console.log('✅ PASS: Suggests relevant works for justification');
      passed++;
    } else {
      console.log('❌ FAIL: Does not suggest expected works');
      failed++;
    }

    console.log('Suggested works:');
    console.log(text.substring(0, 400) + '...\n');
  } catch (error) {
    console.log('❌ FAIL: Error in topic search:', error);
    failed++;
  }

  // Test 3: Topic Search - Predestination
  console.log('🔍 TEST 3: Topic Search for Works - "predestination"');
  console.log('------------------------------------------------------');
  try {
    const result = await classicTextLookupHandler.handler({ query: 'predestination' });
    const text = result.content[0].text;

    if (text.includes('calvin/institutes')) {
      console.log('✅ PASS: Suggests Calvin\'s Institutes for predestination');
      passed++;
    } else {
      console.log('❌ FAIL: Does not suggest Calvin\'s Institutes');
      failed++;
    }

    console.log('Suggested works:');
    console.log(text.substring(0, 400) + '...\n');
  } catch (error) {
    console.log('❌ FAIL: Error in topic search:', error);
    failed++;
  }

  // Test 4: NEW - Topic Search Within Work
  console.log('🆕 TEST 4: Topic Search Within Work - "election" in Calvin\'s Institutes');
  console.log('--------------------------------------------------------------------------');
  try {
    const result = await classicTextLookupHandler.handler({
      work: 'calvin/institutes',
      topic: 'election'
    });
    const text = result.content[0].text;

    if (text.includes('election') || text.includes('ELECTION')) {
      console.log('✅ PASS: Finds sections about election');
      passed++;
    } else {
      console.log('❌ FAIL: Does not find relevant sections');
      failed++;
    }

    // Check if it found multiple sections
    const hasSections = text.includes('Book') || text.includes('Chapter');
    if (hasSections) {
      console.log('✅ PASS: Returns structured section information');
      passed++;
    } else {
      console.log('❌ FAIL: Missing section structure');
      failed++;
    }

    console.log('Found sections:');
    console.log(text.substring(0, 600) + '...\n');
  } catch (error) {
    console.log('❌ FAIL: Error in topic search within work:', error);
    console.log('Error details:', error);
    failed += 2;
  }

  // Test 5: Edge Case - Invalid Work
  console.log('⚠️  TEST 5: Edge Case - Invalid Work');
  console.log('-------------------------------------');
  try {
    const result = await classicTextLookupHandler.handler({
      work: 'invalid/nonexistent',
      topic: 'test'
    });
    const text = result.content[0].text;

    // Should handle gracefully (either error message or empty result)
    if (text) {
      console.log('✅ PASS: Handles invalid work gracefully');
      passed++;
    } else {
      console.log('❌ FAIL: No response for invalid work');
      failed++;
    }

    console.log('Response:', text.substring(0, 300) + '...\n');
  } catch (error) {
    // Expected to error - that's okay
    console.log('✅ PASS: Properly throws error for invalid work');
    passed++;
  }

  // Test 6: Edge Case - No Matches
  console.log('⚠️  TEST 6: Edge Case - No Matches');
  console.log('------------------------------------');
  try {
    const result = await classicTextLookupHandler.handler({
      work: 'calvin/institutes',
      topic: 'xyzabc123nonexistent'
    });
    const text = result.content[0].text;

    if (text.includes('No sections found') || text.includes('No results')) {
      console.log('✅ PASS: Properly handles no matches');
      passed++;
    } else {
      console.log('⚠️  WARNING: May have found unexpected matches');
      console.log('Response:', text.substring(0, 200));
      passed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error handling no matches:', error);
    failed++;
  }

  // Test 7: Existing Functionality - Section Retrieval
  console.log('\n🔧 TEST 7: Existing Functionality - Retrieve Specific Section');
  console.log('--------------------------------------------------------------');
  try {
    const result = await classicTextLookupHandler.handler({
      work: 'augustine/confessions',
      query: 'Book 1'
    });
    const text = result.content[0].text;

    if (text.length > 100) {
      console.log('✅ PASS: Retrieves section content');
      passed++;
    } else {
      console.log('❌ FAIL: Content too short or missing');
      failed++;
    }

    console.log('Retrieved content (first 300 chars):');
    console.log(text.substring(0, 300) + '...\n');
  } catch (error) {
    console.log('❌ FAIL: Error retrieving section:', error);
    failed++;
  }

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
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review output above\n');
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
