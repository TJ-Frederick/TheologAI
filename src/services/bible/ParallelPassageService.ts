/** Curated and cross-reference-backed parallel passage discovery. */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BibleService } from './BibleService.js';
import type {
  ParallelPassageCorpus,
  ParallelPassageLookupParams,
  ParallelPassageResearchResult,
  ParallelPassage,
  ParallelTextEnrichment,
  ParallelTextEnrichmentStatus,
  ParallelTextTranslation,
  ResearchLegacyParallel,
  SourceAttestedParallelGroupResult,
  SourceAttestedResultWindow,
} from '../../kernel/types.js';
import type { ICrossReferenceRepository } from '../../kernel/repositories.js';
import { parseReference, formatReference, type BibleReference } from '../../kernel/reference.js';
import { parseSourceAttestedLookupReference } from '../../kernel/sourceAttestedReference.js';
import type { SourceAttestedParallelService } from './SourceAttestedParallelService.js';
import { ValidationError } from '../../kernel/errors.js';
import {
  LEGACY_PARALLEL_PROVENANCE,
  LEGACY_PARALLEL_PROVENANCE_ID,
  OPENBIBLE_CROSS_REFERENCE_PROVENANCE,
  UBS_PARALLEL_PROVENANCE_ID,
  ubsParallelProvenanceRecord,
} from '../../kernel/parallelPassageProvenance.js';
import { provenanceFromCitation, type ProvenanceRecord } from '../../kernel/provenance.js';
import { translationProvenanceContext } from '../../kernel/translationProvenance.js';
import type { BibleResult } from '../../kernel/types.js';
import { PARALLEL_TEXT_LOOKUP_BUDGET } from '../../kernel/requestLimits.js';
import {
  canonicalParallelSegmentReference,
  orderedUniqueParallelTextTargets,
} from '../../kernel/parallelTextTargets.js';

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
const TEXT_LOOKUP_CONCURRENCY = 4;

export class ParallelPassageService {
  private readonly groupsByReference = new Map<string, CuratedGroup[]>();
  private readonly groupsByBookChapter = new Map<string, CuratedGroup[]>();

  constructor(
    private readonly crossRefs: ICrossReferenceRepository,
    private readonly bibleService?: TextService,
    databasePath?: string,
    preloadedData?: RawParallelDatabase,
    private readonly sourceAttestedService?: Pick<SourceAttestedParallelService, 'lookup' | 'getProvenance'>,
  ) {
    const raw = preloadedData ?? this.loadDatabase(databasePath);
    this.indexDatabase(raw);
  }

  async lookup(params: ParallelPassageLookupParams): Promise<ParallelPassageResearchResult> {
    validateCursorIsolation(params);
    const corpora = normalizeCorpora(params);
    const primaryReference = normalizeResearchReference(params.reference);
    const warnings: string[] = [];
    const sourceAttested = corpora.includes('ubs_source_attested')
      ? await this.lookupSourceAttested(primaryReference, params, warnings)
      : {
        groups: [],
        window: {
          requestedLimit: normalizeMaxGroups(params.maxGroups),
          returnedGroupCount: 0,
          additionalMatchStatus: 'not_evaluated' as const,
        },
      };
    const sourceAttestedGroups = sourceAttested.groups;
    const legacyParallels = corpora.includes('theologai_legacy')
      ? this.lookupLegacy(primaryReference, params)
      : [];
    const includeOpenBible = resolveOpenBibleSelection(params);
    const openBibleCrossReferences = includeOpenBible
      ? await this.lookupOpenBible(primaryReference, normalizeMaxParallels(params.maxParallels), warnings)
      : [];

    const provenance: ProvenanceRecord[] = [];
    if (corpora.includes('ubs_source_attested')) {
      if (!this.sourceAttestedService) throw new Error('UBS source-attested parallels are unavailable in this runtime');
      provenance.push(ubsParallelProvenanceRecord(await this.sourceAttestedService.getProvenance()));
    }
    if (corpora.includes('theologai_legacy')) provenance.push({ ...LEGACY_PARALLEL_PROVENANCE });
    if (includeOpenBible) provenance.push({ ...OPENBIBLE_CROSS_REFERENCE_PROVENANCE });
    const textEnrichment = params.includeText
      ? await this.attachTexts(
        sourceAttestedGroups,
        legacyParallels,
        params.translation || 'ESV',
        warnings,
        provenance,
      )
      : notRequestedTextEnrichment(
        orderedUniqueParallelTextTargets(sourceAttestedGroups, legacyParallels).length,
      );
    return {
      requestedReference: primaryReference,
      corpora,
      sourceAttestedGroups,
      sourceAttestedResultWindow: sourceAttested.window,
      legacyParallels,
      openBibleCrossReferences,
      provenance,
      textEnrichment,
      warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
    };
  }

