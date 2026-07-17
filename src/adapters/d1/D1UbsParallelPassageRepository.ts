import { parseSourceAttestedLookupReference } from '../../kernel/sourceAttestedReference.js';
import { UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY, UBS_PARALLEL_PASSAGE_PROVENANCE } from '../../kernel/ubsParallelSource.js';
import { validateUbsParallelGroup } from '../shared/UbsParallelPassageRepository.js';
import type {
  ISourceAttestedParallelRepository,
  ParallelSourceProvenance,
  SourceAttestedParallelGroup,
  SourceAttestedParallelCursorBoundary,
  SourceAttestedParallelRepositoryResult,
  SourceParallelMember,
  SourceParallelReferenceSegment,
} from '../../kernel/sourceAttestedParallels.js';

const SOURCE_ID = 'ubs_paratext_parallel_passages';
const MAX_GROUPS = 10;
const MAX_MEMBERS = 400;
const MAX_SEGMENTS = 800;

interface GroupRow { group_id: string; source_ordinal: number; label: 'source_attested_parallel'; directionality: 'unspecified' }
interface MemberRow { group_id: string; source_order: number; source_reference: string; normalized_reference: string; language_marker: 'HEB' | 'GRK'; alignment_basis: 'BHS' | 'LXX' | 'UBSGNT5'; alignment_raw: string }
interface SegmentRow { group_id: string; member_order: number; segment_order: number; book_number: number; chapter: number; start_verse: number; end_verse: number }
interface SourceRow {
  schema_version: string; artifact_identity: string; label: string; directionality: string;
  source_id: string; title: string; publisher: string; copyright: string; license: string; license_url: string;
  source_url: string; source_path: string; source_commit: string; source_commit_date: string; source_blob: string;
  source_bytes: number; source_sha256: string; transform_version: number; modified: number; modification_note: string;
}
interface CursorBoundaryRow { cumulative_group_count: number | string; boundary_group_count: number | string }

export class D1UbsParallelPassageRepository implements ISourceAttestedParallelRepository {
  constructor(private readonly db: D1Database) {}

  async getProvenance(): Promise<Readonly<ParallelSourceProvenance>> {
    const row = await this.db.prepare(
      'SELECT * FROM ubs_parallel_sources WHERE source_id = ?',
    ).bind(SOURCE_ID).first<SourceRow>();
    if (!row) throw new Error('UBS parallel source metadata is unavailable');
    const provenance = mapProvenance(row);
    if (row.schema_version !== 'ubs-parallel-passages.v2'
      || row.artifact_identity !== UBS_PARALLEL_PASSAGE_ARTIFACT_IDENTITY
      || row.label !== 'source_attested_parallel' || row.directionality !== 'unspecified'
      || JSON.stringify(provenance) !== JSON.stringify(UBS_PARALLEL_PASSAGE_PROVENANCE)) {
      throw new Error('UBS parallel source identity or provenance is incompatible');
    }
    return Object.freeze(provenance);
  }

