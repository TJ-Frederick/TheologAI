/**
 * Shared HTML → text extraction utilities.
 *
 * Replaces duplicated entity decoding in netBibleApi, esvApi, ccelApi.
 */

/** Decode common HTML entities */
export function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\u00a0/g, ' ');
}

/** Strip HTML tags, collapse whitespace */
export function stripHtml(html: string): string {
  // Raw newlines generally indent HTML source rather than represent authored
  // line breaks. Replace them before turning explicit HTML breaks into text.
  return decodeHtmlEntities(
    html
      .replace(/[\r\n]+/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extract text content from HTML, preserving paragraph structure */
export function htmlToText(html: string): string {
  return stripHtml(html);
}
