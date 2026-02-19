/**
 * Multi-Tool Workflow Test Suite
 *
 * Tests complex multi-tool workflows requiring 4+ tool calls to simulate
 * real-world seminary student and pastor usage patterns.
 *
 * Test Categories:
 * - Love Study (John 21:15-17 agape vs phileo)
 * - Comprehensive Lexicon Studies
 * - Sermon Preparation
 * - Comparative Analysis
 * - Advanced Workflows
 *
 * Run with: npx tsx test/integration/multi-tool-workflows.test.ts
 */

import dotenv from 'dotenv';
import { BibleService } from '../../src/services/bibleService.js';
import { CrossReferenceService } from '../../src/services/crossReferenceService.js';
import { CommentaryService } from '../../src/services/commentaryService.js';
import { LocalDataAdapter } from '../../src/adapters/localData.js';
import { BiblicalLanguagesAdapter } from '../../src/adapters/biblicalLanguagesAdapter.js';
import { ParallelPassageService } from '../../src/services/parallelPassageService.js';

dotenv.config();

console.log('='.repeat(80));
console.log('MULTI-TOOL WORKFLOW TEST SUITE - 12 COMPLEX SCENARIOS');
console.log('='.repeat(80));
console.log(`ESV API Key: ${process.env.ESV_API_KEY ? '✓ Loaded' : '✗ Missing'}`);
console.log();

let passCount = 0;
let failCount = 0;
let toolCallCount = 0;

function logTest(num: number, name: string) {
  console.log();
  console.log('='.repeat(80));
  console.log(`TEST ${num}: ${name}`);
  console.log('='.repeat(80));
}

function logToolCall(name: string, detail?: string) {
  toolCallCount++;
  console.log(`  [Tool ${toolCallCount}] ${name}${detail ? ': ' + detail : ''}`);
}

function logPass(message: string) {
  console.log(`  ✓ ${message}`);
  passCount++;
}

function logFail(message: string, error?: any) {
  console.log(`  ✗ FAILED: ${message}`);
  if (error) {
    console.log(`    Error: ${error instanceof Error ? error.message : error}`);
  }
  failCount++;
}

function logInfo(message: string) {
  console.log(`    ${message}`);
}

function logSection(name: string) {
  console.log();
  console.log('='.repeat(80));
  console.log(name.toUpperCase());
  console.log('='.repeat(80));
  console.log();
}

// Initialize services
const bibleService = new BibleService();
const crossRefService = new CrossReferenceService();
const commentaryService = new CommentaryService();
const localData = new LocalDataAdapter();
const langAdapter = new BiblicalLanguagesAdapter();
const parallelService = new ParallelPassageService();

// ============================================================================
// TEST 108: LOVE STUDY - AGAPE VS PHILEO (John 21:15-17)
// ============================================================================

logSection('LOVE STUDY CONTINUATION');

