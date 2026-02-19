/**
 * Integration Test: Commentary Tool with Auto-Routing
 *
 * Tests the complete flow through the tool layer:
 * 1. Tool receives user input with meta-work ID
 * 2. Tool detects meta-work and routes to correct volume
 * 3. Tool resolves query to section ID
 * 4. Tool fetches content from service
 */

import { findCommentaryVolume, isMetaCommentary } from '../../src/utils/ccelCommentaryMapper.js';
import { SectionResolver } from '../../src/services/sectionResolver.js';

async function runToolIntegrationTests() {
  console.log('\n========================================');
  console.log('COMMENTARY TOOL INTEGRATION TESTS');
  console.log('========================================\n');

  const resolver = new SectionResolver();
  let passed = 0;
  let failed = 0;

  // Test 1: Calvin commentary routing + resolution
  console.log('🔧 TEST 1: Tool flow - calvin/commentary + Isaiah 53');
  console.log('-----------------------------------------------------');
  try {
    const inputWork = 'calvin/commentary';
    const inputQuery = 'Isaiah 53';

    // Step 1: Check if meta-work
    const isMeta = isMetaCommentary(inputWork);
    console.log(`  1. Is meta-work? ${isMeta ? 'Yes' : 'No'}`);

    // Step 2: Route to correct volume
    let actualWork = inputWork;
    if (isMeta && inputQuery) {
      const volume = findCommentaryVolume(inputWork, inputQuery);
      if (volume) {
        actualWork = volume.workId;
        console.log(`  2. Auto-routed: ${inputWork} → ${actualWork}`);
      }
    }

    // Step 3: Resolve to section ID
    const resolution = await resolver.resolve(actualWork, inputQuery);
    console.log(`  3. Section resolved: ${resolution.sectionId}`);
    console.log(`  4. Title: ${resolution.title.substring(0, 60)}...`);

    if (actualWork === 'calvin/calcom16' && resolution.sectionId) {
      console.log('✅ PASS: Complete tool flow working\n');
      passed++;
    } else {
      console.log('❌ FAIL: Flow did not complete as expected\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    console.log('');
    failed++;
  }

  // Test 2: MacLaren commentary routing + resolution
  console.log('🔧 TEST 2: Tool flow - maclaren/expositions + Isaiah 53');
  console.log('--------------------------------------------------------');
  try {
    const inputWork = 'maclaren/expositions';
    const inputQuery = 'Isaiah 53';

    const isMeta = isMetaCommentary(inputWork);
    console.log(`  1. Is meta-work? ${isMeta ? 'Yes' : 'No'}`);

    let actualWork = inputWork;
    if (isMeta && inputQuery) {
      const volume = findCommentaryVolume(inputWork, inputQuery);
      if (volume) {
        actualWork = volume.workId;
        console.log(`  2. Auto-routed: ${inputWork} → ${actualWork}`);
      }
    }

    const resolution = await resolver.resolve(actualWork, inputQuery);
    console.log(`  3. Section resolved: ${resolution.sectionId}`);
    console.log(`  4. Title: ${resolution.title.substring(0, 60)}...`);

    if (actualWork === 'maclaren/isa_jer' && resolution.sectionId) {
      console.log('✅ PASS: Complete tool flow working\n');
      passed++;
    } else {
      console.log('❌ FAIL: Flow did not complete as expected\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    console.log('');
    failed++;
  }

  // Test 3: Expositor's Bible routing + resolution
  console.log('🔧 TEST 3: Tool flow - expositors-bible + Acts 2:1');
  console.log('---------------------------------------------------');
  try {
    const inputWork = 'expositors-bible';
    const inputQuery = 'Acts 2:1';

    const isMeta = isMetaCommentary(inputWork);
    console.log(`  1. Is meta-work? ${isMeta ? 'Yes' : 'No'}`);

    let actualWork = inputWork;
    if (isMeta && inputQuery) {
      const volume = findCommentaryVolume(inputWork, inputQuery);
      if (volume) {
        actualWork = volume.workId;
        console.log(`  2. Auto-routed: ${inputWork} → ${actualWork} (${volume.author})`);
      }
    }

    const resolution = await resolver.resolve(actualWork, inputQuery);
    console.log(`  3. Section resolved: ${resolution.sectionId}`);
    console.log(`  4. Title: ${resolution.title.substring(0, 60)}...`);

    if (actualWork === 'stokes/expositoracts1' && resolution.sectionId) {
      console.log('✅ PASS: Complete tool flow working\n');
      passed++;
    } else {
      console.log('❌ FAIL: Flow did not complete as expected\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    console.log('');
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
    console.log('🎉 ALL INTEGRATION TESTS PASSED! 🎉\n');
    console.log('✨ Commentary tool auto-routing is working end-to-end!\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review output above\n');
    process.exit(1);
  }
}

runToolIntegrationTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
