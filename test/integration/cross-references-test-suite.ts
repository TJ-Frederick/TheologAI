import { bibleCrossReferencesHandler, CrossReferenceLookupParams } from '../../src/tools/bibleCrossReferences.js';

interface TestResult {
  testNumber: number;
  prompt: string;
  category: string;
  passed: boolean;
  response?: string;
  error?: string;
  validationDetails?: string;
}

async function runTest(
  testNumber: number,
  prompt: string,
  category: string,
  params: any
): Promise<TestResult> {
  try {
    console.log(`\n🧪 Test ${testNumber}: ${prompt}`);
    console.log(`   Category: ${category}`);
    console.log(`   Params:`, JSON.stringify(params, null, 2));

    const response = await bibleCrossReferencesHandler.handler(params);

    // Extract the text content from the response
    const content = response.content;
    let responseText = '';

    if (Array.isArray(content)) {
      responseText = content
        .map((item) => (item.type === 'text' ? item.text : ''))
        .join('\n');
    } else if (typeof content === 'string') {
      responseText = content;
    }

    console.log(`   ✅ Response received (${responseText.length} chars)`);

    // Validation logic
    let validationDetails = '';
    let passed = false;

    if (category === 'BASIC') {
      // Basic tests should return cross-references
      const hasReferences = /\d+\.\s+[A-Za-z]+\s+\d+:\d+/.test(responseText);
      const hasAttribution = responseText.includes('OpenBible.info');
      passed = hasReferences && hasAttribution;
      validationDetails = `Has references: ${hasReferences}, Has attribution: ${hasAttribution}`;
    } else if (category === 'WITH OPTIONS') {
      // Tests with options should respect maxResults or minVotes
      const hasReferences = /\d+\.\s+[A-Za-z]+\s+\d+:\d+/.test(responseText);
      const hasAttribution = responseText.includes('OpenBible.info');

      // Count references in response
      const refMatches = responseText.match(/\d+\.\s+[A-Za-z]+\s+\d+:\d+/g);
      const refCount = refMatches ? refMatches.length : 0;

      if (params.maxResults) {
        passed = hasReferences && refCount <= params.maxResults && hasAttribution;
        validationDetails = `References: ${refCount}/${params.maxResults} max, Has attribution: ${hasAttribution}`;
      } else if (params.minVotes !== undefined) {
        // For minVotes, either we have references OR we have a "No cross-references found" message
        const hasNoResultsMessage = responseText.includes('No cross-references found');
        passed = (hasReferences && hasAttribution) || hasNoResultsMessage;
        validationDetails = `Has highly-voted references or no-results message: ${hasReferences || hasNoResultsMessage}, Has attribution (if results): ${hasAttribution}`;
      }
    } else if (category === 'EDGE CASES') {
      // Edge cases have different validation
      if (params.reference.includes('InvalidBook')) {
        // Should handle gracefully
        passed = responseText.includes('No cross-references found') || responseText.includes('error');
        validationDetails = `Error handled gracefully: ${passed}`;
      } else if (!params.reference.includes(':')) {
        // Chapter-only reference (e.g., "Psalm 23")
        const hasChapterOverview = responseText.includes('Chapter Overview') ||
                                    responseText.includes('Most Referenced Verses') ||
                                    responseText.includes('total cross-references');
        passed = hasChapterOverview;
        validationDetails = `Chapter overview provided: ${hasChapterOverview}`;
      } else {
        // Valid reference (Obadiah 1:21)
        const hasReferences = /\d+\.\s+[A-Za-z]+\s+\d+:\d+/.test(responseText) ||
                               responseText.includes('No cross-references found');
        const hasAttribution = responseText.includes('OpenBible.info');
        passed = hasReferences && hasAttribution;
        validationDetails = `Has references or no-results message: ${hasReferences}, Has attribution: ${hasAttribution}`;
      }
    }

    return {
      testNumber,
      prompt,
      category,
      passed,
      response: responseText.substring(0, 500), // Truncate for readability
      validationDetails,
    };
  } catch (error) {
    console.log(`   ❌ Error:`, error);
    return {
      testNumber,
      prompt,
      category,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('Cross-References Tool Test Suite - 11 Tests');
  console.log('='.repeat(80));

  const results: TestResult[] = [];

  // BASIC TESTS (18-22)
  const basicTests = [
    { num: 18, prompt: 'What are the cross-references for John 3:16?', params: { reference: 'John 3:16' } },
    { num: 19, prompt: 'Find related verses to Romans 8:28', params: { reference: 'Romans 8:28' } },
    { num: 20, prompt: 'Show me cross-references for Psalm 23:1', params: { reference: 'Psalm 23:1' } },
    { num: 21, prompt: 'Get verses related to Genesis 1:1', params: { reference: 'Genesis 1:1' } },
    { num: 22, prompt: 'Find cross-references for Matthew 5:16', params: { reference: 'Matthew 5:16' } },
  ];

  for (const test of basicTests) {
    const result = await runTest(test.num, test.prompt, 'BASIC', test.params);
    results.push(result);
  }

  // WITH OPTIONS TESTS (23-25)
  const optionTests = [
    { num: 23, prompt: 'Give me 10 cross-references for John 3:16', params: { reference: 'John 3:16', maxResults: 10 } },
    { num: 24, prompt: 'Show me the top 3 cross-references for Romans 5:8', params: { reference: 'Romans 5:8', maxResults: 3 } },
    { num: 25, prompt: 'Find highly voted cross-references for Ephesians 2:8-9', params: { reference: 'Ephesians 2:8-9', minVotes: 5 } },
  ];

  for (const test of optionTests) {
    const result = await runTest(test.num, test.prompt, 'WITH OPTIONS', test.params);
    results.push(result);
  }

  // EDGE CASES TESTS (26-28)
  const edgeCaseTests = [
    { num: 26, prompt: 'Cross-references for Psalm 23', params: { reference: 'Psalm 23' } },
    { num: 27, prompt: 'Cross-references for Obadiah 1:21', params: { reference: 'Obadiah 1:21' } },
    { num: 28, prompt: 'Cross-references for InvalidBook 1:1', params: { reference: 'InvalidBook 1:1' } },
  ];

  for (const test of edgeCaseTests) {
    const result = await runTest(test.num, test.prompt, 'EDGE CASES', test.params);
    results.push(result);
  }

  // SUMMARY REPORT
  console.log('\n' + '='.repeat(80));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%\n`);

  // Detailed results by category
  const categories = ['BASIC', 'WITH OPTIONS', 'EDGE CASES'];

  for (const category of categories) {
    const categoryResults = results.filter((r) => r.category === category);
    const categoryPassed = categoryResults.filter((r) => r.passed).length;

    console.log(`\n${category} (${categoryPassed}/${categoryResults.length} passed):`);
    console.log('-'.repeat(80));

    for (const result of categoryResults) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`\nTest ${result.testNumber}: ${status}`);
      console.log(`  Prompt: "${result.prompt}"`);

      if (result.validationDetails) {
        console.log(`  Validation: ${result.validationDetails}`);
      }

      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }

      if (result.response && result.response.length > 0) {
        // Show first 200 chars of response
        const preview = result.response.substring(0, 200).replace(/\n/g, ' ');
        console.log(`  Response preview: ${preview}...`);
      }
    }
  }

  // Failed tests details
  const failedTests = results.filter((r) => !r.passed);
  if (failedTests.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('FAILED TESTS DETAILS');
    console.log('='.repeat(80));

    for (const result of failedTests) {
      console.log(`\nTest ${result.testNumber}: ${result.prompt}`);
      console.log(`  Category: ${result.category}`);
      console.log(`  Validation: ${result.validationDetails}`);

      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }

      if (result.response) {
        console.log(`  Full Response:\n${result.response}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test suite completed!');
  console.log('='.repeat(80));
}

main().catch(console.error);