logTest(108, 'John 21:15-17 - Agape vs Phileo Analysis');
toolCallCount = 0;
try {
  // Tool 1: Get the passage
  logToolCall('bible_lookup', 'John 21:15-17 ESV');
  const passage = await bibleService.lookup({
    reference: 'John 21:15-17',
    translation: 'ESV'
  });

  // Tool 2: Get morphology for verse 15
  logToolCall('bible_verse_morphology', 'John 21:15');
  const verse15Morph = langAdapter.getVerseWithMorphology('John 21:15');

  // Tool 3: Get morphology for verse 16
  logToolCall('bible_verse_morphology', 'John 21:16');
  const verse16Morph = langAdapter.getVerseWithMorphology('John 21:16');

  // Tool 4: Get morphology for verse 17
  logToolCall('bible_verse_morphology', 'John 21:17');
  const verse17Morph = langAdapter.getVerseWithMorphology('John 21:17');

  // Tool 5: Look up G25 (agapao)
  logToolCall('original_language_lookup', 'G25 (agapao)');
  const agapeEntry = langAdapter.enrichStrongsWithStepBible('G25');

  // Tool 6: Look up G5368 (phileo)
  logToolCall('original_language_lookup', 'G5368 (phileo)');
  const phileoEntry = langAdapter.enrichStrongsWithStepBible('G5368');

  if (passage && verse15Morph && verse16Morph && verse17Morph && agapeEntry && phileoEntry) {
    logPass(`Retrieved passage and morphology (${toolCallCount} tool calls)`);
    logInfo(`Passage length: ${passage.text.length} characters`);
    logInfo(`Verse 15 words: ${verse15Morph.words.length}`);
    logInfo(`Verse 16 words: ${verse16Morph.words.length}`);
    logInfo(`Verse 17 words: ${verse17Morph.words.length}`);

    // Find agape and phileo occurrences
    const agapeOccurrences = [
      ...verse15Morph.words.filter(w => w.strong === 'G25'),
      ...verse16Morph.words.filter(w => w.strong === 'G25'),
      ...verse17Morph.words.filter(w => w.strong === 'G25')
    ];

    const phileoOccurrences = [
      ...verse15Morph.words.filter(w => w.strong === 'G5368'),
      ...verse16Morph.words.filter(w => w.strong === 'G5368'),
      ...verse17Morph.words.filter(w => w.strong === 'G5368')
    ];

    logInfo(`Agape (G25) occurrences: ${agapeOccurrences.length}`);
    logInfo(`Phileo (G5368) occurrences: ${phileoOccurrences.length}`);
    logInfo(`Agape definition: ${agapeEntry.definition?.substring(0, 100)}...`);
    logInfo(`Phileo definition: ${phileoEntry.definition?.substring(0, 100)}...`);
  } else {
    logFail('Could not retrieve all components for love study');
  }
} catch (error) {
  logFail('Love study test failed', error);
}

// ============================================================================
// COMPREHENSIVE LEXICON STUDIES
// ============================================================================

logSection('COMPREHENSIVE LEXICON STUDIES');

logTest(109, 'John 3:16 - Multi-Tool Comprehensive Study');
toolCallCount = 0;
try {
  // Tool 1: Get verse in multiple translations
  logToolCall('bible_lookup', 'John 3:16 ESV');
  const esv = await bibleService.lookup({ reference: 'John 3:16', translation: 'ESV' });

  logToolCall('bible_lookup', 'John 3:16 KJV');
  const kjv = await bibleService.lookup({ reference: 'John 3:16', translation: 'KJV' });

  logToolCall('bible_lookup', 'John 3:16 NET');
  const net = await bibleService.lookup({ reference: 'John 3:16', translation: 'NET', includeFootnotes: true });

  // Tool 2: Get morphology
  logToolCall('bible_verse_morphology', 'John 3:16');
  const morph = langAdapter.getVerseWithMorphology('John 3:16');

  // Tool 3: Find 'love' word (agapao G25)
  let loveWord = null;
  if (morph) {
    loveWord = morph.words.find(w => w.gloss?.toLowerCase().includes('loved'));
    if (loveWord) {
      logToolCall('original_language_lookup', `${loveWord.strong} (love)`);
      const loveEntry = langAdapter.enrichStrongsWithStepBible(loveWord.strong);
      logInfo(`Love word: ${loveWord.lemma} (${loveWord.strong})`);
      logInfo(`Definition: ${loveEntry?.definition?.substring(0, 100)}...`);
    }
  }

  // Tool 4: Get cross-references
  logToolCall('bible_cross_references', 'John 3:16');
  const crossRefs = crossRefService.getCrossReferences('John 3:16', { maxResults: 10 });

  // Tool 5: Search Westminster Confession for God's love
  logToolCall('classic_text_lookup', 'Westminster on "love"');
  const westminsterLove = localData.searchDocuments('love', 'westminster-confession');

  if (esv && kjv && net && morph && crossRefs && westminsterLove) {
    logPass(`Comprehensive John 3:16 study complete (${toolCallCount} tool calls)`);
    logInfo(`Translations: ESV, KJV, NET (${net.footnotes?.length || 0} footnotes)`);
    logInfo(`Morphology: ${morph.words.length} words analyzed`);
    logInfo(`Cross-references: ${crossRefs.total} found`);
    logInfo(`Westminster refs: ${westminsterLove.length} sections`);
  } else {
    logFail('John 3:16 comprehensive study incomplete');
  }
} catch (error) {
  logFail('John 3:16 comprehensive study failed', error);
}

