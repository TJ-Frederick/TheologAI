import { ToolHandler } from '../types/index.js';
import { bibleLookupHandler } from './bibleLookup.js';
// historicalSearchHandler deprecated - functionality merged into classicTextLookupHandler
// import { historicalSearchHandler } from './historicalSearch.js';
import { commentaryLookupHandler } from './commentaryLookup.js';
import { classicTextLookupHandler } from './classicTextLookup.js';
import { bibleCrossReferencesHandler } from './bibleCrossReferences.js';
import { parallelPassagesHandler } from './parallelPassages.js';
import { originalLanguageLookupHandler, bibleVerseMorphologyHandler } from './biblicalLanguages.js';

export const tools: ToolHandler[] = [
  bibleLookupHandler,
  bibleCrossReferencesHandler,
  parallelPassagesHandler,
  // historicalSearchHandler,  // DEPRECATED: Use classicTextLookupHandler instead (searches local docs first, then CCEL)
  commentaryLookupHandler,
  classicTextLookupHandler,
  originalLanguageLookupHandler,
  bibleVerseMorphologyHandler
];

export function getToolByName(name: string): ToolHandler | undefined {
  return tools.find(tool => tool.name === name);
}