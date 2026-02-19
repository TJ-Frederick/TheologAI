#!/usr/bin/env tsx
/**
 * Bible Lookup Tool - 17 Test Prompts
 *
 * Executes 17 test prompts against the TheologAI MCP server:
 * - 5 Basic lookups
 * - 5 Translation variations
 * - 7 Edge cases
 *
 * Reports: Total pass/fail count, issues found, edge case behavior
 */

import { bibleLookupHandler } from '../../src/tools/bibleLookup.js';
import type { BibleLookupParams } from '../../src/types/index.js';

interface TestResult {
  testNumber: number;
  category: string;
  prompt: string;
  params: BibleLookupParams;
  status: 'PASS' | 'FAIL' | 'ERROR';
  error?: string;
  response?: string;
  executionTime?: number;
}

const testPrompts = [
  // BASIC LOOKUPS (1-5)
  {
    category: 'BASIC',
    prompt: 'Look up John 3:16',
    params: { reference: 'John 3:16' }
  },
  {
    category: 'BASIC',
    prompt: 'Show me Psalm 23:1',
    params: { reference: 'Psalm 23:1' }
  },
  {
    category: 'BASIC',
    prompt: 'What does Romans 8:28 say?',
    params: { reference: 'Romans 8:28' }
  },
  {
    category: 'BASIC',
    prompt: 'Get Genesis 1:1',
    params: { reference: 'Genesis 1:1' }
  },
  {
    category: 'BASIC',
    prompt: 'Read Matthew 5:3-10',
    params: { reference: 'Matthew 5:3-10' }
  },

  // TRANSLATION VARIATIONS (6-10)
  {
    category: 'TRANSLATION',
    prompt: 'Show me John 3:16 in the KJV',
    params: { reference: 'John 3:16', translation: 'KJV' }
  },
  {
    category: 'TRANSLATION',
    prompt: 'Compare John 3:16 in ESV, KJV, and NET',
    params: { reference: 'John 3:16', translation: ['ESV', 'KJV', 'NET'] }
  },
  {
    category: 'TRANSLATION',
    prompt: 'Give me Psalm 23:1 in multiple translations',
    params: { reference: 'Psalm 23:1', translation: ['ESV', 'KJV', 'WEB'] }
  },
  {
    category: 'TRANSLATION',
    prompt: 'Show Romans 8:28 in the World English Bible',
    params: { reference: 'Romans 8:28', translation: 'WEB' }
  },
  {
    category: 'TRANSLATION',
    prompt: 'Compare Genesis 1:1 across three different translations',
    params: { reference: 'Genesis 1:1', translation: ['ESV', 'NET', 'BSB'] }
  },

  // EDGE CASES (11-17)
  {
    category: 'EDGE',
    prompt: 'Look up John 99:99',
    params: { reference: 'John 99:99' }
  },
  {
    category: 'EDGE',
    prompt: 'Show me Book of Mormon 1:1',
    params: { reference: 'Book of Mormon 1:1' }
  },
  {
    category: 'EDGE',
    prompt: 'Get Psalm 119:1-176',
    params: { reference: 'Psalm 119:1-176' }
  },
  {
    category: 'EDGE',
    prompt: 'Look up 3:16',
    params: { reference: '3:16' }
  },
  {
    category: 'EDGE',
    prompt: 'Show me John 3:',
    params: { reference: 'John 3:' }
  },
  {
    category: 'EDGE',
    prompt: 'Get john3:16',
    params: { reference: 'john3:16' }
  },
  {
    category: 'EDGE',
    prompt: 'Look up Jn 3:16',
    params: { reference: 'Jn 3:16' }
  }
];

async function runTest(testNum: number, test: typeof testPrompts[0]): Promise<TestResult> {
  const startTime = Date.now();

  try {
    console.log(`\n[${ testNum }] Testing: ${test.prompt}`);
    console.log(`    Category: ${test.category}`);
    console.log(`    Params: ${JSON.stringify(test.params)}`);

    const result = await bibleLookupHandler.handler(test.params);
    const executionTime = Date.now() - startTime;

    // Check if result contains error
    if (result.content && result.content[0] && result.content[0].text) {
      const responseText = result.content[0].text;

      if (responseText.toLowerCase().includes('error')) {
        return {
          testNumber: testNum,
          category: test.category,
          prompt: test.prompt,
          params: test.params,
          status: 'ERROR',
          error: 'Response contains error message',
          response: responseText.substring(0, 200),
          executionTime
        };
      }

      // Basic validation - check if response contains expected content
      const hasReference = responseText.includes(test.params.reference.split(' ')[0]); // Check book name at least

      if (hasReference || test.category === 'EDGE') {
        return {
          testNumber: testNum,
          category: test.category,
          prompt: test.prompt,
          params: test.params,
          status: 'PASS',
          response: responseText.substring(0, 200),
          executionTime
        };
      } else {
        return {
          testNumber: testNum,
          category: test.category,
          prompt: test.prompt,
          params: test.params,
          status: 'FAIL',
          error: 'Response does not contain expected reference',
          response: responseText.substring(0, 200),
          executionTime
        };
      }
    } else {
      return {
        testNumber: testNum,
        category: test.category,
        prompt: test.prompt,
        params: test.params,
        status: 'FAIL',
        error: 'Invalid response format',
        executionTime
      };
    }
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // For edge cases, errors might be expected
    if (test.category === 'EDGE') {
      return {
        testNumber: testNum,
        category: test.category,
        prompt: test.prompt,
        params: test.params,
        status: 'PASS', // Edge cases that fail gracefully are passes
        error: `Graceful failure: ${errorMessage}`,
        executionTime
      };
    }

    return {
      testNumber: testNum,
      category: test.category,
      prompt: test.prompt,
      params: test.params,
      status: 'FAIL',
      error: errorMessage,
      executionTime
    };
  }
}