logTest(110, 'Deep Dive on Logos (John 1:1)');
toolCallCount = 0;
try {
  // Tool 1: Get verse
  logToolCall('bible_lookup', 'John 1:1');
  const verse = await bibleService.lookup({ reference: 'John 1:1', translation: 'ESV' });

  // Tool 2: Get morphology
  logToolCall('bible_verse_morphology', 'John 1:1');
  const morph = langAdapter.getVerseWithMorphology('John 1:1');

  // Tool 3: Look up G3056 (Logos)
  logToolCall('original_language_lookup', 'G3056 (Logos)');
  const logosEntry = langAdapter.enrichStrongsWithStepBible('G3056');

  // Tool 4: Get cross-references to OT creation
  logToolCall('bible_cross_references', 'John 1:1');
  const crossRefs = crossRefService.getCrossReferences('John 1:1', { maxResults: 10 });

  // Tool 5: Search Nicene Creed
  logToolCall('classic_text_lookup', 'Nicene Creed');
  const nicene = localData.getDocument('nicene-creed');

  if (verse && morph && logosEntry && crossRefs && nicene) {
    logPass(`Logos deep dive complete (${toolCallCount} tool calls)`);
    logInfo(`Logos occurrences in verse: ${morph.words.filter(w => w.strong === 'G3056').length}`);
    logInfo(`Logos definition: ${logosEntry.definition?.substring(0, 100)}...`);
    logInfo(`Cross-refs found: ${crossRefs.total}`);
    logInfo(`Nicene sections: ${nicene.sections.length}`);
  } else {
    logFail('Logos deep dive incomplete');
  }
} catch (error) {
  logFail('Logos deep dive failed', error);
}

logTest(111, 'Study Covenant Love - Hesed (H2617)');
toolCallCount = 0;
try {
  // Tool 1: Look up H2617 (hesed)
  logToolCall('original_language_lookup', 'H2617 (hesed)');
  const hesedEntry = langAdapter.enrichStrongsWithStepBible('H2617');

  // Tool 2: Look up key verse - Psalm 136:1
  logToolCall('bible_lookup', 'Psalm 136:1');
  const psalm = await bibleService.lookup({ reference: 'Psalm 136:1', translation: 'ESV' });

  // Tool 3: Get morphology
  logToolCall('bible_verse_morphology', 'Psalm 136:1');
  const morph = langAdapter.getVerseWithMorphology('Psalm 136:1');

  // Tool 4: Search confessions for covenant
  logToolCall('classic_text_lookup', 'Westminster on "covenant"');
  const westminsterCov = localData.searchDocuments('covenant', 'westminster-confession');

  logToolCall('classic_text_lookup', 'London Baptist on "covenant"');
  const londonCov = localData.searchDocuments('covenant', 'london-baptist-1689');

  if (hesedEntry && psalm && morph && westminsterCov && londonCov) {
    logPass(`Hesed covenant study complete (${toolCallCount} tool calls)`);
    logInfo(`Hesed definition: ${hesedEntry.definition?.substring(0, 100)}...`);
    logInfo(`Psalm text: ${psalm.text.substring(0, 100)}...`);
    logInfo(`Westminster covenant refs: ${westminsterCov.length}`);
    logInfo(`London Baptist covenant refs: ${londonCov.length}`);
  } else {
    logFail('Hesed covenant study incomplete');
  }
} catch (error) {
  logFail('Hesed covenant study failed', error);
}

// ============================================================================
// SERMON PREPARATION
// ============================================================================

logSection('SERMON PREPARATION WORKFLOWS');

