import { describe, expect, it, vi } from 'vitest';
import { createOriginalLanguageStudyHandler } from '../../../../src/tools/v2/originalLanguageStudy.js';
import type { OriginalLanguageStudyService } from '../../../../src/services/languages/OriginalLanguageStudyService.js';
import { validatorFor } from '../../../../src/mcp/validation.js';

describe('original_language_study handler', () => {
  it('advertises a closed bounded schema and emits cautious structured content', async () => {
    const study = vi.fn<OriginalLanguageStudyService['study']>().mockResolvedValue({
      status: 'partial', reference: 'John 3:16', language: 'Greek', target: 'love',
      selectedToken: { position: 3, text: 'ἠγάπησεν', lemma: 'ἀγαπάω', strongsNumber: 'G0025', morphologyCode: 'V-AAI-3S', gloss: 'loved' },
      warnings: ['No separate lexicon evidence.'],
    });
    const handler = createOriginalLanguageStudyHandler({ study } as unknown as OriginalLanguageStudyService);
    expect(handler.inputSchema).toMatchObject({ required: ['reference', 'target'], additionalProperties: false });
    const result = await handler.handler({ reference: 'John 3:16', target: 'love' });
    expect(study).toHaveBeenCalledWith({ reference: 'John 3:16', target: 'love' });
    expect(result.content[0].text).toContain('Contextual evidence (for a plain-English explanation)');
    expect(result.content[0].text).toContain('0f60797c170f11a1f8dc75c5f7617973e2e66b0d');
    expect(result.content[0].text).not.toContain('revision is not exposed');
    expect(result.content[0].text).not.toContain('Meaning here, in plain English');
    expect(result.structuredContent).toMatchObject({ kind: 'original_language_study', status: 'partial', context: { language: 'Greek' } });
    expect(result.structuredContent).not.toHaveProperty('corpusUsage');
    expect(handler.outputSchema?.properties).not.toHaveProperty('corpusUsage');
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
    expect((result.structuredContent?.interpretiveLimits as Array<{ code: string }>).map(x => x.code)).toContain('corpus_scope_limit');
    expect(result.structuredContent?.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'stepbible-morphology',
        version: '0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
        url: 'https://github.com/STEPBible/STEPBible-Data/tree/0f60797c170f11a1f8dc75c5f7617973e2e66b0d',
        attribution: 'Tyndale House, Cambridge / STEP Bible (www.stepbible.org)',
      }),
    ]));
  });

  it('keeps Greek lexicon-only study output unchanged when a separate gloss is present', async () => {
    const study = vi.fn<OriginalLanguageStudyService['study']>().mockResolvedValue({
      status: 'complete', reference: 'John 1:1', language: 'Greek', target: 'G6000',
      selectedToken: { position: 1, text: 'φιξτυρε', lemma: 'φιξτυρε', strongsNumber: 'G6000', morphologyCode: 'G:N-M', gloss: 'token gloss' },
      dictionary: {
        strongs_number: 'G6000', testament: null, language: 'Greek', lemma: 'φιξτυρε',
        definition: 'licensed Greek definition', citation: { source: 'STEPBible lexicon data' },
        sourceKind: 'stepbible_lexicon', extended: { gloss: 'separate Greek gloss' },
      },
      stepBible: { gloss: 'separate Greek gloss' }, warnings: [],
    });
    const result = await createOriginalLanguageStudyHandler({ study } as unknown as OriginalLanguageStudyService)
      .handler({ reference: 'John 1:1', target: 'G6000' });

    expect(result.content[0].text).toContain('### STEPBible lexicon\n\nlicensed Greek definition');
    expect(result.content[0].text).not.toContain('separate Greek gloss');
    expect(result.content[0].text).not.toContain('Brief gloss');
    expect(result.structuredContent?.lexiconEvidence).toEqual([{
      sourceId: 'stepbible-lexicon', kind: 'stepbible_lexicon', lemma: 'φιξτυρε',
      definition: 'licensed Greek definition', provenanceIds: ['stepbible-lexicon'],
    }]);
  });

  it('labels retained Hebrew brief glosses and enforces the evidence-policy notice bound', async () => {
    const notice = 'TBESH Meaning is withheld; no replacement definition is inferred.';
    const study = vi.fn<OriginalLanguageStudyService['study']>().mockResolvedValue({
      status: 'partial', reference: 'Genesis 1:1', language: 'Hebrew', target: 'H9001',
      selectedToken: { position: 1, text: 'וַ', lemma: '/וַ', strongsNumber: 'H9001', morphologyCode: 'H:C', gloss: '&' },
      dictionary: {
        strongs_number: 'H9001', testament: null, language: 'Hebrew', lemma: '/וַ',
        definition: null, citation: { source: 'STEPBible lexicon data' }, sourceKind: 'stepbible_lexicon',
        extended: { gloss: '&', morphologyCode: 'H:C' },
        evidencePolicy: {
          code: 'tbesh_meaning_withheld', semanticEvidence: 'unavailable',
          withheldFields: ['tbesh_meaning'], notice,
        },
      },
      stepBible: { gloss: '&', morphologyCode: 'H:C' }, warnings: [notice],
    });
    const handler = createOriginalLanguageStudyHandler({ study } as unknown as OriginalLanguageStudyService);
    const result = await handler.handler({ reference: 'Genesis 1:1', target: 'H9001' });

    expect(result.content[0].text).toContain('Semantic definition evidence is unavailable.');
    expect(result.content[0].text).toContain('**Brief gloss (translation cue, not a definition):** &');
    expect(result.content[0].text).not.toContain('### STEPBible lexicon\n\n&');
    expect(result.structuredContent).toMatchObject({
      lexiconEvidence: [{
        kind: 'stepbible_lexicon', gloss: '&',
        evidencePolicy: { withheldFields: ['tbesh_meaning'], notice },
      }],
    });
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);

    const evidencePolicySchema = ((handler.outputSchema!.properties!.lexiconEvidence as any).items.properties.evidencePolicy);
    expect(evidencePolicySchema.properties.notice.maxLength).toBe(1000);
    const oversized = structuredClone(result.structuredContent) as any;
    oversized.lexiconEvidence[0].evidencePolicy.notice = 'x'.repeat(1001);
    expect(validatorFor(handler.outputSchema!)(oversized).valid).toBe(false);
  });
});
