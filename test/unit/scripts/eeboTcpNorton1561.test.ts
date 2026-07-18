import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseSourceLock,
  parseStrictLocalXml,
  reviewedBookChildren,
  verifyCheckedInNortonNormalization,
} from '../../../scripts/normalize-eebo-tcp-norton-1561.js';

const sourceRoot = new URL('../../../data/historical-sources/eebo-tcp/A17662/', import.meta.url);

function bytes(name: string): Buffer {
  return readFileSync(new URL(name, sourceRoot));
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceLock(): Record<string, any> {
  return JSON.parse(bytes('SOURCE.json').toString('utf8')) as Record<string, any>;
}

describe('inactive EEBO-TCP A17662 Norton 1561 Gate 1 packet', () => {
  it('locks the exact upstream XML and unmodified per-work rights artifact', () => {
    const xml = bytes('A17662.xml');
    const rights = bytes('README.md');
    const lock = sourceLock();

    expect([xml.byteLength, sha256(xml)]).toEqual([
      4_820_278,
      '90124aa3bf17f7dcb5cab40719ed362c91c0018194b7397884b58f6b10daf5a4',
    ]);
    expect([rights.byteLength, sha256(rights)]).toEqual([
      32_260,
      '79287eb13717149ec5d3fdbf461b21ebd83aa211745c87c41b23260d5ff87b8a',
    ]);
    expect(lock.sourceCommit).toBe('32191150ad4a919dfd2c28c89b1dbc1c2396252a');
    expect(lock.artifacts.map((artifact: Record<string, unknown>) => artifact.gitBlobSha1)).toEqual([
      '16a1c67eede080180fad5c8f7790eac811255fa6',
      '8acbc19251c8c4bbd3bbdc8a86d1c18a241f1d2a',
    ]);
    expect(lock.rights.excluded).toEqual(['page_images', 'facsimiles', 'ccel_material']);
    expect(rights.toString('utf8').replace(/\s+/g, ' ')).toContain(
      'Creative Commons 0 1.0 Universal',
    );
  });

  it.each([
    ['repository URL', (lock: any) => { lock.repositoryUrl = 'https://example.invalid/A17662'; }],
    ['source commit', (lock: any) => { lock.sourceCommit = '0'.repeat(40); }],
    ['acquisition instant', (lock: any) => { lock.acquiredAt = '2026-07-17T20:05:09Z'; }],
    ['artifact order', (lock: any) => { lock.artifacts.reverse(); }],
    ['XML source path', (lock: any) => { lock.artifacts[0].sourcePath = 'other.xml'; }],
    ['XML source URL', (lock: any) => { lock.artifacts[0].sourceUrl = 'https://example.invalid/A17662.xml'; }],
    ['XML local path', (lock: any) => { lock.artifacts[0].localPath = 'data/elsewhere/A17662.xml'; }],
    ['XML Git blob', (lock: any) => { lock.artifacts[0].gitBlobSha1 = '0'.repeat(40); }],
    ['XML byte count', (lock: any) => { lock.artifacts[0].bytes += 1; }],
    ['XML SHA-256', (lock: any) => { lock.artifacts[0].sha256 = '0'.repeat(64); }],
    ['rights source path', (lock: any) => { lock.artifacts[1].sourcePath = 'RIGHTS.md'; }],
    ['rights source URL', (lock: any) => { lock.artifacts[1].sourceUrl = 'https://example.invalid/README.md'; }],
    ['rights local path', (lock: any) => { lock.artifacts[1].localPath = 'data/elsewhere/README.md'; }],
    ['rights Git blob', (lock: any) => { lock.artifacts[1].gitBlobSha1 = '0'.repeat(40); }],
    ['rights byte count', (lock: any) => { lock.artifacts[1].bytes += 1; }],
    ['rights SHA-256', (lock: any) => { lock.artifacts[1].sha256 = '0'.repeat(64); }],
    ['rights status', (lock: any) => { lock.rights.status = 'open_license'; }],
    ['rights scope', (lock: any) => { lock.rights.scope = 'Any TCP material'; }],
    ['rights instrument', (lock: any) => { lock.rights.instrumentUrl = 'https://example.invalid/cc0'; }],
    ['TCP licensing URL', (lock: any) => { lock.rights.tcpLicensingUrl = 'https://example.invalid/tcp'; }],
    ['attribution policy', (lock: any) => { lock.rights.attributionPolicy = 'No credit'; }],
    ['excluded material', (lock: any) => { lock.rights.excluded = ['page_images']; }],
    ['transform version', (lock: any) => { lock.normalization.transformVersion = 2; }],
    ['compiled package path', (lock: any) => { lock.normalization.packagePath = 'dist/edition.json'; }],
    ['normalization report path', (lock: any) => { lock.normalization.reportPath = 'dist/report.json'; }],
    ['modification disclosure', (lock: any) => { lock.normalization.modificationNote = 'Normalized.'; }],
  ])('fails closed when the reviewed source lock mutates: %s', (_label, mutate) => {
    const lock = sourceLock();
    mutate(lock);
    expect(() => parseSourceLock(lock)).toThrow();
  });

  it('reproduces the checked-in package and report byte-for-byte within every cap', () => {
    const result = verifyCheckedInNortonNormalization();
    const { report, compiled } = result;

    expect(report.sourceStructure).toEqual({
      books: 4,
      chapters: 80,
      bookTrailersPreserved: 2,
      explicitMilestones: 1_178,
      gaps: 1_999,
      marginalNotes: 3_203,
      pageBreaksOmitted: 1_044,
      lineEndHyphensResolved: 10_424,
      lineEndUnhyphensResolved: 115,
      unresolvedGlyphMarkers: 2,
    });
    expect(report.bookChapterMilestoneKeyAssessment.status).toBe('rejected');
    expect(report.bookChapterMilestoneKeyAssessment.reasons).toContain(
      'book 1 chapter 11 milestone segment 1 is empty',
    );
    expect(report.package).toMatchObject({
      sectionCount: 1_250,
      totalContentUtf8Bytes: 3_747_794,
      compiledPackageUtf8Bytes: 4_058_506,
      compiledPackageSha256: '3054f4446b2e92af87c1713ee1c44d6745bca42a32aed7c67890d25fedbdff33',
    });
    expect(Object.values(report.package.headroom).every(value => value >= 0)).toBe(true);
    expect(report.deterministic).toEqual({
      secondCompileSha256: report.package.compiledPackageSha256,
      byteIdentical: true,
    });
    expect(compiled.package.sections[0]!.sectionKey).toBe('a17662-source-ordinal-0001');
    expect(compiled.package.sections[0]!.displayLabel).toBe('Source segment 1');
    expect(compiled.package.sections.at(-1)!.sectionKey).toBe('a17662-source-ordinal-1250');
    expect(compiled.package.sections.at(-1)!.displayLabel).toBe('Source segment 1250');
    expect(compiled.package.sections.every(section => !section.displayLabel.includes('§'))).toBe(true);
  });

  it('preserves diplomatic text and uncertainty markers while excluding pointers and foreign corpus text', () => {
    const result = verifyCheckedInNortonNormalization();
    const rendered = result.compiled.package.sections
      .map(section => `${section.heading}\n${section.content}`)
      .join('\n');

    expect(rendered).toContain('vvrytten in Latine by maister Ihon Caluin');
    expect(rendered).toContain('Quenes maiesties iniunctions');
    expect(rendered).toContain('more plētiful frute');
    expect(rendered).toContain('I was certainly enformed');
    expect(rendered).not.toContain('plē tiful');
    expect(rendered).not.toContain('cer tainly');
    expect(rendered).toContain('⟦gap: illegible; 1 letter; marker •⟧');
    expect(rendered).toContain('⟦margin note: Pro. xxix.xviii.⟧');
    expect(rendered).toContain('⟦unresolved glyph: char:abque⟧');
    expect(rendered).not.toMatch(/tcp:7550:|\bfacs=|ccel/i);
  });

  it('preserves the two reviewed book trailers at the ends of their final chapter segments', () => {
    const { compiled, report } = verifyCheckedInNortonNormalization();
    const firstBookFinal = compiled.package.sections[156]!;
    const thirdBookFinal = compiled.package.sections[777]!;

    expect(report.sourceStructure).toMatchObject({
      bookTrailersPreserved: 2,
      lineEndHyphensResolved: 10_424,
      lineEndUnhyphensResolved: 115,
    });
    expect(firstBookFinal).toMatchObject({
      sourceOrdinal: 157,
      sectionKey: 'a17662-source-ordinal-0157',
    });
    expect(firstBookFinal.content).toMatch(/\n\nThe ende of the fyrst booke\.$/);
    expect(thirdBookFinal).toMatchObject({
      sourceOrdinal: 778,
      sectionKey: 'a17662-source-ordinal-0778',
    });
    expect(thirdBookFinal.content).toMatch(/\n\nThe ende of the third Boke\.$/);
  });

  it.each([
    ['unknown child', '<div n="1" type="book"><head>Book</head><argument/><div n="1" type="chapter"/></div>'],
    ['direct text', '<div n="1" type="book"><head>Book</head>unreviewed<div n="1" type="chapter"/></div>'],
    ['chapter after trailer', '<div n="1" type="book"><head>Book</head><div n="1" type="chapter"/><trailer>End.</trailer><div n="2" type="chapter"/></div>'],
    ['trailer attributes', '<div n="1" type="book"><head>Book</head><div n="1" type="chapter"/><trailer type="end">End.</trailer></div>'],
  ])('fails closed on unreviewed book-level structure: %s', (_label, xml) => {
    const book = parseStrictLocalXml(xml);
    expect(() => reviewedBookChildren(book, '1')).toThrow(/book 1/);
  });

  it('accepts only local predefined or valid numeric XML character references', () => {
    const root = parseStrictLocalXml('<TEI a="A&amp;B"><text>A&lt;B &#65; &#x42;</text></TEI>');
    expect(root.attributes.a).toBe('A&B');
    expect(root.parts[0]).toMatchObject({ parts: ['A<B A B'] });
  });

  it.each([
    ['DTD', '<!DOCTYPE TEI><TEI/>'],
    ['custom entity declaration', '<!DOCTYPE TEI [<!ENTITY x "boom">]><TEI>&x;</TEI>'],
    ['processing instruction', '<?xml version="1.0"?><TEI/>'],
    ['comment', '<TEI><!-- hidden --></TEI>'],
    ['CDATA', '<TEI><![CDATA[hidden]]></TEI>'],
    ['unknown entity', '<TEI>&writer;</TEI>'],
    ['invalid numeric entity', '<TEI>&#0;</TEI>'],
    ['surrogate numeric entity', '<TEI>&#xD800;</TEI>'],
    ['duplicate attribute', '<TEI a="1" a="2"/>'],
    ['mismatched close', '<TEI><text></TEI>'],
    ['multiple roots', '<TEI/><TEI/>'],
    ['unclosed root', '<TEI>'],
  ])('rejects %s without external resolution', (_label, xml) => {
    expect(() => parseStrictLocalXml(xml)).toThrow();
  });
});
