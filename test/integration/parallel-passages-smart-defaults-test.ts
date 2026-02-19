/**
 * Test smart default behavior for includeText parameter
 * Long passages (>5 verses) should default to metadata-only
 * Short passages (≤5 verses) should default to including text
 */

import { ParallelPassageService } from '../../src/services/parallelPassageService.js';

console.log('Testing Smart Default Behavior for includeText\n');
console.log('='.repeat(60));

const service = new ParallelPassageService();

// Test 1: Long passage (9 verses) - should default to metadata-only
console.log('\nTest 1: Long passage (Matthew 14:13-21 = 9 verses)');
console.log('Expected: includeText defaults to FALSE (metadata-only)');

const longPassageResult = await service.findParallels({
  reference: 'Matthew 14:13-21',
  mode: 'synoptic',
  useCrossReferences: false
  // includeText NOT specified - should default to false
});

if (!longPassageResult.primary.text) {
  console.log('✓ PASS: Long passage defaulted to metadata-only (no text)');
} else {
  console.log('✗ FAIL: Long passage included text when it should not');
}

if (longPassageResult.suggestedWorkflow) {
  console.log('✓ PASS: Suggested workflow included');
} else {
  console.log('✗ FAIL: No suggested workflow for metadata-only response');
}

// Test 2: Short passage (1 verse) - should default to including text
console.log('\nTest 2: Short passage (Isaiah 53:5 = 1 verse)');
console.log('Expected: includeText defaults to TRUE (includes text)');

const shortPassageResult = await service.findParallels({
  reference: 'Isaiah 53:5',
  mode: 'quotation',
  useCrossReferences: false
  // includeText NOT specified - should default to true
});

if (shortPassageResult.primary.text) {
  console.log('✓ PASS: Short passage included text by default');
} else {
  console.log('✗ FAIL: Short passage did not include text');
}

// Test 3: Medium passage (3 verses) - should include text (≤5 verses)
console.log('\nTest 3: Medium passage (Genesis 1:1-3 = 3 verses)');
console.log('Expected: includeText defaults to TRUE (≤5 verses)');

const mediumPassageResult = await service.findParallels({
  reference: 'Genesis 1:1-3',
  useCrossReferences: false
  // includeText NOT specified - should default to true (≤5 verses)
});

if (mediumPassageResult.primary.text) {
  console.log('✓ PASS: Medium passage (3 verses) included text');
} else {
  console.log('✗ FAIL: Medium passage did not include text');
}

// Test 4: Exactly 5 verses - boundary test
console.log('\nTest 4: Boundary test (5 verses exactly)');
console.log('Expected: includeText defaults to TRUE (≤5 verses)');

const boundaryResult = await service.findParallels({
  reference: 'John 3:16-20',
  useCrossReferences: false
  // includeText NOT specified - should default to true (5 verses)
});

if (boundaryResult.primary.text) {
  console.log('✓ PASS: 5-verse passage included text (boundary)');
} else {
  console.log('✗ FAIL: 5-verse passage did not include text');
}

// Test 5: Exactly 6 verses - should be metadata-only
console.log('\nTest 5: Boundary test (6 verses = over threshold)');
console.log('Expected: includeText defaults to FALSE (>5 verses)');

const overBoundaryResult = await service.findParallels({
  reference: 'John 3:16-21',
  useCrossReferences: false
  // includeText NOT specified - should default to false (6 verses)
});

if (!overBoundaryResult.primary.text) {
  console.log('✓ PASS: 6-verse passage defaulted to metadata-only');
} else {
  console.log('✗ FAIL: 6-verse passage included text when threshold is 5');
}

// Test 6: Explicit override - force text for long passage
console.log('\nTest 6: Explicit override (long passage with includeText=true)');
console.log('Expected: includeText=true overrides smart default');

const explicitOverrideResult = await service.findParallels({
  reference: 'Matthew 14:13-21',
  mode: 'synoptic',
  includeText: true,  // Explicitly request text even though it's long
  useCrossReferences: false
});

if (explicitOverrideResult.primary.text) {
  console.log('✓ PASS: Explicit includeText=true worked for long passage');
} else {
  console.log('✗ FAIL: Explicit includeText=true did not work');
}

console.log('\n' + '='.repeat(60));
console.log('Smart Defaults Test Complete!\n');
console.log('Summary:');
console.log('• Long passages (>5 verses): metadata-only by default');
console.log('• Short passages (≤5 verses): includes text by default');
console.log('• Explicit includeText parameter always overrides smart default');
console.log('\nThis makes responses more manageable for long parallel passages!');