  private async lookupSourceAttested(
    reference: string,
    params: ParallelPassageLookupParams,
    warnings: string[],
  ): Promise<{ groups: SourceAttestedParallelGroupResult[]; window: SourceAttestedResultWindow }> {
    if (!this.sourceAttestedService) throw new Error('UBS source-attested parallels are unavailable in this runtime');
    const lookup = await this.sourceAttestedService.lookup({
      reference,
      maxGroups: params.maxGroups,
      groupCursor: params.groupCursor,
    });
    const requested = parseSourceAttestedLookupReference(lookup.reference).segments;
    const groups = lookup.groups.map(group => ({
      groupId: group.groupId,
      sourceOrdinal: group.sourceOrdinal,
      label: group.label,
      directionality: group.directionality,
      members: group.members.map(member => ({
        sourceOrder: member.sourceOrder,
        sourceReference: member.sourceReference,
        normalizedReference: member.normalizedReference,
        segments: member.segments.map(segment => ({ ...segment })),
        languageMarker: member.languageMarker,
        matched: member.segments.some(segment => requested.some(query => sourceSegmentsOverlap(segment, query))),
        textEnrichmentStatus: 'not_requested' as const,
        provenanceIds: [UBS_PARALLEL_PROVENANCE_ID],
        ...(params.includeAlignment ? { alignmentBasis: member.alignmentBasis, alignmentRaw: member.alignmentRaw } : {}),
      })),
      provenanceIds: [UBS_PARALLEL_PROVENANCE_ID],
    }));
    return {
      groups,
      window: {
        requestedLimit: lookup.requestedLimit,
        returnedGroupCount: groups.length,
        additionalMatchStatus: lookup.additionalMatchObserved
          ? 'additional_match_observed'
          : 'no_additional_match_observed',
        ...(lookup.nextCursor ? { nextCursor: lookup.nextCursor } : {}),
      },
    };
  }

  private lookupLegacy(primaryReference: string, params: ParallelPassageLookupParams): ResearchLegacyParallel[] {
    const mode = params.mode ?? 'auto';
    const maxParallels = normalizeMaxParallels(params.maxParallels);
    const candidates = new Map<string, ResearchLegacyParallel>();
    const primaryParsed = parseReference(primaryReference);
    for (const group of this.findGroups(primaryReference, primaryParsed)) {
      for (const member of group.members) {
        if (rangesOverlap(primaryParsed, member.parsed) || candidates.has(member.reference)) continue;
        const relationship = relationshipForEdge(group.relationship, primaryParsed, member.parsed);
        if (!relationshipMatchesMode(relationship, mode)) continue;
        candidates.set(member.reference, {
          reference: member.reference, relationship, confidence: group.confidence, notes: group.notes,
          textEnrichmentStatus: 'not_requested',
          provenanceIds: [LEGACY_PARALLEL_PROVENANCE_ID],
        });
      }
    }
    return [...candidates.values()].slice(0, maxParallels);
  }

