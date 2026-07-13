/** Normalize the limited HTML-like markup embedded in STEPBible lexicons. */
export function normalizeLexiconText(value: string): string {
  return decodeLexiconEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<ref=['"][^'"]*['"]>/gi, '')
    .replace(/<\/ref>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function decodeLexiconEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized === 'nbsp') return ' ';
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    const code = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return !Number.isInteger(code) || code < 0 || code > 0x10FFFF
      ? _match
      : String.fromCodePoint(code);
  });
}
