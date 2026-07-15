import { describe, expect, it } from 'vitest';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import type { CommentaryLookupResult } from '../../../src/kernel/types.js';
import {
  CANONICAL_COMMENTATORS,
  COMMENTARY_CATALOG,
  commentaryCatalogEntry,
  HELLOAO_COMMENTARY_DELIVERY,
  resolveCommentaryCatalogEntry,
} from '../../../src/kernel/commentaryCatalog.js';
import { commentaryOutputSchema } from '../../../src/mcp/schemas/commentary.js';
import { validatorFor } from '../../../src/mcp/validation.js';
import { presentCommentaryStructured } from '../../../src/presenters/commentaryStructured.js';

const PROVIDER_REVISION = `sha256:${'a'.repeat(64)}` as const;

function jfbResult(overrides: Partial<CommentaryLookupResult> = {}): CommentaryLookupResult {
  return {
    commentary: {
      reference: 'John 3:16', commentator: 'Jamieson-Fausset-Brown', text: 'A note 𐐷',
      citation: { source: 'Jamieson-Fausset-Brown Commentary', copyright: 'Public Domain' },
    },
    resolvedReference: 'John 3:16', canonicalCommentator: 'Jamieson-Fausset-Brown',
    coverage: {
      requestedScope: 'verse', returnedGranularity: 'exact_verse',
      identityBasis: 'provider_verse_number',
      providerIdentity: { field: 'verseNumber', value: 16 },
    },
    providerRevision: PROVIDER_REVISION,
    textWindow: { unit: 'unicode_code_points', returnedCharacters: 8, sourceCharacters: 8, truncated: false },
    ...overrides,
  };
}

function chapterResult(
  canonicalCommentator: 'Matthew Henry' | 'Keil-Delitzsch' | 'John Gill' | 'Tyndale',
): CommentaryLookupResult {
  const entry = commentaryCatalogEntry(canonicalCommentator);
  return {
    commentary: {
      reference: canonicalCommentator === 'Keil-Delitzsch' ? 'Genesis 1' : 'John 3',
      commentator: entry.resultDisplayName,
      text: 'Chapter notes',
      citation: { ...entry.citation },
    },
    resolvedReference: canonicalCommentator === 'Keil-Delitzsch' ? 'Genesis 1' : 'John 3',
    canonicalCommentator,
    coverage: {
      requestedScope: 'chapter', returnedGranularity: 'chapter_aggregate',
      identityBasis: 'provider_chapter_payload',
      providerIdentity: { field: 'chapter_payload', chapter: canonicalCommentator === 'Keil-Delitzsch' ? 1 : 3 },
    },
    providerRevision: PROVIDER_REVISION,
    textWindow: { unit: 'unicode_code_points', returnedCharacters: 13, sourceCharacters: 13, truncated: false },
  };
}

