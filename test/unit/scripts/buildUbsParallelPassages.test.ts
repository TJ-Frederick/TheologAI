import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertProvenanceMatches,
  compileUbsParallelPassages,
  type GeneratedUbsCorpus,
  type SourceMetadata,
} from '../../../scripts/build-ubs-parallel-passages.js';

const sourceDir = new URL('../../../data/parallel-passages/ubs-paratext/', import.meta.url);
const sourcePath = new URL('ParallelPassages.xml', sourceDir);
const metadataPath = new URL('SOURCE.json', sourceDir);
const generatedPath = new URL('../../../src/data/ubs-parallel-passages.generated.json', import.meta.url);

const sourceBytes = readFileSync(sourcePath);
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as SourceMetadata;
const manifest = JSON.parse(readFileSync(new URL('../../../data/data-manifest.json', import.meta.url), 'utf8')) as {
  sources: { ubs_paratext_parallel_passages: SourceMetadata };
};
const generatedBytes = readFileSync(generatedPath, 'utf8');
const generated = JSON.parse(generatedBytes) as GeneratedUbsCorpus;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha(bytes: Buffer): string {
  return createHash('sha1').update(Buffer.concat([
    Buffer.from(`blob ${bytes.length}\0`, 'utf8'),
    bytes,
  ])).digest('hex');
}

function fixtureMetadata(xml: string): SourceMetadata {
  const bytes = Buffer.from(xml, 'utf8');
  return {
    ...metadata,
    sourceBytes: bytes.length,
    sourceSha256: sha256(bytes),
    sourceBlob: gitBlobSha(bytes),
  };
}

