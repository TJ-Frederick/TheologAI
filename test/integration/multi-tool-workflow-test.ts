/**
 * Multi-Tool Workflow Test Suite
 * Tests 96-107: Greek/Hebrew word studies, semantic comparisons, and complex multi-tool chains
 *
 * This test suite validates the integration of:
 * - Original language lookup (Strong's numbers)
 * - Bible verse morphology
 * - Cross-references
 * - Historical documents search
 * - Multi-tool workflows
 */

import { describe, it, expect } from 'vitest';
import { originalLanguageLookupHandler, bibleVerseMorphologyHandler } from '../../src/tools/biblicalLanguages.js';
import { bibleLookupHandler } from '../../src/tools/bibleLookup.js';
import { bibleCrossReferencesHandler } from '../../src/tools/bibleCrossReferences.js';
import { classicTextLookupHandler } from '../../src/tools/classicTextLookup.js';

// Helper to extract text from response
function getResponseText(result: any): string {
  if (result && result.content && result.content[0] && result.content[0].text) {
    return result.content[0].text;
  }
  return '';
}

describe('Multi-Tool Workflow Tests - Greek Word Studies (Tests 96-98)', () => {

  it('Test 96: Show Greek word for "faith" in Ephesians 2:8 with full lexicon definition and related verses', async () => {
    console.log('\n\n=== TEST 96: Faith in Ephesians 2:8 ===');

    // Step 1: Get verse morphology to identify the Greek word for "faith"
    const morphResult = await bibleVerseMorphologyHandler.handler({
      reference: 'Ephesians 2:8'
    });

    const morphText = getResponseText(morphResult);
    console.log('\n--- Step 1: Verse Morphology ---');
    console.log(morphText);

    expect(morphText).toContain('Greek');
    expect(morphText).toContain('G4102'); // pistis - faith

    // Step 2: Get full lexicon definition
    const lexiconResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G4102',
      detail_level: 'detailed'
    });

    const lexiconText = getResponseText(lexiconResult);
    console.log('\n--- Step 2: Full Lexicon Definition ---');
    console.log(lexiconText);

    expect(lexiconText).toContain('G4102');
    expect(lexiconText).toContain('Abbott-Smith');

    // Step 3: Get cross-references
    const crossRefResult = await bibleCrossReferencesHandler.handler({
      reference: 'Ephesians 2:8'
    });

    const crossRefText = getResponseText(crossRefResult);
    console.log('\n--- Step 3: Cross-References ---');
    console.log(crossRefText);

    expect(crossRefText).toContain('Ephesians 2:8');
  });

  it('Test 97: Compare agape (G25) and phileo (G5368) with lexicon definitions and semantic differences', async () => {
    console.log('\n\n=== TEST 97: Agape vs Phileo ===');

    // Step 1: Get agape definition
    const agapeResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G25',
      detail_level: 'detailed'
    });

    const agapeText = getResponseText(agapeResult);
    console.log('\n--- Step 1: Agape (G25) ---');
    console.log(agapeText);

    expect(agapeText).toContain('G25');
    expect(agapeText).toContain('love');

    // Step 2: Get phileo definition
    const phileoResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G5368',
      detail_level: 'detailed'
    });

    const phileoText = getResponseText(phileoResult);
    console.log('\n--- Step 2: Phileo (G5368) ---');
    console.log(phileoText);

    expect(phileoText).toContain('G5368');
    expect(phileoText).toContain('love');

    // Step 3: Compare usage (look at occurrences and morphology)
    console.log('\n--- Step 3: Semantic Comparison ---');
    console.log('Agape: Divine, unconditional love');
    console.log('Phileo: Brotherly love, friendship');
    console.log('Key difference: Agape is sacrificial/volitional, Phileo is affectionate/emotional');
  });

  it('Test 98: Study pneuma (spirit) in John 3:8 with morphology, Abbott-Smith definition, and usage examples', async () => {
    console.log('\n\n=== TEST 98: Pneuma in John 3:8 ===');

    // Step 1: Get verse morphology
    const morphResult = await bibleVerseMorphologyHandler.handler({
      reference: 'John 3:8',
      expand_morphology: true
    });

    const morphText = getResponseText(morphResult);
    console.log('\n--- Step 1: Verse Morphology ---');
    console.log(morphText);

    expect(morphText).toContain('Greek');
    expect(morphText).toContain('G4151'); // pneuma - spirit

    // Step 2: Get Abbott-Smith definition
    const lexiconResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G4151',
      detail_level: 'detailed'
    });

    const lexiconText = getResponseText(lexiconResult);
    console.log('\n--- Step 2: Abbott-Smith Definition ---');
    console.log(lexiconText);

    expect(lexiconText).toContain('G4151');
    expect(lexiconText).toContain('Abbott-Smith');

    // Step 3: Look at the full verse
    const verseResult = await bibleLookupHandler.handler({
      reference: 'John 3:8'
    });

    const verseText = getResponseText(verseResult);
    console.log('\n--- Step 3: Full Verse Context ---');
    console.log(verseText);

    expect(verseText).toContain('wind');
    expect(verseText).toContain('spirit');
  });
});

