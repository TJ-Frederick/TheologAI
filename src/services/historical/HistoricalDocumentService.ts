/**
 * Historical document service using SQLite repository.
 */

import type { HistoricalDocumentRepository, DocumentInfo, DocumentSection } from '../../adapters/data/HistoricalDocumentRepository.js';
import { NotFoundError } from '../../kernel/errors.js';

export class HistoricalDocumentService {
  constructor(private repo: HistoricalDocumentRepository) {}

  /** List all available documents */
  listDocuments(): DocumentInfo[] {
    return this.repo.listDocuments();
  }

  /** Get a document by ID or name */
  getDocument(idOrName: string): DocumentInfo {
    const doc = this.repo.getDocument(idOrName) ?? this.repo.findDocumentByName(idOrName);
    if (!doc) {
      throw new NotFoundError('document', `Document not found: "${idOrName}"`);
    }
    return doc;
  }

  /** Get all sections of a document */
  getSections(documentId: string): DocumentSection[] {
    return this.repo.getSections(documentId);
  }

  /** Get a specific section by number */
  getSection(documentId: string, sectionNumber: string): DocumentSection {
    const section = this.repo.getSection(documentId, sectionNumber);
    if (!section) {
      throw new NotFoundError('section', `Section ${sectionNumber} not found in "${documentId}"`);
    }
    return section;
  }

  /** Search across all documents */
  search(query: string, limit?: number): DocumentSection[] {
    return this.repo.search(query, limit);
  }

  /** Find document by name with fuzzy matching */
  findDocument(name: string): DocumentInfo | undefined {
    return this.repo.findDocumentByName(name);
  }
}