  async findGroups(reference: string, maxGroups = MAX_GROUPS, afterSourceOrdinal = 0): Promise<SourceAttestedParallelRepositoryResult> {
    if (!Number.isSafeInteger(maxGroups) || maxGroups < 1 || maxGroups > MAX_GROUPS) {
      throw new Error(`maxGroups must be an integer from 1 to ${MAX_GROUPS}`);
    }
    if (!Number.isSafeInteger(afterSourceOrdinal) || afterSourceOrdinal < 0) {
      throw new Error('afterSourceOrdinal must be a non-negative integer');
    }
    const parsed = parseSourceAttestedLookupReference(reference);
    if (parsed.segments.length > 8) throw new Error('reference exceeds the reviewed 8-segment query bound');
    const clauses = parsed.segments.map(() => '(s.book_number = ? AND s.chapter = ? AND s.start_verse <= ? AND s.end_verse >= ?)');
    const bindings = parsed.segments.flatMap(segment => [segment.bookNumber, segment.chapter, segment.endVerse, segment.startVerse]);
    const { results: ids } = await this.db.prepare(
      `SELECT DISTINCT g.group_id, g.source_ordinal
         FROM ubs_parallel_segments s
         JOIN ubs_parallel_groups g ON g.group_id = s.group_id
        WHERE g.source_id = ? AND g.source_ordinal > ? AND (${clauses.join(' OR ')})
        ORDER BY g.source_ordinal, g.group_id
        LIMIT ?`,
    ).bind(SOURCE_ID, afterSourceOrdinal, ...bindings, maxGroups + 1).all<Pick<GroupRow, 'group_id' | 'source_ordinal'>>();
    if (ids.length > maxGroups + 1
      || new Set(ids.map(row => row.group_id)).size !== ids.length
      || ids.some(row => !Number.isSafeInteger(row.source_ordinal) || row.source_ordinal <= afterSourceOrdinal)
      || ids.some((row, index) => index > 0 && row.source_ordinal <= ids[index - 1].source_ordinal)) {
      throw new Error('UBS group-ID lookahead exceeded its reviewed bound or source order');
    }
    if (ids.length === 0) return Object.freeze({ groups: Object.freeze([]), additionalMatchObserved: false });

    const selectedIdsForReturn = ids.slice(0, maxGroups);
    const placeholders = selectedIdsForReturn.map(() => '?').join(',');
    const groupIds = selectedIdsForReturn.map(row => row.group_id);
    const [source, groupsResult, membersResult, segmentsResult] = await Promise.all([
      this.getProvenance(),
      this.db.prepare(`SELECT group_id, source_ordinal, label, directionality FROM ubs_parallel_groups WHERE group_id IN (${placeholders}) ORDER BY source_ordinal, group_id LIMIT ?`).bind(...groupIds, maxGroups).all<GroupRow>(),
      this.db.prepare(`SELECT group_id, source_order, source_reference, normalized_reference, language_marker, alignment_basis, alignment_raw FROM ubs_parallel_members WHERE group_id IN (${placeholders}) ORDER BY group_id, source_order LIMIT ?`).bind(...groupIds, MAX_MEMBERS).all<MemberRow>(),
      this.db.prepare(`SELECT group_id, member_order, segment_order, book_number, chapter, start_verse, end_verse FROM ubs_parallel_segments WHERE group_id IN (${placeholders}) ORDER BY group_id, member_order, segment_order LIMIT ?`).bind(...groupIds, MAX_SEGMENTS).all<SegmentRow>(),
    ]);
    const membersByGroup = new Map<string, MemberRow[]>();
    for (const row of membersResult.results) {
      const members = membersByGroup.get(row.group_id) ?? [];
      members.push(row);
      membersByGroup.set(row.group_id, members);
    }
    const segmentsByMember = new Map<string, SegmentRow[]>();
    for (const row of segmentsResult.results) {
      const key = `${row.group_id}\0${row.member_order}`;
      const segments = segmentsByMember.get(key) ?? [];
      segments.push(row);
      segmentsByMember.set(key, segments);
    }
    const selectedIds = new Set(selectedIdsForReturn.map(row => row.group_id));
    const selectedOrdinals = new Map(selectedIdsForReturn.map(row => [row.group_id, row.source_ordinal]));
    const rowsAreScoped = groupsResult.results.every(row => selectedIds.has(row.group_id))
      && membersResult.results.every(row => selectedIds.has(row.group_id))
      && segmentsResult.results.every(row => selectedIds.has(row.group_id));
    if (!rowsAreScoped || groupsResult.results.length !== selectedIdsForReturn.length
      || new Set(groupsResult.results.map(row => row.group_id)).size !== selectedIdsForReturn.length
      || groupsResult.results.some(row => selectedOrdinals.get(row.group_id) !== row.source_ordinal)
      || membersResult.results.length >= MAX_MEMBERS || segmentsResult.results.length >= MAX_SEGMENTS) {
      throw new Error('UBS complete-group query exceeded its reviewed bounds or returned incomplete data');
    }
    let consumedSegments = 0;
    const groups = groupsResult.results.map(row => {
      const members = (membersByGroup.get(row.group_id) ?? []).map((member, memberIndex) => {
        if (member.source_order !== memberIndex + 1) throw new Error('UBS member ordinals are not contiguous');
        const segmentRows = segmentsByMember.get(`${row.group_id}\0${member.source_order}`) ?? [];
        if (segmentRows.some((segment, segmentIndex) => segment.segment_order !== segmentIndex + 1)) {
          throw new Error('UBS segment ordinals are not contiguous');
        }
        consumedSegments += segmentRows.length;
        return {
          sourceOrder: member.source_order,
          sourceReference: member.source_reference,
          normalizedReference: member.normalized_reference,
          languageMarker: member.language_marker,
          alignmentBasis: member.alignment_basis,
          alignmentRaw: member.alignment_raw,
          segments: segmentRows.map(mapSegment),
        };
      });
      return freezeGroup(validateUbsParallelGroup({
        groupId: row.group_id,
        sourceOrdinal: row.source_ordinal,
        label: row.label,
        directionality: row.directionality,
        members,
        provenance: { ...source },
      }, row.source_ordinal, source));
    });
    if (consumedSegments !== segmentsResult.results.length) {
      throw new Error('UBS segment rows do not belong to reconstructed members');
    }
    return Object.freeze({
      groups: Object.freeze(groups),
      additionalMatchObserved: ids.length > maxGroups,
    });
  }

