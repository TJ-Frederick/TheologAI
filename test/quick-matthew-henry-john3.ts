/**
 * Debug Matthew Henry John 3:16 - why is it empty?
 */

import { HelloAOApiAdapter } from '../src/adapters/helloaoApi.js';

const api = new HelloAOApiAdapter();

async function debugMatthewHenry() {
  console.log('Fetching Matthew Henry commentary on John 3...\n');

  const response = await api.getCommentaryChapter('matthew-henry', 'JHN', 3);

  console.log('Chapter content structure:');
  console.log('Total items:', response.chapter.content.length);
  console.log('\nAll verse numbers/entries found:');

  response.chapter.content.forEach((item: any, index: number) => {
    if ('verseNumber' in item) {
      console.log(`  [${index}] Verse ${item.verseNumber}`);
    } else if (item.type === 'verse' && 'number' in item) {
      console.log(`  [${index}] Verse ${item.number}`);
    } else if (item.type === 'heading') {
      console.log(`  [${index}] Heading: ${item.content?.[0]?.content || item.content?.[0] || 'N/A'}`);
    } else if (item.type === 'section') {
      console.log(`  [${index}] Section with ${item.content?.length || 0} items`);
    } else {
      console.log(`  [${index}] Type: ${item.type || 'unknown'}`);
    }
  });

  console.log('\n\nTrying to get verse 16 specifically:');
  const verse16 = HelloAOApiAdapter.getCommentaryForVerse(response, 16);
  console.log('Verse 16 result:', verse16 ? `Found (${verse16.length} chars)` : 'NOT FOUND');

  if (!verse16) {
    console.log('\nChecking if verse 16-21 or 16-18 range exists...');
    const verse16_21 = response.chapter.content.find((item: any) =>
      item.verseNumber === '16-21' || item.verseNumber === '16-18' ||
      (item.type === 'heading' && item.content?.[0]?.content?.includes('16'))
    );

    if (verse16_21) {
      console.log('Found range entry:', JSON.stringify(verse16_21, null, 2).substring(0, 500));
    }
  }
}

debugMatthewHenry().catch(console.error);
