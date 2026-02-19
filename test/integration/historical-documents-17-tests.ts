#!/usr/bin/env node
/**
 * Historical Documents Test Suite - 17 Test Prompts
 *
 * Tests the classic_text_lookup tool with 17 prompts covering:
 * - By Question Number (5 tests)
 * - By Topic (5 tests)
 * - By Document Name (4 tests)
 * - Edge Cases (3 tests)
 */

import { classicTextLookupHandler } from '../../dist/tools/classicTextLookup.js';

interface TestResult {
  testNumber: number;
  prompt: string;
  category: string;
  passed: boolean;
  reason: string;
  responsePreview?: string;
}

const results: TestResult[] = [];

async function runTest(
  testNumber: number,
  prompt: string,
  category: string,
  input: any,
  validator: (response: any) => { passed: boolean; reason: string }
): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST ${testNumber}: ${prompt}`);
  console.log(`Category: ${category}`);
  console.log(`Input:`, JSON.stringify(input, null, 2));
  console.log('='.repeat(80));

  try {
    const response = await classicTextLookupHandler.handler(input);
    const text = response.content[0]?.text || '';
    const preview = text.substring(0, 500) + (text.length > 500 ? '...' : '');

    const validation = validator(response);

    results.push({
      testNumber,
      prompt,
      category,
      passed: validation.passed,
      reason: validation.reason,
      responsePreview: preview
    });

    console.log(`\n✓ Status: ${validation.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  Reason: ${validation.reason}`);
    console.log(`\nResponse Preview:\n${preview}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      testNumber,
      prompt,
      category,
      passed: false,
      reason: `Exception: ${errorMessage}`,
      responsePreview: errorMessage
    });
    console.log(`\n✗ Status: FAILED (Exception)`);
    console.log(`  Error: ${errorMessage}`);
  }
}

// Helper validators
function containsQuestion(expectedNumber: string) {
  return (response: any) => {
    const text = response.content[0]?.text || '';
    const hasQuestionNumber = text.includes(`Question ${expectedNumber}`) || text.includes(`Q${expectedNumber}`);
    const hasContent = text.length > 100;
    return {
      passed: hasQuestionNumber && hasContent && !response.isError,
      reason: hasQuestionNumber && hasContent
        ? `Found Question ${expectedNumber} with content`
        : `Missing Question ${expectedNumber} or content too short`
    };
  };
}

function containsTopic(topic: string) {
  return (response: any) => {
    const text = response.content[0]?.text?.toLowerCase() || '';
    const hasTopic = text.includes(topic.toLowerCase());
    const hasResults = text.length > 200;
    return {
      passed: hasTopic && hasResults && !response.isError,
      reason: hasTopic && hasResults
        ? `Found results for topic "${topic}"`
        : `No results found for topic "${topic}"`
    };
  };
}

function containsDocument(docName: string) {
  return (response: any) => {
    const text = response.content[0]?.text || '';
    const hasDocName = text.toLowerCase().includes(docName.toLowerCase());
    const hasContent = text.length > 100;
    return {
      passed: hasDocName && hasContent && !response.isError,
      reason: hasDocName && hasContent
        ? `Found document "${docName}" with content`
        : `Document "${docName}" not found or content too short`
    };
  };
}

function shouldFail(expectedReason: string) {
  return (response: any) => {
    const text = response.content[0]?.text || '';
    const noResults = text.toLowerCase().includes('no') ||
                     text.toLowerCase().includes('not found') ||
                     text.toLowerCase().includes('error');
    return {
      passed: noResults || response.isError,
      reason: noResults || response.isError
        ? `Correctly failed: ${expectedReason}`
        : `Should have failed but returned results`
    };
  };
}

