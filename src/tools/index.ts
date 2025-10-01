import { ToolHandler } from '../types/index.js';
import { bibleLookupHandler } from './bibleLookup.js';
import { historicalSearchHandler } from './historicalSearch.js';
import { commentaryLookupHandler } from './commentaryLookup.js';
import { classicTextLookupHandler } from './classicTextLookup.js';

export const tools: ToolHandler[] = [
  bibleLookupHandler,
  historicalSearchHandler,
  commentaryLookupHandler,
  classicTextLookupHandler
];

export function getToolByName(name: string): ToolHandler | undefined {
  return tools.find(tool => tool.name === name);
}