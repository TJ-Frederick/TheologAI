/**
 * CCEL (Christian Classics Ethereal Library) adapter.
 *
 * Consolidates ccelApi.ts + ccelCatalogScraper.ts + ccelToc.ts into one adapter.
 * Provides access to 1000+ classic theological texts.
 */

import type { BibleReference } from '../../kernel/reference.js';
import { toCcelMatthewHenry, toCcelMHCConcise, toCcelJFB, formatReference } from '../../kernel/reference.js';
import { HttpClient } from '../shared/HttpClient.js';
import { AdapterError } from '../../kernel/errors.js';
import { stripHtml, decodeHtmlEntities } from '../shared/HtmlParser.js';

export interface CcelWorkResult {
  work: string;
  section: string;
  content: string;
}

export class CcelAdapter {
  private client: HttpClient;

  constructor() {
    this.client = new HttpClient({
      source: 'CCEL',
      baseUrl: 'https://ccel.org',
      cacheTtlMs: 2 * 60 * 60 * 1000, // 2 hour cache
      cacheMaxSize: 200,
    });
  }

  /** Fetch Bible commentary from CCEL for a specific commentator */
  async getCommentary(ref: BibleReference, commentator: string): Promise<CcelWorkResult> {
    const mapper = this.getMapper(commentator);
    const { work, section } = mapper(ref);
    return this.getWorkSection(work, section);
  }

  /** Fetch a CCEL work section by work ID and section ID */
  async getWorkSection(work: string, section: string): Promise<CcelWorkResult> {
    const html = await this.client.getText(`/ccel/${work}/${section}.html?html=true`);
    const content = this.extractBookContent(html);

    return { work, section, content };
  }

  /** Fetch scripture passage from CCEL */
  async getScripture(passage: string, version: string = 'nrsv'): Promise<string> {
    const params = new URLSearchParams({ version, passage });
    const xml = await this.client.getText(`/ajax/scripture?${params}`);

    const bodyMatch = xml.match(/<body>([\s\S]*?)<\/body>/);
    if (!bodyMatch) {
      throw new AdapterError('CCEL', 'Could not parse scripture response');
    }

    return stripHtml(decodeHtmlEntities(bodyMatch[1]));
  }

  private getMapper(commentator: string): (ref: BibleReference) => { work: string; section: string } {
    const normalized = commentator.toLowerCase().trim();
    if (normalized.includes('concise')) return (ref) => toCcelMHCConcise(ref);
    if (normalized.includes('jfb') || normalized.includes('jamieson')) return (ref) => toCcelJFB(ref);
    return (ref) => toCcelMatthewHenry(ref);
  }

  private extractBookContent(html: string): string {
    // Check for error pages
    if (html.includes('Something went wrong') || html.includes('VIEWNAME is 500') || html.length < 100) {
      throw new AdapterError('CCEL', 'Section not found or error page returned');
    }

    // Find the book-content div
    const bookContentStart = html.search(/<div[^>]*class="book-content"[^>]*>/i);
    if (bookContentStart === -1) {
      throw new AdapterError('CCEL', 'Could not find book content in response');
    }

    const startTag = html.slice(bookContentStart).match(/<div[^>]*class="book-content"[^>]*>/i)?.[0];
    if (!startTag) {
      throw new AdapterError('CCEL', 'Could not parse book content div');
    }

    // Find matching closing tag by counting nested divs
    let depth = 0;
    let pos = bookContentStart + startTag.length;
    const contentStart = pos;

    while (pos < html.length) {
      const nextOpen = html.indexOf('<div', pos);
      const nextClose = html.indexOf('</div>', pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 4;
      } else {
        if (depth === 0) {
          const extracted = html.slice(contentStart, nextClose);
          return this.cleanContent(extracted);
        }
        depth--;
        pos = nextClose + 6;
      }
    }

    throw new AdapterError('CCEL', 'Could not extract book content');
  }

  private cleanContent(html: string): string {
    let text = html;
    // Remove scripts, styles, comments, nav
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/<table[^>]*class="book_navbar"[^>]*>[\s\S]*?<\/table>/gi, '');
    text = text.replace(/<sup[^>]*class="Note"[^>]*>[\s\S]*?<\/sup>/gi, '');

    return stripHtml(text);
  }
}
