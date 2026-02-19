#!/usr/bin/env tsx
/**
 * Bible Lookup Tool - 17 Test Prompts (Detailed Report)
 *
 * Executes 17 test prompts against the TheologAI MCP server with full response details
 */

import { bibleLookupHandler } from '../../src/tools/bibleLookup.js';
import type { BibleLookupParams } from '../../src/types/index.js';

interface TestCase {
  category: string;
  prompt: string;
  params: BibleLookupParams;
}

const testPrompts: TestCase[] = [
  // BASIC LOOKUPS (1-5)
  { category: 'BASIC', prompt: 'Look up John 3:16', params: { reference: 'John 3:16' } },
  { category: 'BASIC', prompt: 'Show me Psalm 23:1', params: { reference: 'Psalm 23:1' } },
  { category: 'BASIC', prompt: 'What does Romans 8:28 say?', params: { reference: 'Romans 8:28' } },
  { category: 'BASIC', prompt: 'Get Genesis 1:1', params: { reference: 'Genesis 1:1' } },
  { category: 'BASIC', prompt: 'Read Matthew 5:3-10', params: { reference: 'Matthew 5:3-10' } },

  // TRANSLATION VARIATIONS (6-10)
  { category: 'TRANSLATION', prompt: 'Show me John 3:16 in the KJV', params: { reference: 'John 3:16', translation: 'KJV' } },
  { category: 'TRANSLATION', prompt: 'Compare John 3:16 in ESV, KJV, and NET', params: { reference: 'John 3:16', translation: ['ESV', 'KJV', 'NET'] } },
  { category: 'TRANSLATION', prompt: 'Give me Psalm 23:1 in multiple translations', params: { reference: 'Psalm 23:1', translation: ['ESV', 'KJV', 'WEB'] } },
  { category: 'TRANSLATION', prompt: 'Show Romans 8:28 in the World English Bible', params: { reference: 'Romans 8:28', translation: 'WEB' } },
  { category: 'TRANSLATION', prompt: 'Compare Genesis 1:1 across three different translations', params: { reference: 'Genesis 1:1', translation: ['ESV', 'NET', 'BSB'] } },

  // EDGE CASES (11-17)
  { category: 'EDGE', prompt: 'Look up John 99:99', params: { reference: 'John 99:99' } },
  { category: 'EDGE', prompt: 'Show me Book of Mormon 1:1', params: { reference: 'Book of Mormon 1:1' } },
  { category: 'EDGE', prompt: 'Get Psalm 119:1-176', params: { reference: 'Psalm 119:1-176' } },
  { category: 'EDGE', prompt: 'Look up 3:16', params: { reference: '3:16' } },
  { category: 'EDGE', prompt: 'Show me John 3:', params: { reference: 'John 3:' } },
  { category: 'EDGE', prompt: 'Get john3:16', params: { reference: 'john3:16' } },
  { category: 'EDGE', prompt: 'Look up Jn 3:16', params: { reference: 'Jn 3:16' } }
];

async function runDetailedTests() {
  console.log('='.repeat(100));
  console.log('BIBLE LOOKUP TOOL - 17 TEST PROMPTS - DETAILED REPORT');
  console.log('='.repeat(100));

  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;

  for (let i = 0; i < testPrompts.length; i++) {
    const test = testPrompts[i];
    console.log(`\n${'='.repeat(100)}`);
    console.log(`TEST ${i + 1}/17: ${test.prompt}`);
    console.log(`Category: ${test.category}`);
    console.log(`Params: ${JSON.stringify(test.params, null, 2)}`);
    console.log('-'.repeat(100));

    try {
      const startTime = Date.now();
      const result = await bibleLookupHandler.handler(test.params);
      const executionTime = Date.now() - startTime;

      if (result.content && result.content[0] && result.content[0].text) {
        const responseText = result.content[0].text;
        const isError = responseText.toLowerCase().includes('error');

        console.log(`Status: ${isError ? '⚠ ERROR' : '✓ PASS'}`);
        console.log(`Execution Time: ${executionTime}ms`);
        console.log(`Response Length: ${responseText.length} characters`);
        console.log('\nFull Response:');
        console.log(responseText);

        if (isError) {
          errorCount++;
        } else {
          passCount++;
        }
      } else {
        console.log('Status: ✗ FAIL - Invalid response format');
        failCount++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`Status: ✗ FAIL - Exception thrown`);
      console.log(`Error: ${errorMessage}`);

      // Edge cases that throw exceptions are considered "graceful failures"
      if (test.category === 'EDGE') {
        console.log('Note: Edge case failed gracefully with exception');
        errorCount++;
      } else {
        failCount++;
      }
    }
  }

  // Final Summary
  console.log('\n' + '='.repeat(100));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(100));
  console.log(`\nTotal Tests: ${testPrompts.length}`);
  console.log(`✓ Passed: ${passCount} (${((passCount / testPrompts.length) * 100).toFixed(1)}%)`);
  console.log(`✗ Failed: ${failCount} (${((failCount / testPrompts.length) * 100).toFixed(1)}%)`);
  console.log(`⚠ Errors: ${errorCount} (${((errorCount / testPrompts.length) * 100).toFixed(1)}%)`);
  console.log(`\nSuccess Rate (Pass + Graceful Errors): ${(((passCount + errorCount) / testPrompts.length) * 100).toFixed(1)}%`);

  // Category Breakdown
  console.log('\n' + '-'.repeat(100));
  console.log('CATEGORY BREAKDOWN:');
  console.log('-'.repeat(100));

  const basicTests = testPrompts.filter(t => t.category === 'BASIC');
  const translationTests = testPrompts.filter(t => t.category === 'TRANSLATION');
  const edgeTests = testPrompts.filter(t => t.category === 'EDGE');

  console.log(`\nBASIC LOOKUPS: ${basicTests.length} tests`);
  console.log(`TRANSLATION VARIATIONS: ${translationTests.length} tests`);
  console.log(`EDGE CASES: ${edgeTests.length} tests`);

  console.log('\n' + '='.repeat(100));
}

runDetailedTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
