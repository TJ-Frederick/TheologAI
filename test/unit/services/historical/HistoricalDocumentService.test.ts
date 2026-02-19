import { describe, it, expect, vi } from 'vitest';
import { HistoricalDocumentService } from '../../../../src/services/historical/HistoricalDocumentService.js';
import type { DocumentInfo, DocumentSection } from '../../../../src/adapters/data/HistoricalDocumentRepository.js';
import { NotFoundError } from '../../../../src/kernel/errors.js';

// ── Mock repository ──

const mockDoc: DocumentInfo = {
  id: 'nicene-creed',
  title: 'Nicene Creed',
  type: 'creed',
  date: '325 AD',
  topics: ['trinity'],
};

const mockSection: DocumentSection = {
  id: 1,
  document_id: 'nicene-creed',
  section_number: '1',
  title: 'Article I',
  content: 'We believe in one God...',
  topics: ['god'],
};

function makeMockRepo() {
  return {
    listDocuments: vi.fn().mockReturnValue([mockDoc]),
    getDocument: vi.fn().mockReturnValue(mockDoc),
    findDocumentByName: vi.fn().mockReturnValue(undefined),
    getSections: vi.fn().mockReturnValue([mockSection]),
    getSection: vi.fn().mockReturnValue(mockSection),
    search: vi.fn().mockReturnValue([mockSection]),
  };
}

describe('HistoricalDocumentService', () => {
  it('delegates listDocuments to repository', () => {
    const repo = makeMockRepo();
    const service = new HistoricalDocumentService(repo as any);
    const docs = service.listDocuments();
    expect(repo.listDocuments).toHaveBeenCalled();
    expect(docs).toHaveLength(1);
  });

  describe('getDocument', () => {
    it('returns document when found by ID', () => {
      const repo = makeMockRepo();
      const service = new HistoricalDocumentService(repo as any);
      const doc = service.getDocument('nicene-creed');
      expect(repo.getDocument).toHaveBeenCalledWith('nicene-creed');
      expect(doc.id).toBe('nicene-creed');
    });

    it('falls back to findDocumentByName when not found by ID', () => {
      const repo = makeMockRepo();
      repo.getDocument.mockReturnValue(undefined);
      repo.findDocumentByName.mockReturnValue(mockDoc);
      const service = new HistoricalDocumentService(repo as any);
      const doc = service.getDocument('Nicene Creed');
      expect(repo.findDocumentByName).toHaveBeenCalledWith('Nicene Creed');
      expect(doc.id).toBe('nicene-creed');
    });

    it('throws NotFoundError when neither lookup finds document', () => {
      const repo = makeMockRepo();
      repo.getDocument.mockReturnValue(undefined);
      repo.findDocumentByName.mockReturnValue(undefined);
      const service = new HistoricalDocumentService(repo as any);
      expect(() => service.getDocument('nonexistent')).toThrow(NotFoundError);
    });
  });

  it('delegates getSections to repository', () => {
    const repo = makeMockRepo();
    const service = new HistoricalDocumentService(repo as any);
    const sections = service.getSections('nicene-creed');
    expect(repo.getSections).toHaveBeenCalledWith('nicene-creed');
    expect(sections).toHaveLength(1);
  });

  describe('getSection', () => {
    it('returns section when found', () => {
      const repo = makeMockRepo();
      const service = new HistoricalDocumentService(repo as any);
      const section = service.getSection('nicene-creed', '1');
      expect(repo.getSection).toHaveBeenCalledWith('nicene-creed', '1');
      expect(section.title).toBe('Article I');
    });

    it('throws NotFoundError when section not found', () => {
      const repo = makeMockRepo();
      repo.getSection.mockReturnValue(undefined);
      const service = new HistoricalDocumentService(repo as any);
      expect(() => service.getSection('nicene-creed', '99')).toThrow(NotFoundError);
    });
  });

  it('delegates search to repository with query and limit', () => {
    const repo = makeMockRepo();
    const service = new HistoricalDocumentService(repo as any);
    service.search('grace', 10);
    expect(repo.search).toHaveBeenCalledWith('grace', 10);
  });

  it('delegates findDocument to repository', () => {
    const repo = makeMockRepo();
    repo.findDocumentByName.mockReturnValue(mockDoc);
    const service = new HistoricalDocumentService(repo as any);
    const result = service.findDocument('nicene');
    expect(repo.findDocumentByName).toHaveBeenCalledWith('nicene');
    expect(result?.id).toBe('nicene-creed');
  });
});
