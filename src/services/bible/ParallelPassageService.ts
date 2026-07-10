/** Curated and cross-reference-backed parallel passage discovery. */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BibleService } from './BibleService.js';
import type { ParallelPassageLookupParams, ParallelPassageResult, ParallelPassage } from '../../kernel/types.js';
import type { ICrossReferenceRepository } from '../../kernel/repositories.js';
import { parseReference, formatReference, type BibleReference } from '../../kernel/reference.js';

type Relationship = ParallelPassage['relationship'];
interface RawParallelEntry {
  event: string;
  relationship: Relationship;
  confidence: number;
  parallels: string[];
  notes: string;
  uniqueDetails: Record<string, string[]>;
}
interface RawParallelDatabase {
  description: string;
  version: string;
  parallels: Record<string, RawParallelEntry>;
}
interface CuratedGroup {
  relationship: Relationship;
  confidence: number;
  notes: string;
  members: CuratedMember[];
}
interface CuratedMember {
  reference: string;
  parsed: BibleReference;
}
type TextService = Pick<BibleService, 'lookup'>;

export class ParallelPassageService {
  private readonly groupsByReference = new Map<string, CuratedGroup[]>();
  private readonly groupsByBookChapter = new Map<string, CuratedGroup[]>();

  constructor(
    private readonly crossRefs: ICrossReferenceRepository,
    private readonly bibleService?: TextService,
    databasePath?: string,
    preloadedData?: RawParallelDatabase,
  ) {
    const raw = preloadedData ?? this.loadDatabase(databasePath);
    this.indexDatabase(raw);
  }

  async lookup(params: ParallelPassageLookupParams): Promise<ParallelPassageResult> {
    const primaryReference = normalizeReference(params.reference);
    const mode = params.mode ?? 'auto';
    const maxParallels = normalizeMaxParallels(params.maxParallels);
    const warnings: string[] = [];
    const candidates = new Map<string, ParallelPassage>();
    const primaryParsed = parseReference(primaryReference);

    for (const group of this.findGroups(primaryReference, primaryParsed)) {
      for (const member of group.members) {
        // A verse/range inside a curated member identifies that member; it is
        // not a parallel to return. This also prevents overlapping queries
        // from returning the canonical range they matched.
        if (rangesOverlap(primaryParsed, member.parsed) || candidates.has(member.reference)) continue;
        const relationship = relationshipForEdge(group.relationship, primaryParsed, member.parsed);
        if (!relationshipMatchesMode(relationship, mode)) continue;
        candidates.set(member.reference, {
          reference: member.reference,
          relationship,
          confidence: group.confidence,
          notes: group.notes,
        });
      }
    }

    let usedCrossReferences = false;
    if ((mode === 'auto' || mode === 'thematic') && params.useCrossReferences !== false) {
      const xrefs = await this.crossRefs.getCrossReferences(primaryReference, { maxResults: maxParallels });
      usedCrossReferences = xrefs.references.length > 0;
      for (const xref of xrefs.references) {
        let reference: string;
        try {
          reference = normalizeReference(xref.reference);
        } catch {
          warnings.push('One malformed cross-reference was omitted.');
          continue;
        }
        if (reference === primaryReference || candidates.has(reference)) continue;
        candidates.set(reference, {
          reference,
          relationship: 'thematic',
          confidence: Math.min(Math.max(xref.votes / 100, 0), 1),
        });
      }
    }

    const parallels = [...candidates.values()].slice(0, maxParallels);
    const primary: ParallelPassageResult['primary'] = { reference: primaryReference };
    if (params.includeText) {
      await this.attachTexts(parallels, params.translation || 'ESV', warnings);
    }

    return {
      primary,
      parallels,
      citation: {
        source: usedCrossReferences ? 'TheologAI Parallel Passages + OpenBible.info' : 'TheologAI Parallel Passages',
        copyright: usedCrossReferences ? 'Cross-references from OpenBible.info (CC-BY)' : undefined,
      },
      warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
    };
  }

  private loadDatabase(databasePath?: string): RawParallelDatabase {
    const currentDirectory = dirname(fileURLToPath(import.meta.url));
    const path = databasePath ?? join(currentDirectory, '..', '..', 'data', 'parallel-passages.json');
    return JSON.parse(readFileSync(path, 'utf-8')) as RawParallelDatabase;
  }

