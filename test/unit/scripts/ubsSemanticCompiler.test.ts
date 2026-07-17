import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  UBS_SEMANTIC_INTERMEDIATE_SCHEMA,
  UBS_SEMANTIC_ARTIFACT_SCHEMA,
  compileUbsSemanticIntermediate,
  computeUbsSemanticArtifactIdentity,
} from '../../../scripts/ubs-semantics/compiler.js';

const fixturePath = new URL('../../fixtures/ubs-semantics/invented-valid.json', import.meta.url);
const fixtureText = readFileSync(fixturePath, 'utf8');
type Fixture = Record<string, any>;

function fixture(): Fixture { return JSON.parse(fixtureText) as Fixture; }
function compile(value: unknown) { return compileUbsSemanticIntermediate(JSON.stringify(value)); }
function addSecondEntry(input: Fixture): void {
  const entry = structuredClone(input.entries[0]);
  entry.entryId = 'synthetic-entry-two';
  entry.sourceOrdinal = 2;
  entry.senses[0].senseId = 'synthetic-sense-two';
  entry.senses[0].entryId = entry.entryId;
  entry.senses[0].references[0].evidenceId = 'synthetic-reference-two';
  entry.senses[0].references[0].senseId = entry.senses[0].senseId;
  input.entries.push(entry);
}

