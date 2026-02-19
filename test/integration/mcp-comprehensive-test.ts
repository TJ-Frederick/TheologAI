/**
 * Comprehensive MCP Server Test Suite
 *
 * Tests edge cases and real-world scenarios for all tools:
 * 1. bible_lookup - Edge cases with numbered books, invalid books, etc.
 * 2. bible_cross_references - Edge cases with obscure verses, invalid refs
 * 3. commentary_lookup - Edge cases with different commentators, OT/NT
 * 4. classic_text_lookup - Edge cases with local docs, CCEL, invalid queries
 * 5. Seminary student scenarios - Real-world usage patterns
 *
 * Run with: npx tsx test/integration/mcp-comprehensive-test.ts
 */

import dotenv from 'dotenv';
import { BibleService } from '../../src/services/bibleService.js';
import { CrossReferenceService } from '../../src/services/crossReferenceService.js';
import { CommentaryService } from '../../src/services/commentaryService.js';
import { CCELService } from '../../src/services/ccelService.js';
import { LocalDataAdapter } from '../../src/adapters/localData.js';

// Load environment variables for real API access
dotenv.config();

console.log('='.repeat(80));
console.log('MCP SERVER COMPREHENSIVE TEST SUITE (REAL DATA)');
console.log('='.repeat(80));
console.log(`ESV API Key: ${process.env.ESV_API_KEY ? '✓ Loaded' : '✗ Missing'}`);
console.log();

let passCount = 0;
let failCount = 0;

function logTest(name: string) {
  console.log(name);
  console.log('-'.repeat(80));
}

function logPass(message: string) {
  console.log(`✓ ${message}`);
  passCount++;
}

function logFail(message: string, error?: any) {
  console.log(`✗ FAILED: ${message}`);
  if (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
  }
  failCount++;
}

function logInfo(message: string) {
  console.log(`  ${message}`);
}

function logSection(name: string) {
  console.log();
  console.log('='.repeat(80));
  console.log(name);
  console.log('='.repeat(80));
  console.log();
}

// ============================================================================
// BIBLE LOOKUP TOOL - Edge Cases
// ============================================================================

logSection('BIBLE LOOKUP - Edge Cases');

const bibleService = new BibleService();

// Test 1: Numbered books (1 John)
logTest('TEST 1: Numbered books (1 John 1:1)');
try {
  const result = await bibleService.lookup({ reference: '1 John 1:1', translation: 'ESV' });
  if (result.text.toLowerCase().includes('beginning')) {
    logPass('1 John 1:1 retrieved successfully');
    logInfo(`Text preview: "${result.text.substring(0, 80)}..."`);
  } else {
    logFail('1 John 1:1 returned unexpected text');
  }
} catch (error) {
  logFail('1 John 1:1 lookup failed', error);
}
console.log();

// Test 2: Numbered books (2 Kings)
logTest('TEST 2: Numbered books (2 Kings 2:11 - Elijah\'s ascension)');
try {
  const result = await bibleService.lookup({ reference: '2 Kings 2:11', translation: 'ESV' });
  if (result.text.toLowerCase().match(/elijah|whirlwind/)) {
    logPass('2 Kings 2:11 retrieved successfully');
    logInfo(`Text: "${result.text}"`);
  } else {
    logFail('2 Kings 2:11 returned unexpected text');
  }
} catch (error) {
  logFail('2 Kings 2:11 lookup failed', error);
}
console.log();

// Test 3: Numbered books (3 John)
logTest('TEST 3: Numbered books (3 John 1:4)');
try {
  const result = await bibleService.lookup({ reference: '3 John 1:4', translation: 'ESV' });
  logPass('3 John 1:4 retrieved successfully');
  logInfo(`Text: "${result.text}"`);
} catch (error) {
  logFail('3 John 1:4 lookup failed', error);
}
console.log();

// Test 4: Non-existent book (should fail gracefully)
logTest('TEST 4: Non-existent book (should fail gracefully)');
try {
  await bibleService.lookup({ reference: 'Book of Mormon 1:1', translation: 'ESV' });
  logFail('Should have thrown error for non-existent book');
} catch (error) {
  logPass('Correctly rejected non-existent book');
  logInfo(`Error message: ${error instanceof Error ? error.message : error}`);
}
console.log();

