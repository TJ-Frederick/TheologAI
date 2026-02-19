/**
 * Comprehensive Test Suite: 24 Original Language Lookup Prompts
 *
 * Tests the original_language_lookup tool with various natural language prompts
 * to verify Abbott-Smith (Greek) and BDB (Hebrew) lexicons, semantic comparisons,
 * and edge case handling.
 *
 * Run with: npx tsx test/tools/original-language-24-prompts-test.ts
 */

import { originalLanguageLookupHandler } from '../../src/tools/biblicalLanguages.js';

interface TestResult {
  testNumber: number;
  prompt: string;
  passed: boolean;
  error?: string;
  hasAbbottSmith?: boolean;
  hasBDB?: boolean;
  output?: string;
}

const results: TestResult[] = [];

async function runTest(
  testNumber: number,
  prompt: string,
  params: any,
  validations: {
    shouldSucceed: boolean;
    checkLexicon?: 'abbott-smith' | 'bdb';
    checkContent?: string[];
  }
): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST ${testNumber}: ${prompt}`);
  console.log(`${'='.repeat(80)}`);

  try {
    const result = await originalLanguageLookupHandler.handler(params);
    const output = result.content[0].text;

    console.log(output);

    // Validate results
    let passed = true;
    let error = '';
    let hasAbbottSmith = false;
    let hasBDB = false;

    if (validations.shouldSucceed && result.isError) {
      passed = false;
      error = 'Expected success but got error';
    } else if (!validations.shouldSucceed && !result.isError) {
      passed = false;
      error = 'Expected error but got success';
    }

    // Check lexicon attribution
    if (validations.checkLexicon === 'abbott-smith') {
      hasAbbottSmith = output.includes('Abbott-Smith');
      if (!hasAbbottSmith) {
        passed = false;
        error += ' | Missing Abbott-Smith attribution';
      }
    }

    if (validations.checkLexicon === 'bdb') {
      hasBDB = output.includes('Brown-Driver-Briggs') || output.includes('BDB');
      if (!hasBDB) {
        passed = false;
        error += ' | Missing BDB attribution';
      }
    }

    // Check for specific content
    if (validations.checkContent) {
      for (const content of validations.checkContent) {
        if (!output.includes(content)) {
          passed = false;
          error += ` | Missing expected content: ${content}`;
        }
      }
    }

    results.push({
      testNumber,
      prompt,
      passed,
      error: error || undefined,
      hasAbbottSmith,
      hasBDB,
      output: output.substring(0, 200) + '...'
    });

    console.log(`\n✓ Test ${testNumber} ${passed ? 'PASSED' : 'FAILED'}${error ? ': ' + error : ''}`);

  } catch (err) {
    results.push({
      testNumber,
      prompt,
      passed: false,
      error: (err as Error).message,
      output: undefined
    });
    console.log(`\n✗ Test ${testNumber} FAILED: ${(err as Error).message}`);
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║         COMPREHENSIVE TEST SUITE: 24 ORIGINAL LANGUAGE LOOKUPS             ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  // ============================================================================
  // GREEK BASIC (7 tests)
  // ============================================================================
  console.log('\n\n📖 SECTION 1: GREEK BASIC LOOKUPS (Tests 29-35)');

  await runTest(29, 'Look up Strong\'s G25',
    { strongs_number: 'G25' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith' }
  );

  await runTest(30, 'What does Strong\'s G26 mean?',
    { strongs_number: 'G26' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith' }
  );

  await runTest(31, 'Show me Strong\'s G2316',
    { strongs_number: 'G2316' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith', checkContent: ['θεός', 'God'] }
  );

  await runTest(32, 'Define Strong\'s G3056',
    { strongs_number: 'G3056' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith', checkContent: ['λόγος'] }
  );

  await runTest(33, 'What is Strong\'s G4151?',
    { strongs_number: 'G4151' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith', checkContent: ['πνεῦμα'] }
  );

  await runTest(34, 'Look up Strong\'s G5368',
    { strongs_number: 'G5368' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith' }
  );

  await runTest(35, 'What does Strong\'s G4102 mean?',
    { strongs_number: 'G4102' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith', checkContent: ['πίστις'] }
  );

  // ============================================================================
  // GREEK DETAILED (3 tests)
  // ============================================================================
  console.log('\n\n📚 SECTION 2: GREEK DETAILED ANALYSIS (Tests 36-38)');

  await runTest(36, 'Show me Strong\'s G25 with detailed analysis',
    { strongs_number: 'G25', detail_level: 'detailed' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith', checkContent: ['Etymology', 'Morphological'] }
  );

  await runTest(37, 'Give me detailed information on Strong\'s G3056',
    { strongs_number: 'G3056', detail_level: 'detailed' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith', checkContent: ['Etymology', 'λόγος'] }
  );

  await runTest(38, 'Look up Strong\'s G2316 with detail_level: detailed',
    { strongs_number: 'G2316', detail_level: 'detailed' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith', checkContent: ['θεός'] }
  );

  // ============================================================================
  // HEBREW BASIC (5 tests)
  // ============================================================================
  console.log('\n\n📜 SECTION 3: HEBREW BASIC LOOKUPS (Tests 39-43)');

  await runTest(39, 'Look up Strong\'s H430',
    { strongs_number: 'H430' },
    { shouldSucceed: true, checkLexicon: 'bdb', checkContent: ['אֱלֹהִים'] }
  );

  await runTest(40, 'What does Strong\'s H3068 mean?',
    { strongs_number: 'H3068' },
    { shouldSucceed: true, checkLexicon: 'bdb', checkContent: ['יְהֹוָה'] }
  );

  await runTest(41, 'Show me Strong\'s H8034',
    { strongs_number: 'H8034' },
    { shouldSucceed: true, checkLexicon: 'bdb' }
  );

  await runTest(42, 'Define Strong\'s H7965',
    { strongs_number: 'H7965' },
    { shouldSucceed: true, checkLexicon: 'bdb' }
  );

  await runTest(43, 'What is Strong\'s H2617?',
    { strongs_number: 'H2617' },
    { shouldSucceed: true, checkLexicon: 'bdb' }
  );

  // ============================================================================
  // HEBREW DETAILED (2 tests)
  // ============================================================================
  console.log('\n\n📖 SECTION 4: HEBREW DETAILED ANALYSIS (Tests 44-45)');

  await runTest(44, 'Show me Strong\'s H430 with detailed analysis',
    { strongs_number: 'H430', detail_level: 'detailed' },
    { shouldSucceed: true, checkLexicon: 'bdb', checkContent: ['אֱלֹהִים'] }
  );

  await runTest(45, 'Give me detailed information on Strong\'s H3068',
    { strongs_number: 'H3068', detail_level: 'detailed' },
    { shouldSucceed: true, checkLexicon: 'bdb', checkContent: ['יְהֹוָה'] }
  );

  // ============================================================================
  // LEXICON SOURCES (3 tests)
  // ============================================================================
  console.log('\n\n🔍 SECTION 5: LEXICON SOURCE VERIFICATION (Tests 46-48)');

  await runTest(46, 'Look up G25 and tell me what lexicon it comes from',
    { strongs_number: 'G25' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith', checkContent: ['Abbott-Smith'] }
  );

  await runTest(47, 'Look up H430 and show me the source',
    { strongs_number: 'H430' },
    { shouldSucceed: true, checkLexicon: 'bdb', checkContent: ['Brown-Driver-Briggs'] }
  );

  await runTest(48, 'Compare G25 and G5368 - what\'s the difference?',
    { strongs_number: 'G25' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith' }
  );

  // ============================================================================
  // EDGE CASES (4 tests)
  // ============================================================================
  console.log('\n\n⚠️  SECTION 6: EDGE CASES (Tests 49-52)');

  await runTest(49, 'Look up Strong\'s G1',
    { strongs_number: 'G1' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith' }
  );

  await runTest(50, 'Look up Strong\'s H1',
    { strongs_number: 'H1' },
    { shouldSucceed: true, checkLexicon: 'bdb' }
  );

  await runTest(51, 'What is Strong\'s G5624?',
    { strongs_number: 'G5624' },
    { shouldSucceed: true, checkLexicon: 'abbott-smith' }
  );

  await runTest(52, 'Look up Strong\'s G999999',
    { strongs_number: 'G999999' },
    { shouldSucceed: false }
  );

  // ============================================================================
  // GENERATE SUMMARY REPORT
  // ============================================================================
  console.log('\n\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           TEST SUMMARY REPORT                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  const passRate = ((passedTests / totalTests) * 100).toFixed(1);

  console.log(`Total Tests:    ${totalTests}`);
  console.log(`Passed:         ${passedTests} ✓`);
  console.log(`Failed:         ${failedTests} ✗`);
  console.log(`Pass Rate:      ${passRate}%\n`);

  // Breakdown by category
  const greekBasic = results.slice(0, 7);
  const greekDetailed = results.slice(7, 10);
  const hebrewBasic = results.slice(10, 15);
  const hebrewDetailed = results.slice(15, 17);
  const lexiconSources = results.slice(17, 20);
  const edgeCases = results.slice(20, 24);

  console.log('BREAKDOWN BY CATEGORY:');
  console.log('─'.repeat(80));
  console.log(`Greek Basic (29-35):      ${greekBasic.filter(r => r.passed).length}/${greekBasic.length} passed`);
  console.log(`Greek Detailed (36-38):   ${greekDetailed.filter(r => r.passed).length}/${greekDetailed.length} passed`);
  console.log(`Hebrew Basic (39-43):     ${hebrewBasic.filter(r => r.passed).length}/${hebrewBasic.length} passed`);
  console.log(`Hebrew Detailed (44-45):  ${hebrewDetailed.filter(r => r.passed).length}/${hebrewDetailed.length} passed`);
  console.log(`Lexicon Sources (46-48):  ${lexiconSources.filter(r => r.passed).length}/${lexiconSources.length} passed`);
  console.log(`Edge Cases (49-52):       ${edgeCases.filter(r => r.passed).length}/${edgeCases.length} passed\n`);

  // Lexicon attribution verification
  const abbottSmithCount = results.filter(r => r.hasAbbottSmith).length;
  const bdbCount = results.filter(r => r.hasBDB).length;

  console.log('LEXICON ATTRIBUTION VERIFICATION:');
  console.log('─'.repeat(80));
  console.log(`Abbott-Smith (Greek):     ${abbottSmithCount} tests cited correctly`);
  console.log(`BDB (Hebrew):             ${bdbCount} tests cited correctly\n`);

  // Failed tests detail
  if (failedTests > 0) {
    console.log('FAILED TESTS DETAIL:');
    console.log('─'.repeat(80));
    results.filter(r => !r.passed).forEach(r => {
      console.log(`Test ${r.testNumber}: ${r.prompt}`);
      console.log(`  Error: ${r.error || 'Unknown error'}`);
      console.log('');
    });
  }

  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         END OF TEST SUITE                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run all tests
runAllTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
