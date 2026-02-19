/**
 * Parallel passage discovery service.
 *
 * Uses curated parallel-passages.json + cross-reference repository.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CrossReferenceRepository } from '../../adapters/data/CrossReferenceRepository.js';
import type { BibleAdapter } from '../../adapters/bible/BibleAdapter.js';
import type { ParallelPassageLookupParams, ParallelPassageResult, ParallelPassage } from '../../kernel/types.js';
import { parseReference, formatReference } from '../../kernel/reference.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ParallelEntry {
  event: string;
  relationship: 'synoptic' | 'quotation' | 'allusion' | 'thematic';
  confidence: number;
  parallels: string[];
  notes: string;
  uniqueDetails: Record<string, string[]>;
}

interface ParallelDatabase {
  description: string;
  version: string;
  parallels: Record<string, ParallelEntry>;
}

export class ParallelPassageService {
  private database: ParallelDatabase;
  private crossRefs: CrossReferenceRepository;
  private bibleAdapter?: BibleAdapter;

  constructor(
    crossRefs: CrossReferenceRepository,
    bibleAdapter?: BibleAdapter,
    databasePath?: string,
  ) {
    this.crossRefs = crossRefs;
    this.bibleAdapter = bibleAdapter;
    const dbPath = databasePath ?? join(__dirname, '..', '..', 'data', 'parallel-passages.json');
    this.database = JSON.parse(readFileSync(dbPath, 'utf-8'));
  }

  async lookup(params: ParallelPassageLookupParams): Promise<ParallelPassageResult> {
    const ref = parseReference(params.reference);
    const refStr = formatReference(ref);

    // Find curated parallels
    const entry = this.findEntry(refStr);
    const parallels: ParallelPassage[] = [];

    if (entry) {
      for (const p of entry.parallels) {
        const parallel: ParallelPassage = {
          reference: p,
          relationship: entry.relationship,
          confidence: entry.confidence,
          notes: entry.notes,
        };

        if (params.includeText && this.bibleAdapter) {
          try {
            const pRef = parseReference(p);
            const result = await this.bibleAdapter.getPassage(pRef, params.translation || 'ESV');
            parallel.text = result.text;
            parallel.translation = result.translation;
          } catch {
            // Skip if text unavailable
          }
        }

        parallels.push(parallel);
      }
    }

    // Augment with cross-references if requested
    if (params.useCrossReferences !== false) {
      const xrefs = this.crossRefs.getCrossReferences(params.reference, { maxResults: params.maxParallels ?? 10 });
      for (const xref of xrefs.references) {
        if (!parallels.some(p => p.reference === xref.reference)) {
          parallels.push({
            reference: xref.reference,
            relationship: 'thematic',
            confidence: Math.min(xref.votes / 100, 1),
          });
        }
      }
    }

    // Limit results
    const maxP = params.maxParallels ?? 10;
    const limited = parallels.slice(0, maxP);

    return {
      primary: { reference: refStr },
      parallels: limited,
      citation: {
        source: 'TheologAI Parallel Passages',
        copyright: 'Cross-references from OpenBible.info (CC-BY)',
      },
    };
  }

  private findEntry(reference: string): ParallelEntry | undefined {
    // Direct lookup
    if (this.database.parallels[reference]) {
      return this.database.parallels[reference];
    }

    // Search through all entries for matching references
    for (const [key, entry] of Object.entries(this.database.parallels)) {
      if (entry.parallels.includes(reference) || key === reference) {
        return entry;
      }
    }

    return undefined;
  }
}