  /**
   * Validate an untrusted cursor against D1 rather than trusting its encoded
   * ordinal. This adds one aggregate query for a continuation, never
   * one query per group/member/segment. The normal lookup remains a single
   * maxGroups + 1 ID lookahead followed by at most three complete-group
   * reconstruction queries.
   */
  async hasValidGroupCursorBoundary(
    reference: string,
    boundary: SourceAttestedParallelCursorBoundary,
  ): Promise<boolean> {
    if (!isCursorBoundaryShape(boundary)) return false;
    let parsed;
    try {
      parsed = parseSourceAttestedLookupReference(reference);
    } catch {
      return false;
    }
    if (parsed.segments.length > 8) return false;
    // This checks the pinned artifact/source descriptor before the aggregate
    // reads rows from its source_id. A stale or incompatible D1 corpus fails
    // closed instead of validating an otherwise similar ordinal.
    await this.getProvenance();
    const clauses = parsed.segments.map(() => '(s.book_number = ? AND s.chapter = ? AND s.start_verse <= ? AND s.end_verse >= ?)');
    const bindings = parsed.segments.flatMap(segment => [segment.bookNumber, segment.chapter, segment.endVerse, segment.startVerse]);
    const row = await this.db.prepare(
      `SELECT
         COUNT(DISTINCT CASE WHEN g.source_ordinal <= ? THEN g.group_id END) AS cumulative_group_count,
         COUNT(DISTINCT CASE WHEN g.source_ordinal = ? THEN g.group_id END) AS boundary_group_count
         FROM ubs_parallel_segments s
         JOIN ubs_parallel_groups g ON g.group_id = s.group_id
        WHERE g.source_id = ? AND (${clauses.join(' OR ')})`,
    ).bind(boundary.afterSourceOrdinal, boundary.afterSourceOrdinal, SOURCE_ID, ...bindings).first<CursorBoundaryRow>();
    return Number(row?.cumulative_group_count) === boundary.cumulativeGroupCount
      && Number(row?.boundary_group_count) === 1
      && boundary.cumulativeGroupCount % boundary.pageSize === 0;
  }
}

function isCursorBoundaryShape(boundary: SourceAttestedParallelCursorBoundary): boolean {
  return Number.isSafeInteger(boundary.pageSize) && boundary.pageSize >= 1 && boundary.pageSize <= MAX_GROUPS
    && Number.isSafeInteger(boundary.afterSourceOrdinal) && boundary.afterSourceOrdinal >= 1
    && Number.isSafeInteger(boundary.cumulativeGroupCount)
    && boundary.cumulativeGroupCount >= boundary.pageSize
    && boundary.cumulativeGroupCount % boundary.pageSize === 0;
}

function mapProvenance(row: SourceRow): ParallelSourceProvenance {
  return {
    sourceId: row.source_id, title: row.title, publisher: row.publisher, copyright: row.copyright,
    license: row.license, licenseUrl: row.license_url, sourceUrl: row.source_url, sourcePath: row.source_path,
    sourceCommit: row.source_commit, sourceCommitDate: row.source_commit_date, sourceBlob: row.source_blob,
    sourceBytes: row.source_bytes, sourceSha256: row.source_sha256, transformVersion: row.transform_version,
    modified: row.modified === 1, modificationNote: row.modification_note,
  };
}

function mapSegment(row: SegmentRow): SourceParallelReferenceSegment {
  return { bookNumber: row.book_number, chapter: row.chapter, startVerse: row.start_verse, endVerse: row.end_verse };
}

function freezeGroup(group: SourceAttestedParallelGroup): SourceAttestedParallelGroup {
  Object.freeze(group.provenance);
  for (const member of group.members as SourceParallelMember[]) {
    for (const segment of member.segments) Object.freeze(segment);
    Object.freeze(member.segments);
    Object.freeze(member);
  }
  Object.freeze(group.members);
  return Object.freeze(group);
}