  private async lookupOpenBible(reference: string, maxResults: number, warnings: string[]) {
    const result = await this.crossRefs.getCrossReferences(reference, { maxResults });
    return result.references.flatMap(xref => {
      try {
        const normalized = normalizeReference(xref.reference);
        return normalized === reference ? [] : [{ reference: normalized, votes: xref.votes }];
      } catch {
        warnings.push('One malformed OpenBible.info cross-reference was omitted.');
        return [];
      }
    });
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
    sourceGroups: SourceAttestedParallelGroupResult[],
    legacyParallels: ResearchLegacyParallel[],
    translation: ParallelTextTranslation,
    warnings: string[],
    provenance: ProvenanceRecord[],
  ): Promise<ParallelTextEnrichment> {
    const targets: Array<{
      reference: string;
      apply: (result: BibleResult, provenanceId: string) => void;
    }> = [
      ...sourceGroups.flatMap(group => group.members.flatMap(member => member.segments.map((segment, segmentIndex) => ({
        reference: canonicalParallelSegmentReference(segment),
        apply: (result: BibleResult, provenanceId: string) => {
          const excerpt = {
            segmentOrder: segmentIndex + 1,
            reference: canonicalParallelSegmentReference(segment),
            text: boundExcerpt(result.text),
            translation: result.translation,
            provenanceIds: [provenanceId],
          };
          member.excerpts = [...(member.excerpts ?? []), excerpt]
            .sort((left, right) => left.segmentOrder - right.segmentOrder);
          member.provenanceIds = [...new Set([...member.provenanceIds, provenanceId])];
          member.text = boundExcerpt(member.excerpts.map(item => `${item.reference}: ${item.text}`).join('\n'));
          const translations = new Set(member.excerpts.map(item => item.translation));
          member.translation = translations.size === 1 ? member.excerpts[0].translation : undefined;
        },
      })))),
      ...legacyParallels.map(parallel => ({
        reference: parallel.reference,
        apply: (result: BibleResult, provenanceId: string) => {
          parallel.text = boundExcerpt(result.text);
          parallel.translation = result.translation;
          parallel.provenanceIds = [...(parallel.provenanceIds ?? [LEGACY_PARALLEL_PROVENANCE_ID]), provenanceId];
        },
      })),
    ];
    const consumersByReference = new Map<string, typeof targets>();
    for (const target of targets) {
      consumersByReference.set(target.reference, [...(consumersByReference.get(target.reference) ?? []), target]);
    }
    const plans = orderedUniqueParallelTextTargets(sourceGroups, legacyParallels)
      .map(reference => ({ reference, consumers: consumersByReference.get(reference) ?? [] }));
    const scheduledPlans = plans.slice(0, PARALLEL_TEXT_LOOKUP_BUDGET);
    const outcomes = new Map<string, { status: 'succeeded'; result: BibleResult } | { status: 'failed' } | { status: 'omitted' }>();
    for (const plan of plans.slice(PARALLEL_TEXT_LOOKUP_BUDGET)) outcomes.set(plan.reference, { status: 'omitted' });

    if (this.bibleService) {
      await mapWithConcurrency(scheduledPlans, TEXT_LOOKUP_CONCURRENCY, async plan => {
        try {
          outcomes.set(plan.reference, {
            status: 'succeeded',
            result: await this.bibleService!.lookup({ reference: plan.reference, translation }),
          });
        } catch {
          outcomes.set(plan.reference, { status: 'failed' });
        }
      });
    } else {
      for (const plan of scheduledPlans) outcomes.set(plan.reference, { status: 'failed' });
    }

    const provenanceBySource = new Map<string, string>();
    for (const plan of scheduledPlans) {
      const outcome = outcomes.get(plan.reference);
      if (!outcome || outcome.status !== 'succeeded') continue;
      const provenanceId = translationProvenanceId(outcome.result, provenance, provenanceBySource);
      for (const consumer of plan.consumers) consumer.apply(outcome.result, provenanceId);
    }

    for (const group of sourceGroups) {
      for (const member of group.members) {
        member.textEnrichmentStatus = combineTextStatuses(
          member.segments.map(segment => outcomeStatus(outcomes.get(canonicalParallelSegmentReference(segment)))),
        );
      }
    }
    for (const parallel of legacyParallels) {
      parallel.textEnrichmentStatus = combineTextStatuses([outcomeStatus(outcomes.get(parallel.reference))]);
    }

    const failedReferences = scheduledPlans
      .filter(plan => outcomes.get(plan.reference)?.status === 'failed')
      .map(plan => plan.reference);
    const omittedLookupCount = Math.max(0, plans.length - scheduledPlans.length);
    if (omittedLookupCount > 0) {
      warnings.push(`Text enrichment omitted ${omittedLookupCount} of ${plans.length} unique passage lookups because the per-request budget is ${PARALLEL_TEXT_LOOKUP_BUDGET}.`);
    }
    if (failedReferences.length > 0) {
      const examples = failedReferences.slice(0, 3);
      const remainder = failedReferences.length - examples.length;
      warnings.push(`Text enrichment failed for ${failedReferences.length} scheduled lookup${failedReferences.length === 1 ? '' : 's'}: ${examples.join('; ')}${remainder > 0 ? `; and ${remainder} more` : ''}.`);
    }

    const succeededLookupCount = scheduledPlans.length - failedReferences.length;
    return {
      requested: true,
      translation,
      budget: { unit: 'unique_canonical_passage_lookups', maximum: PARALLEL_TEXT_LOOKUP_BUDGET },
      uniqueTargetCount: plans.length,
      scheduledLookupCount: scheduledPlans.length,
      succeededLookupCount,
      failedLookupCount: failedReferences.length,
      omittedLookupCount,
      completionStatus: failedReferences.length === 0 && omittedLookupCount === 0 ? 'complete' : 'incomplete',
    };
  }
}

