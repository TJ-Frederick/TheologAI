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
    expect(result.content[0].text).not.toContain('Meaning here, in plain English');
    expect(result.structuredContent).toMatchObject({ kind: 'original_language_study', status: 'partial', context: { language: 'Greek' } });
    expect(result.structuredContent).not.toHaveProperty('corpusUsage');
    expect(handler.outputSchema?.properties).not.toHaveProperty('corpusUsage');
    expect(validatorFor(handler.outputSchema!)(result.structuredContent).valid).toBe(true);
    expect((result.structuredContent?.interpretiveLimits as Array<{ code: string }>).map(x => x.code)).toContain('corpus_scope_limit');
  });
});
