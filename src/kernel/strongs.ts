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
const MAX_NUMBER = { G: 5624, H: 8674 } as const;

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
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_NUMBER[prefix]) return undefined;
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