function notRequestedTextEnrichment(uniqueTargetCount: number): ParallelTextEnrichment {
  return {
    requested: false,
    translation: null,
    budget: { unit: 'unique_canonical_passage_lookups', maximum: PARALLEL_TEXT_LOOKUP_BUDGET },
    uniqueTargetCount,
    scheduledLookupCount: 0,
    succeededLookupCount: 0,
    failedLookupCount: 0,
    omittedLookupCount: 0,
    completionStatus: 'not_requested',
  };
}

function outcomeStatus(
  outcome: { status: 'succeeded' } | { status: 'failed' } | { status: 'omitted' } | undefined,
): Exclude<ParallelTextEnrichmentStatus, 'not_requested' | 'partial'> {
  if (outcome?.status === 'succeeded') return 'complete';
  if (outcome?.status === 'omitted') return 'budget_omitted';
  return 'unavailable';
}

function combineTextStatuses(
  statuses: Array<Exclude<ParallelTextEnrichmentStatus, 'not_requested' | 'partial'>>,
): ParallelTextEnrichmentStatus {
  if (statuses.every(status => status === 'complete')) return 'complete';
  if (statuses.every(status => status === 'unavailable')) return 'unavailable';
  if (statuses.every(status => status === 'budget_omitted')) return 'budget_omitted';
  return 'partial';
}

/** Bound public excerpts by Unicode code points, including the ellipsis. */
export function boundExcerpt(text: string, maxCodePoints = 200): string {
  const codePoints = Array.from(text);
  if (codePoints.length <= maxCodePoints) return text;
  return `${codePoints.slice(0, Math.max(0, maxCodePoints - 1)).join('')}…`;
}

function normalizeCorpora(params: ParallelPassageLookupParams): ParallelPassageCorpus[] {
  const corpora = params.corpora ?? ['ubs_source_attested'];
  if (!Array.isArray(corpora) || corpora.length < 1 || corpora.length > 2
    || new Set(corpora).size !== corpora.length
    || corpora.some(corpus => corpus !== 'ubs_source_attested' && corpus !== 'theologai_legacy')) {
    throw new ValidationError('corpora', 'corpora must contain one or both unique supported corpus identifiers.');
  }
  if (!corpora.includes('theologai_legacy') && (params.mode !== undefined || params.maxParallels !== undefined)) {
    throw new ValidationError('corpora', "mode and maxParallels require corpora: ['theologai_legacy'].");
  }
  if (!corpora.includes('ubs_source_attested') && params.includeAlignment === true) {
    throw new ValidationError('includeAlignment', 'includeAlignment requires the ubs_source_attested corpus.');
  }
  return [...corpora];
}

