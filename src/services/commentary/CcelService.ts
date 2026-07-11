/**
 * CCEL classic text service.
 *
 * Provides access to classic theological works via CCEL adapter.
 * Data (work listings, topic mappings) loaded from external JSON
 * instead of hardcoded in the service.
 */

import { CcelAdapter } from '../../adapters/commentary/CcelAdapter.js';
import { ValidationError } from '../../kernel/errors.js';

export interface ClassicTextRequest {
  work: string;
  section?: string;
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

  constructor(adapter: CcelAdapter) {
    this.adapter = adapter;
  }

  /** Look up a classic work section */
  async getWorkSection(request: ClassicTextRequest): Promise<ClassicTextResponse> {
    if (!CCEL_IDENTIFIER.test(request.work) || (request.section && !CCEL_IDENTIFIER.test(request.section))) {
      throw new ValidationError('work', 'CCEL work and section identifiers may contain only letters, numbers, dots, underscores, hyphens, and slashes.');
    }
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

    return response;
  }

  private deriveTitle(work: string, section: string): string {
    // Extract a readable title from the work/section path
    const parts = work.split('/').filter(Boolean);
    const author = this.humanize(parts[0] ?? '');
    const workName = this.humanize(parts.slice(1).join(' '));
    if (author && workName) return `${author} — ${workName}`;
    return author || this.humanize(section) || 'Classic text';
  }

  private humanize(s: string): string {
    return s
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}

const CCEL_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