logTest(112, 'Beatitudes Sermon Prep (Matthew 5:3-12)');
toolCallCount = 0;
try {
  // Tool 1: Get Beatitudes passage
  logToolCall('bible_lookup', 'Matthew 5:3-12 ESV');
  const beatitudes = await bibleService.lookup({ reference: 'Matthew 5:3-12', translation: 'ESV' });

  // Tool 2: Get morphology for "blessed" (v3)
  logToolCall('bible_verse_morphology', 'Matthew 5:3');
  const verse3Morph = langAdapter.getVerseWithMorphology('Matthew 5:3');

  // Tool 3: Look up G3107 (makarios - blessed)
  let makariosStrong = null;
  if (verse3Morph) {
    const makariosWord = verse3Morph.words.find(w => w.gloss?.toLowerCase().includes('blessed'));
    if (makariosWord) {
      makariosStrong = makariosWord.strong;
      logToolCall('original_language_lookup', `${makariosStrong} (makarios)`);
      const makariosEntry = langAdapter.enrichStrongsWithStepBible(makariosStrong);
      logInfo(`Blessed: ${makariosWord.lemma} - ${makariosEntry?.definition?.substring(0, 80)}...`);
    }
  }

  // Tool 4: Get parallel passages in Luke
  logToolCall('parallel_passages', 'Sermon on the Mount');
  const parallels = await parallelService.findParallels({ reference: 'Matthew 5:1-12' });

  // Tool 5: Get cross-references
  logToolCall('bible_cross_references', 'Matthew 5:3');
  const crossRefs = crossRefService.getCrossReferences('Matthew 5:3', { maxResults: 5 });

  // Tool 6: Get commentary
  logToolCall('commentary_lookup', 'Matthew 5:3');
  const comm = await commentaryService.lookup({
    reference: 'Matthew 5:3',
    commentator: 'Matthew Henry'
  });

  if (beatitudes && verse3Morph && parallels && crossRefs && comm) {
    logPass(`Beatitudes sermon prep complete (${toolCallCount} tool calls)`);
    logInfo(`Passage length: ${beatitudes.text.length} characters`);
    logInfo(`Parallel passages: ${parallels.parallels.length} found`);
    logInfo(`Cross-refs: ${crossRefs.total}`);
    logInfo(`Commentary length: ${comm.text.length} characters`);
  } else {
    logFail('Beatitudes sermon prep incomplete');
  }
} catch (error) {
  logFail('Beatitudes sermon prep failed', error);
}

logTest(113, 'Resurrection Sermon Prep (Matthew 28:1-10)');
toolCallCount = 0;
try {
  // Tool 1: Get resurrection account
  logToolCall('bible_lookup', 'Matthew 28:1-10 ESV');
  const resurrection = await bibleService.lookup({ reference: 'Matthew 28:1-10', translation: 'ESV' });

  // Tool 2: Get morphology for "risen" (v6)
  logToolCall('bible_verse_morphology', 'Matthew 28:6');
  const verse6Morph = langAdapter.getVerseWithMorphology('Matthew 28:6');

  // Tool 3: Look up resurrection word (G1453 - egeiro)
  let egeiroWord = null;
  if (verse6Morph) {
    egeiroWord = verse6Morph.words.find(w =>
      w.gloss?.toLowerCase().includes('risen') ||
      w.gloss?.toLowerCase().includes('raised')
    );
    if (egeiroWord) {
      logToolCall('original_language_lookup', `${egeiroWord.strong} (egeiro)`);
      const egeiroEntry = langAdapter.enrichStrongsWithStepBible(egeiroWord.strong);
      logInfo(`Risen word: ${egeiroWord.lemma} - ${egeiroEntry?.definition?.substring(0, 80)}...`);
    }
  }

  // Tool 4: Get parallel passages
  logToolCall('parallel_passages', 'Resurrection accounts');
  const parallels = await parallelService.findParallels({ reference: 'Matthew 28:1-10' });

  // Tool 5: Get cross-references
  logToolCall('bible_cross_references', 'Matthew 28:6');
  const crossRefs = crossRefService.getCrossReferences('Matthew 28:6', { maxResults: 10 });

  // Tool 6: Get commentary (try Matthew 28:1 if 28:6 not available)
  logToolCall('commentary_lookup', 'Matthew 28:1');
  let comm = null;
  try {
    comm = await commentaryService.lookup({
      reference: 'Matthew 28:1',
      commentator: 'Matthew Henry'
    });
  } catch (error) {
    logInfo('Commentary not available, continuing without it');
  }

  if (resurrection && verse6Morph && parallels && crossRefs) {
    logPass(`Resurrection sermon prep complete (${toolCallCount} tool calls)`);
    logInfo(`Parallel Gospel accounts: ${parallels.parallels.length}`);
    logInfo(`Cross-refs: ${crossRefs.total}`);
    if (comm) {
      logInfo(`Commentary: ${comm.text.substring(0, 100)}...`);
    }
  } else {
    logFail('Resurrection sermon prep incomplete');
  }
} catch (error) {
  logFail('Resurrection sermon prep failed', error);
}