function validateCursorIsolation(params: ParallelPassageLookupParams): void {
  if (params.groupCursor === undefined) return;
  if (typeof params.groupCursor !== 'string' || params.groupCursor.length < 1) {
    throw new ValidationError('groupCursor', 'groupCursor must be a non-empty opaque string.');
  }
  if (params.corpora !== undefined
    && (!Array.isArray(params.corpora) || params.corpora.length !== 1 || params.corpora[0] !== 'ubs_source_attested')) {
    throw new ValidationError('groupCursor', "groupCursor continuation is UBS-only; corpora must be ['ubs_source_attested'].");
  }
  if (params.mode !== undefined || params.maxParallels !== undefined) {
    throw new ValidationError('groupCursor', 'groupCursor cannot be combined with TheologAI legacy controls.');
  }
  if (params.includeText === true) {
    throw new ValidationError('groupCursor', 'groupCursor cannot be combined with includeText: true.');
  }
  if (params.includeOpenBibleCrossReferences !== undefined || params.useCrossReferences !== undefined) {
    throw new ValidationError('groupCursor', 'groupCursor cannot be combined with OpenBible controls.');
  }
}

function translationProvenanceId(
  result: BibleResult,
  provenance: ProvenanceRecord[],
  provenanceBySource: Map<string, string>,
): string {
  const context = translationProvenanceContext(result);
  const candidate = provenanceFromCitation(result.citation, {
    id: `translation-${provenance.length + 1}`,
    kind: 'translation',
    status: 'provider_attributed',
    version: result.translation,
    ...(recognizedLicense(result.citation.copyright) ? { license: recognizedLicense(result.citation.copyright) } : {}),
    ...(context ?? {}),
  });
  const key = JSON.stringify({ ...candidate, id: undefined });
  const existing = provenanceBySource.get(key);
  if (existing) return existing;
  provenance.push(candidate);
  provenanceBySource.set(key, candidate.id);
  return candidate.id;
}

function recognizedLicense(copyright: string | undefined): { label: string } | undefined {
  return /^public domain(?:\s+\([^)]*\))?$/i.test(copyright?.trim() ?? '')
    ? { label: 'Public Domain' }
    : undefined;
}

function resolveOpenBibleSelection(params: ParallelPassageLookupParams): boolean {
  if (params.includeOpenBibleCrossReferences !== undefined && params.useCrossReferences !== undefined
    && params.includeOpenBibleCrossReferences !== params.useCrossReferences) {
    throw new ValidationError('includeOpenBibleCrossReferences', 'includeOpenBibleCrossReferences conflicts with deprecated useCrossReferences.');
  }
  return params.includeOpenBibleCrossReferences ?? params.useCrossReferences ?? false;
}

function sourceSegmentsOverlap(
  left: { bookNumber: number; chapter: number; startVerse: number; endVerse: number },
  right: { bookNumber: number; chapter: number; startVerse: number; endVerse: number },
): boolean {
  return left.bookNumber === right.bookNumber && left.chapter === right.chapter
    && left.startVerse <= right.endVerse && right.startVerse <= left.endVerse;
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

function normalizeMaxGroups(value: number | undefined): number {
  const maxGroups = value ?? 5;
  if (!Number.isSafeInteger(maxGroups) || maxGroups < 1 || maxGroups > 10) {
    throw new ValidationError('maxGroups', 'maxGroups must be an integer from 1 to 10.');
  }
  return maxGroups;
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

function normalizeResearchReference(raw: string): string {
  try {
    return parseSourceAttestedLookupReference(raw).normalizedReference;
  } catch {
    return normalizeReference(raw);
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
