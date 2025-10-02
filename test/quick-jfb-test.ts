import { HelloAOApiAdapter } from '../src/adapters/helloaoApi.js';

const adapter = new HelloAOApiAdapter();

const result = await adapter.getCommentaryChapter('jamieson-fausset-brown', 'JHN', 3);

console.log(`JFB John 3 - Verse entries: ${result.chapter.content.length}`);
console.log();

// Show first few verse numbers
for (let i = 0; i < Math.min(5, result.chapter.content.length); i++) {
  const entry = result.chapter.content[i];
  console.log(`Verse ${entry.verseNumber}: ${entry.content.length} annotations`);
}

// Try to extract verse 16
const verse16 = HelloAOApiAdapter.getCommentaryForVerse(result, 16);
console.log();
console.log(`Verse 16 found: ${verse16 ? 'Yes' : 'No'}`);
if (verse16) {
  console.log(`Verse 16 preview: ${verse16.substring(0, 200)}...`);
}