// ============================================================================
// COMPARATIVE ANALYSIS
// ============================================================================

logSection('COMPARATIVE ANALYSIS WORKFLOWS');

logTest(114, 'Translation Comparison - John 1:1 Logos Analysis');
toolCallCount = 0;
try {
  // Tool 1-4: Get multiple translations
  logToolCall('bible_lookup', 'John 1:1 ESV');
  const esv = await bibleService.lookup({ reference: 'John 1:1', translation: 'ESV' });

  logToolCall('bible_lookup', 'John 1:1 KJV');
  const kjv = await bibleService.lookup({ reference: 'John 1:1', translation: 'KJV' });

  logToolCall('bible_lookup', 'John 1:1 NET');
  const net = await bibleService.lookup({ reference: 'John 1:1', translation: 'NET' });

  logToolCall('bible_lookup', 'John 1:1 NIV');
  const niv = await bibleService.lookup({ reference: 'John 1:1', translation: 'NIV' });

  // Tool 5: Get Greek morphology
  logToolCall('bible_verse_morphology', 'John 1:1');
  const morph = langAdapter.getVerseWithMorphology('John 1:1');

  // Tool 6: Look up G3056 (Logos)
  logToolCall('original_language_lookup', 'G3056 (Logos)');
  const logosEntry = langAdapter.enrichStrongsWithStepBible('G3056');

  // Tool 7: Get Nicene Creed
  logToolCall('classic_text_lookup', 'Nicene Creed');
  const nicene = localData.getDocument('nicene-creed');

  if (esv && kjv && net && niv && morph && logosEntry && nicene) {
    logPass(`Translation comparison complete (${toolCallCount} tool calls)`);
    logInfo(`ESV: "${esv.text}"`);
    logInfo(`KJV: "${kjv.text}"`);
    logInfo(`NET: "${net.text}"`);
    logInfo(`NIV: "${niv.text}"`);
    logInfo(`Logos definition: ${logosEntry.definition?.substring(0, 100)}...`);
  } else {
    logFail('Translation comparison incomplete');
  }
} catch (error) {
  logFail('Translation comparison failed', error);
}

logTest(115, 'Feeding of 5000 - Gospel Comparison');
toolCallCount = 0;
try {
  // Tool 1: Get parallel passages
  logToolCall('parallel_passages', 'Feeding of 5000');
  const parallels = await parallelService.findParallels({ reference: 'Matthew 14:13-21' });

  // Tool 2-5: Get each Gospel account
  logToolCall('bible_lookup', 'Matthew 14:13-21');
  const matthew = await bibleService.lookup({ reference: 'Matthew 14:13-21', translation: 'ESV' });

  if (parallels.parallels.length > 0) {
    for (const parallel of parallels.parallels.slice(0, 3)) {
      logToolCall('bible_lookup', parallel.reference);
      const account = await bibleService.lookup({ reference: parallel.reference, translation: 'ESV' });
      logInfo(`${parallel.reference}: ${account.text.length} chars`);
    }
  }

  // Tool 6: Get morphology of key verse (Matthew 14:19)
  logToolCall('bible_verse_morphology', 'Matthew 14:19');
  const morph = langAdapter.getVerseWithMorphology('Matthew 14:19');

  if (matthew && parallels && morph) {
    logPass(`Feeding of 5000 comparison complete (${toolCallCount} tool calls)`);
    logInfo(`Parallel accounts found: ${parallels.parallels.length}`);
    logInfo(`Matthew account: ${matthew.text.length} chars`);
    logInfo(`Key verse words: ${morph.words.length}`);
  } else {
    logFail('Feeding of 5000 comparison incomplete');
  }
} catch (error) {
  logFail('Feeding of 5000 comparison failed', error);
}