describe('Multi-Tool Workflow Tests - Hebrew Word Studies (Tests 99-102)', () => {

  it('Test 99: Hebrew "shalom" (peace) - BDB definition and semantic range', async () => {
    console.log('\n\n=== TEST 99: Shalom (H7965) ===');

    // Get BDB definition
    const result = await originalLanguageLookupHandler.handler({
      strongs_number: 'H7965',
      detail_level: 'detailed'
    });

    const text = getResponseText(result);
    console.log(text);

    expect(text).toContain('H7965');
    expect(text).toContain('Brown-Driver-Briggs');
    expect(text).toContain('peace');
  });

  it('Test 100: Analyze "Elohim" (H430) - BDB definition, theological notes, and key verses', async () => {
    console.log('\n\n=== TEST 100: Elohim (H430) ===');

    // Step 1: Get BDB definition
    const lexiconResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'H430',
      detail_level: 'detailed'
    });

    const lexiconText = getResponseText(lexiconResult);
    console.log('\n--- Step 1: BDB Definition ---');
    console.log(lexiconText);

    expect(lexiconText).toContain('H430');
    expect(lexiconText).toContain('God');

    // Step 2: Look at key verse - Genesis 1:1
    const verseResult = await bibleVerseMorphologyHandler.handler({
      reference: 'Genesis 1:1',
      expand_morphology: true
    });

    const verseText = getResponseText(verseResult);
    console.log('\n--- Step 2: Genesis 1:1 Morphology ---');
    console.log(verseText);

    expect(verseText).toContain('Hebrew');
    expect(verseText).toContain('H430');
  });

  it('Test 101: Study "hesed" (H2617) - BDB lexicon entry and explanation of covenant love', async () => {
    console.log('\n\n=== TEST 101: Hesed (H2617) ===');

    // Get BDB definition
    const result = await originalLanguageLookupHandler.handler({
      strongs_number: 'H2617',
      detail_level: 'detailed'
    });

    const text = getResponseText(result);
    console.log(text);

    expect(text).toContain('H2617');
    expect(text).toContain('Brown-Driver-Briggs');
    expect(text).toContain('lovingkindness').or.toContain('steadfast love').or.toContain('mercy');
  });

  it('Test 102: "YHWH" (H3068) - Full Hebrew lexicon definition', async () => {
    console.log('\n\n=== TEST 102: YHWH (H3068) ===');

    // Get BDB definition
    const result = await originalLanguageLookupHandler.handler({
      strongs_number: 'H3068',
      detail_level: 'detailed'
    });

    const text = getResponseText(result);
    console.log(text);

    expect(text).toContain('H3068');
    expect(text).toContain('Brown-Driver-Briggs');
    expect(text).toContain('LORD').or.toContain('Jehovah').or.toContain('Yahweh');
  });
});

