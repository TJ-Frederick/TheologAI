/**
 * Historical document service using SQLite repository.
 */

import type {
  IHistoricalDocumentRepository, DocumentInfo, DocumentSection,
  HistoricalDocumentDeliveryProfile, HistoricalSectionBrowseBoundary, ResolvedHistoricalSection,
  HistoricalSectionSummary,
} from '../../kernel/repositories.js';
import { NotFoundError } from '../../kernel/errors.js';

export class HistoricalDocumentService {
  constructor(private repo: IHistoricalDocumentRepository) {}

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

  async getDeliveryProfile(documentId: string): Promise<HistoricalDocumentDeliveryProfile> {
    const profile = await this.repo.getDeliveryProfile(documentId);
    if (!profile) throw new NotFoundError('document', `Historical delivery profile not found for "${documentId}"`);
    return profile;
  }

  async resolveSection(documentId: string, sectionId: string): Promise<ResolvedHistoricalSection> {
    const section = await this.repo.resolveSection(documentId, sectionId);
    if (!section) throw new NotFoundError('section', `Section ${sectionId} not found in "${documentId}"`);
    return section;
  }

  async browseHistoricalSectionSummaries(
    documentId: string,
    after: HistoricalSectionBrowseBoundary | undefined,
    limit: number,
  ): Promise<HistoricalSectionSummary[]> {
    return await this.repo.browseHistoricalSectionSummaries(documentId, after, limit);
  }

  async hasHistoricalSectionBoundary(documentId: string, boundary: HistoricalSectionBrowseBoundary): Promise<boolean> {
    return await this.repo.hasHistoricalSectionBoundary(documentId, boundary);
  }

  /** Search across all documents */
  async search(query: string, limit?: number): Promise<DocumentSection[]> {
    return await this.repo.search(query, limit);
  }

  async searchResolvedSections(query: string, limit?: number): Promise<ResolvedHistoricalSection[]> {
    return await this.repo.searchResolvedSections(query, limit);
  }

  /** Find document by name with fuzzy matching */
  async findDocument(name: string): Promise<DocumentInfo | undefined> {
    return await this.repo.findDocumentByName(name);
  }
}
