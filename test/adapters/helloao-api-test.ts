/**
 * HelloAO API Adapter Tests
 *
 * Tests the HelloAO Bible API adapter functionality
 */

import { HelloAOApiAdapter } from '../../src/adapters/helloaoApi.js';

console.log('='.repeat(80));
console.log('HELLOAO API ADAPTER TESTS');
console.log('='.repeat(80));
console.log();

const adapter = new HelloAOApiAdapter();

// Test 1: Get Available Translations
console.log('TEST 1: Get Available Translations');
console.log('-'.repeat(80));
try {
  const result = await adapter.getAvailableTranslations();
  console.log(`✓ Successfully fetched translations`);
  console.log(`  Total translations: ${result.translations.length}`);
  console.log(`  Sample translations:`);

  // Show first 5 translations
  for (let i = 0; i < Math.min(5, result.translations.length); i++) {
    const t = result.translations[i];
    console.log(`    - ${t.id}: ${t.name} (${t.language})`);
  }

  // Find specific ones we're interested in
  const web = result.translations.find(t => t.id === 'WEB');
  const bsb = result.translations.find(t => t.id === 'BSB');

  if (web) console.log(`  ✓ WEB (World English Bible) available`);
  if (bsb) console.log(`  ✓ BSB (Berean Standard Bible) available`);

  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 2: Get Available Commentaries
console.log('TEST 2: Get Available Commentaries');
console.log('-'.repeat(80));
try {
  const result = await adapter.getAvailableCommentaries();
  console.log(`✓ Successfully fetched commentaries`);
  console.log(`  Total commentaries: ${result.commentaries.length}`);
  console.log(`  Available commentaries:`);

  for (const c of result.commentaries) {
    console.log(`    - ${c.id}: ${c.name}`);
  }

  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 3: Get Translation Chapter (BSB - John 3)
console.log('TEST 3: Get Translation Chapter (BSB - John 3)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getTranslationChapter('BSB', 'John', 3);
  console.log(`✓ Successfully fetched John 3 from BSB`);
  console.log(`  Translation: ${result.translation.name}`);
  console.log(`  Book: ${result.book.name}`);
  console.log(`  Number of verses: ${result.numberOfVerses}`);

  // Extract John 3:16
  const verse16 = HelloAOApiAdapter.getVerseFromChapter(result, 16);
  if (verse16) {
    const text = HelloAOApiAdapter.extractVerseText(verse16.content);
    console.log(`  John 3:16 text: "${text.substring(0, 100)}..."`);
  }

  // Check for footnotes
  const footnotes = HelloAOApiAdapter.getFootnotesForVerse(result, 16);
  console.log(`  Footnotes for verse 16: ${footnotes.length}`);

  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 4: Get Commentary Chapter (Matthew Henry - John 3)
console.log('TEST 4: Get Commentary Chapter (Matthew Henry - John 3)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getCommentaryChapter('matthew-henry', 'JHN', 3);
  console.log(`✓ Successfully fetched Matthew Henry commentary on John 3`);
  console.log(`  Commentary: ${result.commentary.name}`);
  console.log(`  Book: ${result.book.name}`);
  console.log(`  Chapter: ${result.chapter.number}`);
  console.log(`  Verse entries: ${result.chapter.content.length}`);

  // Extract commentary for verse 16
  const verse16Commentary = HelloAOApiAdapter.getCommentaryForVerse(result, 16);
  if (verse16Commentary) {
    console.log(`  Verse 16 commentary preview: "${verse16Commentary.substring(0, 150)}..."`);
  } else {
    console.log(`  ⚠️ No specific commentary found for verse 16 (may be combined with other verses)`);
  }

  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 5: Test JFB Commentary
console.log('TEST 5: Get JFB Commentary (John 3)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getCommentaryChapter('jamieson-fausset-brown', 'JHN', 3);
  console.log(`✓ Successfully fetched JFB commentary on John 3`);
  console.log(`  Commentary: ${result.commentary.name}`);
  console.log(`  Book: ${result.book.name}`);
  console.log(`  Verse entries: ${result.chapter.content.length}`);

  const verse16Commentary = HelloAOApiAdapter.getCommentaryForVerse(result, 16);
  if (verse16Commentary) {
    console.log(`  Verse 16 commentary preview: "${verse16Commentary.substring(0, 150)}..."`);
  }

  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Test 6: Test Adam Clarke Commentary
console.log('TEST 6: Get Adam Clarke Commentary (Genesis 1)');
console.log('-'.repeat(80));
try {
  const result = await adapter.getCommentaryChapter('adam-clarke', 'GEN', 1);
  console.log(`✓ Successfully fetched Adam Clarke commentary on Genesis 1`);
  console.log(`  Commentary: ${result.commentary.name}`);
  console.log(`  Book: ${result.book.name}`);
  console.log(`  Verse entries: ${result.chapter.content.length}`);

  const verse1Commentary = HelloAOApiAdapter.getCommentaryForVerse(result, 1);
  if (verse1Commentary) {
    console.log(`  Verse 1 commentary preview: "${verse1Commentary.substring(0, 150)}..."`);
  }

  console.log();
} catch (error) {
  console.log(`✗ FAILED: ${error instanceof Error ? error.message : error}`);
  console.log();
}

// Summary
console.log('='.repeat(80));
console.log('HELLOAO API ADAPTER TESTS COMPLETE');
console.log('='.repeat(80));
console.log('All tests completed. Check output above for results.');
console.log();
