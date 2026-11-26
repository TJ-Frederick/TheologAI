import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH,
  ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES,
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE,
  ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES,
  ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION,
} from '../src/kernel/originalLanguageStudyV3Contract.js';

export interface LanguageReleaseCase {
  id: string;
  arguments: Record<string, unknown>;
  mode: 'success' | 'safe-error' | 'input-error';
  cursorFrom?: string | null;
}

export interface LanguageReleaseFixture {
  authorityAnchors: {
    semanticArtifactIdentity: string;
    morphologyUsageIdentity: string;
    h0216SenseId: string;
    h3027SenseCount: number;
    g3056PageSha256: [string, string];
  };
  cases: LanguageReleaseCase[];
}

interface LanguageResult {
  isError?: boolean;
  structuredContent?: unknown;
  content: Array<{ type: string; text?: string }>;
}

function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  assert(Array.isArray(value));
  return value;
}

function rememberPage(
  item: LanguageReleaseCase,
  window: Record<string, unknown>,
  operation: string,
  keys: string[],
  cursors: Map<string, string>,
  priorPages: Map<string, string[]>,
) {
  assert(keys.length > 0 && new Set(keys).size === keys.length);
  if (item.cursorFrom) {
    const prior = priorPages.get(item.cursorFrom);
    assert(prior && keys.every(key => !prior.includes(key)));
  }
  assert.equal(window.hasMore, true);
  const continuation = object(window.continuation);
  const { cursor } = continuation;
  assert.equal(continuation.operation, operation);
  assert(typeof cursor === 'string' && cursor.length <= ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH);
  assert.match(cursor, /^olsv3c1_[A-Za-z0-9_-]+$/u);
  cursors.set(item.id, cursor);
  priorPages.set(item.id, keys);
}

