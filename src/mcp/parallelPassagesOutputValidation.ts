import {
  canonicalParallelSegmentReference,
  orderedUniqueParallelTextTargets,
  type ParallelTextLegacyLike,
  type ParallelTextSegmentLike,
  type ParallelTextSourceGroupLike,
} from '../kernel/parallelTextTargets.js';
import { decodeParallelGroupCursor } from '../kernel/parallelGroupCursor.js';
import { parseSourceAttestedLookupReference } from '../kernel/sourceAttestedReference.js';

const TRANSLATIONS = new Set(['ESV', 'NET', 'KJV', 'WEB', 'BSB', 'ASV', 'YLT', 'DBY']);
const ITEM_STATUSES = new Set(['not_requested', 'complete', 'partial', 'unavailable', 'budget_omitted']);
const TEXT_LOOKUP_BUDGET = 12;
type DerivedTargetState = 'complete' | 'unavailable' | 'budget_omitted';
type ReportedStatus = 'not_requested' | 'complete' | 'partial' | 'unavailable' | 'budget_omitted';
interface MemberEvidence {
  reportedStatus: ReportedStatus;
  targets: string[];
}
interface LegacyEvidence {
  reportedStatus: ReportedStatus;
  target: string;
}

/** Validate parallel-passage algebra and text/status relationships beyond JSON Schema. */
export function validateParallelPassagesOutputSemantics(value: Record<string, unknown>): boolean {
  if (value.schemaVersion !== '4') return false;
  const enrichment = record(value.textEnrichment);
  if (!enrichment) return false;
  const requested = enrichment.requested;
  const translation = enrichment.translation;
  const budget = record(enrichment.budget);
  const unique = integer(enrichment.uniqueTargetCount);
  const scheduled = integer(enrichment.scheduledLookupCount);
  const succeeded = integer(enrichment.succeededLookupCount);
  const failed = integer(enrichment.failedLookupCount);
  const omitted = integer(enrichment.omittedLookupCount);
  const completion = enrichment.completionStatus;
  if (typeof requested !== 'boolean' || !budget
    || budget.unit !== 'unique_canonical_passage_lookups' || budget.maximum !== TEXT_LOOKUP_BUDGET
    || unique === undefined || scheduled === undefined || succeeded === undefined
    || failed === undefined || omitted === undefined) return false;

  if (!requested) {
    if (translation !== null || scheduled !== 0 || succeeded !== 0 || failed !== 0
      || omitted !== 0 || completion !== 'not_requested') return false;
  } else {
    if (typeof translation !== 'string' || !TRANSLATIONS.has(translation)
      || scheduled > TEXT_LOOKUP_BUDGET || unique !== scheduled + omitted || scheduled !== succeeded + failed
      || completion !== (failed === 0 && omitted === 0 ? 'complete' : 'incomplete')) return false;
  }

  const corpora = array(value.corpora);
  const groups = array(value.sourceAttestedGroups);
  const legacy = array(value.legacyParallels);
  if (!corpora || !groups || !legacy) return false;
  const hasUbsCorpus = corpora.includes('ubs_source_attested');
  const hasLegacyCorpus = corpora.includes('theologai_legacy');
  if (!validateResultWindow(value.sourceAttestedResultWindow, groups, hasUbsCorpus, value.requestedReference)
    || (!hasUbsCorpus && groups.length > 0)
    || (!hasLegacyCorpus && legacy.length > 0)) return false;

  const occurrenceEvidence = new Map<string, boolean[]>();
  const memberEvidence: MemberEvidence[] = [];
  const legacyEvidence: LegacyEvidence[] = [];
  const addOccurrence = (target: string, hasSuccessfulEvidence: boolean) => {
    occurrenceEvidence.set(target, [...(occurrenceEvidence.get(target) ?? []), hasSuccessfulEvidence]);
  };
  for (const groupValue of groups) {
    const group = record(groupValue);
    const members = group && array(group.members);
    if (!members) return false;
    for (const memberValue of members) {
      const member = record(memberValue);
      if (!member || !validateMember(member, requested, translation)) return false;
      const segments = array(member.segments)!;
      const excerpts = member.excerpts === undefined ? [] : array(member.excerpts)!;
      const excerptOrders = new Set<number>();
      const targets: string[] = [];
      for (const segmentValue of segments) {
        const segment = record(segmentValue);
        if (!segment) return false;
        try {
          targets.push(canonicalParallelSegmentReference(segment as unknown as ParallelTextSegmentLike));
        } catch {
          return false;
        }
      }
      for (const excerptValue of excerpts) {
        const excerpt = record(excerptValue);
        const segmentOrder = excerpt && integer(excerpt.segmentOrder);
        if (!excerpt || segmentOrder === undefined || segmentOrder < 1 || segmentOrder > targets.length
          || excerptOrders.has(segmentOrder) || excerpt.reference !== targets[segmentOrder - 1]) return false;
        excerptOrders.add(segmentOrder);
      }
      for (let index = 0; index < targets.length; index++) {
        addOccurrence(targets[index], excerptOrders.has(index + 1));
      }
      memberEvidence.push({ reportedStatus: member.textEnrichmentStatus as ReportedStatus, targets });
    }
  }
  for (const itemValue of legacy) {
    const item = record(itemValue);
    if (!item || !validateLegacy(item, requested, translation) || typeof item.reference !== 'string') return false;
    addOccurrence(item.reference, typeof item.text === 'string');
    legacyEvidence.push({ reportedStatus: item.textEnrichmentStatus as ReportedStatus, target: item.reference });
  }

  let actualUniqueTargetCount: number;
  let orderedTargets: string[];
  try {
    orderedTargets = orderedUniqueParallelTextTargets(
      groups as unknown as ParallelTextSourceGroupLike[],
      legacy as unknown as ParallelTextLegacyLike[],
    );
    actualUniqueTargetCount = orderedTargets.length;
  } catch {
    return false;
  }
  if (unique !== actualUniqueTargetCount) return false;
  if (!requested) return true;

  const targetStates = new Map<string, DerivedTargetState>();
  for (let index = 0; index < orderedTargets.length; index++) {
    const target = orderedTargets[index];
    const evidence = occurrenceEvidence.get(target);
    if (!evidence?.length) return false;
    const evidenceCount = evidence.filter(Boolean).length;
    if (index >= TEXT_LOOKUP_BUDGET) {
      if (evidenceCount !== 0) return false;
      targetStates.set(target, 'budget_omitted');
    } else {
      // A lookup result is fanned out atomically to every duplicate consumer.
      if (evidenceCount !== 0 && evidenceCount !== evidence.length) return false;
      targetStates.set(target, evidenceCount === evidence.length ? 'complete' : 'unavailable');
    }
  }

  const derivedSucceeded = [...targetStates.values()].filter(state => state === 'complete').length;
  const derivedFailed = [...targetStates.values()].filter(state => state === 'unavailable').length;
  const derivedOmitted = [...targetStates.values()].filter(state => state === 'budget_omitted').length;
  if (scheduled !== Math.min(unique, TEXT_LOOKUP_BUDGET)
    || succeeded !== derivedSucceeded || failed !== derivedFailed || omitted !== derivedOmitted) return false;

  for (const member of memberEvidence) {
    const states = member.targets.map(target => targetStates.get(target));
    if (states.some(state => state === undefined)
      || member.reportedStatus !== combineTargetStates(states as DerivedTargetState[])) return false;
  }
  for (const item of legacyEvidence) {
    if (item.reportedStatus !== targetStates.get(item.target)) return false;
  }
  return true;
}