function fixtureXml(groups: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><Passages>${groups.join('')}</Passages>`;
}

function passage(members: string[]): string {
  return `<Passage>${members.join('')}</Passage>`;
}

function verse(attribute: string, reference: string): string {
  return `<Verse ${attribute}>${reference}</Verse>`;
}

describe('UBS/Paratext deterministic compiler', () => {
  it('matches the pinned snapshot and exact published invariants', () => {
    expect(sourceBytes.byteLength).toBe(336250);
    expect(sha256(sourceBytes)).toBe('d43e7554556c1a1c5e2464e6b5ad8a4ab9118ada11060bf6b200abf3d0d0a394');
    expect(gitBlobSha(sourceBytes)).toBe('b30af22e9ee4740f6c339eb267a59b8fdb9f83f7');
    expect(metadata.sourceCommit).toBe('fd7bcf88b20a1522d3916f437f012c561466fe7b');
    expect(manifest.sources.ubs_paratext_parallel_passages).toEqual(metadata);

    const groups = generated.groups;
    const members = groups.flatMap(group => group.members);
    const markers = groups.map(group => new Set(group.members.map(member => member.languageMarker)));
    const groupSizes = new Map<number, number>();
    for (const group of groups) groupSizes.set(group.members.length, (groupSizes.get(group.members.length) ?? 0) + 1);

    expect(groups).toHaveLength(2193);
    expect(members).toHaveLength(5266);
    expect(markers.filter(set => set.size === 1 && set.has('HEB'))).toHaveLength(1184);
    expect(markers.filter(set => set.size === 1 && set.has('GRK'))).toHaveLength(760);
    expect(markers.filter(set => set.size === 2)).toHaveLength(249);
    expect(groupSizes.get(2)).toBe(1699);
    expect([...groupSizes.entries()].filter(([size]) => size >= 3).reduce((sum, [, count]) => sum + count, 0)).toBe(494);
    expect(Math.max(...groups.map(group => group.members.length))).toBe(39);

    expect(members.filter(member => member.sourceReference.includes('-'))).toHaveLength(647);
    expect(members.filter(member => member.sourceReference.includes(','))).toHaveLength(10);
    expect(new Set(members.map(member => member.sourceReference.split(' ')[0]))).toHaveLength(60);
    expect(new Set(members.flatMap(member => [...member.alignmentRaw]))).toEqual(new Set(['0', '1', '2', '3', '4', '5']));
    expect(new Set(groups.map(group => group.groupId)).size).toBe(groups.length);
    expect(groups.every((group, index) => group.sourceOrdinal === index + 1
      && group.members.every((member, memberIndex) => member.sourceOrder === memberIndex + 1))).toBe(true);
    expect(groups.every(group => group.label === 'source_attested_parallel')).toBe(true);
    expect(groups.every(group => group.directionality === 'unspecified')).toBe(true);
    expect(generated.provenance.license).toBe('CC BY-SA 4.0');
    expect(generated.provenance.modified).toBe(true);
    expect(generated.provenance.sourceSha256).toBe(metadata.sourceSha256);
  });

  it('is byte-identical when compiled twice and matches the checked-in artifact', () => {
    const first = compileUbsParallelPassages(sourceBytes, metadata);
    const second = compileUbsParallelPassages(sourceBytes, metadata);
    expect(first).toBe(second);
    expect(first).toBe(generatedBytes);
    expect(first.endsWith('\n')).toBe(true);
  });

  it('preserves discontinuous segments without widening ranges', () => {
    const member = generated.groups
      .flatMap(group => group.members)
      .find(candidate => candidate.sourceReference === 'LUK 6:27-28,35');
    expect(member).toBeDefined();
    expect(member?.normalizedReference).toBe('Luke 6:27-28,35');
    expect(member?.segments).toEqual([
      { bookNumber: 42, chapter: 6, startVerse: 27, endVerse: 28 },
      { bookNumber: 42, chapter: 6, startVerse: 35, endVerse: 35 },
    ]);
    const indexEntries = generated.referenceIndex['42:6'];
    expect(indexEntries.some(entry => entry.startVerse === 27 && entry.endVerse === 28)).toBe(true);
    expect(indexEntries.some(entry => entry.startVerse === 35 && entry.endVerse === 35)).toBe(true);
    expect(indexEntries.some(entry => entry.startVerse === 27 && entry.endVerse === 35)).toBe(false);
  });

  it('derives alignment basis from testament composition while preserving raw codes', () => {
    const mixed = generated.groups.find(group => group.members.some(member => member.sourceReference === 'ISA 40:3'));
    expect(mixed?.members.find(member => member.sourceReference === 'ISA 40:3')?.alignmentBasis).toBe('LXX');
    expect(mixed?.members.filter(member => member.languageMarker === 'GRK').every(member => member.alignmentBasis === 'UBSGNT5')).toBe(true);
    expect(generated.groups.filter(group => group.members.every(member => member.languageMarker === 'HEB'))
      .every(group => group.members.every(member => member.alignmentBasis === 'BHS'))).toBe(true);
  });
});

describe('UBS/Paratext compiler rejection and security gates', () => {
  function compileFixture(xml: string): GeneratedUbsCorpus {
    return JSON.parse(compileUbsParallelPassages(xml, fixtureMetadata(xml))) as GeneratedUbsCorpus;
  }

  it.each([
    ['DOCTYPE/entity declarations', '<!DOCTYPE Passages [<!ENTITY x SYSTEM "file:///tmp/x">]><Passages />'],
    ['unknown element', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1'), '<Other>GEN 1:2</Other>'])])],
    ['unknown attribute', fixtureXml([passage([verse('HEB="0" foo="1"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])])],
    ['one member group', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1')])])],
    ['both language attributes', fixtureXml([passage([verse('HEB="0" GRK="1"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])])],
    ['missing language attribute', fixtureXml([passage([verse('', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])])],
    ['invalid alignment digit', fixtureXml([passage([verse('HEB="9"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])])],
    ['unknown book code', fixtureXml([passage([verse('HEB="0"', 'ZZZ 1:1'), verse('HEB="2"', 'GEN 1:2')])])],
    ['reversed range', fixtureXml([passage([verse('HEB="0"', 'GEN 1:2-1'), verse('HEB="2"', 'GEN 1:3')])])],
    ['unsafe integer verse', fixtureXml([passage([verse('HEB="0"', 'GEN 1:9007199254740993'), verse('HEB="2"', 'GEN 1:2')])])],
    ['overflow chapter', fixtureXml([passage([verse('HEB="0"', 'GEN 999999999999999999999999:1'), verse('HEB="2"', 'GEN 1:2')])])],
    ['reference whitespace drift', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1 '), verse('HEB="2"', 'GEN 1:2')])])],
    ['unsupported entity', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1&evil;'), verse('HEB="2"', 'GEN 1:2')])])],
    ['literal vertical tab', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])]).replace('<Passages>', '<Passages>\u000b')],
    ['literal C0 control', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])]).replace('<Passages>', '<Passages>\u001f')],
    ['literal XML noncharacter', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])]).replace('<Passages>', '<Passages>\ufffe')],
    ['NBSP structural whitespace', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])]).replace('<Passages>', '<Passages>\u00a0')],
    ['missing XML declaration', '<Passages><Passage><Verse HEB="0">GEN 1:1</Verse><Verse HEB="2">GEN 1:2</Verse></Passage></Passages>'],
    ['wrong XML version', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])]).replace('version="1.0"', 'version="1.1"')],
    ['wrong XML encoding', fixtureXml([passage([verse('HEB="0"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')])]).replace('encoding="utf-8"', 'encoding="utf-16"')],
    ['malformed numeric entity', fixtureXml([passage([verse('HEB="0"', 'GEN 1:&#49junk;'), verse('HEB="2"', 'GEN 1:2')])])],
    ['disallowed numeric entity code point', fixtureXml([passage([verse('HEB="0"', 'GEN 1:&#x1;'), verse('HEB="2"', 'GEN 1:2')])])],
    ['disallowed XML control code point', fixtureXml([passage([verse('HEB="0"', 'GEN 1:&#xB;'), verse('HEB="2"', 'GEN 1:2')])])],
    ['disallowed XML non-character code point', fixtureXml([passage([verse('HEB="0"', 'GEN 1:&#xFFFE;'), verse('HEB="2"', 'GEN 1:2')])])],
    ['surrogate numeric entity', fixtureXml([passage([verse('HEB="0"', 'GEN 1:&#xD800;'), verse('HEB="2"', 'GEN 1:2')])])],
  ])('rejects %s', (_label, xml) => {
    expect(() => compileFixture(xml)).toThrow('[ubs-compiler]');
  });

  it('accepts documented alignment digits 6–8 without interpreting or discarding them', () => {
    const xml = fixtureXml([passage([
      verse('HEB="678"', 'GEN 1:1'),
      verse('HEB="012"', 'GEN 1:2'),
    ])]);
    const result = compileFixture(xml);
    expect(result.groups[0].members[0].alignmentRaw).toBe('678');
    expect(result.groups[0].members[0]).not.toHaveProperty('confidence');
  });

  it('decodes standard XML character references before validating and retaining the reference', () => {
    const xml = fixtureXml([passage([
      verse('HEB="0"', 'GEN 1:1&#x2d;1'),
      verse('HEB="2"', 'GEN 1:2'),
    ])]);
    const result = compileFixture(xml);
    expect(result.groups[0].members[0].sourceReference).toBe('GEN 1:1-1');
    expect(result.groups[0].members[0].segments[0]).toEqual({
      bookNumber: 1, chapter: 1, startVerse: 1, endVerse: 1,
    });
  });

  it('rejects exact duplicate groups and source drift', () => {
    const oneGroup = passage([verse('HEB="0"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')]);
    const duplicateXml = fixtureXml([oneGroup, oneGroup]);
    expect(() => compileFixture(duplicateXml)).toThrow(/duplicate UBS group/);
    const drifted = Buffer.from(readFileSync(sourcePath));
    drifted[drifted.length - 20] ^= 1;
    expect(() => compileUbsParallelPassages(drifted, metadata)).toThrow(/source (byte size|SHA-256|Git blob) drift/);
  });

  it('rejects provenance drift between canonical metadata records', () => {
    expect(() => assertProvenanceMatches(metadata, {
      ...metadata,
      licenseUrl: 'https://example.invalid/license',
    })).toThrow(/licenseUrl/);
    expect(() => assertProvenanceMatches(metadata, {
      ...metadata,
      sourceCommitDate: '2024-01-01',
    })).toThrow(/sourceCommitDate/);
    expect(() => assertProvenanceMatches(metadata, {
      ...metadata,
      extraField: 'drift',
    } as SourceMetadata)).toThrow(/noncanonical fields/);
    expect(() => assertProvenanceMatches({
      ...metadata,
      extraField: 'left',
    } as SourceMetadata, {
      ...metadata,
      extraField: 'right',
    } as SourceMetadata)).toThrow(/noncanonical fields/);
  });

  it('keeps IDs content-derived when group order changes and changes IDs when content changes', () => {
    const first = passage([verse('HEB="0"', 'GEN 1:1'), verse('HEB="2"', 'GEN 1:2')]);
    const second = passage([verse('GRK="1"', 'MAT 1:1'), verse('GRK="2"', 'MRK 1:1')]);
    const xml = fixtureXml([first, second]);
    const reorderedXml = fixtureXml([second, first]);
    const originalIds = new Set(compileFixture(xml).groups.map(group => group.groupId));
    const reorderedIds = new Set(compileFixture(reorderedXml).groups.map(group => group.groupId));
    expect(reorderedIds).toEqual(originalIds);

    const changedXml = fixtureXml([passage([verse('HEB="0"', 'GEN 1:1'), verse('HEB="1"', 'GEN 1:2')]), second]);
    expect(compileFixture(changedXml).groups[0].groupId).not.toBe(compileFixture(xml).groups[0].groupId);
  });
});