describe('source-free Hebrew UBS semantic compiler skeleton', () => {
  it('compiles only the two named Hebrew artifacts and preserves internal H/A identities', () => {
    const first = compileUbsSemanticIntermediate(new TextEncoder().encode(fixtureText));
    expect(UBS_SEMANTIC_INTERMEDIATE_SCHEMA).toContain('synthetic');
    expect(first.schemaVersion).toBe(UBS_SEMANTIC_ARTIFACT_SCHEMA);
    expect(first.sources.map(source => source.artifactName)).toEqual([
      'UBSHebrewDic-v0.9.2-en.JSON',
      'UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
    ]);
    expect(first.sources.every(source => source.language === 'Hebrew')).toBe(true);
    expect(first.sources.every(source => source.artifactIdentity === first.artifactIdentity)).toBe(true);
    expect(first.entries[0].lexicalIdentities).toEqual(['A0001', 'H0001']);
    expect(first.senses[0].domainRefs).toEqual([{
      sourceId: 'synthetic-hebrew-lexical-domains', domainId: 'synthetic-domain-child',
    }]);
    expect(first.referenceEvidence[0].evidenceKind).toBe('source_attested_sense_reference');
    expect(first.artifactIdentity).toMatch(/^[0-9a-f]{64}$/);
    expect(computeUbsSemanticArtifactIdentity(first)).toBe(first.artifactIdentity);
  });

  it('canonicalizes source order, set-like identities/domain references, and input array order', () => {
    const firstInput = fixture();
    firstInput.sources.reverse();
    firstInput.domains.reverse();
    firstInput.entries[0].lexicalIdentities = ['H0001', 'A0001'];
    firstInput.entries[0].senses[0].domainIds = ['synthetic-domain-child', 'synthetic-domain-root'];
    const secondInput = fixture();
    secondInput.entries[0].lexicalIdentities = ['A0001', 'H0001'];
    secondInput.entries[0].senses[0].domainIds = ['synthetic-domain-root', 'synthetic-domain-child'];
    expect(compile(firstInput).artifactIdentity).toBe(compile(secondInput).artifactIdentity);
  });

  it('NFC-normalizes an invented Hebrew Unicode sentinel deterministically', () => {
    const decomposed = `SYNTHETIC-${String.fromCodePoint(0x05d0, 0x05b4, 0x05b0)}`;
    const normalized = decomposed.normalize('NFC');
    const first = fixture(); first.entries[0].lemma = decomposed;
    const second = fixture(); second.entries[0].lemma = normalized;
    const compiled = compile(first);
    expect(compiled.entries[0].lemma).toBe(normalized);
    expect(compiled.artifactIdentity).toBe(compile(second).artifactIdentity);
  });

  it.each([
    ['root', (x: Fixture) => { x.unreviewed = true; }],
    ['source', (x: Fixture) => { x.sources[0].unreviewed = true; }],
    ['domain', (x: Fixture) => { x.domains[0].unreviewed = true; }],
    ['entry', (x: Fixture) => { x.entries[0].unreviewed = true; }],
    ['sense', (x: Fixture) => { x.entries[0].senses[0].unreviewed = true; }],
    ['reference', (x: Fixture) => { x.entries[0].senses[0].references[0].unreviewed = true; }],
  ])('rejects unknown %s fields', (_label, mutate) => {
    const input = fixture(); mutate(input);
    expect(() => compile(input)).toThrow('unsupported field');
  });

  it('rejects non-UTF-8, BOM, invalid JSON, and the wrong fixture marker', () => {
    expect(() => compileUbsSemanticIntermediate(new Uint8Array([0xc3, 0x28]))).toThrow('not valid UTF-8');
    expect(() => compileUbsSemanticIntermediate(`\ufeff${fixtureText}`)).toThrow('without a BOM');
    expect(() => compileUbsSemanticIntermediate('{')).toThrow('not valid JSON');
    const input = fixture(); input.fixtureStatus = 'approved_source';
    expect(() => compile(input)).toThrow('invented_synthetic_only');
  });

  it.each([
    ['entry ID', (x: Fixture) => { x.entries.push(structuredClone(x.entries[0])); x.entries[1].sourceOrdinal = 2; }],
    ['entry sourceOrdinal', (x: Fixture) => { addSecondEntry(x); x.entries[1].sourceOrdinal = 1; }],
    ['domain ID', (x: Fixture) => { x.domains.push(structuredClone(x.domains[0])); x.domains[2].sourceOrdinal = 3; }],
    ['domain sourceOrdinal', (x: Fixture) => { x.domains.push(structuredClone(x.domains[0])); x.domains[2].domainId = 'synthetic-domain-other'; }],
    ['sense ID', (x: Fixture) => { const s = structuredClone(x.entries[0].senses[0]); s.sourceOrdinal = 2; x.entries[0].senses.push(s); }],
    ['synthetic-entry-one sense sourceOrdinal', (x: Fixture) => { const s = structuredClone(x.entries[0].senses[0]); s.senseId = 'synthetic-sense-two'; s.references = []; x.entries[0].senses.push(s); }],
    ['reference evidence ID', (x: Fixture) => { const r = structuredClone(x.entries[0].senses[0].references[0]); r.sourceOrdinal = 2; x.entries[0].senses[0].references.push(r); }],
    ['synthetic-sense-one reference sourceOrdinal', (x: Fixture) => { const r = structuredClone(x.entries[0].senses[0].references[0]); r.evidenceId = 'synthetic-reference-two'; x.entries[0].senses[0].references.push(r); }],
  ])('rejects duplicate %s values', (label, mutate) => {
    const input = fixture(); mutate(input);
    expect(() => compile(input)).toThrow(`Duplicate ${label}`);
  });

  it('rejects cross-entry sense ownership even when the target entry exists', () => {
    const input = fixture(); addSecondEntry(input);
    input.entries[0].senses[0].entryId = 'synthetic-entry-two';
    expect(() => compile(input)).toThrow('must equal enclosing entry synthetic-entry-one');
  });

  it('rejects cross-sense reference ownership even when the target sense exists', () => {
    const input = fixture();
    const sense = structuredClone(input.entries[0].senses[0]);
    sense.senseId = 'synthetic-sense-two'; sense.sourceOrdinal = 2; sense.references = [];
    input.entries[0].senses.push(sense);
    input.entries[0].senses[0].references[0].senseId = 'synthetic-sense-two';
    expect(() => compile(input)).toThrow('must equal enclosing sense synthetic-sense-one');
  });

  it.each([
    ['missing domain parent', (x: Fixture) => { x.domains[1].parentDomainId = 'missing'; }, 'missing parent'],
    ['domain cycle', (x: Fixture) => { x.domains[0].parentDomainId = 'synthetic-domain-child'; }, 'cycle'],
    ['parent after child', (x: Fixture) => { x.domains[0].sourceOrdinal = 2; x.domains[1].sourceOrdinal = 1; }, 'must follow parent'],
    ['missing sense domain', (x: Fixture) => { x.entries[0].senses[0].domainIds = ['missing']; }, 'missing domain'],
  ])('rejects a broken relationship: %s', (_label, mutate, message) => {
    const input = fixture(); mutate(input);
    expect(() => compile(input)).toThrow(message);
  });

  it.each([
    ['definition', (x: Fixture) => { x.entries[0].senses[0].definition = 'Text {A:foreign witness}'; }],
    ['gloss', (x: Fixture) => { x.entries[0].senses[0].glosses[0] = '{Note:foreign}'; }],
    ['domain description', (x: Fixture) => { x.domains[0].description = 'Text {W:foreign}'; }],
    ['reference', (x: Fixture) => { x.entries[0].senses[0].references[0].sourceReference = '{A:foreign} SYN 1:1'; }],
  ])('rejects third-party witness/note tags in %s', (_label, mutate) => {
    const input = fixture(); mutate(input);
    expect(() => compile(input)).toThrow('prohibited third-party witness/note tag');
  });

  it.each([
    ['Greek identity', (x: Fixture) => { x.entries[0].lexicalIdentities = ['G0001']; }],
    ['malformed lexical identity', (x: Fixture) => { x.entries[0].lexicalIdentities = ['H1 meaning']; }],
    ['zero lexical identity', (x: Fixture) => { x.entries[0].lexicalIdentities = ['A0000']; }],
    ['overlong lexical identity', (x: Fixture) => { x.entries[0].lexicalIdentities = ['A000001']; }],
    ['malformed SHA', (x: Fixture) => { x.sources[0].sourceSha256 = 'abc'; }],
    ['wrong exact artifact version', (x: Fixture) => { x.sources[0].artifactVersion = '0.9.3'; }],
    ['wrong transform pairing', (x: Fixture) => { x.sources[1].transformVersion = 8; }],
    ['non-HTTPS source', (x: Fixture) => { x.sources[0].sourceUrl = 'http://example.invalid'; }],
    ['Greek language', (x: Fixture) => { x.sources[0].language = 'Greek'; }],
    ['wrong dictionary artifact', (x: Fixture) => { x.sources[0].artifactName = 'Other.json'; }],
    ['trimmed text', (x: Fixture) => { x.entries[0].lemma = ' padded '; }],
  ])('rejects malformed or out-of-scope input: %s', (_label, mutate) => {
    const input = fixture(); mutate(input);
    expect(() => compile(input)).toThrow();
  });

  it('requires exactly one dictionary and one lexical-domain source', () => {
    const missing = fixture(); missing.sources.pop();
    expect(() => compile(missing)).toThrow('exactly the dictionary and lexical-domain artifacts');
    const duplicate = fixture(); duplicate.sources[1].sourceRole = 'dictionary';
    duplicate.sources[1].artifactName = 'UBSHebrewDic-v0.9.2-en.JSON';
    expect(() => compile(duplicate)).toThrow('Duplicate source role');
  });
});