// ============================================================================
// ADVANCED WORKFLOWS
// ============================================================================

logSection('ADVANCED MULTI-TOOL WORKFLOWS');

logTest(116, 'Lord\'s Prayer Analysis (Matthew 6:9-13)');
toolCallCount = 0;
try {
  // Tool 1: Get passage
  logToolCall('bible_lookup', 'Matthew 6:9-13 ESV');
  const passage = await bibleService.lookup({ reference: 'Matthew 6:9-13', translation: 'ESV' });

  // Tool 2: Get parallel passages
  logToolCall('parallel_passages', 'Lord\'s Prayer');
  const parallels = await parallelService.findParallels({ reference: 'Matthew 6:9-13' });

  // Tool 3: Get morphology for key verse (v9)
  logToolCall('bible_verse_morphology', 'Matthew 6:9');
  const morph = langAdapter.getVerseWithMorphology('Matthew 6:9');

  // Tool 4: Look up key Greek word - "Father" (G3962)
  let fatherWord = null;
  if (morph) {
    fatherWord = morph.words.find(w => w.gloss?.toLowerCase().includes('father'));
    if (fatherWord) {
      logToolCall('original_language_lookup', `${fatherWord.strong} (Father)`);
      const fatherEntry = langAdapter.enrichStrongsWithStepBible(fatherWord.strong);
      logInfo(`Father: ${fatherEntry?.definition?.substring(0, 80)}...`);
    }
  }

  // Tool 5: Get cross-references
  logToolCall('bible_cross_references', 'Matthew 6:9');
  const crossRefs = crossRefService.getCrossReferences('Matthew 6:9', { maxResults: 5 });

  // Tool 6: Search catechisms for prayer
  logToolCall('classic_text_lookup', 'Westminster Shorter Catechism on prayer');
  const wsc = localData.searchDocuments('prayer', 'westminster-shorter-catechism');

  logToolCall('classic_text_lookup', 'Heidelberg Catechism on prayer');
  const heidelberg = localData.searchDocuments('prayer', 'heidelberg-catechism');

  if (passage && parallels && morph && crossRefs && wsc && heidelberg) {
    logPass(`Lord's Prayer analysis complete (${toolCallCount} tool calls)`);
    logInfo(`Parallel passages: ${parallels.parallels.length}`);
    logInfo(`Cross-refs: ${crossRefs.total}`);
    logInfo(`WSC prayer refs: ${wsc.length}`);
    logInfo(`Heidelberg prayer refs: ${heidelberg.length}`);
  } else {
    logFail('Lord\'s Prayer analysis incomplete');
  }
} catch (error) {
  logFail('Lord\'s Prayer analysis failed', error);
}