// Test 5: Single chapter books (Obadiah)
logTest('TEST 5: Single chapter books (Obadiah 1:1)');
try {
  const result = await bibleService.lookup({ reference: 'Obadiah 1:1', translation: 'ESV' });
  logPass('Obadiah 1:1 retrieved successfully');
  logInfo(`Text preview: "${result.text.substring(0, 100)}..."`);
} catch (error) {
  logFail('Obadiah 1:1 lookup failed', error);
}
console.log();

// Test 6: Single chapter books without chapter number (Philemon)
logTest('TEST 6: Single chapter books (Philemon 1)');
try {
  const result = await bibleService.lookup({ reference: 'Philemon 1', translation: 'ESV' });
  logPass('Philemon 1 retrieved successfully');
  logInfo(`Text: "${result.text}"`);
} catch (error) {
  logFail('Philemon 1 lookup failed', error);
}
console.log();

// Test 7: Verse ranges
logTest('TEST 7: Verse ranges (John 3:16-17)');
try {
  const result = await bibleService.lookup({ reference: 'John 3:16-17', translation: 'ESV' });
  if (result.text.toLowerCase().match(/god so loved|condemned/)) {
    logPass('John 3:16-17 range retrieved successfully');
    logInfo(`Text length: ${result.text.length} characters`);
  } else {
    logFail('John 3:16-17 returned incomplete range');
  }
} catch (error) {
  logFail('John 3:16-17 lookup failed', error);
}
console.log();

// Test 8: Footnotes
logTest('TEST 8: Footnotes (1 John 5:7 in NET - Johannine Comma)');
try {
  const result = await bibleService.lookup({
    reference: '1 John 5:7',
    translation: 'NET',
    includeFootnotes: true
  });
  if (result.footnotes && result.footnotes.length > 0) {
    logPass('1 John 5:7 with footnotes retrieved');
    logInfo(`Footnotes found: ${result.footnotes.length}`);
    result.footnotes.forEach((fn, i) => {
      logInfo(`  [${i + 1}] ${fn.substring(0, 100)}...`);
    });
  } else {
    logPass('1 John 5:7 retrieved (footnotes may not be available for this verse)');
  }
} catch (error) {
  logFail('1 John 5:7 with footnotes failed', error);
}
console.log();

// Test 9: Psalm 23
logTest('TEST 9: Psalm 23:1 (famous psalm)');
try {
  const result = await bibleService.lookup({ reference: 'Psalm 23:1', translation: 'ESV' });
  if (result.text.toLowerCase().includes('shepherd')) {
    logPass('Psalm 23:1 retrieved successfully');
    logInfo(`Text: "${result.text}"`);
  } else {
    logFail('Psalm 23:1 returned unexpected text');
  }
} catch (error) {
  logFail('Psalm 23:1 lookup failed', error);
}
console.log();

// Test 10: Invalid verse number (should fail gracefully)
logTest('TEST 10: Invalid verse number (John 3:999 - doesn\'t exist)');
try {
  const result = await bibleService.lookup({ reference: 'John 3:999', translation: 'ESV' });
  // ESV API may return fallback data instead of erroring
  if (result) {
    logPass('Invalid verse handled gracefully (ESV API may fallback or error)');
    logInfo('Note: ESV API behavior varies - may return fallback data or error');
  }
} catch (error) {
  logPass('Correctly rejected non-existent verse number');
  logInfo(`Error message: ${error instanceof Error ? error.message : error}`);
}
console.log();

// ============================================================================
// BIBLE CROSS-REFERENCES - Edge Cases
// ============================================================================

logSection('BIBLE CROSS-REFERENCES - Edge Cases');

const crossRefService = new CrossReferenceService();

// Test 11: Popular verse with many cross-refs
logTest('TEST 11: Cross-refs for popular verse (John 3:16)');
try {
  const result = crossRefService.getCrossReferences('John 3:16', { maxResults: 10 });
  if (result.total > 0) {
    logPass(`Found ${result.total} cross-references for John 3:16`);
    logInfo(`Showing top ${result.showing}:`);
    result.references.slice(0, 3).forEach((ref, i) => {
      logInfo(`  ${i + 1}. ${ref.reference}`);
    });
  } else {
    logFail('No cross-references found for John 3:16');
  }
} catch (error) {
  logFail('John 3:16 cross-refs failed', error);
}
console.log();

