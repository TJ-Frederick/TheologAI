/**
 * PRE-LAUNCH CRITICAL TEST SUITE
 *
 * Tests 10 critical prompts that MUST pass before beta launch approval.
 * These tests simulate real user prompts in Claude Desktop with the TheologAI MCP server.
 *
 * Run with: npx tsx test/scripts/pre-launch-critical-tests.ts
 */

import dotenv from 'dotenv';
import { bibleLookupHandler } from '../../src/tools/bibleLookup.js';
import { bibleCrossReferencesHandler } from '../../src/tools/bibleCrossReferences.js';
import { classicTextLookupHandler } from '../../src/tools/classicTextLookup.js';
import { originalLanguageLookupHandler } from '../../src/tools/biblicalLanguages.js';

// Load environment variables
dotenv.config();

console.log('='.repeat(80));
console.log('THEOLOGAI MCP SERVER - PRE-LAUNCH CRITICAL TEST SUITE');
console.log('='.repeat(80));
console.log(`ESV API Key: ${process.env.ESV_API_KEY ? '✓ Loaded' : '✗ Missing'}`);
console.log();

interface TestResult {
  number: number;
  prompt: string;
  status: 'PASS' | 'FAIL';
  summary: string;
  issues: string[];
  expectedBehavior: string;
  actualBehavior: string;
}

const results: TestResult[] = [];

