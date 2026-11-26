import assert from 'node:assert/strict';
import {
  ORIGINAL_LANGUAGE_STUDY_CURSOR_MAX_LENGTH,
  ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES,
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE,
  ORIGINAL_LANGUAGE_STUDY_RESPONSE_BYTES,
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
  keys: string[],
  cursors: Map<string, string>,
  priorPages: Map<string, string[]>,
) {
  assert(keys.length > 0 && new Set(keys).size === keys.length);
  if (item.cursorFrom) {
    const prior = priorPages.get(item.cursorFrom);
    assert(prior && keys.every(key => !prior.includes(key)));
    return;
  }
  const { cursor } = object(window.continuation);
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
  assert.equal(window.used, Buffer.byteLength(JSON.stringify(output)));
  assert(typeof raw.content[0].text === 'string');
  assert(Buffer.byteLength(raw.content[0].text) <= ORIGINAL_LANGUAGE_STUDY_MARKDOWN_BYTES);

  const semantic = object(output.semanticEvidence);
  const greek = String(item.arguments.target).startsWith('G');
  assert.equal(semantic.language, greek ? 'Greek' : 'Hebrew');
  if (greek) assert.equal(semantic.status, 'not_applicable');
  if (item.id === 'hebrew-position-required' || item.id === 'h1961-unavailable') {
    assert.equal(semantic.status, 'unavailable');
    assert.equal(semantic.reason, item.id === 'hebrew-position-required' ? 'selected_token_required' : 'no_lexical_entry');
  }
  if (['h0216-beginner', 'h3027-intermediate', 'semantic-continuation'].includes(item.id)) {
    const provenance = object(semantic.provenance);
    assert.equal(provenance.artifactIdentity, fixture.authorityAnchors.semanticArtifactIdentity);
    assert.deepEqual(list(provenance.sources).map(value => {
      const source = object(value);
      return [source.sourceId, source.sourceRole];
    }), [
      ['ubs-hebrew-dictionary-en-v0.9.2', 'dictionary'],
      ['ubs-hebrew-lexical-domains-en-v0.9.2', 'lexical_domains'],
    ]);
    const keys = list(semantic.candidates).map(value => {
      const key = object(value).senseId;
      assert(typeof key === 'string');
      return key;
    });
    if (item.id === 'h0216-beginner') assert.equal(keys[0], fixture.authorityAnchors.h0216SenseId);
    else {
      const semanticWindow = object(semantic.resultWindow);
      assert.equal(semanticWindow.totalCount, fixture.authorityAnchors.h3027SenseCount);
      if (item.cursorFrom) assert.equal(semanticWindow.priorCount, priorPages.get(item.cursorFrom)?.length);
      rememberPage(item, semanticWindow, keys, cursors, priorPages);
    }
  }

  if (depth !== 'technical') {
    assert(!Object.hasOwn(output, 'corpusOccurrences'));
    return;
  }
  const usage = object(output.corpusOccurrences);
  assert.equal(usage.status, 'available');
  assert.equal(usage.corpusIdentity, fixture.authorityAnchors.morphologyUsageIdentity);
  const records = list(usage.occurrences);
  assert(records.length <= ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_PAGE_SIZE);
  const keys = records.map(value => {
    const entry = object(value);
    assert(typeof entry.sourceForm === 'string' && entry.sourceForm.length > 0);
    return [entry.canonicalOrder, entry.chapter, entry.verse, entry.position].join(':');
  });
  const occurrences = object(usage.resultWindow);
  assert.equal(occurrences.returnedCount, records.length);
  rememberPage(item, occurrences, keys, cursors, priorPages);
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
