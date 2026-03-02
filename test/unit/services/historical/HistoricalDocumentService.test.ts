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
  it('delegates listDocuments to repository', async () => {
    const repo = makeMockRepo();
    const service = new HistoricalDocumentService(repo as any);
    const docs = await service.listDocuments();
    expect(repo.listDocuments).toHaveBeenCalled();
    expect(docs).toHaveLength(1);
  });

  describe('getDocument', () => {
    it('returns document when found by ID', async () => {
      const repo = makeMockRepo();
      const service = new HistoricalDocumentService(repo as any);
      const doc = await service.getDocument('nicene-creed');
      expect(repo.getDocument).toHaveBeenCalledWith('nicene-creed');
      expect(doc.id).toBe('nicene-creed');
    });

    it('falls back to findDocumentByName when not found by ID', async () => {
      const repo = makeMockRepo();
      repo.getDocument.mockReturnValue(undefined);
      repo.findDocumentByName.mockReturnValue(mockDoc);
      const service = new HistoricalDocumentService(repo as any);
      const doc = await service.getDocument('Nicene Creed');
      expect(repo.findDocumentByName).toHaveBeenCalledWith('Nicene Creed');
      expect(doc.id).toBe('nicene-creed');
    });

    it('throws NotFoundError when neither lookup finds document', async () => {
      const repo = makeMockRepo();
      repo.getDocument.mockReturnValue(undefined);
      repo.findDocumentByName.mockReturnValue(undefined);
      const service = new HistoricalDocumentService(repo as any);
      await expect(service.getDocument('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  it('delegates getSections to repository', async () => {
    const repo = makeMockRepo();
    const service = new HistoricalDocumentService(repo as any);
    const sections = await service.getSections('nicene-creed');
    expect(repo.getSections).toHaveBeenCalledWith('nicene-creed');
    expect(sections).toHaveLength(1);
  });

  describe('getSection', () => {
    it('returns section when found', async () => {
      const repo = makeMockRepo();
      const service = new HistoricalDocumentService(repo as any);
      const section = await service.getSection('nicene-creed', '1');
      expect(repo.getSection).toHaveBeenCalledWith('nicene-creed', '1');
      expect(section.title).toBe('Article I');
    });

    it('throws NotFoundError when section not found', async () => {
      const repo = makeMockRepo();
      repo.getSection.mockReturnValue(undefined);
      const service = new HistoricalDocumentService(repo as any);
      await expect(service.getSection('nicene-creed', '99')).rejects.toThrow(NotFoundError);
    });
  });

  it('delegates search to repository with query and limit', async () => {
    const repo = makeMockRepo();
    const service = new HistoricalDocumentService(repo as any);
    await service.search('grace', 10);
    expect(repo.search).toHaveBeenCalledWith('grace', 10);
  });

  it('delegates findDocument to repository', async () => {
    const repo = makeMockRepo();
    repo.findDocumentByName.mockReturnValue(mockDoc);
    const service = new HistoricalDocumentService(repo as any);
    const result = await service.findDocument('nicene');
    expect(repo.findDocumentByName).toHaveBeenCalledWith('nicene');
    expect(result?.id).toBe('nicene-creed');
  });
});