export function assertLanguageReleaseSuccess(
  item: LanguageReleaseCase,
  raw: LanguageResult,
  fixture: LanguageReleaseFixture,
  cursors: Map<string, string>,
  priorPages: Map<string, string[]>,
) {
  assert(!raw.isError && raw.content.length === 1 && raw.content[0]?.type === 'text');
  const output = object(raw.structuredContent);
  const depth = item.arguments.depth ?? 'intermediate';
  assert.equal(output.kind, 'original_language_study');
  assert.equal(output.schemaVersion, '3');
  assert.equal(output.depth, depth);
  assert(!Object.hasOwn(output, 'detail'));
  assert.equal(object(output.request).reference, item.arguments.reference);
  assert.equal(object(output.request).target, item.arguments.target);
  assert.equal(object(output.lexicalRange).scope, 'source_attested_non_exhaustive');
  for (const field of ['englishTranslationComparison', 'contextualInterpretation']) {
    const boundary = object(output[field]);
    assert.equal(boundary.status, 'not_performed');
    assert.equal(boundary.responsibility, 'guided_prompt');
  }
  const window = object(output.responseWindow);
  assert.equal(window.unit, 'utf8_bytes');
  assert.equal(window.maximum, ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES);
  assert.equal(window.truncated, false);
  const bytes = Buffer.byteLength(JSON.stringify(output));
  assert.equal(window.used, bytes);
  assert(bytes <= ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES);
  assert(typeof raw.content[0].text === 'string');
  assert(Buffer.byteLength(raw.content[0].text) <= ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES);

  const semantic = object(output.semanticEvidence);
  const greek = String(item.arguments.target).startsWith('G');
  const study = object(output.study);
  const context = object(study.context);
  assert.equal(study.schemaVersion, '1');
  assert.equal(context.reference, item.arguments.reference);
  assert.equal(context.language, greek ? 'Greek' : 'Hebrew');
  if (item.arguments.position !== undefined) {
    assert.equal(object(context.selectedToken).position, item.arguments.position);
  } else if (item.id === 'hebrew-position-required') {
    assert.equal(study.status, 'needs_disambiguation');
    assert.deepEqual(list(context.candidates).map(candidate => object(candidate).position), [4, 6]);
  }
  assert.equal(semantic.language, greek ? 'Greek' : 'Hebrew');
  if (greek) assert.equal(semantic.status, 'not_applicable');
  if (item.id === 'hebrew-position-required' || item.id === 'h1961-unavailable') {
    assert.equal(semantic.status, 'unavailable');
    assert.equal(semantic.reason, item.id === 'hebrew-position-required' ? 'selected_token_required' : 'no_lexical_entry');
  }
  if (['h0216-beginner', 'h3027-intermediate', 'semantic-continuation', 'h1961-unavailable'].includes(item.id)) {
    const identity = object(semantic.identity);
    const sourceId = item.arguments.target === 'H0216' ? 'H0216' : item.arguments.target;
    assert.equal(identity.sourceIdentity, sourceId);
    assert.equal(identity.publicStrongs, sourceId === 'H0216' ? 'H216' : sourceId);
    assert.equal(semantic.normalizedReference, item.arguments.reference);
    assert(!Object.hasOwn(semantic, 'alignmentEvidence'));
    const provenance = object(semantic.provenance);
    assert.equal(provenance.artifactIdentity, fixture.authorityAnchors.semanticArtifactIdentity);
    assert.deepEqual(list(provenance.sources).map(value => {
      const source = object(value);
      return [source.sourceId, source.sourceRole];
    }), [
      ['ubs-hebrew-dictionary-en-v0.9.2', 'dictionary'],
      ['ubs-hebrew-lexical-domains-en-v0.9.2', 'lexical_domains'],
    ]);
    assert.deepEqual(list(semantic.withheldEvidence).map(value => {
      const entry = object(value);
      return [entry.source, entry.field, entry.status];
    }), [
      ['TBESH', 'Meaning', 'withheld_rights_boundary'],
      ['UBS Hebrew dictionary', 'A#### lexical identities', 'withheld_public_scope'],
    ]);
    const keys = list(semantic.candidates).map(value => {
      const key = object(value).senseId;
      assert(typeof key === 'string');
      return key;
    });
    const semanticWindow = object(semantic.resultWindow);
    if (item.id === 'h0216-beginner' || item.id === 'h1961-unavailable') {
      const beginning = item.id === 'h0216-beginner';
      assert.deepEqual(keys, beginning ? [fixture.authorityAnchors.h0216SenseId] : []);
      if (beginning) {
        assert.equal(semantic.status, 'lexical_candidates');
        assert.equal(semantic.reason, 'ambiguous_reference_alignment');
      }
      assert.equal(semanticWindow.priorCount, 0);
      assert.equal(semanticWindow.returnedCount, keys.length);
      assert.equal(semanticWindow.consumedCount, keys.length);
      assert.equal(semanticWindow.totalCount, keys.length);
      assert.equal(semanticWindow.hasMore, false);
      assert(!Object.hasOwn(semanticWindow, 'continuation'));
    } else {
      const priorCount = item.cursorFrom ? 8 : 0;
      assert.equal(semantic.status, 'lexical_candidates');
      assert.equal(semantic.reason, 'reference_alignment_unproven');
      assert.equal(semanticWindow.totalCount, fixture.authorityAnchors.h3027SenseCount);
      assert.equal(semanticWindow.priorCount, priorCount);
      assert.equal(semanticWindow.returnedCount, 8);
      assert.equal(semanticWindow.consumedCount, priorCount + 8);
      assert.deepEqual(keys, Array.from({ length: 8 }, (_, index) =>
        `ubs-sense-0027910010${String(priorCount + index + 1).padStart(2, '0')}000`));
      rememberPage(item, semanticWindow, ORIGINAL_LANGUAGE_STUDY_SEMANTIC_CURSOR_OPERATION, keys, cursors, priorPages);
    }
  }

  if (depth !== 'technical') {
    assert(!Object.hasOwn(output, 'corpusOccurrences'));
    return;
  }
  const usage = object(output.corpusOccurrences);
  assert.equal(usage.status, 'available');
  assert.equal(usage.exactMorphologyKey, item.arguments.target);
  assert.equal(usage.corpusIdentity, fixture.authorityAnchors.morphologyUsageIdentity);
  const records = list(usage.occurrences);
  assert.equal(records.length, ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE);
  const coordinates = records.map(value => {
    const entry = object(value);
    assert(typeof entry.sourceForm === 'string' && entry.sourceForm.length > 0);
    assert.equal(entry.exactMorphologyKey, usage.exactMorphologyKey);
    const tuple = [entry.canonicalOrder, entry.chapter, entry.verse, entry.position];
    assert(tuple.every(Number.isSafeInteger));
    return [...tuple, entry.sourceForm];
  });
  const digest = createHash('sha256').update(JSON.stringify(coordinates)).digest('hex');
  assert.equal(digest, fixture.authorityAnchors.g3056PageSha256[item.cursorFrom ? 1 : 0]);
  const occurrences = object(usage.resultWindow);
  assert.equal(occurrences.maximumReturned, ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE);
  assert.equal(occurrences.returnedCount, records.length);
  rememberPage(item, occurrences, ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
    coordinates.map(tuple => tuple.slice(0, 4).join(':')), cursors, priorPages);
}

export function assertLanguageReleaseError(item: LanguageReleaseCase, raw: LanguageResult, cursor?: unknown) {
  assert(raw.isError === true && raw.structuredContent === undefined);
  const text = JSON.stringify(raw);
  assert(!/(?:sqlite|\bsql\b|\bd1\b|secret|api[ _-]?key|authorization|bearer|stack|traceback)/iu.test(text));
  if (typeof cursor === 'string') assert(!text.includes(cursor));
  if (item.id === 'stale-v2-cursor') assert.match(text, /(?:restart|start a new|fresh).*(?:pagination|study|request)/iu);
  if (item.id === 'removed-detail') assert.match(text, /detail/iu);
  if (item.id === 'forbidden-artifact-identity') assert.match(text, /artifactIdentity/iu);
}
