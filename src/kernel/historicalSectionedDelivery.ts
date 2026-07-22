import type { HistoricalDocumentDeliveryProfile, HistoricalSectionBrowseBoundary } from './repositories.js';

/** Frozen Transform-8 sectioned-only cursor contract. */
export const HISTORICAL_SECTIONED_ONLY_CURSOR_CONTRACT = 'historical-sectioned-only-cursor-v1' as const;
export const HISTORICAL_SECTIONED_ONLY_CURSOR_MAX_LENGTH = 2048;
export const HISTORICAL_SECTIONED_ONLY_PAGE_SIZE = 32;
export const HISTORICAL_SECTIONED_ONLY_LOOKAHEAD = 33;
export const HISTORICAL_SECTIONED_ONLY_LANDING_MAX_BYTES = 16_384;

interface HistoricalSectionedOnlyCursorV1 {
  contractVersion: typeof HISTORICAL_SECTIONED_ONLY_CURSOR_CONTRACT;
  documentId: string;
  editionId: string;
  immutableCorpusIdentity: string;
  pageSize: typeof HISTORICAL_SECTIONED_ONLY_PAGE_SIZE;
  lastSourceOrdinal: number;
  lastSectionKey: string;
}

export type HistoricalSectionedOnlyCursorPosition = HistoricalSectionBrowseBoundary;

/** A single stable error surface shared by the Node and D1 paths. */
export class HistoricalSectionedOnlyCursorError extends RangeError {
  constructor() {
    super('Historical section browse cursor is malformed, stale, or non-canonical.');
    this.name = 'HistoricalSectionedOnlyCursorError';
  }
}

export function encodeHistoricalSectionedOnlyCursor(
  profile: HistoricalDocumentDeliveryProfile,
  position: HistoricalSectionedOnlyCursorPosition,
): string {
  assertSectionedProfile(profile);
  assertPosition(position);
  const cursor = encodeBase64Url(JSON.stringify({
    contractVersion: HISTORICAL_SECTIONED_ONLY_CURSOR_CONTRACT,
    documentId: profile.documentId,
    editionId: profile.editionId,
    // A sectioned edition binds to its package; a legacy corpus would bind to
    // its immutable corpus identity.  The field name remains frozen.
    immutableCorpusIdentity: profile.sectionPackageIdentity ?? profile.immutableCorpusIdentity,
    pageSize: HISTORICAL_SECTIONED_ONLY_PAGE_SIZE,
    lastSourceOrdinal: position.sourceOrdinal,
    lastSectionKey: position.sectionKey,
  } satisfies HistoricalSectionedOnlyCursorV1));
  if (cursor.length > HISTORICAL_SECTIONED_ONLY_CURSOR_MAX_LENGTH) throw new HistoricalSectionedOnlyCursorError();
  return cursor;
}

export function decodeHistoricalSectionedOnlyCursor(
  cursor: string,
  profile: HistoricalDocumentDeliveryProfile,
): HistoricalSectionedOnlyCursorPosition {
  assertSectionedProfile(profile);
  if (!cursor || cursor.length > HISTORICAL_SECTIONED_ONLY_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new HistoricalSectionedOnlyCursorError();
  }
  let value: unknown;
  try {
    value = JSON.parse(decodeBase64Url(cursor));
  } catch {
    throw new HistoricalSectionedOnlyCursorError();
  }
  if (!isRecord(value)
    || Object.keys(value).join(',') !== 'contractVersion,documentId,editionId,immutableCorpusIdentity,pageSize,lastSourceOrdinal,lastSectionKey'
    || value.contractVersion !== HISTORICAL_SECTIONED_ONLY_CURSOR_CONTRACT
    || value.documentId !== profile.documentId
    || value.editionId !== profile.editionId
    || value.immutableCorpusIdentity !== (profile.sectionPackageIdentity ?? profile.immutableCorpusIdentity)
    || value.pageSize !== HISTORICAL_SECTIONED_ONLY_PAGE_SIZE) {
    throw new HistoricalSectionedOnlyCursorError();
  }
  const position = {
    sourceOrdinal: value.lastSourceOrdinal,
    sectionKey: value.lastSectionKey,
  };
  try {
    assertPosition(position as HistoricalSectionedOnlyCursorPosition);
  } catch {
    throw new HistoricalSectionedOnlyCursorError();
  }
  const canonical = encodeHistoricalSectionedOnlyCursor(profile, position as HistoricalSectionedOnlyCursorPosition);
  if (canonical !== cursor) throw new HistoricalSectionedOnlyCursorError();
  return position as HistoricalSectionedOnlyCursorPosition;
}

function assertSectionedProfile(profile: HistoricalDocumentDeliveryProfile): asserts profile is HistoricalDocumentDeliveryProfile & {
  deliveryMode: 'sectioned_only'; editionId: string; sectionPackageIdentity: string;
} {
  if (profile.deliveryMode !== 'sectioned_only'
    || profile.cursorVersion !== 1 || profile.browsePageSize !== HISTORICAL_SECTIONED_ONLY_PAGE_SIZE
    || profile.landingMaxBytes !== HISTORICAL_SECTIONED_ONLY_LANDING_MAX_BYTES
    || !profile.editionId || !profile.sectionPackageIdentity) {
    throw new HistoricalSectionedOnlyCursorError();
  }
}

function assertPosition(value: HistoricalSectionedOnlyCursorPosition): void {
  if (!Number.isSafeInteger(value.sourceOrdinal) || value.sourceOrdinal < 1
    || typeof value.sectionKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value.sectionKey)
    || value.sectionKey === '.' || value.sectionKey === '..') {
    throw new HistoricalSectionedOnlyCursorError();
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
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
