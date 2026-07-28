import type { HistoricalHierarchyCursor, HistoricalHierarchyPublication } from './repositories.js';
import { isHistoricalHierarchyNodeKey } from './historicalHierarchyResource.js';

/** Frozen, opaque keyset cursor contract for dormant hierarchy delivery. */
export const HISTORICAL_HIERARCHY_CURSOR_CONTRACT = 'historical-hierarchy-browse-cursor-v1' as const;
export const HISTORICAL_HIERARCHY_CURSOR_MAX_LENGTH = 2048;
export const HISTORICAL_HIERARCHY_MAX_PAGE_SIZE = 32;

interface HistoricalHierarchyCursorV1 {
  contractVersion: typeof HISTORICAL_HIERARCHY_CURSOR_CONTRACT;
  hierarchyId: string;
  publicationId: string;
  cursorIdentity: string;
  parentNodeKey: string | null;
  pageSize: number;
  lastSiblingOrdinal: number;
  lastNodeKey: string;
}

/** A single stable error surface shared by Node and D1 dormant delivery. */
export class HistoricalHierarchyCursorError extends RangeError {
  constructor() {
    super('Historical hierarchy browse cursor is malformed, stale, or non-canonical.');
    this.name = 'HistoricalHierarchyCursorError';
  }
}

export function encodeHistoricalHierarchyCursor(
  publication: HistoricalHierarchyPublication,
  parentNodeKey: string | null,
  position: HistoricalHierarchyCursor,
): string {
  assertPublicationCursorContract(publication);
  assertParentNodeKey(parentNodeKey);
  assertPosition(position);
  const cursor = encodeBase64Url(JSON.stringify({
    contractVersion: HISTORICAL_HIERARCHY_CURSOR_CONTRACT,
    hierarchyId: publication.hierarchyId,
    publicationId: publication.publicationId,
    cursorIdentity: publication.cursorIdentity,
    parentNodeKey,
    pageSize: publication.browsePageSize,
    lastSiblingOrdinal: position.siblingOrdinal,
    lastNodeKey: position.nodeKey,
  } satisfies HistoricalHierarchyCursorV1));
  if (cursor.length > HISTORICAL_HIERARCHY_CURSOR_MAX_LENGTH) throw new HistoricalHierarchyCursorError();
  return cursor;
}

export function decodeHistoricalHierarchyCursor(
  cursor: string,
  publication: HistoricalHierarchyPublication,
  parentNodeKey: string | null,
): HistoricalHierarchyCursor {
  assertPublicationCursorContract(publication);
  assertParentNodeKey(parentNodeKey);
  if (!cursor || cursor.length > HISTORICAL_HIERARCHY_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new HistoricalHierarchyCursorError();
  }
  let value: unknown;
  try {
    value = JSON.parse(decodeBase64Url(cursor));
  } catch {
    throw new HistoricalHierarchyCursorError();
  }
  if (!isRecord(value)
    || Object.keys(value).join(',') !== 'contractVersion,hierarchyId,publicationId,cursorIdentity,parentNodeKey,pageSize,lastSiblingOrdinal,lastNodeKey'
    || value.contractVersion !== HISTORICAL_HIERARCHY_CURSOR_CONTRACT
    || value.hierarchyId !== publication.hierarchyId
    || value.publicationId !== publication.publicationId
    || value.cursorIdentity !== publication.cursorIdentity
    || value.parentNodeKey !== parentNodeKey
    || value.pageSize !== publication.browsePageSize) {
    throw new HistoricalHierarchyCursorError();
  }
  const position = { siblingOrdinal: value.lastSiblingOrdinal, nodeKey: value.lastNodeKey };
  try {
    assertPosition(position as HistoricalHierarchyCursor);
  } catch {
    throw new HistoricalHierarchyCursorError();
  }
  if (encodeHistoricalHierarchyCursor(publication, parentNodeKey, position as HistoricalHierarchyCursor) !== cursor) {
    throw new HistoricalHierarchyCursorError();
  }
  return position as HistoricalHierarchyCursor;
}

function assertPublicationCursorContract(publication: HistoricalHierarchyPublication): void {
  if (publication.deliveryKind !== 'hierarchy_nodes_v1'
    || publication.cursorContract !== HISTORICAL_HIERARCHY_CURSOR_CONTRACT
    || !/^[0-9a-f]{64}$/.test(publication.cursorIdentity)
    || !Number.isSafeInteger(publication.browsePageSize)
    || publication.browsePageSize < 1 || publication.browsePageSize > HISTORICAL_HIERARCHY_MAX_PAGE_SIZE) {
    throw new HistoricalHierarchyCursorError();
  }
}

function assertParentNodeKey(value: string | null): void {
  if (value !== null && !isHistoricalHierarchyNodeKey(value)) throw new HistoricalHierarchyCursorError();
}

function assertPosition(value: HistoricalHierarchyCursor): void {
  if (!Number.isSafeInteger(value.siblingOrdinal) || value.siblingOrdinal < 1 || !isHistoricalHierarchyNodeKey(value.nodeKey)) {
    throw new HistoricalHierarchyCursorError();
  }
}

function encodeBase64Url(value: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
