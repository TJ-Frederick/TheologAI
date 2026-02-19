/**
 * Integration Test for Commentary Volume Auto-Routing
 *
 * Tests the system's ability to automatically route Bible verse queries
 * to the correct commentary volume across different commentary sets:
 * - Single-author sets (Calvin, MacLaren)
 * - Multi-author sets (Expositor's Bible)
 * - Generic work IDs (calvin, expositors-bible)
 * - Invalid work IDs → helpful suggestions
 */

import { CCELService } from '../../src/services/ccelService.js';
import { findCommentaryVolume, isMetaCommentary } from '../../src/utils/ccelCommentaryMapper.js';

async function runTests() {
  console.log('\n========================================');
  console.log('COMMENTARY VOLUME AUTO-ROUTING - TEST SUITE');
  console.log('========================================\n');

  const service = new CCELService();
  let passed = 0;
  let failed = 0;

  // Test 1: Calvin's commentaries - Isaiah 53
  console.log('📖 TEST 1: Calvin + Isaiah 53 → calcom16');
  console.log('------------------------------------------');
  try {
    // User queries with generic "calvin/commentary" or just "calvin"
    const volume = findCommentaryVolume('calvin', 'Isaiah 53');

    if (volume && volume.workId === 'calvin/calcom16') {
      console.log('✅ PASS: Routed to correct volume');
      console.log(`   Volume: ${volume.workId}`);
      console.log(`   Title: ${volume.title}`);
      passed++;
    } else {
      console.log('❌ FAIL: Wrong volume returned');
      console.log(`   Expected: calvin/calcom16`);
      console.log(`   Got: ${volume?.workId || 'null'}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 2: MacLaren's expositions - Isaiah 53
  console.log('📖 TEST 2: MacLaren + Isaiah 53 → isa_jer');
  console.log('------------------------------------------');
  try {
    const volume = findCommentaryVolume('maclaren', 'Isaiah 53');

    if (volume && volume.workId === 'maclaren/isa_jer') {
      console.log('✅ PASS: Routed to correct volume');
      console.log(`   Volume: ${volume.workId}`);
      console.log(`   Title: ${volume.title}`);
      passed++;
    } else {
      console.log('❌ FAIL: Wrong volume returned');
      console.log(`   Expected: maclaren/isa_jer`);
      console.log(`   Got: ${volume?.workId || 'null'}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 3: Expositor's Bible - Isaiah 53 (multi-author set)
  console.log('📖 TEST 3: Expositor\'s Bible + Isaiah 53 → George Adam Smith');
  console.log('--------------------------------------------------------------');
  try {
    const volume = findCommentaryVolume('expositors-bible', 'Isaiah 53');

    // Isaiah in Expositor's Bible was written by George Adam Smith
    if (volume && volume.author.includes('Smith')) {
      console.log('✅ PASS: Routed to correct author\'s volume');
      console.log(`   Volume: ${volume.workId}`);
      console.log(`   Author: ${volume.author}`);
      console.log(`   Title: ${volume.title}`);
      passed++;
    } else {
      console.log('❌ FAIL: Wrong volume returned');
      console.log(`   Expected: George Adam Smith\'s Isaiah`);
      console.log(`   Got: ${volume?.workId || 'null'}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 4: Meta-commentary detection
  console.log('🔍 TEST 4: Meta-commentary detection');
  console.log('-------------------------------------');
  try {
    const isCalvinMeta = isMetaCommentary('calvin/commentaries');
    const isMacLarenMeta = isMetaCommentary('maclaren/expositions');
    const isExpositorMeta = isMetaCommentary('expositors-bible');
    const isRealWork = isMetaCommentary('calvin/calcom16');

    if (isCalvinMeta && isMacLarenMeta && isExpositorMeta && !isRealWork) {
      console.log('✅ PASS: Meta-commentary detection working');
      console.log('   calvin/commentaries: meta-work ✓');
      console.log('   maclaren/expositions: meta-work ✓');
      console.log('   expositors-bible: meta-work ✓');
      console.log('   calvin/calcom16: real work ✓');
      passed++;
    } else {
      console.log('❌ FAIL: Meta-commentary detection incorrect');
      console.log(`   calvin/commentaries: ${isCalvinMeta}`);
      console.log(`   maclaren/expositions: ${isMacLarenMeta}`);
      console.log(`   expositors-bible: ${isExpositorMeta}`);
      console.log(`   calvin/calcom16: ${isRealWork}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 5: Calvin Genesis (first volume)
  console.log('📖 TEST 5: Calvin + Genesis 1:1 → calcom01');
  console.log('-------------------------------------------');
  try {
    const volume = findCommentaryVolume('calvin', 'Genesis 1:1');

    if (volume && volume.workId === 'calvin/calcom01') {
      console.log('✅ PASS: Routed to Genesis Volume 1');
      console.log(`   Volume: ${volume.workId}`);
      passed++;
    } else {
      console.log('❌ FAIL: Wrong volume returned');
      console.log(`   Expected: calvin/calcom01`);
      console.log(`   Got: ${volume?.workId || 'null'}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 6: MacLaren Psalms (should work for both his Expositions and Expositor's Bible)
  console.log('📖 TEST 6: MacLaren + Psalms 23 → Multiple matches');
  console.log('---------------------------------------------------');
  try {
    const volume = findCommentaryVolume('maclaren', 'Psalms 23');

    // MacLaren wrote both standalone Psalms expositions AND Expositor's Bible Psalms
    if (volume && volume.books.some(b => b.toLowerCase().includes('psalm'))) {
      console.log('✅ PASS: Found MacLaren Psalms commentary');
      console.log(`   Volume: ${volume.workId}`);
      console.log(`   Books: ${volume.books.join(', ')}`);
      passed++;
    } else {
      console.log('❌ FAIL: Did not find Psalms commentary');
      console.log(`   Got: ${volume?.workId || 'null'}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 7: Book not covered by commentator
  console.log('❌ TEST 7: Calvin + Revelation (not covered)');
  console.log('---------------------------------------------');
  try {
    const volume = findCommentaryVolume('calvin', 'Revelation 1:1');

    if (volume === null) {
      console.log('✅ PASS: Correctly returned null for uncovered book');
      passed++;
    } else {
      console.log('❌ FAIL: Should return null for Revelation');
      console.log(`   Got: ${volume.workId}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

  // Test 8: Expositor's Bible - Acts (G. T. Stokes)
  console.log('📖 TEST 8: Expositor\'s Bible + Acts 2:1');
  console.log('-----------------------------------------');
  try {
    const volume = findCommentaryVolume('expositors-bible', 'Acts 2:1');

    if (volume && volume.author.includes('Stokes')) {
      console.log('✅ PASS: Routed to G. T. Stokes\' Acts');
      console.log(`   Volume: ${volume.workId}`);
      console.log(`   Author: ${volume.author}`);
      passed++;
    } else {
      console.log('❌ FAIL: Wrong volume returned');
      console.log(`   Expected: G. T. Stokes (Acts)`);
      console.log(`   Got: ${volume?.workId || 'null'}`);
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL: Error occurred:', error instanceof Error ? error.message : error);
    failed++;
  }
  console.log('');

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
    console.log('🎉 ALL TESTS PASSED! 🎉\n');
    console.log('✨ Commentary volume auto-routing is working correctly!\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review output above\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