describe('Multi-Tool Workflow Tests - Trinity Study (Tests 103-104)', () => {

  it('Test 103: John 1:1 - Analyze "Word" and "God" in Greek, cross-references, and Trinity in historical documents', async () => {
    console.log('\n\n=== TEST 103: Trinity Study - John 1:1 ===');

    // Step 1: Get verse morphology
    const morphResult = await bibleVerseMorphologyHandler.handler({
      reference: 'John 1:1',
      expand_morphology: true
    });

    const morphText = getResponseText(morphResult);
    console.log('\n--- Step 1: Verse Morphology ---');
    console.log(morphText);

    expect(morphText).toContain('G3056'); // logos - Word
    expect(morphText).toContain('G2316'); // theos - God

    // Step 2: Get Abbott-Smith definitions
    const logosResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G3056',
      detail_level: 'detailed'
    });

    const logosText = getResponseText(logosResult);
    console.log('\n--- Step 2a: Logos (Word) Definition ---');
    console.log(logosText);

    expect(logosText).toContain('G3056');

    const theosResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G2316',
      detail_level: 'detailed'
    });

    const theosText = getResponseText(theosResult);
    console.log('\n--- Step 2b: Theos (God) Definition ---');
    console.log(theosText);

    expect(theosText).toContain('G2316');

    // Step 3: Get cross-references
    const crossRefResult = await bibleCrossReferencesHandler.handler({
      reference: 'John 1:1'
    });

    const crossRefText = getResponseText(crossRefResult);
    console.log('\n--- Step 3: Cross-References ---');
    console.log(crossRefText);

    // Step 4: Search historical documents for Trinity
    const trinityResult = await classicTextLookupHandler.handler({
      query: 'Trinity'
    });

    const trinityText = getResponseText(trinityResult);
    console.log('\n--- Step 4: Historical Documents on Trinity ---');
    console.log(trinityText);

    expect(trinityText).toContain('Trinity').or.toContain('Father').or.toContain('Son');
  });

  it('Test 104: Matthew 28:19 - Cross-references about Trinity and what Nicene Creed says', async () => {
    console.log('\n\n=== TEST 104: Trinity Study - Matthew 28:19 ===');

    // Step 1: Look up the verse
    const verseResult = await bibleLookupHandler.handler({
      reference: 'Matthew 28:19'
    });

    const verseText = getResponseText(verseResult);
    console.log('\n--- Step 1: Matthew 28:19 ---');
    console.log(verseText);

    expect(verseText).toContain('Father');
    expect(verseText).toContain('Son');
    expect(verseText).toContain('Holy Spirit').or.toContain('Holy Ghost');

    // Step 2: Get cross-references
    const crossRefResult = await bibleCrossReferencesHandler.handler({
      reference: 'Matthew 28:19'
    });

    const crossRefText = getResponseText(crossRefResult);
    console.log('\n--- Step 2: Cross-References ---');
    console.log(crossRefText);

    // Step 3: Search for Nicene Creed
    const niceneResult = await classicTextLookupHandler.handler({
      query: 'Nicene Creed'
    });

    const niceneText = getResponseText(niceneResult);
    console.log('\n--- Step 3: Nicene Creed ---');
    console.log(niceneText);

    expect(niceneText).toContain('Nicene').or.toContain('Creed').or.toContain('Trinity');
  });
});

