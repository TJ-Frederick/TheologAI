import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { resolve } from 'path';
import { HistoricalResult } from '../types/index.js';

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
      // Use absolute path since process.cwd() isn't reliable in Claude Desktop
      this.dataPath = '/Users/tyler/Projects/TheologAI/data';
    }
    this.loadDocuments();
  }

  private loadDocuments(): void {
    try {
      // Load creeds
      const creedsPath = join(this.dataPath, 'creeds');
      try {
        const creedFiles = readdirSync(creedsPath).filter(f => f.endsWith('.json'));
        for (const file of creedFiles) {
          const content = readFileSync(join(creedsPath, file), 'utf-8');
          const doc: HistoricalDocument = JSON.parse(content);
          this.documentsCache.set(file.replace('.json', ''), doc);
        }
      } catch (err) {
        console.error(`Error loading creeds: ${err}`);
      }

      // Load confessions
      const confessionsPath = join(this.dataPath, 'confessions');
      try {
        const confessionFiles = readdirSync(confessionsPath).filter(f => f.endsWith('.json'));
        for (const file of confessionFiles) {
          const content = readFileSync(join(confessionsPath, file), 'utf-8');
          const doc: HistoricalDocument = JSON.parse(content);
          this.documentsCache.set(file.replace('.json', ''), doc);
        }
      } catch (err) {
        console.error(`Error loading confessions: ${err}`);
      }

      console.error(`Loaded ${this.documentsCache.size} historical documents from path: ${this.dataPath}`);
    } catch (error) {
      console.error('Error loading historical documents:', error);
    }
  }

  searchDocuments(query: string, documentFilter?: string, docType?: string): HistoricalResult[] {
    const results: HistoricalResult[] = [];
    const searchTerm = query.toLowerCase();

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
      if (doc.topics.some(topic => topic.toLowerCase().includes(searchTerm))) {
        // Find sections with matching section-level topics, or all sections if none have topics
        const matchingSections = doc.sections.filter(section =>
          section.topics && section.topics.some(topic => topic.toLowerCase().includes(searchTerm))
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

      // Search in sections
      for (const section of doc.sections) {
        const sectionText = this.getSectionText(section);
        const sectionTitle = this.getSectionTitle(section);

        if (sectionText.toLowerCase().includes(searchTerm)) {
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