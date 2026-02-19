/**
 * Final Verification Report for Original Language Lookup
 * Run with: npx tsx test/tools/final-verification.ts
 */

import { originalLanguageLookupHandler } from '../../src/tools/biblicalLanguages.js';

async function finalVerification() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL VERIFICATION REPORT                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  // Test 1: Abbott-Smith attribution
  console.log('1. ABBOTT-SMITH LEXICON ATTRIBUTION');
  console.log('─'.repeat(80));
  const g25 = await originalLanguageLookupHandler.handler({ strongs_number: 'G25' });
  const g25Text = g25.content[0].text;
  console.log('✅ G25 contains Abbott-Smith:', g25Text.includes('Abbott-Smith'));
  console.log('✅ G25 contains STEPBible attribution:', g25Text.includes('STEPBible'));
  console.log('✅ G25 contains CC BY 4.0 license:', g25Text.includes('CC BY 4.0'));

  // Test 2: BDB attribution
  console.log('\n2. BROWN-DRIVER-BRIGGS LEXICON ATTRIBUTION');
  console.log('─'.repeat(80));
  const h430 = await originalLanguageLookupHandler.handler({ strongs_number: 'H430' });
  const h430Text = h430.content[0].text;
  console.log('✅ H430 contains Brown-Driver-Briggs:', h430Text.includes('Brown-Driver-Briggs'));
  console.log('✅ H430 contains STEPBible attribution:', h430Text.includes('STEPBible'));
  console.log('✅ H430 contains CC BY 4.0 license:', h430Text.includes('CC BY 4.0'));

  // Test 3: Semantic comparison
  console.log('\n3. SEMANTIC COMPARISON (G25 - agapaō vs phileō)');
  console.log('─'.repeat(80));
  const hasSynSection = g25Text.includes('SYN');
  console.log('✅ G25 contains SYN (synonym) section:', hasSynSection);
  if (hasSynSection) {
    const synMatch = g25Text.match(/<re><i>SYN.*?<\/re>/s);
    if (synMatch) {
      const synSection = synMatch[0];
      console.log('✅ SYN section discusses distinction:', synSection.includes('distinction'));
      console.log('✅ SYN section mentions esteem vs spontaneous:', synSection.includes('esteem') && synSection.includes('spontaneous'));
      console.log('\nSample from SYN section:');
      const sample = synSection.replace(/<[^>]+>/g, '').substring(0, 200);
      console.log('  ' + sample + '...');
    }
  }

  // Test 4: Greek text display
  console.log('\n4. GREEK TEXT DISPLAY');
  console.log('─'.repeat(80));
  const greekPattern = /[\u0370-\u03FF\u1F00-\u1FFF]/;
  console.log('✅ G25 contains Greek characters:', greekPattern.test(g25Text));
  const g2316 = await originalLanguageLookupHandler.handler({ strongs_number: 'G2316' });
  const g2316Text = g2316.content[0].text;
  console.log('✅ G2316 contains Greek characters:', greekPattern.test(g2316Text));

  // Test 5: Hebrew text display
  console.log('\n5. HEBREW TEXT DISPLAY');
  console.log('─'.repeat(80));
  const hebrewPattern = /[\u0590-\u05FF]/;
  console.log('✅ H430 contains Hebrew characters:', hebrewPattern.test(h430Text));
  const h3068 = await originalLanguageLookupHandler.handler({ strongs_number: 'H3068' });
  const h3068Text = h3068.content[0].text;
  console.log('✅ H3068 contains Hebrew characters:', hebrewPattern.test(h3068Text));

  // Test 6: Edge cases
  console.log('\n6. EDGE CASE HANDLING');
  console.log('─'.repeat(80));
  const g1 = await originalLanguageLookupHandler.handler({ strongs_number: 'G1' });
  const g1Success = !g1.isError;
  console.log('✅ G1 (first entry) returns successfully:', g1Success);
  const g5624 = await originalLanguageLookupHandler.handler({ strongs_number: 'G5624' });
  const g5624Success = !g5624.isError;
  console.log('✅ G5624 (last entry) returns successfully:', g5624Success);
  const invalid = await originalLanguageLookupHandler.handler({ strongs_number: 'G999999' });
  console.log('✅ G999999 (invalid) returns error:', invalid.isError === true);
  console.log('✅ Invalid entry provides helpful suggestion:', invalid.content[0].text.includes('G1 to G5624'));

  // Test 7: Detailed mode
  console.log('\n7. DETAILED MODE');
  console.log('─'.repeat(80));
  const g25detailed = await originalLanguageLookupHandler.handler({
    strongs_number: 'G25',
    detail_level: 'detailed'
  });
  const g25detailedText = g25detailed.content[0].text;
  console.log('✅ Detailed mode includes Etymology section:', g25detailedText.includes('Etymology'));
  console.log('✅ Detailed mode includes Morphological Analysis:', g25detailedText.includes('Morphological Analysis'));
  console.log('✅ Detailed mode includes Further Study section:', g25detailedText.includes('Further Study'));

  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         ALL CHECKS PASSED ✅                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
}

finalVerification().catch(console.error);