describe('Multi-Tool Workflow Tests - Salvation Study (Tests 105-106)', () => {

  it('Test 105: Ephesians 2:8-9 - Analyze "grace" and "faith", cross-references, and historical documents on salvation', async () => {
    console.log('\n\n=== TEST 105: Salvation Study - Ephesians 2:8-9 ===');

    // Step 1: Get verse morphology
    const morphResult = await bibleVerseMorphologyHandler.handler({
      reference: 'Ephesians 2:8'
    });

    const morphText = getResponseText(morphResult);
    console.log('\n--- Step 1: Verse Morphology ---');
    console.log(morphText);

    expect(morphText).toContain('G5485'); // charis - grace
    expect(morphText).toContain('G4102'); // pistis - faith

    // Step 2: Get full lexicon definitions
    const graceResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G5485',
      detail_level: 'detailed'
    });

    const graceText = getResponseText(graceResult);
    console.log('\n--- Step 2a: Grace (G5485) Definition ---');
    console.log(graceText);

    expect(graceText).toContain('G5485');

    const faithResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G4102',
      detail_level: 'detailed'
    });

    const faithText = getResponseText(faithResult);
    console.log('\n--- Step 2b: Faith (G4102) Definition ---');
    console.log(faithText);

    expect(faithText).toContain('G4102');

    // Step 3: Get cross-references
    const crossRefResult = await bibleCrossReferencesHandler.handler({
      reference: 'Ephesians 2:8'
    });

    const crossRefText = getResponseText(crossRefResult);
    console.log('\n--- Step 3: Cross-References ---');
    console.log(crossRefText);

    // Step 4: Search historical documents
    const salvationResult = await classicTextLookupHandler.handler({
      query: 'salvation by grace'
    });

    const salvationText = getResponseText(salvationResult);
    console.log('\n--- Step 4: Historical Documents on Salvation by Grace ---');
    console.log(salvationText);

    expect(salvationText).toContain('salvation').or.toContain('grace');
  });

  it('Test 106: Romans 3:23-24 - Greek words for "justified" and Westminster Shorter Catechism on justification', async () => {
    console.log('\n\n=== TEST 106: Salvation Study - Romans 3:24 ===');

    // Step 1: Get verse morphology
    const morphResult = await bibleVerseMorphologyHandler.handler({
      reference: 'Romans 3:24'
    });

    const morphText = getResponseText(morphResult);
    console.log('\n--- Step 1: Verse Morphology ---');
    console.log(morphText);

    expect(morphText).toContain('G1344'); // dikaioo - to justify

    // Step 2: Get Abbott-Smith definition
    const justifiedResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G1344',
      detail_level: 'detailed'
    });

    const justifiedText = getResponseText(justifiedResult);
    console.log('\n--- Step 2: Justified (G1344) Definition ---');
    console.log(justifiedText);

    expect(justifiedText).toContain('G1344');

    // Step 3: Search Westminster Shorter Catechism
    const wscResult = await classicTextLookupHandler.handler({
      query: 'Westminster Shorter Catechism justification'
    });

    const wscText = getResponseText(wscResult);
    console.log('\n--- Step 3: Westminster Shorter Catechism on Justification ---');
    console.log(wscText);

    expect(wscText).toContain('justification').or.toContain('Westminster');
  });
});

describe('Multi-Tool Workflow Tests - Love Study (Test 107)', () => {

  it('Test 107: Compare Greek words for love - G25 (agape) vs G5368 (phileo) with Abbott-Smith definitions', async () => {
    console.log('\n\n=== TEST 107: Love Study - Agape vs Phileo ===');

    // Step 1: Get agape definition
    const agapeResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G25',
      detail_level: 'detailed'
    });

    const agapeText = getResponseText(agapeResult);
    console.log('\n--- Step 1: Agape (G25) - Abbott-Smith Definition ---');
    console.log(agapeText);

    expect(agapeText).toContain('G25');
    expect(agapeText).toContain('Abbott-Smith');

    // Step 2: Get phileo definition
    const phileoResult = await originalLanguageLookupHandler.handler({
      strongs_number: 'G5368',
      detail_level: 'detailed'
    });

    const phileoText = getResponseText(phileoResult);
    console.log('\n--- Step 2: Phileo (G5368) - Abbott-Smith Definition ---');
    console.log(phileoText);

    expect(phileoText).toContain('G5368');
    expect(phileoText).toContain('Abbott-Smith');

    // Step 3: Explain the difference
    console.log('\n--- Step 3: Semantic Difference ---');
    console.log('AGAPE (ἀγάπη):');
    console.log('- Unconditional, divine love');
    console.log('- Volitional and sacrificial');
    console.log('- Used for God\'s love for humanity');
    console.log('- Example: John 3:16 - "For God so loved (agape) the world"');
    console.log('');
    console.log('PHILEO (φιλέω):');
    console.log('- Brotherly love, friendship');
    console.log('- Emotional and affectionate');
    console.log('- Natural human affection');
    console.log('- Example: John 11:3 - "Lord, he whom you love (phileo)"');
    console.log('');
    console.log('KEY DISTINCTION:');
    console.log('- Agape is a choice to love regardless of feelings');
    console.log('- Phileo is an emotional response based on affection');
  });
});
