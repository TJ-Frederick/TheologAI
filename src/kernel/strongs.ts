/** Canonical identities used by the public Strong's API and STEPBible data. */
export interface CanonicalStrongsIdentity {
  /** Unpadded public identifier, preserving an optional lowercase sense suffix. */
  publicId: string;
  /** Four-digit STEPBible/morphology identifier, preserving the same suffix. */
  morphologyKey: string;
}

const STRONGS_ID = /^([GH])(\d+)([a-z]?)$/i;

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

  const prefix = match[1].toUpperCase();
  const digits = match[2].replace(/^0+(?=\d)/, '');
  const suffix = match[3].toLowerCase();

  return {
    publicId: `${prefix}${digits}${suffix}`,
    morphologyKey: `${prefix}${digits.padStart(4, '0')}${suffix}`,
  };
}

/** Remove an optional sense suffix while retaining the chosen key format. */
export function baseStrongsId(id: string): string {
  return id.replace(/[a-z]$/, '');
}
