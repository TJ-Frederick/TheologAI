/**
 * Test the CCEL Catalog Scraper
 *
 * Tests unlimited work discovery via HTML scraping
 */

import { CCELCatalogScraper } from '../../src/adapters/ccelCatalogScraper.js';
import { CCELService } from '../../src/services/ccelService.js';

async function testCatalogScraper() {
  console.log('Testing CCEL Catalog Scraper\n');
  console.log('='.repeat(60));

  const scraper = new CCELCatalogScraper();
  const service = new CCELService();

  // Test 1: Scrape single letter (C for Calvin)
  console.log('\n1. Testing single letter scrape (C)...');
  try {
    const cEntries = await scraper.scrapeAuthorIndex('c');
    console.log(`   ✓ Found ${cEntries.length} works for letter C`);

    // Find Calvin entries
    const calvinEntries = cEntries.filter(e =>
      e.author.toLowerCase().includes('calvin')
    );
    console.log(`   ✓ Found ${calvinEntries.length} Calvin works`);

    if (calvinEntries.length > 0) {
      console.log('\n   Sample Calvin works:');
      calvinEntries.slice(0, 5).forEach(entry => {
        console.log(`   - ${entry.title}`);
        console.log(`     Work ID: ${entry.workId}`);
        console.log(`     Author: ${entry.author}${entry.lifespan ? ` (${entry.lifespan})` : ''}`);
      });
    }
  } catch (error) {
    console.error('   ✗ Error:', error);
  }

  // Test 2: Search catalog by author name
  console.log('\n2. Testing catalog search (calvin)...');
  try {
    const results = await scraper.searchCatalog('calvin');
    console.log(`   ✓ Found ${results.length} works matching "calvin"`);

    if (results.length > 0) {
      console.log('\n   Top 5 results:');
      results.slice(0, 5).forEach((entry, i) => {
        console.log(`   ${i + 1}. ${entry.author} - ${entry.title}`);
        console.log(`      Work ID: ${entry.workId}`);
      });
    }
  } catch (error) {
    console.error('   ✗ Error:', error);
  }

  // Test 3: Search catalog by work title
  console.log('\n3. Testing catalog search (institutes)...');
  try {
    const results = await scraper.searchCatalog('institutes');
    console.log(`   ✓ Found ${results.length} works matching "institutes"`);

    if (results.length > 0) {
      console.log('\n   Top 3 results:');
      results.slice(0, 3).forEach((entry, i) => {
        console.log(`   ${i + 1}. ${entry.author} - ${entry.title}`);
        console.log(`      Work ID: ${entry.workId}`);
      });
    }
  } catch (error) {
    console.error('   ✗ Error:', error);
  }

  // Test 4: Service integration (searchAllWorks)
  console.log('\n4. Testing CCELService.searchAllWorks()...');
  try {
    const works = await service.searchAllWorks('luther');
    console.log(`   ✓ Found ${works.length} Luther works via service`);

    if (works.length > 0) {
      console.log('\n   Sample works:');
      works.slice(0, 5).forEach(work => {
        console.log(`   - ${work.title}`);
        console.log(`     Work ID: ${work.work}`);
        console.log(`     ${work.description}`);
      });
    }
  } catch (error) {
    console.error('   ✗ Error:', error);
  }

  // Test 5: Verify caching works
  console.log('\n5. Testing cache (should be instant)...');
  try {
    const start = Date.now();
    const cachedResults = await scraper.searchCatalog('calvin');
    const duration = Date.now() - start;
    console.log(`   ✓ Cache hit: ${duration}ms (should be < 10ms)`);
    console.log(`   ✓ Found ${cachedResults.length} cached results`);
  } catch (error) {
    console.error('   ✗ Error:', error);
  }

  // Test 6: Search for "What other works by Calvin?"
  console.log('\n6. Testing real-world query: "What other works by Calvin?"');
  try {
    const calvinWorks = await service.searchAllWorks('calvin');
    console.log(`   ✓ Found ${calvinWorks.length} Calvin works`);
    console.log('\n   User would see:');
    calvinWorks.slice(0, 10).forEach((work, i) => {
      console.log(`   ${i + 1}. ${work.title} (${work.work})`);
    });
  } catch (error) {
    console.error('   ✗ Error:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✓ All tests completed!\n');
}

// Run tests
testCatalogScraper().catch(console.error);