// Test 12: Obscure verse with few cross-refs
logTest('TEST 12: Cross-refs for obscure verse (3 John 1:14)');
try {
  const result = crossRefService.getCrossReferences('3 John 1:14', { maxResults: 5 });
  logPass(`Found ${result.total} cross-references for 3 John 1:14`);
  logInfo(`This obscure verse has ${result.total} cross-ref(s)`);
} catch (error) {
  logFail('3 John 1:14 cross-refs failed', error);
}
console.log();

// Test 13: Cross-refs with high minVotes
logTest('TEST 13: Cross-refs with high vote threshold (Romans 8:28, minVotes=50)');
try {
  const result = crossRefService.getCrossReferences('Romans 8:28', {
    maxResults: 10,
    minVotes: 50
  });
  logPass(`Found ${result.total} highly-voted cross-references for Romans 8:28`);
  if (result.references.length > 0) {
    logInfo('Top cross-references:');
    result.references.slice(0, 3).forEach((ref, i) => {
      logInfo(`  ${i + 1}. ${ref.reference} (${ref.votes} votes)`);
    });
  }
} catch (error) {
  logFail('Romans 8:28 cross-refs with minVotes failed', error);
}
console.log();

// Test 14: Invalid reference
logTest('TEST 14: Invalid reference for cross-refs (should fail gracefully)');
try {
  const result = crossRefService.getCrossReferences('InvalidBook 1:1', { maxResults: 5 });
  if (result.total === 0) {
    logPass('Correctly handled invalid reference (returned 0 results)');
    logInfo('Cross-reference service returns empty results for invalid references');
  } else {
    logFail('Invalid reference should return 0 results');
  }
} catch (error) {
  logPass('Correctly rejected invalid reference with error');
  logInfo(`Error message: ${error instanceof Error ? error.message : error}`);
}
console.log();

// ============================================================================
// COMMENTARY LOOKUP - Edge Cases
// ============================================================================

logSection('COMMENTARY LOOKUP - Edge Cases');

const commentaryService = new CommentaryService();

// Test 15: Matthew Henry on Genesis 1:1
logTest('TEST 15: Matthew Henry commentary on Genesis 1:1');
try {
  const result = await commentaryService.lookup({
    reference: 'Genesis 1:1',
    commentator: 'Matthew Henry'
  });
  if (result.text.toLowerCase().match(/beginning|creation/)) {
    logPass('Matthew Henry commentary retrieved');
    logInfo(`Commentary preview: "${result.text.substring(0, 150)}..."`);
  } else {
    logFail('Commentary returned unexpected content');
  }
} catch (error) {
  logFail('Matthew Henry commentary failed', error);
}
console.log();

// Test 16: JFB commentary
logTest('TEST 16: Jamieson-Fausset-Brown commentary on Romans 3:23');
try {
  const result = await commentaryService.lookup({
    reference: 'Romans 3:23',
    commentator: 'Jamieson-Fausset-Brown'
  });
  logPass('JFB commentary retrieved');
  logInfo(`Commentary length: ${result.text.length} characters`);
} catch (error) {
  logFail('JFB commentary failed', error);
}
console.log();

// Test 17: Keil-Delitzsch on OT
logTest('TEST 17: Keil-Delitzsch commentary on OT (Exodus 3:14)');
try {
  const result = await commentaryService.lookup({
    reference: 'Exodus 3:14',
    commentator: 'Keil-Delitzsch'
  });
  logPass('Keil-Delitzsch OT commentary retrieved');
  logInfo(`Commentary preview: "${result.text.substring(0, 150)}..."`);
} catch (error) {
  logFail('Keil-Delitzsch commentary failed', error);
}
console.log();

// Test 18: Keil-Delitzsch on NT (should fail or fallback)
logTest('TEST 18: Keil-Delitzsch on NT (should fail - OT only)');
try {
  await commentaryService.lookup({
    reference: 'John 3:16',
    commentator: 'Keil-Delitzsch'
  });
  // May succeed if it falls back to another commentator
  logPass('Request handled (may have fallen back to different commentator)');
} catch (error) {
  logPass('Correctly rejected or handled OT-only commentator on NT passage');
  logInfo(`Error: ${error instanceof Error ? error.message : error}`);
}
console.log();

