/**
 * README Scenario Testing
 *
 * Tests all example scenarios from the README to ensure they work correctly.
 */

import { bibleLookupHandler } from '../src/tools/bibleLookup.js';
import { commentaryLookupHandler } from '../src/tools/commentaryLookup.js';
import { classicTextLookupHandler } from '../src/tools/classicTextLookup.js';
import { historicalSearchHandler } from '../src/tools/historicalSearch.js';

async function testReadmeScenarios() {
  console.log('\n' + '='.repeat(80));
  console.log('README SCENARIO TESTING');
  console.log('='.repeat(80) + '\n');

  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  // Helper function to test a scenario
  async function testScenario(
    name: string,
    handler: any,
    input: any,
    expectation: string
  ): Promise<boolean> {
    console.log(`\n📝 ${name}`);
    console.log('-'.repeat(80));
    try {
      const result = await handler.handler(input);
      const text = result.content[0].text;

      if (text.length > 0) {
        console.log(`✅ SUCCESS`);
        console.log(`   Output length: ${text.length} characters`);
        console.log(`   Preview: ${text.substring(0, 150).replace(/\n/g, ' ')}...`);
        results.push(`✅ ${name}: PASSED`);
        return true;
      } else {
        console.log(`❌ FAILED: Empty response`);
        results.push(`❌ ${name}: FAILED (empty response)`);
        return false;
      }
    } catch (error) {
      console.log(`❌ FAILED: ${error instanceof Error ? error.message : error}`);
      results.push(`❌ ${name}: FAILED (${error instanceof Error ? error.message : error})`);
      return false;
    }
  }

  // ========================================
  // BIBLE LOOKUP TESTS (from README)
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('BIBLE LOOKUP SCENARIOS');
  console.log('='.repeat(80));

  // Example 1: "Look up John 3:16"
  if (await testScenario(
    'Look up John 3:16',
    bibleLookupHandler,
    { reference: 'John 3:16' },
    'Should return verse text'
  )) passed++; else failed++;

  // Example 2: "Show me Romans 8:28-30 in KJV"
  if (await testScenario(
    'Show me Romans 8:28-30 in KJV',
    bibleLookupHandler,
    { reference: 'Romans 8:28-30', translation: 'KJV' },
    'Should return verse range in KJV'
  )) passed++; else failed++;

  // Example 3: "Get 1 John 5:7 in BSB with footnotes"
  if (await testScenario(
    'Get 1 John 5:7 in BSB with footnotes',
    bibleLookupHandler,
    { reference: '1 John 5:7', translation: 'BSB', includeFootnotes: true },
    'Should return verse with footnotes'
  )) passed++; else failed++;

  // Example 4: Multiple translations test
  if (await testScenario(
    'Look up Psalm 119:105 in WEB',
    bibleLookupHandler,
    { reference: 'Psalm 119:105', translation: 'WEB' },
    'Should return verse in WEB'
  )) passed++; else failed++;

  // Example 5: Numbered book (2 Samuel)
  if (await testScenario(
    'Look up 2 Samuel 7:12',
    bibleLookupHandler,
    { reference: '2 Samuel 7:12' },
    'Should handle numbered books'
  )) passed++; else failed++;

  // ========================================
  // COMMENTARY LOOKUP TESTS
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('COMMENTARY LOOKUP SCENARIOS');
  console.log('='.repeat(80));

  // Example 1: "Get commentary on Romans 8:28"
  if (await testScenario(
    'Get commentary on Romans 8:28',
    commentaryLookupHandler,
    { reference: 'Romans 8:28' },
    'Should return Matthew Henry commentary'
  )) passed++; else failed++;

  // Example 2: "What does Matthew Henry say about John 3:16?"
  if (await testScenario(
    'Matthew Henry on John 3:16',
    commentaryLookupHandler,
    { reference: 'John 3:16', commentator: 'Matthew Henry' },
    'Should return Matthew Henry commentary'
  )) passed++; else failed++;

  // Example 3: "Get JFB commentary on Genesis 1:1"
  if (await testScenario(
    'JFB commentary on Genesis 1:1',
    commentaryLookupHandler,
    { reference: 'Genesis 1:1', commentator: 'JFB' },
    'Should return JFB commentary'
  )) passed++; else failed++;

  // ========================================
  // CLASSIC TEXT LOOKUP TESTS
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('CLASSIC TEXT LOOKUP SCENARIOS');
  console.log('='.repeat(80));

  // Example 1: "Look up Calvin's Institutes Book 1 Chapter 1"
  if (await testScenario(
    'Calvin Institutes Book 1 Chapter 1',
    classicTextLookupHandler,
    { work: 'calvin/institutes', query: 'Book 1 Chapter 1' },
    'Should return first chapter'
  )) passed++; else failed++;

  // Example 2: "Show me Aquinas Summa Part 1 Question 2"
  if (await testScenario(
    'Aquinas Summa Part 1 Question 2',
    classicTextLookupHandler,
    { work: 'aquinas/summa', query: 'Part 1 Question 2' },
    'Should return Summa section'
  )) passed++; else failed++;

  // Example 3: "Get Augustine's Confessions Book 4"
  if (await testScenario(
    'Augustine Confessions Book 4',
    classicTextLookupHandler,
    { work: 'augustine/confessions', query: 'Book 4' },
    'Should return Confessions Book 4'
  )) passed++; else failed++;

  // NEW: List works
  if (await testScenario(
    'List available works',
    classicTextLookupHandler,
    { listWorks: true },
    'Should list 40+ works'
  )) passed++; else failed++;

  // NEW: Search by topic
  if (await testScenario(
    'Search for works about "trinity"',
    classicTextLookupHandler,
    { query: 'trinity' },
    'Should suggest relevant works'
  )) passed++; else failed++;

  // NEW: Topic search within work
  if (await testScenario(
    'Find sections about "grace" in Calvin Institutes',
    classicTextLookupHandler,
    { work: 'calvin/institutes', topic: 'grace' },
    'Should find relevant sections'
  )) passed++; else failed++;

  // ========================================
  // HISTORICAL DOCUMENTS TESTS
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('HISTORICAL DOCUMENTS SCENARIOS');
  console.log('='.repeat(80));

  // Example 1: "What do the creeds say about the Trinity?"
  if (await testScenario(
    'Search for Trinity in creeds',
    historicalSearchHandler,
    { query: 'Trinity' },
    'Should find creed references'
  )) passed++; else failed++;

  // Example 2: "Show me the Apostles' Creed"
  if (await testScenario(
    'Show Apostles Creed',
    historicalSearchHandler,
    { document: 'apostles-creed' },
    'Should return full Apostles Creed'
  )) passed++; else failed++;

  // Example 3: "Search for 'salvation' in confessions"
  if (await testScenario(
    'Search salvation in confessions',
    historicalSearchHandler,
    { query: 'salvation', docType: 'confession' },
    'Should find confession references'
  )) passed++; else failed++;

  // ========================================
  // SUMMARY
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);
  console.log(`🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(80));

  console.log('\n📋 DETAILED RESULTS:');
  console.log('-'.repeat(80));
  results.forEach(r => console.log(r));

  if (failed === 0) {
    console.log('\n🎉 ALL README SCENARIOS WORKING! 🎉\n');
  } else {
    console.log('\n⚠️  SOME SCENARIOS FAILED - Review output above\n');
  }

  return { passed, failed, total: passed + failed };
}

// Run tests
testReadmeScenarios().catch(error => {
  console.error('Fatal error running README scenario tests:', error);
  process.exit(1);
});