  private indexDatabase(database: RawParallelDatabase): void {
    for (const [rawPrimary, entry] of Object.entries(database.parallels)) {
      if (!['synoptic', 'quotation', 'allusion', 'thematic'].includes(entry.relationship)) {
        throw new Error(`Invalid parallel relationship for ${rawPrimary}`);
      }
      if (!Array.isArray(entry.parallels) || !Number.isFinite(entry.confidence)) {
        throw new Error(`Invalid parallel entry for ${rawPrimary}`);
      }
      const uniqueMembers = [...new Set([rawPrimary, ...entry.parallels].map(normalizeReference))]
        .map(reference => ({ reference, parsed: parseReference(reference) }));
      const confidence = entry.confidence > 1 ? entry.confidence / 100 : entry.confidence;
      if (confidence < 0 || confidence > 1) throw new Error(`Invalid parallel confidence for ${rawPrimary}`);
      const group: CuratedGroup = {
        relationship: entry.relationship,
        confidence,
        notes: entry.notes,
        members: uniqueMembers,
      };
      for (const member of group.members) {
        const groups = this.groupsByReference.get(member.reference) ?? [];
        groups.push(group);
        this.groupsByReference.set(member.reference, groups);

        const scope = referenceScopeKey(member.parsed);
        const scopedGroups = this.groupsByBookChapter.get(scope) ?? [];
        scopedGroups.push(group);
        this.groupsByBookChapter.set(scope, scopedGroups);
      }
    }
  }

  private findGroups(primaryReference: string, primaryParsed: BibleReference): CuratedGroup[] {
    const groups = new Set(this.groupsByReference.get(primaryReference) ?? []);
    for (const group of this.groupsByBookChapter.get(referenceScopeKey(primaryParsed)) ?? []) {
      if (group.members.some(member => rangesOverlap(primaryParsed, member.parsed))) {
        groups.add(group);
      }
    }
    return [...groups];
  }

  private async attachTexts(
    parallels: ParallelPassage[],
    translation: string,
    warnings: string[],
  ): Promise<void> {
    if (!this.bibleService) {
      warnings.push('Passage text is unavailable in this runtime.');
      return;
    }

    const targets: Array<{ reference: string; apply: (text: string, resolvedTranslation: string) => void }> = [
      ...parallels.map(parallel => ({
        reference: parallel.reference,
        apply: (text: string, resolvedTranslation: string) => {
          parallel.text = text;
          parallel.translation = resolvedTranslation;
        },
      })),
    ];

    await mapWithConcurrency(targets, 4, async target => {
      try {
        const result = await this.bibleService!.lookup({ reference: target.reference, translation });
        target.apply(result.text, result.translation);
      } catch {
        warnings.push(`Text unavailable for ${target.reference}.`);
      }
    });
  }
}

function relationshipMatchesMode(relationship: Relationship, mode: NonNullable<ParallelPassageLookupParams['mode']>): boolean {
  if (mode === 'auto') return true;
  if (mode === 'thematic') return relationship === 'thematic' || relationship === 'allusion';
  return relationship === mode;
}

function relationshipForEdge(
  groupRelationship: Relationship,
  primary: BibleReference,
  member: BibleReference,
): Relationship {
  if (groupRelationship !== 'synoptic') return groupRelationship;
  return isSynopticGospel(primary) && isSynopticGospel(member) ? 'synoptic' : 'thematic';
}

function isSynopticGospel(reference: BibleReference): boolean {
  return reference.book.name === 'Matthew' || reference.book.name === 'Mark' || reference.book.name === 'Luke';
}

function normalizeMaxParallels(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 10;
  return Math.min(Math.max(Math.trunc(value), 1), 50);
}

function referenceScopeKey(reference: BibleReference): string {
  return `${reference.book.number}:${reference.chapter}`;
}

function rangesOverlap(left: BibleReference, right: BibleReference): boolean {
  if (left.book.number !== right.book.number || left.chapter !== right.chapter) return false;

  const leftStart = left.startVerse ?? 1;
  const leftEnd = left.endVerse ?? left.startVerse ?? Number.POSITIVE_INFINITY;
  const rightStart = right.startVerse ?? 1;
  const rightEnd = right.endVerse ?? right.startVerse ?? Number.POSITIVE_INFINITY;

  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function normalizeReference(raw: string): string {
  try {
    return formatReference(parseReference(raw));
  } catch (originalError) {
    const slug = raw.trim().match(/^(.+)_(\d+)_(\d+)(?:-(\d+))?$/);
    if (!slug) throw originalError;
    const [, bookSlug, chapter, startVerse, endVerse] = slug;
    const candidate = `${bookSlug.replaceAll('_', ' ')} ${chapter}:${startVerse}${endVerse ? `-${endVerse}` : ''}`;
    return formatReference(parseReference(candidate));
  }
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      await mapper(values[index]);
    }
  });
  await Promise.all(workers);
}
