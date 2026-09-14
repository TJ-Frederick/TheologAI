/** Plain-text validation and Markdown presentation shared by preparation and active renderers. */

/** Kept as the established public error name for compatibility callers. */
export class EditionProvenanceValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'EditionProvenanceValidationError';
  }
}

/** The only invisible format characters retained in corpus bodies. */
export const EDITION_PROVENANCE_ALLOWED_CONTENT_FORMAT_CHARACTERS = Object.freeze([
  '\u200c', // ZERO WIDTH NON-JOINER
  '\u200d', // ZERO WIDTH JOINER
] as const);

function fail(path: string, message: string): never {
  throw new EditionProvenanceValidationError(path, message);
}

export function editionStringAt(input: unknown, path: string): string {
  if (typeof input !== 'string') fail(path, 'must be a string');
  return input;
}

export function safeEditionTextAt(input: unknown, path: string, maxCharacters: number, allowLineBreaks = false, allowPlainTextSyntax = false): string {
  const raw = editionStringAt(input, path);
  if (hasLoneSurrogate(raw)) fail(path, 'contains a lone UTF-16 surrogate');
  const value = raw.normalize('NFC');
  if (!value || value !== value.trim() || [...value].length > maxCharacters) fail(path, `must be non-empty, trimmed, and at most ${maxCharacters} Unicode characters`);
  const forbiddenControls = allowLineBreaks
    ? /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u
    : /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/u;
  if (forbiddenControls.test(value)) fail(path, 'contains forbidden control or bidirectional-control characters');
  if (/[\p{Zl}\p{Zp}]/u.test(value)) fail(path, 'contains a Unicode line or paragraph separator; use an explicit line feed in corpus text');
  const allowedFormatCharacters = allowLineBreaks ? new Set<string>(EDITION_PROVENANCE_ALLOWED_CONTENT_FORMAT_CHARACTERS) : new Set<string>();
  if ([...value].some(character => /\p{Cf}/u.test(character) && !allowedFormatCharacters.has(character))) {
    fail(path, allowLineBreaks ? 'contains an unapproved invisible format character; corpus text permits only ZWNJ and ZWJ' : 'contains an invisible format character; single-line metadata permits none');
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if ((codePoint >= 0xfdd0 && codePoint <= 0xfdef) || (codePoint & 0xffff) >= 0xfffe) fail(path, 'contains a forbidden Unicode noncharacter');
  }
  if (!allowPlainTextSyntax && /<\/?[A-Za-z][^>]*>|<!DOCTYPE|<!--|<\?xml|javascript\s*:|\bon[A-Za-z]+\s*=/iu.test(value)) fail(path, 'contains markup or executable-content syntax');
  return value;
}

export interface FrozenEditionTextBoundary {
  leadingLineFeeds: string;
  interior: string;
  trailingLineFeeds: string;
}

export function splitFrozenEditionTextAt(input: unknown, path: string, maxCharacters: number): FrozenEditionTextBoundary {
  const raw = editionStringAt(input, path);
  if (hasLoneSurrogate(raw)) fail(path, 'contains a lone UTF-16 surrogate');
  const value = raw.normalize('NFC');
  if (!value || [...value].length > maxCharacters) fail(path, `must be non-empty, trimmed, and at most ${maxCharacters} Unicode characters`);
  if (value.includes('\r')) fail(path, 'contains a carriage return; corpus text must use line feeds');
  const interior = value.replace(/^\n+|\n+$/g, '');
  if (!interior || interior !== interior.trim()) fail(path, 'must be trimmed except for LF-only frozen source boundaries');
  safeEditionTextAt(interior, path, maxCharacters, true, true);
  return { leadingLineFeeds: value.match(/^\n+/u)?.[0] ?? '', interior, trailingLineFeeds: value.match(/\n+$/u)?.[0] ?? '' };
}

/** Escape trimmed plain text before interpolation into CommonMark/GFM. */
export function escapeEditionPlainTextForMarkdown(content: string): string {
  return safeEditionTextAt(content, '$.content', Number.MAX_SAFE_INTEGER, true, true)
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '\\$&');
}

/** Escape frozen source text while preserving LF-only outer boundaries. */
export function escapeFrozenEditionSectionContentForMarkdown(content: string): string {
  const boundary = splitFrozenEditionTextAt(content, '$.content', Number.MAX_SAFE_INTEGER);
  return `${boundary.leadingLineFeeds}${escapeEditionPlainTextForMarkdown(boundary.interior)}${boundary.trailingLineFeeds}`;
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index++;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return true;
  }
  return false;
}