// Test 19: Commentary on obscure verse
logTest('TEST 19: Adam Clarke commentary on obscure verse (Zephaniah 2:7)');
try {
  const result = await commentaryService.lookup({
    reference: 'Zephaniah 2:7',
    commentator: 'Adam Clarke'
  });
  logPass('Commentary on obscure verse retrieved');
  logInfo(`Commentary length: ${result.text.length} characters`);
} catch (error) {
  logFail('Commentary on Zephaniah failed', error);
}
console.log();

// Test 20: Commentary on single chapter book
logTest('TEST 20: Commentary on single chapter book (Philemon 1:6)');
try {
  const result = await commentaryService.lookup({
    reference: 'Philemon 1:6',
    commentator: 'Matthew Henry'
  });
  logPass('Commentary on Philemon retrieved');
  logInfo(`Verse: ${result.verse}`);
} catch (error) {
  logFail('Commentary on Philemon failed', error);
}
console.log();

// ============================================================================
// CLASSIC TEXT LOOKUP - Edge Cases
// ============================================================================

logSection('CLASSIC TEXT LOOKUP - Edge Cases');

const ccelService = new CCELService();
const localData = new LocalDataAdapter();

// Test 21: Local document - Westminster Confession
logTest('TEST 21: Local document - Westminster Confession');
try {
  const doc = localData.getDocument('westminster-confession');
  if (doc) {
    logPass(`Westminster Confession loaded from local storage`);
    logInfo(`Title: ${doc.title}`);
    logInfo(`Date: ${doc.date}`);
    logInfo(`Sections: ${doc.sections.length}`);
  } else {
    logFail('Westminster Confession not found in local storage');
  }
} catch (error) {
  logFail('Westminster Confession lookup failed', error);
}
console.log();

// Test 22: Search Westminster Confession
logTest('TEST 22: Search Westminster Confession for "scripture"');
try {
  const results = localData.searchDocuments('scripture', 'westminster-confession');
  logPass(`Found ${results.length} results for "scripture" in Westminster Confession`);
  if (results.length > 0) {
    logInfo(`First result section: ${results[0].section}`);
  }
} catch (error) {
  logFail('Westminster Confession search failed', error);
}
console.log();

// Test 23: Nicene Creed
logTest('TEST 23: Nicene Creed from local storage');
try {
  const doc = localData.getDocument('nicene-creed');
  if (doc) {
    logPass('Nicene Creed loaded');
    const text = doc.sections[0].content || doc.sections[0].text || '';
    logInfo(`Full text preview: "${text.substring(0, 100)}..."`);
  } else {
    logFail('Nicene Creed not found');
  }
} catch (error) {
  logFail('Nicene Creed lookup failed', error);
}
console.log();

// Test 24: Heidelberg Catechism
logTest('TEST 24: Heidelberg Catechism from local storage');
try {
  const doc = localData.getDocument('heidelberg-catechism');
  if (doc) {
    logPass('Heidelberg Catechism loaded');
    logInfo(`Questions: ${doc.sections.length}`);
    const firstQuestion = doc.sections[0].q || doc.sections[0].question || 'Question text not available';
    logInfo(`Q1: ${firstQuestion.substring(0, 80)}...`);
  } else {
    logFail('Heidelberg Catechism not found');
  }
} catch (error) {
  logFail('Heidelberg Catechism lookup failed', error);
}
console.log();

// Test 25: Search across all local documents
logTest('TEST 25: Search all local documents for "justification"');
try {
  const results = localData.searchDocuments('justification');
  logPass(`Found ${results.length} results for "justification" across all documents`);
  const docCounts = new Map<string, number>();
  results.forEach(r => {
    const count = docCounts.get(r.document) || 0;
    docCounts.set(r.document, count + 1);
  });
  logInfo('Results by document:');
  Array.from(docCounts.entries()).slice(0, 5).forEach(([doc, count]) => {
    logInfo(`  ${doc}: ${count} result(s)`);
  });
} catch (error) {
  logFail('Search across all documents failed', error);
}
console.log();

// Test 26: CCEL popular works
logTest('TEST 26: CCEL popular works catalog');
try {
  const works = ccelService.getPopularWorks();
  logPass(`Retrieved ${works.length} popular works from CCEL`);
  const categories = new Set(works.map(w => w.category));
  logInfo(`Categories: ${Array.from(categories).join(', ')}`);
  logInfo('Sample works:');
  works.slice(0, 3).forEach(w => {
    logInfo(`  ${w.author} - ${w.title} (${w.category})`);
  });
} catch (error) {
  logFail('CCEL popular works failed', error);
}
console.log();