function validateResultWindow(
  value: unknown,
  groups: unknown[],
  hasUbsCorpus: boolean,
  requestedReference: unknown,
): boolean {
  const window = record(value);
  if (!window) return false;
  const requestedLimit = integer(window.requestedLimit);
  const returnedGroupCount = integer(window.returnedGroupCount);
  const status = window.additionalMatchStatus;
  const nextCursor = window.nextCursor;
  if (requestedLimit === undefined || requestedLimit < 1 || requestedLimit > 10
    || returnedGroupCount === undefined || returnedGroupCount !== groups.length
    || returnedGroupCount > requestedLimit) return false;
  const ordinals = groups.map(group => integer(record(group)?.sourceOrdinal));
  if (ordinals.some(ordinal => ordinal === undefined)
    || ordinals.some((ordinal, index) => index > 0 && ordinal! <= ordinals[index - 1]!)) return false;
  if (!hasUbsCorpus) return groups.length === 0 && status === 'not_evaluated' && nextCursor === undefined;
  if (status === 'not_evaluated') return false;
  if (status === 'additional_match_observed') {
    if (returnedGroupCount !== requestedLimit || typeof nextCursor !== 'string' || typeof requestedReference !== 'string') return false;
    try {
      const segments = parseSourceAttestedLookupReference(requestedReference).segments;
      const cursor = decodeParallelGroupCursor(nextCursor, segments, requestedLimit);
      return cursor.afterSourceOrdinal === ordinals.at(-1)
        && cursor.cumulativeGroupCount >= returnedGroupCount
        && cursor.cumulativeGroupCount % requestedLimit === 0;
    } catch {
      return false;
    }
  }
  return status === 'no_additional_match_observed' && nextCursor === undefined;
}

function combineTargetStates(states: DerivedTargetState[]): Exclude<ReportedStatus, 'not_requested'> {
  if (states.every(status => status === 'complete')) return 'complete';
  if (states.every(status => status === 'unavailable')) return 'unavailable';
  if (states.every(status => status === 'budget_omitted')) return 'budget_omitted';
  return 'partial';
}

function validateMember(member: Record<string, unknown>, requested: boolean, translation: unknown): boolean {
  const status = member.textEnrichmentStatus;
  const segments = array(member.segments);
  if (typeof status !== 'string' || !ITEM_STATUSES.has(status) || !segments || segments.length < 1) return false;
  const excerpts = member.excerpts === undefined ? [] : array(member.excerpts);
  if (!excerpts) return false;
  const hasText = typeof member.text === 'string';
  const hasTranslation = typeof member.translation === 'string';
  if (excerpts.some(value => record(value)?.translation !== translation)) return false;

  if (!requested) return status === 'not_requested' && excerpts.length === 0 && !hasText && !hasTranslation;
  if (status === 'not_requested') return false;
  if (status === 'complete') {
    return excerpts.length === segments.length && hasText && hasTranslation && member.translation === translation;
  }
  if (status === 'partial') {
    return excerpts.length < segments.length
      && (excerpts.length > 0 ? hasText && hasTranslation && member.translation === translation : !hasText && !hasTranslation);
  }
  return excerpts.length === 0 && !hasText && !hasTranslation;
}

function validateLegacy(item: Record<string, unknown>, requested: boolean, translation: unknown): boolean {
  const status = item.textEnrichmentStatus;
  if (typeof status !== 'string' || !ITEM_STATUSES.has(status)) return false;
  const hasText = typeof item.text === 'string';
  const hasTranslation = typeof item.translation === 'string';
  if (!requested) return status === 'not_requested' && !hasText && !hasTranslation;
  if (status === 'complete') return hasText && hasTranslation && item.translation === translation;
  if (status === 'partial' || status === 'not_requested') return false;
  return !hasText && !hasTranslation;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function array(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function integer(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}