logTest(117, 'Faith Study - Hebrews 11:1');
toolCallCount = 0;
try {
  // Tool 1: Get verse
  logToolCall('bible_lookup', 'Hebrews 11:1 ESV');
  const verse = await bibleService.lookup({ reference: 'Hebrews 11:1', translation: 'ESV' });

  // Tool 2: Get morphology
  logToolCall('bible_verse_morphology', 'Hebrews 11:1');
  const morph = langAdapter.getVerseWithMorphology('Hebrews 11:1');

  // Tool 3: Look up G4102 (pistis - faith)
  let faithWord = null;
  let faithEntry = null;
  if (morph) {
    faithWord = morph.words.find(w => w.gloss?.toLowerCase().includes('faith'));
    if (faithWord && faithWord.strong) {
      logToolCall('original_language_lookup', `${faithWord.strong} (pistis)`);
      faithEntry = langAdapter.enrichStrongsWithStepBible(faithWord.strong);
      logInfo(`Faith: ${faithEntry?.definition?.substring(0, 80)}...`);
    } else {
      // Fallback to known G4102
      logToolCall('original_language_lookup', 'G4102 (pistis)');
      faithEntry = langAdapter.enrichStrongsWithStepBible('G4102');
      logInfo(`Faith (G4102): ${faithEntry?.definition?.substring(0, 80)}...`);
    }
  }

  // Tool 4: Get cross-references
  logToolCall('bible_cross_references', 'Hebrews 11:1');
  const crossRefs = crossRefService.getCrossReferences('Hebrews 11:1', { maxResults: 10 });

  // Tool 5: Search Westminster for faith
  logToolCall('classic_text_lookup', 'Westminster on faith');
  const westminster = localData.searchDocuments('faith', 'westminster-confession');

  // Tool 6: Get commentary
  logToolCall('commentary_lookup', 'Hebrews 11:1');
  const comm = await commentaryService.lookup({
    reference: 'Hebrews 11:1',
    commentator: 'Matthew Henry'
  });

  if (verse && morph && faithEntry && crossRefs && westminster && comm) {
    logPass(`Faith study complete (${toolCallCount} tool calls)`);
    logInfo(`Cross-refs: ${crossRefs.total}`);
    logInfo(`Westminster faith refs: ${westminster.length}`);
    logInfo(`Commentary: ${comm.text.substring(0, 100)}...`);
  } else {
    logFail('Faith study incomplete');
  }
} catch (error) {
  logFail('Faith study failed', error);
}

logTest(118, 'Resurrection Accounts - Four Gospel Comparison');
toolCallCount = 0;
try {
  // Tool 1: Get parallel passages
  logToolCall('parallel_passages', 'Resurrection accounts');
  const parallels = await parallelService.findParallels({ reference: 'Matthew 28:1-10' });

  // Tool 2-5: Get each Gospel account
  logToolCall('bible_lookup', 'Matthew 28:1-10');
  const matthew = await bibleService.lookup({ reference: 'Matthew 28:1-10', translation: 'ESV' });

  logToolCall('bible_lookup', 'Mark 16:1-8');
  const mark = await bibleService.lookup({ reference: 'Mark 16:1-8', translation: 'ESV' });

  logToolCall('bible_lookup', 'Luke 24:1-12');
  const luke = await bibleService.lookup({ reference: 'Luke 24:1-12', translation: 'ESV' });

  logToolCall('bible_lookup', 'John 20:1-10');
  const john = await bibleService.lookup({ reference: 'John 20:1-10', translation: 'ESV' });

  // Tool 6: Get morphology for "resurrection" (G386 - anastasis)
  logToolCall('bible_verse_morphology', 'Luke 24:6');
  const morph = langAdapter.getVerseWithMorphology('Luke 24:6');

  // Tool 7: Look up G386 (anastasis)
  logToolCall('original_language_lookup', 'G386 (anastasis)');
  const anastasisEntry = langAdapter.enrichStrongsWithStepBible('G386');

  // Tool 8: Get cross-references
  logToolCall('bible_cross_references', 'Matthew 28:6');
  const crossRefs = crossRefService.getCrossReferences('Matthew 28:6', { maxResults: 10 });

  if (matthew && mark && luke && john && parallels && anastasisEntry && crossRefs) {
    logPass(`Resurrection comparison complete (${toolCallCount} tool calls)`);
    logInfo(`Matthew: ${matthew.text.length} chars`);
    logInfo(`Mark: ${mark.text.length} chars`);
    logInfo(`Luke: ${luke.text.length} chars`);
    logInfo(`John: ${john.text.length} chars`);
    logInfo(`Parallel passages: ${parallels.parallels.length}`);
    logInfo(`Anastasis definition: ${anastasisEntry.definition?.substring(0, 80)}...`);
    logInfo(`Cross-refs: ${crossRefs.total}`);
  } else {
    logFail('Resurrection comparison incomplete');
  }
} catch (error) {
  logFail('Resurrection comparison failed', error);
}