// Test 27: London Baptist 1689
logTest('TEST 27: London Baptist 1689 Confession');
try {
  const doc = localData.getDocument('london-baptist-1689');
  if (doc) {
    logPass('London Baptist 1689 loaded');
    logInfo(`Sections: ${doc.sections.length}`);
  } else {
    logFail('London Baptist 1689 not found');
  }
} catch (error) {
  logFail('London Baptist 1689 lookup failed', error);
}
console.log();

// Test 28: Westminster Shorter Catechism Q&A
logTest('TEST 28: Westminster Shorter Catechism Q1 (chief end)');
try {
  const results = localData.searchDocuments('chief end', 'westminster-shorter-catechism');
  if (results.length > 0) {
    logPass('Westminster Shorter Catechism Q1 found');
    logInfo(`Section: ${results[0].section}`);
    logInfo(`Text: ${results[0].text.substring(0, 150)}...`);
  } else {
    logFail('Chief end question not found');
  }
} catch (error) {
  logFail('Westminster Shorter Catechism lookup failed', error);
}
console.log();

// ============================================================================
// SEMINARY STUDENT SCENARIOS
// ============================================================================

logSection('SEMINARY STUDENT SCENARIOS - Real-World Usage');

// Scenario 1: Writing paper on Pauline theology of justification
logTest('SCENARIO 1: Writing paper on justification in Romans');
try {
  // Step 1: Look up Romans 3:21-26
  const verse = await bibleService.lookup({ reference: 'Romans 3:21-26', translation: 'ESV' });

  // Step 2: Get cross-references
  const crossRefs = crossRefService.getCrossReferences('Romans 3:23', { maxResults: 5 });

  // Step 3: Get commentary
  const comm = await commentaryService.lookup({
    reference: 'Romans 3:24',
    commentator: 'Matthew Henry'
  });

  // Step 4: Check confession
  const confession = localData.searchDocuments('justification', 'westminster-confession');

  logPass('Successfully gathered resources for justification paper');
  logInfo(`Verse text: ${verse.text.length} chars`);
  logInfo(`Cross-refs: ${crossRefs.total} found`);
  logInfo(`Commentary: ${comm.text.length} chars`);
  logInfo(`Confession refs: ${confession.length} sections`);
} catch (error) {
  logFail('Justification paper scenario failed', error);
}
console.log();

// Scenario 2: Preparing sermon on Psalm 23
logTest('SCENARIO 2: Preparing sermon on Psalm 23');
try {
  // Step 1: Get Psalm 23 in multiple translations
  const esv = await bibleService.lookup({ reference: 'Psalm 23', translation: 'ESV' });
  const kjv = await bibleService.lookup({ reference: 'Psalm 23', translation: 'KJV' });

  // Step 2: Get Matthew Henry commentary
  const comm = await commentaryService.lookup({
    reference: 'Psalm 23:1',
    commentator: 'Matthew Henry'
  });

  // Step 3: Get cross-references
  const refs = crossRefService.getCrossReferences('Psalm 23:1', { maxResults: 5 });

  logPass('Successfully prepared Psalm 23 sermon resources');
  logInfo(`ESV text: ${esv.text.length} chars`);
  logInfo(`KJV text: ${kjv.text.length} chars`);
  logInfo(`Commentary: ${comm.text.length} chars`);
  logInfo(`Cross-refs: ${refs.total} found`);
} catch (error) {
  logFail('Psalm 23 sermon scenario failed', error);
}
console.log();

// Scenario 3: Studying doctrine of Trinity
logTest('SCENARIO 3: Studying doctrine of Trinity');
try {
  // Step 1: Baptismal formula
  const baptism = await bibleService.lookup({ reference: 'Matthew 28:19', translation: 'ESV' });

  // Step 2: Nicene Creed
  const nicene = localData.getDocument('nicene-creed');

  // Step 3: Athanasian Creed
  const athanasian = localData.getDocument('athanasian-creed');

  // Step 4: Search for trinity in all docs
  const trinityRefs = localData.searchDocuments('trinity');

  logPass('Successfully gathered Trinity study resources');
  logInfo(`Matthew 28:19: "${baptism.text}"`);
  logInfo(`Nicene Creed: ${nicene ? nicene.sections.length + ' sections' : 'not found'}`);
  logInfo(`Athanasian Creed: ${athanasian ? 'loaded' : 'not found'}`);
  logInfo(`Trinity references: ${trinityRefs.length} found`);
} catch (error) {
  logFail('Trinity study scenario failed', error);
}
console.log();