describe('presentCommentaryStructured', () => {
  it('emits explicit Markdown and provider-attested exact identity evidence', () => {
    const output = presentCommentaryStructured('Jn 3:16', null, jfbResult());
    expect(validatorFor(commentaryOutputSchema)(output).valid).toBe(true);
    expect(output).toMatchObject({
      schemaVersion: '1', kind: 'commentary_lookup', requestedReference: 'Jn 3:16',
      resolvedReference: 'John 3:16',
      query: { commentator: 'Jamieson-Fausset-Brown', maxResponseCharacters: null },
      coverage: {
        requestedScope: 'verse', returnedGranularity: 'exact_verse',
        identityBasis: 'provider_verse_number',
        providerIdentity: { field: 'verseNumber', value: 16 }, sectionSpanClaim: 'none',
      },
      commentary: {
        commentator: 'Jamieson-Fausset-Brown', text: 'A note 𐐷', textFormat: 'text/markdown',
        provenanceIds: ['jamieson-fausset-brown-commentary', 'helloao-commentary-delivery'],
      },
      retrieval: {
        mode: 'remote_cached_or_live', providerId: 'helloao-commentary-delivery',
        providerRevision: PROVIDER_REVISION, cacheStatus: 'not_exposed',
      },
    });
  });

  it.each(['Matthew Henry', 'Keil-Delitzsch'] as const)(
    'allows only chapter aggregate coverage for %s',
    (commentator) => {
      const chapter = presentCommentaryStructured(chapterResult(commentator).resolvedReference, null, chapterResult(commentator));
      expect(validatorFor(commentaryOutputSchema)(chapter).valid).toBe(true);

      const forged = structuredClone(chapter) as any;
      forged.coverage = {
        requestedScope: 'verse', returnedGranularity: 'exact_verse',
        identityBasis: 'provider_verse_number',
        providerIdentity: { field: 'verseNumber', value: 1 }, sectionSpanClaim: 'none',
      };
      expect(validatorFor(commentaryOutputSchema)(forged).valid).toBe(false);
    },
  );

  it('allows John Gill exact coverage only with verseNumber evidence', () => {
    const chapter = chapterResult('John Gill');
    const verseNumber = jfbResult({
      commentary: { ...chapter.commentary, reference: 'John 3:16', text: 'Exact Gill note' },
      resolvedReference: 'John 3:16', canonicalCommentator: 'John Gill',
    });
    const valid = presentCommentaryStructured('John 3:16', null, verseNumber);
    expect(validatorFor(commentaryOutputSchema)(valid).valid).toBe(true);

    const typedNumber = structuredClone(valid) as any;
    typedNumber.coverage = {
      requestedScope: 'verse', returnedGranularity: 'exact_verse',
      identityBasis: 'provider_typed_verse_number',
      providerIdentity: { field: 'number', value: 16, entryType: 'verse' }, sectionSpanClaim: 'none',
    };
    expect(validatorFor(commentaryOutputSchema)(typedNumber).valid).toBe(false);
  });

  it('separates conservative work provenance from cached-or-live delivery provenance', () => {
    const output = presentCommentaryStructured('John 3:16', null, jfbResult());
    expect(output.provenance).toEqual([
      expect.objectContaining({
        id: 'jamieson-fausset-brown-commentary', rightsNotice: 'Public Domain',
        status: 'transcription_source_uncertain',
      }),
      expect.objectContaining({
        id: 'helloao-commentary-delivery', kind: 'delivery_provider', status: 'provider_attributed',
      }),
    ]);

    const alteredRights = structuredClone(output) as any;
    alteredRights.provenance[0].status = 'verified_source';
    expect(validatorFor(commentaryOutputSchema)(alteredRights).valid).toBe(false);

    const reordered = structuredClone(output) as any;
    reordered.commentary.provenanceIds.reverse();
    reordered.provenance.reverse();
    expect(validatorFor(commentaryOutputSchema)(reordered).valid).toBe(false);
  });

  it('rejects a false live-only retrieval claim or omitted cache disclosure', () => {
    const output = presentCommentaryStructured('John 3:16', null, jfbResult());
    const liveOnly = structuredClone(output) as any;
    liveOnly.retrieval.mode = 'remote_live';
    expect(validatorFor(commentaryOutputSchema)(liveOnly).valid).toBe(false);

    const undisclosed = structuredClone(output) as any;
    delete undisclosed.retrieval.cacheStatus;
    expect(validatorFor(commentaryOutputSchema)(undisclosed).valid).toBe(false);

    const unreported = structuredClone(output) as any;
    unreported.retrieval.providerRevision = 'not_reported';
    expect(validatorFor(commentaryOutputSchema)(unreported).valid).toBe(false);
  });

  it('reports Tyndale attribution and ShareAlike license without treating the corpus hash as an edition', () => {
    const output = presentCommentaryStructured('John 3', 1000, chapterResult('Tyndale'));
    expect(output.provenance[0]).toMatchObject({
      id: 'tyndale-open-study-notes', attribution: 'Tyndale House, Cambridge',
      license: { label: 'CC BY-SA 4.0' }, status: 'provider_attributed',
    });
    expect(output.provenance[0]).not.toHaveProperty('version');
    expect(output.commentary.commentator).toBe('Tyndale');
    expect(output.retrieval.providerRevision).toBe(PROVIDER_REVISION);
    expect(output.provenance[1].note).toContain('does not identify or authenticate the underlying transcription edition');
    expect(output.commentary.textFormat).toBe('text/markdown');
    expect(validatorFor(commentaryOutputSchema)(output).valid).toBe(true);
  });

  it('validates with the official SDK AJV implementation', () => {
    const validate = new AjvJsonSchemaValidator().getValidator(commentaryOutputSchema);
    const output = presentCommentaryStructured('John 3:16', 500, jfbResult());
    expect(validate(output).valid).toBe(true);
    const wrongWork = structuredClone(output) as any;
    wrongWork.provenance = [
      { ...commentaryCatalogEntry('John Gill').workProvenance },
      { ...HELLOAO_COMMENTARY_DELIVERY },
    ];
    expect(validate(wrongWork).valid).toBe(false);
  });

  it('fails closed when display and canonical identities disagree', () => {
    expect(() => presentCommentaryStructured('John 3:16', null, jfbResult({
      commentary: {
        reference: 'John 3:16', commentator: 'John Gill', text: 'Wrong work', citation: { source: 'Test' },
      },
    }))).toThrow('identity does not match');
  });

  it('keeps the advertised schema bounded and reference-free', () => {
    const schemaText = JSON.stringify(commentaryOutputSchema);
    expect(schemaText.length).toBeLessThan(50_000);
    expect(schemaText).not.toContain('"$ref"');
  });

  it('deep-freezes catalog data so consumers cannot create runtime contract drift', () => {
    const beforeSchema = JSON.stringify(commentaryOutputSchema);
    const beforeOutput = presentCommentaryStructured('John 3:16', null, jfbResult());
    const jfb = resolveCommentaryCatalogEntry('JFB')!;
    const tyndale = commentaryCatalogEntry('Tyndale');

    expect(Object.isFrozen(COMMENTARY_CATALOG)).toBe(true);
    expect(Object.isFrozen(jfb)).toBe(true);
    expect(Object.isFrozen(jfb.aliases)).toBe(true);
    expect(Object.isFrozen(jfb.scalarPolicy)).toBe(true);
    expect(Object.isFrozen(jfb.citation)).toBe(true);
    expect(Object.isFrozen(tyndale.workProvenance)).toBe(true);
    expect(Object.isFrozen(tyndale.workProvenance.license)).toBe(true);
    expect(Object.isFrozen(HELLOAO_COMMENTARY_DELIVERY)).toBe(true);
    expect(Object.isFrozen(CANONICAL_COMMENTATORS)).toBe(true);

    expect(() => { (jfb as any).providerWorkId = 'poisoned'; }).toThrow(TypeError);
    expect(() => { (jfb.scalarPolicy as any).kind = 'chapter_only'; }).toThrow(TypeError);
    expect(() => { (jfb.citation as any).source = 'Poisoned source'; }).toThrow(TypeError);
    expect(() => { (jfb.aliases as any).push('poisoned'); }).toThrow(TypeError);
    expect(() => { (tyndale.workProvenance.license as any).label = 'Poisoned license'; }).toThrow(TypeError);
    expect(() => { (HELLOAO_COMMENTARY_DELIVERY as any).note = 'Poisoned note'; }).toThrow(TypeError);
    expect(() => { (CANONICAL_COMMENTATORS as any).push('Poisoned'); }).toThrow(TypeError);

    expect(resolveCommentaryCatalogEntry('JFB')?.providerWorkId).toBe('jamieson-fausset-brown');
    expect(JSON.stringify(commentaryOutputSchema)).toBe(beforeSchema);
    expect(presentCommentaryStructured('John 3:16', null, jfbResult())).toEqual(beforeOutput);
  });
});
