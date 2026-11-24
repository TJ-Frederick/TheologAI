import { describe, it, expect, vi } from 'vitest';
import { HistoricalDocumentService } from '../../../../src/services/historical/HistoricalDocumentService.js';
import type { DocumentInfo, DocumentSection } from '../../../../src/adapters/data/HistoricalDocumentRepository.js';
import { NotFoundError } from '../../../../src/kernel/errors.js';
import type { HistoricalDocumentDeliveryProfile } from '../../../../src/kernel/repositories.js';

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

const mockProfile: HistoricalDocumentDeliveryProfile = {
  documentId: mockDoc.id, workId: null, editionId: null,
  immutableCorpusIdentity: 'a'.repeat(64), sectionPackageIdentity: null,
  deliveryMode: 'complete_document', sectionCount: 1,
  landingMaxBytes: 0, browsePageSize: 0, cursorVersion: 0,
  provenance: {}, rights: {},
};

function makeMockRepo() {
  return {
    listDocuments: vi.fn().mockReturnValue([mockDoc]),
    getDeliveryProfile: vi.fn().mockReturnValue(mockProfile),
    getDocument: vi.fn().mockReturnValue(mockDoc),
    findDocumentByName: vi.fn().mockReturnValue(undefined),
    getSections: vi.fn().mockReturnValue([mockSection]),
    getSection: vi.fn().mockReturnValue(mockSection),
    resolveSection: vi.fn().mockReturnValue({
      document: mockDoc, section: mockSection, sectionKey: 'source-0001', sourceOrdinal: 1,
      requestedSectionId: 'source-0001', resolution: 'canonical',
    }),
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

  it('uses the bulk catalog read without point reads when supported', async () => {
    const entries = [{ document: mockDoc, profile: mockProfile }];
    const repo = { ...makeMockRepo(), listDocumentsWithProfiles: vi.fn().mockResolvedValue(entries) };
    const service = new HistoricalDocumentService(repo as any);

    await expect(service.listDocumentsWithProfiles()).resolves.toEqual(entries);
    expect(repo.listDocumentsWithProfiles).toHaveBeenCalledOnce();
    expect(repo.listDocuments).not.toHaveBeenCalled();
    expect(repo.getDeliveryProfile).not.toHaveBeenCalled();
  });

  it('reports the exact missing joined profile without reading individual works', async () => {
    const repo = { ...makeMockRepo(), listDocumentsWithProfiles: vi.fn().mockReturnValue([
      { document: mockDoc, profile: mockProfile },
      { document: { ...mockDoc, id: 'missing-middle' }, profile: undefined },
      { document: { ...mockDoc, id: 'last' }, profile: { ...mockProfile, documentId: 'last' } },
    ]) };
    const service = new HistoricalDocumentService(repo as any);

    await expect(service.listDocumentsWithProfiles()).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.listDocumentsWithProfiles()).rejects.toThrow('Historical delivery profile not found for "missing-middle"');
    expect(repo.getDeliveryProfile).not.toHaveBeenCalled();
  });

  it('supports point-read repositories and preserves an empty catalog', async () => {
    const repo = makeMockRepo();
    const service = new HistoricalDocumentService(repo as any);

    await expect(service.listDocumentsWithProfiles()).resolves.toEqual([{ document: mockDoc, profile: mockProfile }]);
    expect(repo.getDeliveryProfile).toHaveBeenCalledExactlyOnceWith(mockDoc.id);
    repo.getDeliveryProfile.mockClear();
    repo.listDocuments.mockReturnValue([]);
    await expect(service.listDocumentsWithProfiles()).resolves.toEqual([]);
    expect(repo.getDeliveryProfile).not.toHaveBeenCalled();
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

  describe('resolveSection', () => {
    it('preserves the repository source-first result', async () => {
      const repo = makeMockRepo();
      const service = new HistoricalDocumentService(repo as any);
      const resolved = await service.resolveSection('nicene-creed', 'source-0001');
      expect(repo.resolveSection).toHaveBeenCalledWith('nicene-creed', 'source-0001');
      expect(resolved).toMatchObject({ sectionKey: 'source-0001', sourceOrdinal: 1, resolution: 'canonical' });
    });

    it('keeps unknown transform-8 IDs in the not-found error taxonomy', async () => {
      const repo = makeMockRepo();
      repo.resolveSection.mockReturnValue(undefined);
      const service = new HistoricalDocumentService(repo as any);
      await expect(service.resolveSection('nicene-creed', 'not-a-reviewed-section-key'))
        .rejects.toThrow(NotFoundError);
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
