/**
 * All 66 Bible Books Mapping Test
 *
 * Validates that every book of the Bible can be mapped to CCEL commentary sections
 * Tests the complete coverage of Matthew Henry's Commentary
 */

import { mapToMatthewHenry, findBookMapping } from '../../src/utils/commentaryMapper.js';

console.log('='.repeat(80));
console.log('ALL 66 BIBLE BOOKS - CCEL MAPPING VALIDATION');
console.log('='.repeat(80));
console.log();

/**
 * Representative verse from each of the 66 books
 * Format: [Book Chapter:Verse, Expected Volume]
 */
const allBooks: Array<[string, number]> = [
  // Old Testament - Volume 1: Genesis - Deuteronomy
  ['Genesis 1:1', 1],
  ['Exodus 20:1', 1],
  ['Leviticus 19:18', 1],
  ['Numbers 6:24', 1],
  ['Deuteronomy 6:4', 1],

  // Old Testament - Volume 2: Joshua - Esther
  ['Joshua 1:8', 2],
  ['Judges 6:12', 2],
  ['Ruth 1:16', 2],
  ['1 Samuel 17:45', 2],
  ['2 Samuel 7:12', 2],
  ['1 Kings 18:21', 2],
  ['2 Kings 2:11', 2],
  ['1 Chronicles 16:34', 2],
  ['2 Chronicles 7:14', 2],
  ['Ezra 3:11', 2],
  ['Nehemiah 8:10', 2],
  ['Esther 4:14', 2],

  // Old Testament - Volume 3: Job - Song of Solomon
  ['Job 19:25', 3],
  ['Psalm 23:1', 3],
  ['Proverbs 3:5', 3],
  ['Ecclesiastes 3:1', 3],
  ['Song of Solomon 2:1', 3],

  // Old Testament - Volume 4: Isaiah - Malachi
  ['Isaiah 53:5', 4],
  ['Jeremiah 29:11', 4],
  ['Lamentations 3:22', 4],
  ['Ezekiel 36:26', 4],
  ['Daniel 6:10', 4],
  ['Hosea 6:1', 4],
  ['Joel 2:28', 4],
  ['Amos 5:24', 4],
  ['Obadiah 1:15', 4],
  ['Jonah 2:9', 4],
  ['Micah 6:8', 4],
  ['Nahum 1:7', 4],
  ['Habakkuk 2:4', 4],
  ['Zephaniah 3:17', 4],
  ['Haggai 2:9', 4],
  ['Zechariah 4:6', 4],
  ['Malachi 3:10', 4],

  // New Testament - Volume 5: Matthew - John
  ['Matthew 5:16', 5],
  ['Mark 10:45', 5],
  ['Luke 19:10', 5],
  ['John 3:16', 5],

  // New Testament - Volume 6: Acts - Revelation
  ['Acts 1:8', 6],
  ['Romans 8:28', 6],
  ['1 Corinthians 13:13', 6],
  ['2 Corinthians 5:17', 6],
  ['Galatians 5:22', 6],
  ['Ephesians 2:8', 6],
  ['Philippians 4:13', 6],
  ['Colossians 3:2', 6],
  ['1 Thessalonians 5:16', 6],
  ['2 Thessalonians 3:16', 6],
  ['1 Timothy 2:5', 6],
  ['2 Timothy 3:16', 6],
  ['Titus 2:11', 6],
  ['Philemon 1:6', 6],
  ['Hebrews 11:1', 6],
  ['James 1:2', 6],
  ['1 Peter 3:15', 6],
  ['2 Peter 3:9', 6],
  ['1 John 4:8', 6],
  ['2 John 1:6', 6],
  ['3 John 1:4', 6],
  ['Jude 1:24', 6],
  ['Revelation 21:4', 6],
];

let passedCount = 0;
let failedCount = 0;
const failures: string[] = [];

console.log('Testing all 66 books of the Bible...');
console.log();

for (const [reference, expectedVolume] of allBooks) {
  try {
    const mapping = mapToMatthewHenry(reference);

    // Extract volume number from work identifier (e.g., "henry/mhc5" → 5)
    const volumeMatch = mapping.work.match(/mhc(\d+)/);
    const actualVolume = volumeMatch ? parseInt(volumeMatch[1], 10) : -1;

    if (actualVolume === expectedVolume) {
      console.log(`✓ ${reference.padEnd(25)} → ${mapping.section}`);
      passedCount++;
    } else {
      console.log(`✗ ${reference.padEnd(25)} → ${mapping.section} (Expected Vol${expectedVolume}, got Vol${actualVolume})`);
      failedCount++;
      failures.push(reference);
    }
  } catch (error) {
    console.log(`✗ ${reference.padEnd(25)} → ERROR: ${error instanceof Error ? error.message : error}`);
    failedCount++;
    failures.push(reference);
  }
}

console.log();
console.log('='.repeat(80));
console.log('RESULTS');
console.log('='.repeat(80));
console.log(`Total Books: ${allBooks.length}`);
console.log(`Passed: ${passedCount}`);
console.log(`Failed: ${failedCount}`);
console.log();

if (failures.length > 0) {
  console.log('Failed References:');
  failures.forEach(ref => console.log(`  - ${ref}`));
  console.log();
}

if (passedCount === allBooks.length) {
  console.log('🎉 SUCCESS! All 66 books of the Bible are properly mapped to CCEL sections!');
  console.log('Matthew Henry\'s Commentary coverage is complete.');
} else {
  console.log(`⚠️  WARNING: ${failedCount} books failed mapping validation.`);
  console.log('Review the failures above and update the book mapping.');
}

console.log('='.repeat(80));