logTest(119, 'Psalm 22 Analysis - Hebrew, Morphology, NT Cross-refs');
toolCallCount = 0;
try {
  // Tool 1: Get Psalm 22
  logToolCall('bible_lookup', 'Psalm 22:1 ESV');
  const verse = await bibleService.lookup({ reference: 'Psalm 22:1', translation: 'ESV' });

  // Tool 2: Get Hebrew morphology
  logToolCall('bible_verse_morphology', 'Psalm 22:1');
  const morph = langAdapter.getVerseWithMorphology('Psalm 22:1');

  // Tool 3: Look up H5800 (azab - forsaken)
  let forsakenWord = null;
  if (morph) {
    forsakenWord = morph.words.find(w =>
      w.gloss?.toLowerCase().includes('forsaken') ||
      w.gloss?.toLowerCase().includes('forsake')
    );
    if (forsakenWord) {
      logToolCall('original_language_lookup', `${forsakenWord.strong} (azab)`);
      const forsakenEntry = langAdapter.enrichStrongsWithStepBible(forsakenWord.strong);
      logInfo(`Forsaken: ${forsakenEntry?.definition?.substring(0, 80)}...`);
    }
  }

  // Tool 4: Get NT cross-references (especially Matthew 27:46)
  logToolCall('bible_cross_references', 'Psalm 22:1');
  const crossRefs = crossRefService.getCrossReferences('Psalm 22:1', { maxResults: 10 });

  // Tool 5: Get Matthew 27:46 (Jesus quotes this)
  logToolCall('bible_lookup', 'Matthew 27:46');
  const matthew = await bibleService.lookup({ reference: 'Matthew 27:46', translation: 'ESV' });

  // Tool 6: Get commentary
  logToolCall('commentary_lookup', 'Psalm 22:1');
  const comm = await commentaryService.lookup({
    reference: 'Psalm 22:1',
    commentator: 'Matthew Henry'
  });

  // Tool 7: Search confessions for Christ's suffering
  logToolCall('classic_text_lookup', 'Westminster on Christ\'s suffering');
  const westminster = localData.searchDocuments('suffered', 'westminster-confession');

  if (verse && morph && forsakenWord && crossRefs && matthew && comm && westminster) {
    logPass(`Psalm 22 analysis complete (${toolCallCount} tool calls)`);
    logInfo(`Hebrew words: ${morph.words.length}`);
    logInfo(`NT cross-refs: ${crossRefs.total}`);
    logInfo(`Matthew 27:46: "${matthew.text}"`);
    logInfo(`Commentary: ${comm.text.substring(0, 100)}...`);
    logInfo(`Westminster refs: ${westminster.length}`);
  } else {
    logFail('Psalm 22 analysis incomplete');
  }
} catch (error) {
  logFail('Psalm 22 analysis failed', error);
}

// ============================================================================
// SUMMARY
// ============================================================================

logSection('TEST SUMMARY');

const totalTests = 12;
console.log(`Total tests: ${totalTests}`);
console.log(`Passed: ${passCount} ✓`);
console.log(`Failed: ${failCount} ✗`);
console.log();

if (failCount === 0) {
  console.log('🎉 ALL 12 MULTI-TOOL WORKFLOW TESTS PASSED!');
  console.log();
  console.log('These tests demonstrate:');
  console.log('- 4+ tool calls per workflow');
  console.log('- Real-world seminary student scenarios');
  console.log('- Integration across biblical languages, cross-refs, commentary, and historical docs');
  console.log('- Complex comparative analysis workflows');
} else {
  console.log(`⚠️  ${failCount} test(s) failed. Review output above for details.`);
}

console.log();
console.log('='.repeat(80));
console.log('MULTI-TOOL WORKFLOW TEST SUITE COMPLETE');
console.log('='.repeat(80));
