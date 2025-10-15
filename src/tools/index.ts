import { ToolHandler } from '../types/index.js';
import { bibleLookupHandler } from './bibleLookup.js';
// historicalSearchHandler deprecated - functionality merged into classicTextLookupHandler
// import { historicalSearchHandler } from './historicalSearch.js';
import { commentaryLookupHandler } from './commentaryLookup.js';
import { classicTextLookupHandler } from './classicTextLookup.js';
import { bibleCrossReferencesHandler } from './bibleCrossReferences.js';

export const tools: ToolHandler[] = [
  bibleLookupHandler,
  bibleCrossReferencesHandler,
  // historicalSearchHandler,  // DEPRECATED: Use classicTextLookupHandler instead (searches local docs first, then CCEL)
  commentaryLookupHandler,
  classicTextLookupHandler
];

export function getToolByName(name: string): ToolHandler | undefined {
  return tools.find(tool => tool.name === name);
}