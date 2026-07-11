import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities, htmlToText, stripHtml } from '../../../../src/adapters/shared/HtmlParser.js';

describe('HtmlParser', () => {
  it('decodes named, decimal, and hexadecimal entities', () => {
    expect(decodeHtmlEntities(
      '&amp;&lt;&gt;&quot;&#039;&apos; &#65; &#x42; &nbsp;&#160;&#xA0;',
    )).toBe("&<>\"'' A B    ");
  });

  it('strips tags while preserving paragraph and line-break structure', () => {
    const html = '<p> First   line<br/>second &amp; third</p>\n\n\n\n<p>Last</p>';

    expect(stripHtml(html)).toBe('First line\nsecond & third\n\nLast');
  });

  it('uses the same normalization for htmlToText', () => {
    expect(htmlToText('<div>Hello\t <strong>world</strong></div>'))
      .toBe('Hello world');
  });

  it('treats source-formatting newlines as spaces but preserves explicit breaks', () => {
    const html = `
      <div>Grace &amp; truth
        <span>nested text</span><br>
        final line
      </div>
    `;

    expect(stripHtml(html)).toBe('Grace & truth nested text\nfinal line');
  });
});
