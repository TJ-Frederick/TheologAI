import { describe, expect, it, vi } from 'vitest';
import { createOriginalLanguageStudyHandler } from '../../../../src/tools/v2/originalLanguageStudy.js';
import { validatorFor } from '../../../../src/mcp/validation.js';
import { MORPHOLOGY_USAGE_IDENTITY } from '../../../../src/kernel/morphologyUsageCursor.js';
import { encodeMorphologyUsageCursor } from '../../../../src/kernel/morphologyUsageCursor.js';
import {
  ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
  createOriginalLanguageStudyV3Cursor,
  parseOriginalLanguageStudyV3Cursor,
  type OriginalLanguageStudyV3CursorBinding,
} from '../../../../src/kernel/originalLanguageStudyV3Contract.js';
import { OriginalLanguageStudyV3Coordinator } from '../../../../src/services/languages/OriginalLanguageStudyV3Coordinator.js';
import {
  productionCandidate,
  productionContext,
  productionCoordinator,
} from '../../../helpers/originalLanguageStudyV2ProductionFixtures.js';

function occurrenceService() {
  return {
    getCorpusOccurrencePage: vi.fn().mockResolvedValue({
      publicStrongs: 'H1',
      exactMorphologyKey: 'H0001',
      corpusIdentity: MORPHOLOGY_USAGE_IDENTITY,
      attested: true,
      totals: { tokenCount: 1, verseCount: 1, bookCount: 1, sourceSurfaceVariantCount: 1 },
      occurrences: [{
        book: 'Genesis', canonicalOrder: 1, chapter: 1, verse: 1, position: 1,
        sourceForm: 'בְּרֵאשִׁית', lemma: 'רֵאשִׁית', exactMorphologyKey: 'H0001',
        morphologyCode: 'HNcfsa', gloss: 'beginning',
      }],
      cautions: ['Counts are corpus evidence.', 'Source forms are exact.', 'Frequency does not establish meaning.'],
    }),
  };
}

function v3Coordinator(current: ReturnType<typeof productionCoordinator>, occurrences = occurrenceService()) {
  return { coordinator: new OriginalLanguageStudyV3Coordinator(current.coordinator, occurrences), occurrences };
}