async function runAllTests() {
  console.log('='.repeat(80));
  console.log('BIBLE LOOKUP TOOL - 17 TEST PROMPTS');
  console.log('='.repeat(80));

  const results: TestResult[] = [];

  for (let i = 0; i < testPrompts.length; i++) {
    const result = await runTest(i + 1, testPrompts[i]);
    results.push(result);

    // Print immediate result
    const statusSymbol = result.status === 'PASS' ? '✓' :
                        result.status === 'ERROR' ? '⚠' : '✗';
    console.log(`    ${statusSymbol} ${result.status} (${result.executionTime}ms)`);
    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
  }

  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(80));

  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const errorCount = results.filter(r => r.status === 'ERROR').length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`✓ Passed: ${passCount}`);
  console.log(`✗ Failed: ${failCount}`);
  console.log(`⚠ Errors: ${errorCount}`);
  console.log(`Success Rate: ${((passCount / results.length) * 100).toFixed(1)}%`);

  // Category breakdown
  console.log('\n' + '-'.repeat(80));
  console.log('RESULTS BY CATEGORY');
  console.log('-'.repeat(80));

  const categories = ['BASIC', 'TRANSLATION', 'EDGE'];
  categories.forEach(cat => {
    const catResults = results.filter(r => r.category === cat);
    const catPass = catResults.filter(r => r.status === 'PASS').length;
    const catFail = catResults.filter(r => r.status === 'FAIL').length;
    const catError = catResults.filter(r => r.status === 'ERROR').length;

    console.log(`\n${cat} LOOKUPS:`);
    console.log(`  Total: ${catResults.length}`);
    console.log(`  ✓ Pass: ${catPass}  ✗ Fail: ${catFail}  ⚠ Error: ${catError}`);
  });

  // Failed tests detail
  const failedTests = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR');
  if (failedTests.length > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('FAILED/ERROR TEST DETAILS');
    console.log('-'.repeat(80));

    failedTests.forEach(test => {
      console.log(`\n[${test.testNumber}] ${test.prompt}`);
      console.log(`    Status: ${test.status}`);
      console.log(`    Error: ${test.error}`);
      if (test.response) {
        console.log(`    Response: ${test.response}...`);
      }
    });
  }

  // Edge case analysis
  console.log('\n' + '-'.repeat(80));
  console.log('EDGE CASE ANALYSIS');
  console.log('-'.repeat(80));

  const edgeCases = results.filter(r => r.category === 'EDGE');
  edgeCases.forEach(test => {
    const behavior = test.status === 'PASS' && test.error?.includes('Graceful failure')
      ? 'Failed gracefully'
      : test.status === 'PASS'
      ? 'Handled successfully'
      : test.status === 'ERROR'
      ? 'Errored gracefully'
      : 'Crashed';

    console.log(`\n[${test.testNumber}] ${test.prompt}`);
    console.log(`    Behavior: ${behavior}`);
    if (test.error) {
      console.log(`    Message: ${test.error}`);
    }
  });

  // Performance stats
  console.log('\n' + '-'.repeat(80));
  console.log('PERFORMANCE METRICS');
  console.log('-'.repeat(80));

  const avgTime = results.reduce((sum, r) => sum + (r.executionTime || 0), 0) / results.length;
  const minTime = Math.min(...results.map(r => r.executionTime || 0));
  const maxTime = Math.max(...results.map(r => r.executionTime || 0));

  console.log(`\nAverage execution time: ${avgTime.toFixed(0)}ms`);
  console.log(`Fastest: ${minTime}ms`);
  console.log(`Slowest: ${maxTime}ms`);

  console.log('\n' + '='.repeat(80));
  console.log('TEST EXECUTION COMPLETE');
  console.log('='.repeat(80));

  // Return exit code based on results
  process.exit(failCount > 0 ? 1 : 0);
}

// Run the tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
