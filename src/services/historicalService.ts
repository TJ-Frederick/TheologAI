import { LocalDataAdapter } from '../adapters/localData.js';
import { HistoricalSearchParams, HistoricalResult } from '../types/index.js';

export class HistoricalService {
  private localDataAdapter: LocalDataAdapter;

  constructor() {
    this.localDataAdapter = new LocalDataAdapter();
  }

  async search(params: HistoricalSearchParams): Promise<HistoricalResult[]> {
    return this.localDataAdapter.searchDocuments(
      params.query,
      params.document,
      params.docType
    );
  }

  getAvailableDocuments(): string[] {
    return this.localDataAdapter.listDocuments();
  }
}