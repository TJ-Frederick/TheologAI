/** Canonical identities used by the public Strong's API and STEPBible data. */
export interface CanonicalStrongsIdentity {
  prefix: 'G' | 'H';
  number: number;
  suffix?: string;
  /** Unpadded public identifier, preserving an optional uppercase STEPBible suffix. */
  publicId: string;
  /** Four-digit STEPBible/morphology identifier, preserving the same suffix. */
  morphologyKey: string;
}

const STRONGS_ID = /^([GH])(\d+)([A-Z]?)$/i;

/**
 * STEPBible extends classical dictionary numbering with morphology particles,
 * proper names, and other source identities (for example H9001 and G21502).
 * Five decimal digits is the reviewed, storage-safe interchange domain. It is
 * identity grammar, not a claim that every number exists in every repository.
 */
export const STRONGS_IDENTITY_MAX_DIGITS = 5;
export const STRONGS_IDENTITY_MAX_NUMBER = 99_999;
export const STRONGS_IDENTITY_PATTERN = '^[GHgh](?:[1-9]\\d{0,4}|0[1-9]\\d{0,3}|00[1-9]\\d{0,2}|000[1-9]\\d?|0000[1-9])[A-Za-z]?$';

/**
 * Parse a Strong's identifier once at the kernel boundary.
 *
 * Public concordance data uses unpadded numbers (G25), while STEPBible data
 * uses four-digit keys (G0025). Optional sense suffixes are semantic and must
 * survive conversion between those two representations.
 */
export function parseStrongsIdentity(input: string): CanonicalStrongsIdentity | undefined {
  const match = STRONGS_ID.exec(input.trim());
  if (!match) return undefined;

  const prefix = match[1].toUpperCase() as 'G' | 'H';
  if (match[2].length > STRONGS_IDENTITY_MAX_DIGITS) return undefined;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number < 1 || number > STRONGS_IDENTITY_MAX_NUMBER) return undefined;
  const digits = String(number);
  const suffix = match[3].toUpperCase() || undefined;

  return {
    prefix,
    number,
    suffix,
    publicId: `${prefix}${digits}${suffix ?? ''}`,
    morphologyKey: `${prefix}${digits.padStart(4, '0')}${suffix ?? ''}`,
  };
}