describe('original_language_study v3 handler', () => {
  it('hard-cuts the tool to depth and schema v3 while preserving the complete v1 study', async () => {
    const current = productionCoordinator(Array.from({ length: 10 }, (_, index) => productionCandidate(index + 1)));
    const v3 = v3Coordinator(current);
    const handler = createOriginalLanguageStudyHandler(v3.coordinator);

    expect(handler.name).toBe('original_language_study');
    expect(handler.inputSchema).toMatchObject({
      required: ['reference', 'target'], additionalProperties: false,
      properties: { depth: { enum: ['beginner', 'intermediate', 'technical'] }, cursor: { maxLength: 12 * 1024 } },
    });
    expect(handler.inputSchema.properties).not.toHaveProperty('detail');
    const result = await handler.handler({ reference: 'Gen 1:1', target: 'H1', position: 1, depth: 'technical' });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '3', kind: 'original_language_study', depth: 'technical',
      study: { schemaVersion: '1', kind: 'original_language_study', context: { language: 'Hebrew' } },
      lexicalRange: { status: 'available', scope: 'source_attested_non_exhaustive' },
      englishTranslationComparison: { status: 'not_performed', responsibility: 'guided_prompt' },
      contextualInterpretation: { status: 'not_performed', responsibility: 'guided_prompt' },
      semanticEvidence: { status: 'lexical_candidates' },
      corpusOccurrences: { status: 'available', publicStrongs: 'H1', occurrences: [{ exactMorphologyKey: 'H0001' }] },
    });
    expect(result.structuredContent).not.toHaveProperty('detail');
    expect(result.content[0]?.text).toContain('### Technical evidence depth');
    expect(current.repository.queryCount).toBe(1);
    expect(v3.occurrences.getCorpusOccurrencePage).toHaveBeenCalledWith('H1', 20, undefined);
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
  });

  it('defaults to intermediate, keeps corpus reads technical-only, and makes beginner Markdown concise', async () => {
    const greek = productionCoordinator([productionCandidate(1)], productionContext('Greek'));
    const greekV3 = v3Coordinator(greek);
    const defaultResult = await createOriginalLanguageStudyHandler(greekV3.coordinator)
      .handler({ reference: 'Jn 1:1', target: 'H1', position: 1 });
    expect(defaultResult.structuredContent).toMatchObject({
      schemaVersion: '3', depth: 'intermediate',
      study: { schemaVersion: '1', context: { language: 'Greek' } },
      semanticEvidence: { language: 'Greek', status: 'not_applicable' },
    });
    expect(defaultResult.structuredContent).not.toHaveProperty('corpusOccurrences');
    expect(greekV3.occurrences.getCorpusOccurrencePage).not.toHaveBeenCalled();

    const beginner = await createOriginalLanguageStudyHandler(v3Coordinator(greek).coordinator)
      .handler({ reference: 'Jn 1:1', target: 'H1', position: 1, depth: 'beginner' });
    expect(beginner.structuredContent).toMatchObject({ depth: 'beginner' });
    expect(beginner.content[0]?.text).not.toContain('raw code');
    expect(beginner.content[0]?.text).not.toContain('openscriptures-strongs');
    expect(beginner.content[0]?.text).toContain('Open Scriptures dictionary');
    expect(beginner.content[0]?.text).toContain('does not choose the meaning');
  });

  it('rejects a depth-replayed semantic cursor before the paged evidence query', async () => {
    const current = productionCoordinator(Array.from({ length: 10 }, (_, index) => productionCandidate(index + 1)));
    const handler = createOriginalLanguageStudyHandler(v3Coordinator(current).coordinator);
    const first = await handler.handler({
      reference: 'Gen 1:1', target: 'H1', position: 1, depth: 'intermediate',
    });
    const semantic = first.structuredContent?.semanticEvidence as {
      resultWindow?: { continuation?: { cursor?: string } };
    };
    const cursor = semantic.resultWindow?.continuation?.cursor;
    expect(cursor).toBeTypeOf('string');
    const readsBeforeReplay = current.repository.queryCount;

    const replay = await handler.handler({
      reference: 'Gen 1:1', target: 'H1', position: 1, depth: 'technical', cursor,
    });
    expect(replay).toMatchObject({ isError: true });
    expect(current.repository.queryCount).toBe(readsBeforeReplay);
  });

  it('binds the exact inner repository position into the opaque v3 cursor digest', () => {
    const binding: OriginalLanguageStudyV3CursorBinding = {
      requestReference: 'John 1:1', requestTarget: 'G3056', requestPosition: 5,
      depth: 'technical', operation: ORIGINAL_LANGUAGE_STUDY_OCCURRENCE_CURSOR_OPERATION,
      canonicalReference: 'John 1:1',
      selectedToken: {
        position: 5, text: 'Λόγος', lemma: 'λόγος', strongsNumber: 'G3056',
        morphologyCode: 'N-NSM', gloss: 'word',
      },
      publicStrongs: 'G3056', morphologyKey: 'G3056',
      semanticArtifactIdentity: null, semanticSourceIdentity: null,
      semanticNormalizedReference: null, corpusIdentity: MORPHOLOGY_USAGE_IDENTITY,
    };
    const inner = encodeMorphologyUsageCursor('G3056', {
      book_order: 43, chapter: 1, verse: 1, position: 5,
    });
    const cursor = createOriginalLanguageStudyV3Cursor(inner, binding);
    const payload = JSON.parse(Buffer.from(cursor.slice('olsv3c1_'.length), 'base64url').toString('utf8')) as {
      repositoryCursor: string;
    };
    payload.repositoryCursor = encodeMorphologyUsageCursor('G3056', {
      book_order: 43, chapter: 1, verse: 14, position: 3,
    });
    const forged = `olsv3c1_${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

    expect(() => parseOriginalLanguageStudyV3Cursor(forged, binding)).toThrow(/full evidence context/);
  });

  it('returns technical corpus unavailability without querying on ambiguity', async () => {
    const ambiguousContext = productionContext();
    const candidate = ambiguousContext.v1Result.selectedToken!;
    ambiguousContext.v1Result = {
      reference: 'Genesis 1:1', language: 'Hebrew', target: 'H1', status: 'needs_disambiguation',
      candidates: [candidate, { ...candidate, position: 2 }], warnings: [],
    };
    const ambiguous = productionCoordinator([productionCandidate(1)], ambiguousContext);
    const v3 = v3Coordinator(ambiguous);
    const result = await createOriginalLanguageStudyHandler(v3.coordinator)
      .handler({ reference: 'Gen 1:1', target: 'H1', depth: 'technical' });
    expect(result.structuredContent).toMatchObject({
      schemaVersion: '3', study: { status: 'needs_disambiguation' },
      semanticEvidence: { reason: 'selected_token_required' },
      corpusOccurrences: { status: 'unavailable', reason: 'selected_token_required' },
    });
    expect(v3.occurrences.getCorpusOccurrencePage).not.toHaveBeenCalled();
  });

  it('rejects removed detail, caller-controlled identities, and stale v2 cursors before v3 work', async () => {
    const coordinator = { study: vi.fn() } as unknown as Parameters<typeof createOriginalLanguageStudyHandler>[0];
    const handler = createOriginalLanguageStudyHandler(coordinator);
    for (const argumentsValue of [
      { reference: 'Genesis 1:1', target: 'H1', detail: 'detailed' },
      { reference: 'Genesis 1:1', target: 'H1', artifactIdentity: 'forged' },
    ]) {
      const result = await handler.handler(argumentsValue);
      expect(result).toMatchObject({ isError: true });
    }
    expect(coordinator.study).not.toHaveBeenCalled();

    const active = v3Coordinator(productionCoordinator());
    const stale = await createOriginalLanguageStudyHandler(active.coordinator).handler({
      reference: 'Gen 1:1', target: 'H1', position: 1, depth: 'technical', cursor: 'olsv2c1_7b7d',
    });
    expect(stale).toMatchObject({ isError: true });
    expect(stale.content[0]?.text).toContain('unsupported and stale');
    expect(active.occurrences.getCorpusOccurrencePage).not.toHaveBeenCalled();
  });
});
