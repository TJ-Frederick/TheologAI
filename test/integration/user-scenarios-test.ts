/**
 * Test the actual user scenarios from the GitHub issue
 */

import { CCELService } from '../../src/services/ccelService.js';
import { SectionResolver } from '../../src/services/sectionResolver.js';

async function testUserScenarios() {
  console.log('\n========================================');
  console.log('USER SCENARIO TESTS');
  console.log('========================================\n');

  const service = new CCELService();
  const resolver = new SectionResolver();

  // Scenario 1: User asks "what does Alexander Maclaren say about Isaiah 53 in his commentary?"
  // Claude tries: { work: "maclaren/expositions", query: "Isaiah 53" }
  console.log('📖 SCENARIO 1: MacLaren + Isaiah 53');
  console.log('Query: { work: "maclaren/expositions", query: "Isaiah 53" }');
  console.log('---------------------------------------------------\n');

  try {
    // This should now auto-route to maclaren/isa_jer
    const result = await service.getClassicText({
      work: 'maclaren/expositions',
      query: 'Isaiah 53'
    });

    console.log('✅ SUCCESS!');
    console.log(`Routed to: ${result.work}`);
    console.log(`Title: ${result.title.substring(0, 80)}...`);
    console.log(`Content preview: ${result.content.substring(0, 200)}...\n`);
  } catch (error) {
    console.log('❌ FAILED');
    console.log(`Error: ${error instanceof Error ? error.message : error}\n`);
  }

  // Scenario 2: User says "check calvin's commentary"
  // Claude tries: { work: "calvin/commentary", query: "Isaiah 53" }
  console.log('📖 SCENARIO 2: Calvin + Isaiah 53');
  console.log('Query: { work: "calvin/commentary", query: "Isaiah 53" }');
  console.log('---------------------------------------------------\n');

  try {
    // This should now auto-route to calvin/calcom16
    const result = await service.getClassicText({
      work: 'calvin/commentary',
      query: 'Isaiah 53'
    });

    console.log('✅ SUCCESS!');
    console.log(`Routed to: ${result.work}`);
    console.log(`Title: ${result.title.substring(0, 80)}...`);
    console.log(`Content preview: ${result.content.substring(0, 200)}...\n`);
  } catch (error) {
    console.log('❌ FAILED');
    console.log(`Error: ${error instanceof Error ? error.message : error}\n`);
  }

  // Scenario 3: Simpler query - just "calvin" + "Isaiah 53"
  console.log('📖 SCENARIO 3: Calvin (simple) + Isaiah 53');
  console.log('Query: { work: "calvin", query: "Isaiah 53" }');
  console.log('---------------------------------------------------\n');

  try {
    const result = await service.getClassicText({
      work: 'calvin',
      query: 'Isaiah 53'
    });

    console.log('✅ SUCCESS!');
    console.log(`Routed to: ${result.work}`);
    console.log(`Title: ${result.title.substring(0, 80)}...`);
    console.log(`Content preview: ${result.content.substring(0, 200)}...\n`);
  } catch (error) {
    console.log('❌ FAILED');
    console.log(`Error: ${error instanceof Error ? error.message : error}\n`);
  }

  console.log('========================================');
  console.log('ALL USER SCENARIOS TESTED');
  console.log('========================================\n');
}

testUserScenarios().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
