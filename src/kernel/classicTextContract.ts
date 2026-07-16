import { buildLocalDocumentResourceUri } from './documentResource.js';

/** Shared storage and v1 output bounds for locally hosted classic texts. */
export const CLASSIC_TEXT_LIMITS = {
  workCount: 100,
  sectionsPerWork: 2000,
  documentIdCharacters: 160,
  titleCharacters: 300,
  typeCharacters: 100,
  dateCharacters: 100,
  topicCount: 64,
  topicCharacters: 160,
  sectionNumberCharacters: 160,
  resourceUriCharacters: 384,
  nativeDirectoryLinks: 32,
  searchHits: 10,
  discoverySnippetCharacters: 303,
} as const;

export interface ClassicTextStoredDocumentMetadata {
  id: unknown;
  title: unknown;
  type: unknown;
  date: unknown;
  topics: unknown;
}

export interface ClassicTextStoredSectionMetadata {
  id?: unknown;
  documentId: unknown;
  sectionNumber: unknown;
  title: unknown;
}

export function assertClassicTextDocumentMetadata(
  document: ClassicTextStoredDocumentMetadata,
  context = 'Classic-text document',
): asserts document is { id: string; title: string; type: string; date: string | null; topics: string[] } {
  assertBoundedText(document.id, 1, CLASSIC_TEXT_LIMITS.documentIdCharacters, `${context} id`);
  assertBoundedText(document.title, 1, CLASSIC_TEXT_LIMITS.titleCharacters, `${context} title`);
  assertBoundedText(document.type, 1, CLASSIC_TEXT_LIMITS.typeCharacters, `${context} type`);
  if (document.date !== null) {
    assertBoundedText(document.date, 1, CLASSIC_TEXT_LIMITS.dateCharacters, `${context} date`);
  }
  if (!Array.isArray(document.topics) || document.topics.length > CLASSIC_TEXT_LIMITS.topicCount) {
    throw new Error(`${context} topics must contain at most ${CLASSIC_TEXT_LIMITS.topicCount} strings`);
  }
  for (const [index, topic] of document.topics.entries()) {
    assertBoundedText(topic, 0, CLASSIC_TEXT_LIMITS.topicCharacters, `${context} topic ${index}`);
  }
  const uri = buildLocalDocumentResourceUri(document.id);
  if (!uri || codePointLength(uri) > CLASSIC_TEXT_LIMITS.resourceUriCharacters) {
    throw new Error(`${context} id cannot form a bounded canonical resource URI`);
  }
}

export function assertClassicTextSectionMetadata(
  section: ClassicTextStoredSectionMetadata,
  context = 'Classic-text section',
): asserts section is { id?: number; documentId: string; sectionNumber: string; title: string } {
  if (section.id !== undefined
    && (!Number.isSafeInteger(section.id) || (section.id as number) < 0)) {
    throw new Error(`${context} id must be a non-negative safe integer`);
  }
  assertBoundedText(section.documentId, 1, CLASSIC_TEXT_LIMITS.documentIdCharacters, `${context} document id`);
  assertBoundedText(section.sectionNumber, 1, CLASSIC_TEXT_LIMITS.sectionNumberCharacters, `${context} section number`);
  assertBoundedText(section.title, 0, CLASSIC_TEXT_LIMITS.titleCharacters, `${context} title`);
  const uri = buildLocalDocumentResourceUri(section.documentId, section.sectionNumber);
  if (!uri || codePointLength(uri) > CLASSIC_TEXT_LIMITS.resourceUriCharacters) {
    throw new Error(`${context} identity cannot form a bounded canonical resource URI`);
  }
}

function assertBoundedText(value: unknown, minimum: number, maximum: number, field: string): asserts value is string {
  const length = typeof value === 'string' ? codePointLength(value) : -1;
  if (length < minimum || length > maximum) {
    throw new Error(`${field} must contain ${minimum}..${maximum} Unicode characters`);
  }
}

function codePointLength(value: string): number {
  return [...value].length;
}
