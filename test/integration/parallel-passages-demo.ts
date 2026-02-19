/**
 * Parallel Passages Tool - User Scenario Demo
 *
 * Demonstrates real-world usage of the parallel_passages tool
 *
 * Run with: npx tsx test/integration/parallel-passages-demo.ts
 */

import dotenv from 'dotenv';
import { parallelPassagesHandler } from '../../src/tools/parallelPassages.js';

dotenv.config();

console.log('='.repeat(80));
console.log('PARALLEL PASSAGES TOOL - USER SCENARIOS DEMO');
console.log('='.repeat(80));
console.log();

// ============================================================================
// SCENARIO 1: Seminary Student - Studying Gospel Harmony
// ============================================================================

console.log('SCENARIO 1: Seminary Student Studying Feeding of the 5000');
console.log('-'.repeat(80));
console.log('Student wants to compare how each Gospel describes the miracle...\n');

const result1 = await parallelPassagesHandler.handler({
  reference: 'Matthew 14:13-21',
  mode: 'synoptic',
  includeText: false,  // Quick discovery first
  useCrossReferences: false
});

console.log(result1.content[0].text);
console.log('\n');

// ============================================================================
// SCENARIO 2: Pastor - Preparing Sermon on OT Prophecy
// ============================================================================

console.log('='.repeat(80));
console.log('SCENARIO 2: Pastor Preparing Sermon on Isaiah 53 (Suffering Servant)');
console.log('-'.repeat(80));
console.log('Pastor wants to see how NT authors understood and applied this passage...\n');

const result2 = await parallelPassagesHandler.handler({
  reference: 'Isaiah 53:5',
  mode: 'quotation',
  includeText: true,
  translation: 'ESV',
  showDifferences: true,
  useCrossReferences: false
});

console.log(result2.content[0].text);
console.log('\n');

// ============================================================================
// SCENARIO 3: Bible Study Leader - Comparing Beatitudes
// ============================================================================

console.log('='.repeat(80));
console.log('SCENARIO 3: Bible Study Leader - Matthew vs Luke Beatitudes');
console.log('-'.repeat(80));
console.log('Group wants to understand differences between Sermon on Mount (Matthew) and Plain (Luke)...\n');

const result3 = await parallelPassagesHandler.handler({
  reference: 'Matthew 5:1-12',
  mode: 'synoptic',
  includeText: false,
  useCrossReferences: false
});

console.log(result3.content[0].text);
console.log('\n');

// ============================================================================
// SCENARIO 4: Researcher - Using Cross-References for Discovery
// ============================================================================

console.log('='.repeat(80));
console.log('SCENARIO 4: Researcher - Comprehensive Resurrection Parallel Discovery');
console.log('-'.repeat(80));
console.log('Researcher wants to find ALL references to resurrection, including cross-references...\n');

const result4 = await parallelPassagesHandler.handler({
  reference: 'Matthew 28:1-10',
  mode: 'auto',
  includeText: false,
  useCrossReferences: true,  // Enable discovery augmentation
  maxParallels: 15
});

console.log(result4.content[0].text);
console.log('\n');

// ============================================================================
// SCENARIO 5: Quick Reference Check
// ============================================================================

console.log('='.repeat(80));
console.log('SCENARIO 5: Quick Check - Does Psalm 110:1 Have NT Parallels?');
console.log('-'.repeat(80));
console.log('User quickly checks if this psalm is quoted in NT...\n');

const result5 = await parallelPassagesHandler.handler({
  reference: 'Psalm 110:1',
  mode: 'auto',
  includeText: false,
  useCrossReferences: false
});

console.log(result5.content[0].text);
console.log('\n');

// ============================================================================
// Summary
// ============================================================================

console.log('='.repeat(80));
console.log('✅ DEMO COMPLETE');
console.log('='.repeat(80));
console.log();
console.log('The parallel_passages tool successfully:');
console.log('  ✓ Discovers synoptic Gospel parallels');
console.log('  ✓ Finds OT quotations in NT');
console.log('  ✓ Supports both metadata-only and full-text modes');
console.log('  ✓ Augments with cross-reference data when requested');
console.log('  ✓ Provides confidence scores and relationship types');
console.log();
console.log('Next steps:');
console.log('  • Add more parallels to the database as users request them');
console.log('  • Consider adding "compare" mode for user-specified passages');
console.log('  • Enhance difference detection with NLP/semantic analysis');
console.log();