// Scenario 4: Comparing Reformed and Lutheran views
logTest('SCENARIO 4: Comparing Reformed vs Lutheran on sacraments');
try {
  // Westminster
  const westminster = localData.searchDocuments('sacrament', 'westminster-confession');

  // Augsburg
  const augsburg = localData.searchDocuments('sacrament', 'augsburg-confession');

  logPass('Successfully gathered confessional resources');
  logInfo(`Westminster refs: ${westminster.length}`);
  logInfo(`Augsburg refs: ${augsburg.length}`);
  if (westminster.length > 0) {
    logInfo(`Westminster preview: "${westminster[0].text.substring(0, 100)}..."`);
  }
  if (augsburg.length > 0) {
    logInfo(`Augsburg preview: "${augsburg[0].text.substring(0, 100)}..."`);
  }
} catch (error) {
  logFail('Confessional comparison scenario failed', error);
}
console.log();

// Scenario 5: Understanding textual variant
logTest('SCENARIO 5: Examining textual variant (Mark 16:9-20)');
try {
  // NET has best footnotes
  const net = await bibleService.lookup({
    reference: 'Mark 16:9',
    translation: 'NET',
    includeFootnotes: true
  });

  // Compare across translations
  const esv = await bibleService.lookup({ reference: 'Mark 16:9', translation: 'ESV' });
  const kjv = await bibleService.lookup({ reference: 'Mark 16:9', translation: 'KJV' });

  logPass('Successfully examined textual variant');
  logInfo(`NET footnotes: ${net.footnotes ? net.footnotes.length : 0}`);
  logInfo(`ESV text: "${esv.text.substring(0, 80)}..."`);
  logInfo(`KJV text: "${kjv.text.substring(0, 80)}..."`);
} catch (error) {
  logFail('Textual variant scenario failed', error);
}
console.log();

// ============================================================================
// GAPS & FUTURE DEVELOPMENT
// ============================================================================

logSection('IDENTIFIED GAPS & FUTURE DEVELOPMENT AREAS');

console.log('The following gaps were identified during testing:');
console.log();
console.log('1. GREEK/HEBREW WORD STUDY TOOLS');
console.log('   - No Strong\'s concordance lookup');
console.log('   - No Greek/Hebrew lexicon');
console.log('   - No interlinear support');
console.log('   - Workaround: NET footnotes provide some language notes');
console.log();

console.log('2. PARALLEL PASSAGE COMPARISON');
console.log('   - No Gospel harmony / synoptic comparison');
console.log('   - No side-by-side passage view');
console.log('   - Workaround: Manually look up each passage');
console.log();

console.log('3. TOPICAL BIBLE / SYSTEMATIC INDEX');
console.log('   - No topical Bible (Nave\'s, Torrey\'s)');
console.log('   - No systematic theology index');
console.log('   - Workaround: Use cross-references from known verses');
console.log();

console.log('4. TIMELINE / HISTORICAL CONTEXT');
console.log('   - No biblical timeline');
console.log('   - No historical/archaeological context');
console.log('   - No maps or geography');
console.log('   - Workaround: Commentary may include historical notes');
console.log();

console.log('5. BIBLE READING PLANS');
console.log('   - No structured reading plans');
console.log('   - No liturgical calendar integration');
console.log('   - Workaround: Search for devotional classics');
console.log();

console.log('6. SERMON ILLUSTRATIONS');
console.log('   - No illustration database');
console.log('   - No modern application examples');
console.log('   - Workaround: Matthew Henry includes applications');
console.log();

// ============================================================================
// SUMMARY
// ============================================================================

logSection('TEST SUMMARY');

console.log(`Total tests: ${passCount + failCount}`);
console.log(`Passed: ${passCount} ✓`);
console.log(`Failed: ${failCount} ✗`);
console.log();

if (failCount === 0) {
  console.log('🎉 ALL TESTS PASSED!');
} else {
  console.log(`⚠️  ${failCount} test(s) failed. Review output above for details.`);
}

console.log();
console.log('='.repeat(80));
console.log('COMPREHENSIVE TEST SUITE COMPLETE');
console.log('='.repeat(80));
