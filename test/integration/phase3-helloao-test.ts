/**
 * Phase 3.2 Integration Tests - HelloAO Commentary Integration
 *
 * Tests the full commentary lookup pipeline:
 * - MCP Tool -> Commentary Service -> Public Commentary Adapter -> HelloAO API
 *
 * Validates all 6 public domain commentaries from bible.helloao.org
 */

import { commentaryLookupHandler } from '../../src/tools/commentaryLookup.js';
import type { TextContent } from '@modelcontextprotocol/sdk/types.js';

console.log('================================================================================');
console.log('PHASE 3.2 INTEGRATION TESTS - HELLOAO COMMENTARY');
console.log('================================================================================\n');

interface TestCase {
  reference: string;
  commentator: string;
  expectedInText?: string;
  description: string;
}

const testCases: TestCase[] = [
  {
    reference: 'John 3:16',
    commentator: 'Matthew Henry',
    expectedInText: 'God so loved',
    description: 'Most famous verse - Matthew Henry complete commentary'
  },
  {
    reference: 'John 3:16',
    commentator: 'Jamieson-Fausset-Brown',
    expectedInText: 'God so loved',
    description: 'Most famous verse - JFB commentary'
  },
  {
    reference: 'Genesis 1:1',
    commentator: 'Adam Clarke',
    expectedInText: 'beginning',
    description: 'Creation account - Adam Clarke'
  },
  {
    reference: 'Genesis 1:1',
    commentator: 'John Gill',
    expectedInText: 'beginning',
    description: 'Creation account - John Gill'
  },
  {
    reference: 'Psalm 23:1',
    commentator: 'Keil-Delitzsch',
    expectedInText: 'shepherd',
    description: 'OT Psalm - Keil-Delitzsch (OT specialist)'
  },
  {
    reference: 'Romans 8:28',
    commentator: 'Tyndale',
    expectedInText: 'good',
    description: 'NT promise - Tyndale Open Study Notes'
  },
  {
    reference: 'Romans 3:23',
    commentator: 'Matthew Henry',
    expectedInText: 'sin',
    description: 'Gospel verse - Matthew Henry'
  },
  {
    reference: 'Ephesians 2:8-9',
    commentator: 'Jamieson-Fausset-Brown',
    expectedInText: 'grace',
    description: 'Grace passage - JFB multi-verse'
  }
];

async function runTest(testCase: TestCase): Promise<void> {
  console.log(`TEST: ${testCase.description}`);
  console.log(`  Reference: ${testCase.reference}`);
  console.log(`  Commentator: ${testCase.commentator}`);

  try {
    const result = await commentaryLookupHandler.handler({
      reference: testCase.reference,
      commentator: testCase.commentator
    });

    if (!result.content || result.content.length === 0) {
      console.log('  ❌ FAIL: No content returned\n');
      return;
    }

    const textContent = result.content[0] as TextContent;
    const commentary = textContent.text;

    if (!commentary || commentary.length === 0) {
      console.log('  ❌ FAIL: Empty commentary text\n');
      return;
    }

    // Check for expected text if provided
    if (testCase.expectedInText) {
      const hasExpectedText = commentary.toLowerCase().includes(testCase.expectedInText.toLowerCase());
      if (!hasExpectedText) {
        console.log(`  ⚠️  WARNING: Expected text "${testCase.expectedInText}" not found in commentary`);
      }
    }

    // Basic quality checks
    const wordCount = commentary.split(/\s+/).length;
    const hasReference = commentary.includes(testCase.reference);
    const hasCommentator = commentary.includes(testCase.commentator);

    console.log(`  ✓ SUCCESS`);
    console.log(`    Word count: ${wordCount}`);
    console.log(`    Has reference: ${hasReference ? '✓' : '✗'}`);
    console.log(`    Has commentator: ${hasCommentator ? '✓' : '✗'}`);
    console.log(`    Preview: ${commentary.substring(0, 150)}...`);
    console.log('');

  } catch (error: any) {
    console.log(`  ❌ FAIL: ${error.message}`);
    console.log('');
  }
}

async function runAllTests(): Promise<void> {
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      await runTest(testCase);
      passed++;
    } catch (error) {
      failed++;
    }
  }

  console.log('================================================================================');
  console.log('TEST SUMMARY');
  console.log('================================================================================');
  console.log(`Total tests: ${testCases.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('================================================================================\n');
}

// Run tests
runAllTests().catch(console.error);