async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('HISTORICAL DOCUMENTS TEST SUITE - 17 TEST PROMPTS');
  console.log('='.repeat(80));

  // ============================================================================
  // BY QUESTION NUMBER (5 tests)
  // ============================================================================

  await runTest(
    67,
    'What is Westminster Shorter Catechism question 1?',
    'By Question Number',
    { work: 'westminster-shorter-catechism', query: 'question 1' },
    containsQuestion('1')
  );

  await runTest(
    68,
    'Show me WSC Q1',
    'By Question Number',
    { work: 'westminster-shorter-catechism', query: '1' },
    containsQuestion('1')
  );

  await runTest(
    69,
    'What is Heidelberg Catechism question 1?',
    'By Question Number',
    { work: 'heidelberg-catechism', query: 'question 1' },
    containsQuestion('1')
  );

  await runTest(
    70,
    'Show me Baltimore Catechism Q100',
    'By Question Number',
    { work: 'baltimore-catechism', query: '100' },
    containsQuestion('100')
  );

  await runTest(
    71,
    'What is the first question of the Westminster Shorter Catechism?',
    'By Question Number',
    { work: 'westminster-shorter-catechism', query: 'first question' },
    containsQuestion('1')
  );

  // ============================================================================
  // BY TOPIC (5 tests)
  // ============================================================================

  await runTest(
    72,
    'Search historical documents for Trinity',
    'By Topic',
    { query: 'Trinity' },
    containsTopic('Trinity')
  );

  await runTest(
    73,
    'Find references to justification in the confessions',
    'By Topic',
    { query: 'justification' },
    containsTopic('justification')
  );

  await runTest(
    74,
    'What do the creeds say about the Holy Spirit?',
    'By Topic',
    { query: 'Holy Spirit' },
    containsTopic('Holy Spirit')
  );

  await runTest(
    75,
    'Search for "chief end of man"',
    'By Topic',
    { query: 'chief end of man' },
    containsTopic('chief end')
  );

  await runTest(
    76,
    'Find information about baptism in historical documents',
    'By Topic',
    { query: 'baptism' },
    containsTopic('baptism')
  );

  // ============================================================================
  // BY DOCUMENT NAME (4 tests)
  // ============================================================================

  await runTest(
    77,
    'Show me the Nicene Creed',
    'By Document Name',
    { work: 'nicene-creed' },
    containsDocument('Nicene')
  );

  await runTest(
    78,
    'What is the Apostles\' Creed?',
    'By Document Name',
    { work: 'apostles-creed' },
    containsDocument('Apostles')
  );

  await runTest(
    79,
    'Show me the Westminster Confession',
    'By Document Name',
    { work: 'westminster-confession' },
    containsDocument('Westminster Confession')
  );

  await runTest(
    80,
    'What does the Heidelberg Catechism say about salvation?',
    'By Document Name',
    { work: 'heidelberg-catechism', query: 'salvation' },
    (response: any) => {
      const text = response.content[0]?.text || '';
      const hasHeidelberg = text.toLowerCase().includes('heidelberg');
      const hasSalvation = text.toLowerCase().includes('salvation') || text.length > 200;
      return {
        passed: hasHeidelberg && hasSalvation && !response.isError,
        reason: hasHeidelberg && hasSalvation
          ? 'Found Heidelberg Catechism with salvation content'
          : 'Missing Heidelberg or salvation content'
      };
    }
  );

  // ============================================================================
  // EDGE CASES (3 tests)
  // ============================================================================

  await runTest(
    81,
    'Search historical documents for xyzabc123',
    'Edge Cases',
    { query: 'xyzabc123' },
    shouldFail('Nonsense query should return no results')
  );

  await runTest(
    82,
    'What is Westminster Catechism Q999?',
    'Edge Cases',
    { work: 'westminster-shorter-catechism', query: '999' },
    shouldFail('Question number out of range')
  );

  await runTest(
    83,
    'Show me the Book of Mormon',
    'Edge Cases',
    { work: 'book-of-mormon' },
    shouldFail('Non-existent document')
  );

  // ============================================================================
  // GENERATE REPORT
  // ============================================================================

  console.log('\n\n' + '='.repeat(80));
  console.log('TEST SUMMARY REPORT');
  console.log('='.repeat(80));

  const byCategory = results.reduce((acc, result) => {
    if (!acc[result.category]) {
      acc[result.category] = { passed: 0, failed: 0, tests: [] };
    }
    if (result.passed) {
      acc[result.category].passed++;
    } else {
      acc[result.category].failed++;
    }
    acc[result.category].tests.push(result);
    return acc;
  }, {} as Record<string, { passed: number; failed: number; tests: TestResult[] }>);

  for (const [category, data] of Object.entries(byCategory)) {
    console.log(`\n${category}:`);
    console.log(`  Passed: ${data.passed}/${data.passed + data.failed}`);
    console.log(`  Failed: ${data.failed}/${data.passed + data.failed}`);

    if (data.failed > 0) {
      console.log(`  Failed tests:`);
      for (const test of data.tests.filter(t => !t.passed)) {
        console.log(`    - Test ${test.testNumber}: ${test.prompt}`);
        console.log(`      Reason: ${test.reason}`);
      }
    }
  }

  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.filter(r => !r.passed).length;
  const passRate = ((totalPassed / results.length) * 100).toFixed(1);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`OVERALL RESULTS:`);
  console.log(`  Total Tests: ${results.length}`);
  console.log(`  Passed: ${totalPassed} (${passRate}%)`);
  console.log(`  Failed: ${totalFailed} (${(100 - parseFloat(passRate)).toFixed(1)}%)`);
  console.log('='.repeat(80));

  // Generate detailed JSON report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: totalPassed,
      failed: totalFailed,
      passRate: `${passRate}%`
    },
    byCategory,
    detailedResults: results
  };

  return report;
}

// Run the tests
runAllTests()
  .then((report) => {
    console.log('\n✓ Test suite completed');
    process.exit(report.summary.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('\n✗ Test suite failed with error:', error);
    process.exit(1);
  });