async function runTest(
  testNumber: number,
  prompt: string,
  handler: any,
  params: any,
  expectedBehavior: string,
  validateFn: (result: any) => { pass: boolean; summary: string; issues: string[] }
): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST ${testNumber}: ${prompt}`);
  console.log('='.repeat(80));
  console.log(`Parameters: ${JSON.stringify(params, null, 2)}`);
  console.log();

  try {
    const result = await handler.handler(params);

    // Validate the result
    const validation = validateFn(result);

    const testResult: TestResult = {
      number: testNumber,
      prompt,
      status: validation.pass ? 'PASS' : 'FAIL',
      summary: validation.summary,
      issues: validation.issues,
      expectedBehavior,
      actualBehavior: validation.pass ? 'Returned expected data' : 'Did not meet expectations'
    };

    results.push(testResult);

    // Print result
    if (validation.pass) {
      console.log(`✓ PASS: ${validation.summary}`);
    } else {
      console.log(`✗ FAIL: ${validation.summary}`);
      validation.issues.forEach(issue => {
        console.log(`  - ${issue}`);
      });
    }

    // Print sample output (first 500 chars)
    if (result.content && result.content[0] && result.content[0].text) {
      const text = result.content[0].text;
      console.log(`\nSample Output (first 500 chars):`);
      console.log('-'.repeat(80));
      console.log(text.substring(0, 500));
      if (text.length > 500) {
        console.log('...');
      }
    }

  } catch (error) {
    const testResult: TestResult = {
      number: testNumber,
      prompt,
      status: 'FAIL',
      summary: 'Test threw an error',
      issues: [error instanceof Error ? error.message : String(error)],
      expectedBehavior,
      actualBehavior: 'Error thrown during execution'
    };

    results.push(testResult);

    console.log(`✗ FAIL: Error thrown`);
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

async function runAllTests() {
  console.log('Starting test execution...\n');

  // Test 1: Get cross-references for 1 Corinthians 15:3
  await runTest(
    1,
    'Get cross-references for 1 Corinthians 15:3',
    bibleCrossReferencesHandler,
    { reference: '1 Corinthians 15:3' },
    'Should return cross-references for 1 Corinthians 15:3',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasCrossRefs = text.includes('Cross-References') || text.includes('cross-reference');
      const hasReference = text.includes('1 Corinthians 15:3') || text.includes('1Cor.15.3');
      const hasData = text.length > 100;

      return {
        pass: hasCrossRefs && hasReference && hasData,
        summary: hasCrossRefs && hasReference && hasData
          ? 'Cross-references returned successfully'
          : 'Did not return expected cross-references',
        issues: [
          !hasCrossRefs ? 'Missing cross-reference data' : '',
          !hasReference ? 'Missing reference in output' : '',
          !hasData ? 'Output too short' : ''
        ].filter(Boolean)
      };
    }
  );

  // Test 2: What are the cross-references for 1Cor.15.3?
  await runTest(
    2,
    'What are the cross-references for 1Cor.15.3?',
    bibleCrossReferencesHandler,
    { reference: '1Cor.15.3' },
    'Should handle abbreviated reference format (1Cor.15.3) and return cross-references',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasCrossRefs = text.includes('Cross-References') || text.includes('cross-reference');
      const hasData = text.length > 100;

      return {
        pass: hasCrossRefs && hasData,
        summary: hasCrossRefs && hasData
          ? 'Abbreviated reference format handled successfully'
          : 'Did not handle abbreviated reference format',
        issues: [
          !hasCrossRefs ? 'Missing cross-reference data' : '',
          !hasData ? 'Output too short' : ''
        ].filter(Boolean)
      };
    }
  );

  // Test 3: Show me cross-references for Genesis 1:1
  await runTest(
    3,
    'Show me cross-references for Genesis 1:1',
    bibleCrossReferencesHandler,
    { reference: 'Genesis 1:1' },
    'Should return cross-references for Genesis 1:1 (OT verse)',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasCrossRefs = text.includes('Cross-References') || text.includes('cross-reference');
      const hasReference = text.includes('Genesis 1:1');
      const hasData = text.length > 100;

      return {
        pass: hasCrossRefs && hasReference && hasData,
        summary: hasCrossRefs && hasReference && hasData
          ? 'OT cross-references returned successfully'
          : 'Did not return expected OT cross-references',
        issues: [
          !hasCrossRefs ? 'Missing cross-reference data' : '',
          !hasReference ? 'Missing reference in output' : '',
          !hasData ? 'Output too short' : ''
        ].filter(Boolean)
      };
    }
  );

  // Test 4: Find cross-references for 1 Peter 2:24
  await runTest(
    4,
    'Find cross-references for 1 Peter 2:24',
    bibleCrossReferencesHandler,
    { reference: '1 Peter 2:24' },
    'Should handle numbered book name (1 Peter) and return cross-references',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasCrossRefs = text.includes('Cross-References') || text.includes('cross-reference');
      const hasReference = text.includes('1 Peter 2:24') || text.includes('1Peter 2:24');
      const hasData = text.length > 100;

      return {
        pass: hasCrossRefs && hasReference && hasData,
        summary: hasCrossRefs && hasReference && hasData
          ? 'Numbered book cross-references returned successfully'
          : 'Did not handle numbered book reference correctly',
        issues: [
          !hasCrossRefs ? 'Missing cross-reference data' : '',
          !hasReference ? 'Missing reference in output' : '',
          !hasData ? 'Output too short' : ''
        ].filter(Boolean)
      };
    }
  );

  // Test 5: Get cross-references for Psalms 148:4-5
  await runTest(
    5,
    'Get cross-references for Psalms 148:4-5',
    bibleCrossReferencesHandler,
    { reference: 'Psalms 148:4' },
    'Should handle verse range (note: may only return first verse)',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasCrossRefs = text.includes('Cross-References') || text.includes('cross-reference');
      const hasReference = text.includes('Psalms 148') || text.includes('Psalm 148');
      const hasData = text.length > 100;

      return {
        pass: hasCrossRefs && hasReference && hasData,
        summary: hasCrossRefs && hasReference && hasData
          ? 'Psalms cross-references returned successfully'
          : 'Did not return expected Psalms cross-references',
        issues: [
          !hasCrossRefs ? 'Missing cross-reference data' : '',
          !hasReference ? 'Missing reference in output' : '',
          !hasData ? 'Output too short' : ''
        ].filter(Boolean)
      };
    }
  );

  // Test 6: Look up John 3:16
  await runTest(
    6,
    'Look up John 3:16',
    bibleLookupHandler,
    { reference: 'John 3:16', translation: 'ESV' },
    'Should return John 3:16 verse text in ESV translation',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasVerse = text.toLowerCase().includes('god so loved') || text.toLowerCase().includes('world');
      const hasReference = text.includes('John 3:16');
      const hasESV = text.includes('ESV') || text.includes('English Standard Version');

      return {
        pass: hasVerse && hasReference,
        summary: hasVerse && hasReference
          ? 'John 3:16 returned successfully'
          : 'Did not return John 3:16 verse text',
        issues: [
          !hasVerse ? 'Missing verse text content' : '',
          !hasReference ? 'Missing reference in output' : ''
        ].filter(Boolean)
      };
    }
  );

  // Test 7: Compare John 3:16 in ESV, KJV, and NET
  await runTest(
    7,
    'Compare John 3:16 in ESV, KJV, and NET',
    bibleLookupHandler,
    { reference: 'John 3:16', translation: ['ESV', 'KJV', 'NET'] },
    'Should return John 3:16 in all three translations for comparison',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasESV = text.includes('ESV');
      const hasKJV = text.includes('KJV');
      const hasNET = text.includes('NET');
      const hasVerse = text.toLowerCase().includes('god') && text.toLowerCase().includes('love');

      return {
        pass: hasESV && hasKJV && hasNET && hasVerse,
        summary: hasESV && hasKJV && hasNET && hasVerse
          ? 'All three translations returned successfully'
          : 'Did not return all three translations',
        issues: [
          !hasESV ? 'Missing ESV translation' : '',
          !hasKJV ? 'Missing KJV translation' : '',
          !hasNET ? 'Missing NET translation' : '',
          !hasVerse ? 'Missing verse text' : ''
        ].filter(Boolean)
      };
    }
  );

  // Test 8: What is Westminster Shorter Catechism question 1?
  await runTest(
    8,
    'What is Westminster Shorter Catechism question 1?',
    classicTextLookupHandler,
    { work: 'westminster-shorter-catechism', query: '1' },
    'Should return Westminster Shorter Catechism Q1 (chief end of man)',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasChiefEnd = text.toLowerCase().includes('chief end') || text.toLowerCase().includes('glorify god');
      const hasQuestion = text.toLowerCase().includes('question') || text.includes('Q:');
      const hasData = text.length > 50;

      return {
        pass: hasChiefEnd && hasData,
        summary: hasChiefEnd && hasData
          ? 'Westminster Shorter Catechism Q1 returned successfully'
          : 'Did not return expected catechism content',
        issues: [
          !hasChiefEnd ? 'Missing "chief end" content' : '',
          !hasQuestion ? 'Missing question format' : '',
          !hasData ? 'Output too short' : ''
        ].filter(Boolean)
      };
    }
  );

  // Test 9: Look up Strong's G25
  await runTest(
    9,
    'Look up Strong\'s G25',
    originalLanguageLookupHandler,
    { strongs_number: 'G25' },
    'Should return Greek word agapao (to love)',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasStrongs = text.includes('G25') || text.includes('Strong');
      const hasGreek = text.toLowerCase().includes('love') || text.toLowerCase().includes('agap');
      const hasDefinition = text.toLowerCase().includes('definition') || text.length > 100;

      return {
        pass: hasStrongs && hasGreek && hasDefinition,
        summary: hasStrongs && hasGreek && hasDefinition
          ? 'Strong\'s G25 (agapao) returned successfully'
          : 'Did not return expected Greek word data',
        issues: [
          !hasStrongs ? 'Missing Strong\'s number in output' : '',
          !hasGreek ? 'Missing Greek word/meaning' : '',
          !hasDefinition ? 'Missing definition' : ''
        ].filter(Boolean)
      };
    }
  );

  // Test 10: Look up Strong's H430
  await runTest(
    10,
    'Look up Strong\'s H430',
    originalLanguageLookupHandler,
    { strongs_number: 'H430' },
    'Should return Hebrew word elohim (God)',
    (result) => {
      const text = result.content?.[0]?.text || '';
      const hasStrongs = text.includes('H430') || text.includes('Strong');
      const hasHebrew = text.toLowerCase().includes('god') || text.toLowerCase().includes('elohim');
      const hasDefinition = text.toLowerCase().includes('definition') || text.length > 100;

      return {
        pass: hasStrongs && hasHebrew && hasDefinition,
        summary: hasStrongs && hasHebrew && hasDefinition
          ? 'Strong\'s H430 (elohim) returned successfully'
          : 'Did not return expected Hebrew word data',
        issues: [
          !hasStrongs ? 'Missing Strong\'s number in output' : '',
          !hasHebrew ? 'Missing Hebrew word/meaning' : '',
          !hasDefinition ? 'Missing definition' : ''
        ].filter(Boolean)
      };
    }
  );
}

// ============================================================================
// SUMMARY REPORT
// ============================================================================

function printSummary() {
  console.log('\n\n');
  console.log('='.repeat(80));
  console.log('TEST SUMMARY REPORT');
  console.log('='.repeat(80));
  console.log();

  // Summary table
  console.log('RESULTS BY TEST:');
  console.log('-'.repeat(80));
  console.log('| # | Status | Prompt                                           |');
  console.log('|---|--------|--------------------------------------------------|');

  results.forEach(result => {
    const status = result.status === 'PASS' ? '✓ PASS' : '✗ FAIL';
    const prompt = result.prompt.length > 48
      ? result.prompt.substring(0, 45) + '...'
      : result.prompt.padEnd(48);
    console.log(`| ${result.number.toString().padStart(2)} | ${status} | ${prompt} |`);
  });
  console.log('-'.repeat(80));

  // Detailed failures
  const failures = results.filter(r => r.status === 'FAIL');
  if (failures.length > 0) {
    console.log('\nDETAILED FAILURE INFORMATION:');
    console.log('='.repeat(80));
    failures.forEach(failure => {
      console.log(`\nTest ${failure.number}: ${failure.prompt}`);
      console.log(`Summary: ${failure.summary}`);
      console.log(`Expected: ${failure.expectedBehavior}`);
      console.log(`Actual: ${failure.actualBehavior}`);
      console.log('Issues:');
      failure.issues.forEach(issue => {
        console.log(`  - ${issue}`);
      });
    });
  }

  // Pass/Fail counts
  console.log('\n');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL TESTS:  ${results.length}`);
  console.log(`PASSED:       ${passCount} (${Math.round(passCount / results.length * 100)}%)`);
  console.log(`FAILED:       ${failCount} (${Math.round(failCount / results.length * 100)}%)`);
  console.log();

  // Launch approval
  if (failCount === 0) {
    console.log('✓✓✓ ALL TESTS PASSED ✓✓✓');
    console.log('BETA LAUNCH APPROVED');
  } else {
    console.log('✗✗✗ TESTS FAILED ✗✗✗');
    console.log('BETA LAUNCH BLOCKED - FIX FAILURES BEFORE PROCEEDING');
  }

  console.log();
  console.log('='.repeat(80));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  await runAllTests();
  printSummary();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
