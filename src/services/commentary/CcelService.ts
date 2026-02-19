/**
 * CCEL classic text service.
 *
 * Provides access to classic theological works via CCEL adapter.
 * Data (work listings, topic mappings) loaded from external JSON
 * instead of hardcoded in the service.
 */

import { CcelAdapter } from '../../adapters/commentary/CcelAdapter.js';
import { Cache } from '../../kernel/cache.js';

export interface ClassicTextRequest {
  work: string;
  section?: string;
  query?: string;
}

export interface ClassicTextResponse {
  work: string;
  section: string;
  title: string;
  content: string;
  source: string;
  url: string;
}

export class CcelService {
  private adapter: CcelAdapter;
  private cache: Cache<ClassicTextResponse>;

  constructor(adapter?: CcelAdapter) {
    this.adapter = adapter ?? new CcelAdapter();
    this.cache = new Cache(200, 2 * 60 * 60 * 1000);
  }

  /** Look up a classic work section */
  async getWorkSection(request: ClassicTextRequest): Promise<ClassicTextResponse> {
    const cacheKey = `${request.work}:${request.section || ''}:${request.query || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const section = request.section || request.work.split('/').pop() || '';
    const result = await this.adapter.getWorkSection(request.work, section);

    const response: ClassicTextResponse = {
      work: result.work,
      section: result.section,
      title: this.deriveTitle(result.work, result.section),
      content: result.content,
      source: 'CCEL (Christian Classics Ethereal Library)',
      url: `https://ccel.org/ccel/${result.work}/${result.section}.html`,
    };

    this.cache.set(cacheKey, response);
    return response;
  }

  private deriveTitle(work: string, section: string): string {
    // Extract a readable title from the work/section path
    const parts = work.split('/');
    const author = parts[0]?.replace(/-/g, ' ') ?? '';
    const workName = parts[1]?.replace(/-/g, ' ') ?? '';
    return `${this.capitalize(author)} — ${this.capitalize(workName)}`;
  }

  private capitalize(s: string): string {
    return s.replace(/\b\w/g, c => c.toUpperCase());
  }
}
