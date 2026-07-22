import { describe, expect, it } from 'vitest';
import {
  AquinasTopologyValidationError,
  assertExactCoverage,
  parseAndAuditHtml,
  strictHtmlUtf8,
} from '../../../scripts/aquinas-gutenberg-topology.js';

function document(body: string, head = ''): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

describe('Aquinas Gutenberg topology scanner hardening', () => {
  it('accepts only a strict, fully located inert HTML tree', () => {
    expect(() => parseAndAuditHtml(document('<p id="alpha">Synthetic</p>', '<style>.a{}</style>'), 'fixture')).not.toThrow();
    expect(() => parseAndAuditHtml('<!doctype html><html><body><p id="alpha">Synthetic</p></body></html>', 'fixture')).toThrow(AquinasTopologyValidationError);
    expect(() => parseAndAuditHtml(document('<p id="alpha"><div id="beta">Synthetic</div></p>'), 'fixture')).toThrow(AquinasTopologyValidationError);
  });

  it('rejects active, hidden, commented, malformed-identifier, and oversized fixtures', () => {
    for (const body of [
      '<script id="alpha">0</script>',
      '<template id="alpha">x</template>',
      '<svg id="alpha"></svg>',
      '<p id="alpha" hidden>z</p>',
      '<!-- synthetic -->',
      '<p id="alpha">x</p><p id="alpha">y</p>',
      '<p id="α">x</p>',
      `<p id="alpha">${'x'.repeat(262_145)}</p>`,
    ]) expect(() => parseAndAuditHtml(document(body), 'fixture')).toThrow(AquinasTopologyValidationError);
  });

  it('rejects invalid byte and Unicode input before parser execution', () => {
    for (const value of [
      Uint8Array.from([0xff]),
      new TextEncoder().encode('a\u0000b'),
      new TextEncoder().encode('a\u202eb'),
      new TextEncoder().encode('a\ufdd0b'),
    ]) expect(() => strictHtmlUtf8(value, 'fixture')).toThrow(AquinasTopologyValidationError);
  });

  it('requires exact source coverage without untyped gaps or overlaps', () => {
    expect(() => assertExactCoverage([
      { type: 'authorial_article', startChar: 1, endChar: 3 },
      { type: 'structural_metadata', startChar: 3, endChar: 5 },
    ], 1, 5, 0)).not.toThrow();
    expect(() => assertExactCoverage([{ type: 'authorial_article', startChar: 1, endChar: 3 }], 1, 5, 0)).toThrow(/coverage/);
    expect(() => assertExactCoverage([
      { type: 'authorial_article', startChar: 1, endChar: 3 },
      { type: 'structural_metadata', startChar: 2, endChar: 5 },
    ], 1, 5, 0)).toThrow(/coverage/);
  });
});
