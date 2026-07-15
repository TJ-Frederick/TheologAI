import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  OPENBIBLE_CROSS_REFERENCE_PROVENANCE as COMPATIBLE_PROVENANCE,
} from '../../../src/kernel/parallelPassageProvenance.js';
import {
  OPENBIBLE_CROSS_REFERENCE_PROVENANCE,
} from '../../../src/kernel/openBibleCrossReferenceProvenance.js';
import { crossReferencesOutputSchema } from '../../../src/mcp/schemas/crossReferences.js';
import { validatorFor } from '../../../src/mcp/validation.js';
import { presentCrossReferencesStructured } from '../../../src/presenters/crossReferencesStructured.js';

describe('cross-reference structured presenter', () => {
  it('preserves repository order, raw votes, positions, window, and exact snapshot attribution', () => {
    const output = presentCrossReferencesStructured(
      'Jn 3.16',
      { maxResults: 2, minVotes: 10 },
      {
        resolvedReference: 'John 3:16',
        references: [
          { reference: '1 John 4:9', votes: 30 },
          { reference: 'Romans 5:8', votes: 30 },
        ],
        total: 4,
        showing: 2,
        hasMore: true,
      },
    );

    expect(output).toEqual({
      schemaVersion: '1',
      kind: 'bible_cross_references',
      requestedReference: 'Jn 3.16',
      resolvedReference: 'John 3:16',
      query: { maxResults: 2, minVotes: 10 },
      ranking: {
        method: 'openbible_votes_descending',
        tieBreak: 'source_reference_ascending',
      },
      semantics: {
        evidenceUse: 'discovery_lead',
        relationshipClassification: 'unspecified',
        directionality: 'unspecified',
      },
      references: [
        { position: 1, reference: '1 John 4:9', votes: 30, provenanceIds: ['openbible-cross-references'] },
        { position: 2, reference: 'Romans 5:8', votes: 30, provenanceIds: ['openbible-cross-references'] },
      ],
      resultWindow: { returnedCount: 2, qualifyingTotal: 4, hasMore: true },
      provenance: [{
        id: 'openbible-cross-references',
        kind: 'cross_reference_dataset',
        label: 'OpenBible.info cross references',
        url: 'https://www.openbible.info/labs/cross-references/',
        license: { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
        attribution: 'OpenBible.info',
        version: '2025-10-13',
        locator: 'data/cross-references/cross_references.txt @ sha256:bb5a4f5cfb7f0faa07b171ee9b361285d6179bee705de16ead0690da16568191',
        status: 'verified_source',
      }],
    });
    expect(validatorFor(crossReferencesOutputSchema)(output).valid).toBe(true);
  });

  it('returns the one required provenance record even for an empty result window', () => {
    const output = presentCrossReferencesStructured(
      'John 3:16',
      { maxResults: 5, minVotes: 100 },
      { resolvedReference: 'John 3:16', references: [], total: 0, showing: 0, hasMore: false },
    );

    expect(output.references).toEqual([]);
    expect(output.resultWindow).toEqual({ returnedCount: 0, qualifyingTotal: 0, hasMore: false });
    expect(output.provenance).toHaveLength(1);
    expect(validatorFor(crossReferencesOutputSchema)(output).valid).toBe(true);
  });

  it('keeps the historical parallel-passage provenance import compatible', () => {
    expect(COMPATIBLE_PROVENANCE).toBe(OPENBIBLE_CROSS_REFERENCE_PROVENANCE);
  });

  it('binds provenance identity to the tracked source header and bytes', () => {
    const source = readFileSync(new URL('../../../data/cross-references/cross_references.txt', import.meta.url));
    const firstLine = source.subarray(0, source.indexOf(0x0a)).toString('utf8');
    const sha256 = createHash('sha256').update(source).digest('hex');

    expect(firstLine).toContain('CC-BY 2025-10-13');
    expect(OPENBIBLE_CROSS_REFERENCE_PROVENANCE.version).toBe('2025-10-13');
    expect(sha256).toBe('bb5a4f5cfb7f0faa07b171ee9b361285d6179bee705de16ead0690da16568191');
    expect(OPENBIBLE_CROSS_REFERENCE_PROVENANCE.locator).toContain(sha256);
  });

  it('rejects unpositioned references and invented relationship classifications', () => {
    const output = presentCrossReferencesStructured(
      'John 3:16',
      { maxResults: 1, minVotes: 0 },
      {
        resolvedReference: 'John 3:16',
        references: [{ reference: 'Romans 5:8', votes: 42 }],
        total: 1,
        showing: 1,
        hasMore: false,
      },
    );
    const malformed = structuredClone(output) as any;
    delete malformed.references[0].position;
    malformed.semantics.relationshipClassification = 'quotation';

    expect(validatorFor(crossReferencesOutputSchema)(malformed).valid).toBe(false);
  });

  it.each([101, 1_000_000])('rejects an out-of-contract reference position of %i', position => {
    const output = presentCrossReferencesStructured(
      'John 3:16',
      { maxResults: 1, minVotes: 0 },
      {
        resolvedReference: 'John 3:16',
        references: [{ reference: 'Romans 5:8', votes: 42 }],
        total: 1,
        showing: 1,
        hasMore: false,
      },
    );
    const malformed = structuredClone(output) as any;
    malformed.references[0].position = position;

    expect(validatorFor(crossReferencesOutputSchema)(malformed).valid).toBe(false);
  });

  it('rejects provenance records other than the exact pinned OpenBible snapshot', () => {
    const output = presentCrossReferencesStructured(
      'John 3:16',
      { maxResults: 5, minVotes: 0 },
      { resolvedReference: 'John 3:16', references: [], total: 0, showing: 0, hasMore: false },
    );
    const malformed = structuredClone(output) as any;
    malformed.provenance[0].version = 'latest';

    expect(validatorFor(crossReferencesOutputSchema)(malformed).valid).toBe(false);
  });
});
