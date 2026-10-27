import { describe, expect, it } from 'vitest';
import { presentBibleLookupStructured } from '../../../src/presenters/bibleStructured.js';

const citation = {
  source: 'English Standard Version',
  copyright: 'ESV license',
  url: 'https://example.test/esv',
};

describe('Bible structured presenter', () => {
  it('presents a single passage with footnote fields and provenance', () => {
    const result = presentBibleLookupStructured({
      reference: 'John 3:16',
      translation: 'ESV',
      text: 'For God so loved the world.',
      footnotes: [{
        id: 1,
        caller: 'a',
        text: 'A translation note.',
        reference: { chapter: 3, verse: 16 },
      }],
      citation,
    }, 'John 3:16', ['ESV']);

    expect(result).toMatchObject({
      schemaVersion: '1',
      kind: 'bible_lookup',
      requestedReference: 'John 3:16',
      requestedTranslations: ['ESV'],
      passages: [{
        reference: 'John 3:16',
        translation: 'ESV',
        text: 'For God so loved the world.',
        footnotes: [{ caller: 'a', text: 'A translation note.', chapter: 3, verse: 16 }],
        provenanceIds: ['src-1'],
      }],
    });
    expect(result.provenance).toEqual([expect.objectContaining({
      id: 'src-1',
      kind: 'translation',
      label: 'English Standard Version',
      rightsNotice: 'ESV license',
      attribution: 'Crossway',
      note: expect.stringContaining('No open-content license is asserted'),
      status: 'provider_attributed',
    })]);
    expect(result.provenance[0]).not.toHaveProperty('license');
  });

  it('adds authoritative ESV and NET source metadata without inventing licenses', () => {
    const result = presentBibleLookupStructured({
      reference: 'John 1:1',
      results: [
        {
          reference: 'John 1:1', translation: 'ESV', text: 'ESV text',
          citation: {
            source: 'English Standard Version',
            copyright: 'ESV® Bible (English Standard Version®), copyright © 2001 by Crossway',
            url: 'https://www.esv.org/',
          },
        },
        {
          reference: 'John 1:1', translation: 'NET', text: 'NET text',
          citation: {
            source: 'New English Translation',
            copyright: 'NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C.',
            url: 'https://netbible.org',
          },
        },
      ],
      failures: [],
    }, 'John 1:1', ['ESV', 'NET']);

    expect(result.provenance).toEqual([
      expect.objectContaining({
        label: 'English Standard Version', url: 'https://www.esv.org/',
        attribution: 'Crossway', rightsNotice: expect.stringContaining('copyright © 2001'),
        note: expect.stringContaining('No open-content license is asserted'),
      }),
      expect.objectContaining({
        label: 'New English Translation', url: 'https://netbible.org',
        attribution: 'Biblical Studies Press, L.L.C.', rightsNotice: expect.stringContaining('copyright ©1996, 2019'),
        note: expect.stringContaining('No open-content license is asserted'),
      }),
    ]);
    for (const record of result.provenance) expect(record).not.toHaveProperty('license');
  });

  it('recognizes explicit public-domain notices without treating other notices as licenses', () => {
    const result = presentBibleLookupStructured({
      reference: 'John 3:16',
      translation: 'KJV',
      text: 'For God so loved the world.',
      citation: { source: 'King James Version', copyright: 'Public Domain' },
    }, 'John 3:16', ['KJV']);

    expect(result.provenance[0]).toMatchObject({
      rightsNotice: 'Public Domain',
      license: { label: 'Public Domain' },
    });
  });

  it('keeps partial translation failures and deduplicates equal citations', () => {
    const result = presentBibleLookupStructured({
      reference: 'John 3:16',
      results: [
        { reference: 'John 3:16', translation: 'WEB', text: 'WEB text', citation: { source: 'Same source' } },
        { reference: 'John 3:16', translation: 'KJV', text: 'KJV text', citation: { source: 'Same source' } },
      ],
      failures: [{ translation: 'NET', reason: 'Translation could not be retrieved.' }],
    }, 'John 3:16', ['WEB', 'KJV', 'NET']);

    expect(result.failures).toEqual([{ translation: 'NET', reason: 'Translation could not be retrieved.' }]);
    expect(result.passages.map(passage => passage.provenanceIds)).toEqual([['src-1'], ['src-1']]);
    expect(result.provenance).toHaveLength(1);
  });
});
