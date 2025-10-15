import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HistoricalResult } from '../types/index.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DocumentSection {
  title?: string;
  chapter?: string;
  question?: string;
  q?: string;
  a?: string;
  content?: string;
  topics?: string[];
}

export interface HistoricalDocument {
  title: string;
  type: string;
  date: string;
  sections: DocumentSection[];
  topics: string[];
}

export class LocalDataAdapter {
  private documentsCache: Map<string, HistoricalDocument> = new Map();
  private dataPath: string;

  constructor(dataPath?: string) {
    if (dataPath) {
      this.dataPath = dataPath;
    } else {
      // Use path relative to this file: src/adapters/../.. = project root
      // This works regardless of where the server is run from
      this.dataPath = join(__dirname, '..', '..', 'data');
    }
    this.loadDocuments();
  }

  private loadDocuments(): void {
    try {
      // Load all historical documents (creeds, confessions, catechisms)
      const historicalDocsPath = join(this.dataPath, 'historical-documents');
      try {
        const files = readdirSync(historicalDocsPath).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const content = readFileSync(join(historicalDocsPath, file), 'utf-8');
          const doc: HistoricalDocument = JSON.parse(content);
          this.documentsCache.set(file.replace('.json', ''), doc);
        }
      } catch (err) {
        console.error(`Error loading historical documents: ${err}`);
      }

      console.error(`Loaded ${this.documentsCache.size} historical documents from path: ${this.dataPath}`);
    } catch (error) {
      console.error('Error loading historical documents:', error);
    }
  }

  searchDocuments(query: string, documentFilter?: string, docType?: string): HistoricalResult[] {
    const results: HistoricalResult[] = [];
    const searchTerm = query.toLowerCase();

    // Tokenize the search query for multi-word searches
    const searchTokens = searchTerm.split(/\s+/).filter(token => token.length > 0);

    for (const [key, doc] of this.documentsCache) {
      // Filter by document if specified
      if (documentFilter && !key.includes(documentFilter.toLowerCase())) {
        continue;
      }

      // Filter by document type if specified
      if (docType && doc.type !== docType.toLowerCase()) {
        continue;
      }

      // Search in title (more flexible matching)
      const normalizedTitle = doc.title.toLowerCase().replace(/['"]/g, '').replace(/^the\s+/, '');
      const normalizedSearch = searchTerm.replace(/['"]/g, '').replace(/^the\s+/, '');

      if (normalizedTitle.includes(normalizedSearch) || doc.title.toLowerCase().includes(searchTerm)) {
        results.push({
          document: doc.title,
          section: 'Full Text',
          text: doc.sections[0]?.content || doc.title,
          citation: {
            source: `${doc.title} (${doc.date})`,
            url: `local:${key}`
          }
        });
      }

      // Search in document-level and section-level topics
      // Check if any search token matches any topic (OR logic)
      const topicMatches = doc.topics && searchTokens.some(token =>
        doc.topics.some(topic => topic.toLowerCase().includes(token))
      );

      if (topicMatches) {
        // Find sections with matching section-level topics, or all sections if none have topics
        const matchingSections = doc.sections.filter(section =>
          section.topics && searchTokens.some(token =>
            section.topics!.some(topic => topic.toLowerCase().includes(token))
          )
        );

        // If we found sections with matching topics, return those
        if (matchingSections.length > 0) {
          for (const section of matchingSections) {
            const sectionText = this.getSectionText(section);
            const sectionTitle = this.getSectionTitle(section);
            results.push({
              document: doc.title,
              section: sectionTitle,
              text: sectionText,
              citation: {
                source: `${doc.title} (${doc.date})`,
                url: `local:${key}`
              }
            });
          }
        } else {
          // Fallback: no section-level topics, return all sections (backward compatible)
          for (const section of doc.sections) {
            const sectionText = this.getSectionText(section);
            const sectionTitle = this.getSectionTitle(section);
            results.push({
              document: doc.title,
              section: sectionTitle,
              text: sectionText,
              citation: {
                source: `${doc.title} (${doc.date})`,
                url: `local:${key}`
              }
            });
          }
        }
      }

      // Search in sections - check if all tokens appear in text (AND logic for content search)
      // OR if any token appears for better recall
      for (const section of doc.sections) {
        const sectionText = this.getSectionText(section);
        const sectionTextLower = sectionText.toLowerCase();
        const sectionTitle = this.getSectionTitle(section);

        // First try exact phrase match
        if (sectionTextLower.includes(searchTerm)) {
          results.push({
            document: doc.title,
            section: sectionTitle,
            text: sectionText,
            citation: {
              source: `${doc.title} (${doc.date})`,
              url: `local:${key}`
            }
          });
        } else if (searchTokens.length > 1) {
          // For multi-word queries, check if ALL tokens appear (more precise)
          const allTokensPresent = searchTokens.every(token => sectionTextLower.includes(token));
          if (allTokensPresent) {
            results.push({
              document: doc.title,
              section: sectionTitle,
              text: sectionText,
              citation: {
                source: `${doc.title} (${doc.date})`,
                url: `local:${key}`
              }
            });
          }
        }
      }
    }

    return results;
  }

  getDocument(documentName: string): HistoricalDocument | undefined {
    return this.documentsCache.get(documentName);
  }

  listDocuments(): string[] {
    return Array.from(this.documentsCache.keys());
  }

  private getSectionText(section: DocumentSection): string {
    if (section.content) return section.content;
    if (section.q && section.a) return `Q: ${section.q} A: ${section.a}`;
    return '';
  }

  private getSectionTitle(section: DocumentSection): string {
    if (section.title) return section.title;
    if (section.chapter) return `Chapter ${section.chapter}`;
    if (section.question) return `Question ${section.question}`;
    return 'Section';
  }
}