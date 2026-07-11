/**
 * Normalize STEPBible-style Latin transliterations for ASCII search.
 *
 * Greek and Hebrew queries are intentionally not passed through this helper by
 * the repositories. Their original Unicode spelling continues to use FTS;
 * this normalization is only for the Latin transliteration column.
 */

const TRANSLITERATION_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['ʼ', ''],
  ['ʾ', ''],
  ['ʿ', ''],
  ['ʻ', ''],
  ['’', ''],
  ['‘', ''],
  ['ˢ', 's'],
  ['ᵉ', 'e'],
];

/** Convert a Latin transliteration such as ʼĕlôhîym to elohim. */
export function normalizeTransliteration(value: string): string {
  let normalized = value.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
  for (const [from, to] of TRANSLITERATION_REPLACEMENTS) {
    normalized = normalized.replaceAll(from, to);
  }
  // STEPBible writes the Hebrew plural ending as `îym` in forms such as
  // ʼĕlôhîym. Restrict this compatibility spelling to the word ending;
  // arbitrary `iy` sequences must not collapse to a one-character query.
  return normalized.replace(/iym$/, 'im');
}

/**
 * Restrict the SQL fallback to simple ASCII transliteration terms.
 * Unicode lemma searches continue to use the original FTS query unchanged.
 */
export function isAsciiTransliterationQuery(value: string): boolean {
  return /^[A-Za-z]{2,100}$/.test(value);
}

// SQLite/D1 do not expose JavaScript's Unicode normalization APIs. This
// expression mirrors the common Latin characters found in the corpus before
// lower-casing, allowing both repositories to share the same fallback query.
const SQL_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ...TRANSLITERATION_REPLACEMENTS,
  ['Á', 'a'], ['Â', 'a'], ['Ç', 'c'], ['É', 'e'], ['Ê', 'e'], ['Î', 'i'],
  ['Ô', 'o'], ['Û', 'u'], ['à', 'a'], ['á', 'a'], ['â', 'a'], ['ç', 'c'],
  ['è', 'e'], ['é', 'e'], ['ê', 'e'], ['ì', 'i'], ['í', 'i'], ['î', 'i'],
  ['ï', 'i'], ['ó', 'o'], ['ô', 'o'], ['ú', 'u'], ['û', 'u'], ['ý', 'y'],
  ['ÿ', 'y'], ['Ă', 'a'], ['ă', 'a'], ['Ē', 'e'], ['ē', 'e'], ['Ĕ', 'e'],
  ['ĕ', 'e'], ['Ō', 'o'], ['ō', 'o'], ['ŏ', 'o'], ['ŷ', 'y'], ['ḕ', 'e'],
  ['Ḗ', 'e'], ['ḗ', 'e'], ['ḯ', 'i'], ['ṑ', 'o'], ['ṓ', 'o'], ['Ṭ', 't'],
  ['ṭ', 't'],
];

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Build a SQL expression that normalizes a transliteration column. */
export function normalizedTransliterationSql(column = 's.transliteration'): string {
  const replaced = SQL_REPLACEMENTS.reduce(
    (expression, [from, to]) => `replace(${expression}, ${sqlString(from)}, ${sqlString(to)})`,
    column,
  );
  const lowered = `lower(${replaced})`;
  return `(CASE WHEN ${lowered} LIKE '%iym' ` +
    `THEN substr(${lowered}, 1, length(${lowered}) - 3) || 'im' ELSE ${lowered} END)`;
}
