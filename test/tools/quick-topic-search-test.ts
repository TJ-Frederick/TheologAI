/**
 * Quick test to verify topic search is working
 */

import { classicTextLookupHandler } from '../../src/tools/classicTextLookup.js';

async function test() {
  console.log('\n=== Testing topic search in Calvin\'s Institutes ===\n');

  // Test 1: Search for "election" (more likely to be in chapter titles)
  console.log('1. Searching for "election":');
  const result1 = await classicTextLookupHandler.handler({
    work: 'calvin/institutes',
    topic: 'election'
  });
  console.log(result1.content[0].text.substring(0, 600));
  console.log('\n---\n');

  // Test 2: Search for "faith"
  console.log('2. Searching for "faith":');
  const result2 = await classicTextLookupHandler.handler({
    work: 'calvin/institutes',
    topic: 'faith'
  });
  console.log(result2.content[0].text.substring(0, 600));
  console.log('\n---\n');

  // Test 3: Search for "God"
  console.log('3. Searching for "God":');
  const result3 = await classicTextLookupHandler.handler({
    work: 'calvin/institutes',
    topic: 'God'
  });
  console.log(result3.content[0].text.substring(0, 600));
  console.log('\n');
}

test().catch(console.error);
