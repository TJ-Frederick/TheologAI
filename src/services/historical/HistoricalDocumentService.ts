/**
 * Historical document service using SQLite repository.
 */

import type { HistoricalDocumentRepository, DocumentInfo, DocumentSection } from '../../adapters/data/HistoricalDocumentRepository.js';
import { NotFoundError } from '../../kernel/errors.js';

export class HistoricalDocumentService {
  constructor(private repo: HistoricalDocumentRepository) {}

  /** List all available documents */
  async listDocuments(): Promise<DocumentInfo[]> {
    return await this.repo.listDocuments();
  }

  /** Get a document by ID or name */
  async getDocument(idOrName: string): Promise<DocumentInfo> {
    const doc = await this.repo.getDocument(idOrName) ?? await this.repo.findDocumentByName(idOrName);
    if (!doc) {
      throw new NotFoundError('document', `Document not found: "${idOrName}"`);
    }
    return doc;
  }

  /** Get all sections of a document */
  async getSections(documentId: string): Promise<DocumentSection[]> {
    return await this.repo.getSections(documentId);
  }

  /** Get a specific section by number */
  async getSection(documentId: string, sectionNumber: string): Promise<DocumentSection> {
    const section = await this.repo.getSection(documentId, sectionNumber);
    if (!section) {
      throw new NotFoundError('section', `Section ${sectionNumber} not found in "${documentId}"`);
    }
    return section;
  }

  /** Search across all documents */
  async search(query: string, limit?: number): Promise<DocumentSection[]> {
    return await this.repo.search(query, limit);
  }

  /** Find document by name with fuzzy matching */
  async findDocument(name: string): Promise<DocumentInfo | undefined> {
    return await this.repo.findDocumentByName(name);
  }
}
