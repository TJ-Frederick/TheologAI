/**
 * Prepare the machine-checkable first local query shown by guided prompts.
 *
 * This is deliberately not an intent classifier or a semantic rewriter. It
 * removes only a small, closed set of leading research-question frames that
 * otherwise make `all_terms` require generic words such as "historical" and
 * "perspectives". Quoted text and every remaining content term are preserved.
 * The MCP host still owns query choice and any bounded reformulation.
 */
export function initialPrimarySourceLocalQuery(question: string): string {
  const normalized = question.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const withoutFrame = normalized.replace(
    /^(?:historical\s+perspectives?\s+on|historical\s+(?:sources?|works?)\s+(?:about|on)|perspectives?\s+on)\s+/iu,
    '',
  );
  return withoutFrame.replace(/[?.!]+$/u, '').trim() || normalized;
}
