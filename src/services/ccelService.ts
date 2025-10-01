/**
 * CCEL (Christian Classics Ethereal Library) Service
 *
 * Provides high-level access to classic Christian texts:
 * - Scripture passages from multiple translations
 * - Classic work sections (Augustine, Calvin, Luther, etc.)
 * - Quotations and fragments from classic works
 */

import { CCELApiAdapter, type CCELScriptureOptions, type CCELWorkSection } from '../adapters/ccelApi.js';
import { Cache } from '../utils/cache.js';

export interface ClassicTextRequest {
  work: string;        // Work identifier (e.g., 'augustine/confessions')
  section?: string;    // Section identifier (e.g., 'confessions.ii')
  query?: string;      // Optional search query to find relevant sections
}

export interface ClassicTextResponse {
  work: string;
  section: string;
  title: string;
  content: string;
  source: string;
  url: string;
}

export interface ScriptureResponse {
  reference: string;
  translation: string;
  text: string;
  source: string;
}

export class CCELService {
  private adapter: CCELApiAdapter;
  private cache: Cache<any>;

  constructor() {
    this.adapter = new CCELApiAdapter();
    this.cache = new Cache();
  }

  /**
   * Look up a Bible passage from CCEL
   *
   * @param reference - Bible reference (e.g., "John 3:16")
   * @param translation - Bible translation (e.g., "KJV", "NRSV", "ASV")
   * @returns Scripture response
   */
  async getScripture(reference: string, translation: string = 'KJV'): Promise<ScriptureResponse> {
    const cacheKey = `ccel:${translation}:${reference}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as ScriptureResponse;
    }

    // Format reference for CCEL API
    const passage = CCELApiAdapter.formatPassageReference(reference);

    // Fetch from CCEL
    const result = await this.adapter.getScripture({
      version: translation.toLowerCase(),
      passage
    });

    const response: ScriptureResponse = {
      reference,
      translation: translation.toUpperCase(),
      text: result.text,
      source: 'CCEL (Christian Classics Ethereal Library)'
    };

    // Cache the response
    this.cache.set(cacheKey, response);

    return response;
  }

  /**
   * Get a section from a classic Christian work
   *
   * @param request - Classic text request
   * @returns Classic text response with content
   */
  async getClassicText(request: ClassicTextRequest): Promise<ClassicTextResponse> {
    const { work, section } = request;

    if (!section) {
      throw new Error('Section identifier is required. Example: augustine/confessions -> confessions.ii');
    }

    const cacheKey = `ccel:work:${work}:${section}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as ClassicTextResponse;
    }

    // Fetch from CCEL
    const result = await this.adapter.getWorkSection({
      work,
      section
    });

    // Extract title from work/section identifiers
    const title = this.formatWorkTitle(work, section);

    const response: ClassicTextResponse = {
      work,
      section,
      title,
      content: result.content,
      source: 'CCEL (Christian Classics Ethereal Library)',
      url: `https://ccel.org/ccel/${work}/${section}.html`
    };

    // Cache the response
    this.cache.set(cacheKey, response);

    return response;
  }

  /**
   * Get available CCEL translations
   */
  getAvailableTranslations(): string[] {
    return [
      'KJV',    // King James Version
      'NRSV',   // New Revised Standard Version
      'ASV',    // American Standard Version
      'WEB',    // World English Bible
      'YLT',    // Young's Literal Translation
      'Darby'   // Darby Translation
    ];
  }

  /**
   * Get information about popular classic works available on CCEL
   */
  getPopularWorks(): Array<{ work: string; author: string; title: string; sampleSection: string; description: string }> {
    return [
      {
        work: 'augustine/confessions',
        author: 'Augustine of Hippo',
        title: 'Confessions',
        sampleSection: 'confessions.iv',
        description: 'Book 1 - Augustine\'s early years and conversion'
      },
      {
        work: 'augustine/city_of_god',
        author: 'Augustine of Hippo',
        title: 'City of God',
        sampleSection: 'cityofgod.ii.i',
        description: 'Book 1, Chapter 1 - Against the pagans'
      },
      {
        work: 'calvin/institutes',
        author: 'John Calvin',
        title: 'Institutes of the Christian Religion',
        sampleSection: 'institutes.iii.ii',
        description: 'Book 1, Chapter 1 - Knowledge of God and ourselves'
      },
      {
        work: 'luther/bondage',
        author: 'Martin Luther',
        title: 'The Bondage of the Will',
        sampleSection: 'bondage.iii',
        description: 'Part 1 - Luther\'s response to Erasmus'
      },
      {
        work: 'aquinas/summa',
        author: 'Thomas Aquinas',
        title: 'Summa Theologica',
        sampleSection: 'summa.fp.q1.a1',
        description: 'First Part, Question 1, Article 1'
      },
      {
        work: 'bunyan/pilgrim',
        author: 'John Bunyan',
        title: "Pilgrim's Progress",
        sampleSection: 'pilgrim.iii',
        description: 'Part 1 - Christian\'s journey begins'
      }
    ];
  }

  /**
   * Format work title from identifiers
   */
  private formatWorkTitle(work: string, section: string): string {
    const [author, workName] = work.split('/');

    // Capitalize and format
    const formattedAuthor = author.charAt(0).toUpperCase() + author.slice(1);
    const formattedWork = workName
      .split(/[_-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const formattedSection = section
      .split('.')
      .map(part => part.toUpperCase())
      .join(' - ');

    return `${formattedAuthor}: ${formattedWork} (${formattedSection})`;
  }

  /**
   * Search for works by topic or keyword
   * (This is a helper method - actual search would require CCEL's search API)
   */
  suggestWorks(topic: string): Array<{ work: string; author: string; title: string; reason: string }> {
    const topicLower = topic.toLowerCase();
    const suggestions: Array<{ work: string; author: string; title: string; reason: string }> = [];

    // Simple keyword matching - could be enhanced with actual CCEL search
    if (topicLower.includes('grace') || topicLower.includes('salvation')) {
      suggestions.push({
        work: 'augustine/confessions',
        author: 'Augustine',
        title: 'Confessions',
        reason: 'Classic work on God\'s grace and conversion'
      });
    }

    if (topicLower.includes('sovereignty') || topicLower.includes('providence')) {
      suggestions.push({
        work: 'calvin/institutes',
        author: 'Calvin',
        title: 'Institutes of the Christian Religion',
        reason: 'Comprehensive systematic theology'
      });
    }

    if (topicLower.includes('will') || topicLower.includes('free will')) {
      suggestions.push({
        work: 'luther/bondage',
        author: 'Luther',
        title: 'The Bondage of the Will',
        reason: 'Luther\'s treatise on human will and divine sovereignty'
      });
    }

    if (topicLower.includes('city') || topicLower.includes('kingdom')) {
      suggestions.push({
        work: 'augustine/city_of_god',
        author: 'Augustine',
        title: 'City of God',
        reason: 'The church and the world, God\'s kingdom'
      });
    }

    return suggestions;
  }
}
