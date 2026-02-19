/**
 * Manual test for Original Language Lookup Tool (formerly Strong's Lookup)
 *
 * Run with: npx tsx test/tools/strongs-lookup-manual-test.ts
 */

import { originalLanguageLookupHandler } from '../../src/tools/biblicalLanguages.js';

async function testStrongsLookup() {
  console.log('=== Testing Original Language Lookup Tool ===\n');

  // Test 1: Greek word (G25 - agapaō - to love)
  console.log('Test 1: Looking up G25 (Greek - agapaō - to love)');
  const result1 = await originalLanguageLookupHandler.handler({ strongs_number: 'G25' });
  console.log(result1.content[0].text);
  console.log('\n---\n');

  // Test 2: Hebrew word (H430 - elohim - God)
  console.log('Test 2: Looking up H430 (Hebrew - elohim - God)');
  const result2 = await originalLanguageLookupHandler.handler({ strongs_number: 'H430' });
  console.log(result2.content[0].text);
  console.log('\n---\n');

  // Test 3: Another Greek word (G2316 - theos - God)
  console.log('Test 3: Looking up G2316 (Greek - theos - God)');
  const result3 = await originalLanguageLookupHandler.handler({ strongs_number: 'G2316' });
  console.log(result3.content[0].text);
  console.log('\n---\n');

  // Test 4: Another Hebrew word (H7225 - reshith - beginning)
  console.log('Test 4: Looking up H7225 (Hebrew - reshith - beginning)');
  const result4 = await originalLanguageLookupHandler.handler({ strongs_number: 'H7225' });
  console.log(result4.content[0].text);
  console.log('\n---\n');

  // Test 5: Invalid format
  console.log('Test 5: Invalid format (should error)');
  const result5 = await originalLanguageLookupHandler.handler({ strongs_number: 'invalid' });
  console.log('Error:', result5.isError);
  console.log(result5.content[0].text);
  console.log('\n---\n');

  // Test 6: Non-existent number
  console.log('Test 6: Non-existent number G99999 (should error)');
  const result6 = await originalLanguageLookupHandler.handler({ strongs_number: 'G99999' });
  console.log('Error:', result6.isError);
  console.log(result6.content[0].text);
  console.log('\n---\n');

  // Test 7: Detailed mode for G25
  console.log('Test 7: Detailed mode for G25 (agapaō - to love)');
  const result7 = await originalLanguageLookupHandler.handler({
    strongs_number: 'G25',
    detail_level: 'detailed'
  });
  console.log(result7.content[0].text);
  console.log('\n---\n');

  console.log('=== All Tests Complete ===');
}

testStrongsLookup().catch(console.error);
