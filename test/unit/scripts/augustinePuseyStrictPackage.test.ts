import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  escapeEditionPlainTextForMarkdown,
  escapeFrozenEditionSectionContentForMarkdown,
} from '../../../src/kernel/editionProvenanceFoundation.js';
import {
  AUGUSTINE_PUSEY_STRICT_ACQUIRED_ON,
  AUGUSTINE_PUSEY_STRICT_CONTENT_UTF8_BYTES,
  AUGUSTINE_PUSEY_STRICT_MAX_SECTION_UTF8_BYTES,
  AUGUSTINE_PUSEY_STRICT_PATHS,
  AUGUSTINE_PUSEY_STRICT_PREPARED_SHA256,
  AUGUSTINE_PUSEY_STRICT_SECTION_KEYS,
  AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS,
  buildAugustinePuseyStrictPackage,
  extractNormalizedGutenbergBody,
  sha256,
  splitFrozenAugustineSections,
  strictUtf8,
  verifyCheckedInAugustinePuseyStrictPackage,
  verifyPinnedArtifact,
} from '../../../scripts/prepare-augustine-pusey-strict-package.js';

const root = resolve(new URL('../../..', import.meta.url).pathname);

function bytes(path: string): Buffer {
  return readFileSync(resolve(root, path));
}

function filesBelow(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) return filesBelow(child);
    return entry.isFile() ? [child] : [];
  });
}

describe('inactive Augustine/Pusey strict edition package', () => {
  it('reproduces the exact checked-in package and compact report twice', () => {
    const first = verifyCheckedInAugustinePuseyStrictPackage();
    const second = verifyCheckedInAugustinePuseyStrictPackage();
    expect(first.compiled.sha256).toBe(AUGUSTINE_PUSEY_STRICT_PREPARED_SHA256);
    expect(second.compiled.sha256).toBe(first.compiled.sha256);
    expect(Buffer.compare(Buffer.from(first.compiled.utf8), Buffer.from(second.compiled.utf8))).toBe(0);
    expect(first.report.deterministic).toEqual({ secondCompileSha256: first.compiled.sha256, byteIdentical: true });
    expect(first.report.package).toMatchObject({
      sectionCount: 14,
      compiledPackageSha256: AUGUSTINE_PUSEY_STRICT_PREPARED_SHA256,
    });
  });

  it('pins the exact text, RDF metadata, and separate policy reference', () => {
    for (const artifact of AUGUSTINE_PUSEY_STRICT_SOURCE_ARTIFACTS) {
      const value = bytes(artifact.localPath);
      expect([value.byteLength, sha256(value)]).toEqual([artifact.bytes, artifact.sha256]);
      expect(() => verifyPinnedArtifact(artifact, value)).not.toThrow();
      const altered = Buffer.from(value);
      altered[0] = altered[0]! ^ 1;
      expect(() => verifyPinnedArtifact(artifact, altered)).toThrow(/drift/);
    }
  });

  it('permits only the stated normalization and preserves the exact frozen topology', () => {
    const raw = strictUtf8(bytes(AUGUSTINE_PUSEY_STRICT_PATHS.text), 'pg3296 source');
    const body = extractNormalizedGutenbergBody(raw);
    const sections = splitFrozenAugustineSections(body);
    expect(sections.map(section => section.sectionKey)).toEqual(AUGUSTINE_PUSEY_STRICT_SECTION_KEYS);
    expect(sections.map(section => section.sourceOrdinal)).toEqual(Array.from({ length: 14 }, (_, index) => index + 1));
    expect(sections.map(section => section.content).join('')).toBe(body);
    expect(Buffer.byteLength(body)).toBe(AUGUSTINE_PUSEY_STRICT_CONTENT_UTF8_BYTES);
    expect(Math.max(...sections.map(section => Buffer.byteLength(section.content)))).toBe(AUGUSTINE_PUSEY_STRICT_MAX_SECTION_UTF8_BYTES);
    expect(sections.find(section => section.sectionKey === 'book-10')?.content).toHaveLength(sections.find(section => section.sectionKey === 'book-10')!.content.length);
    expect(Buffer.byteLength(sections.find(section => section.sectionKey === 'book-10')!.content)).toBe(86_537);
    expect(body).not.toContain('START OF THE PROJECT GUTENBERG');
    expect(body).not.toContain('END OF THE PROJECT GUTENBERG');
    expect(body).not.toContain('THE FULL PROJECT GUTENBERG');
    expect(() => extractNormalizedGutenbergBody(raw.replace(/\r\n/g, '\n'))).toThrow(/CRLF/);
    expect(() => splitFrozenAugustineSections(extractNormalizedGutenbergBody(raw.replace('BOOK XIII', 'BOOK XIV')))).toThrow(/14 frozen sections|topology drift/);
    expect(() => strictUtf8(Uint8Array.from([0xff]), 'invalid')).toThrow(/strict UTF-8/);
    expect(() => strictUtf8(new TextEncoder().encode('a\rb'), 'lone CR')).toThrow(/lone carriage return/);
  });

  it('keeps Pusey as the only typed edition contributor and states the source uncertainty honestly', () => {
    const { compiled, report } = verifyCheckedInAugustinePuseyStrictPackage();
    expect(compiled.package.work).toMatchObject({
      workId: 'augustine-confessions',
      creators: [{ name: 'Augustine of Hippo', role: 'author' }],
    });
    expect(compiled.package.edition.contributorGroups).toEqual({
      translation: { metadataStatus: 'reviewed', contributors: [{ name: 'E. B. Pusey (Edward Bouverie)', role: 'translator' }] },
      editing: { metadataStatus: 'unknown', contributors: [] },
      revision: { metadataStatus: 'unknown', contributors: [] },
    });
    expect(JSON.stringify(compiled.package.edition.contributorGroups)).not.toContain('Munday');
    expect(compiled.package.edition.publication).toContain('Robert S. Munday');
    expect(compiled.package.edition.publication).toContain('Untyped source-colophon credit: Robert S. Munday');
    expect(compiled.package.edition.publication).toContain('No contributor role is asserted for that credit');
    expect(compiled.package.edition.publication).toContain('Project Gutenberg is the evidenced artifact publisher/provider');
    expect(compiled.package.edition.provenance).toMatchObject({ status: 'verified_with_uncertainty' });
    expect(compiled.package.edition.provenance.uncertainty).toContain('not independently established');
    expect(report.provenance).toMatchObject({
      acquisition: { value: AUGUSTINE_PUSEY_STRICT_ACQUIRED_ON, precision: 'day', noInventedTime: true },
      electronicTranscription: {
        releaseDate: '2002-06-01',
        updatedDate: '2023-05-05',
        untypedSourceColophonCredit: 'Robert S. Munday; copied from the Project Gutenberg source Credits line with no contributor role asserted.',
        status: 'verified_with_uncertainty',
      },
    });
  });

  it('records the USA public-domain scope and keeps Project Gutenberg policy outside delivered body', () => {
    const { compiled, report } = verifyCheckedInAugustinePuseyStrictPackage();
    expect(compiled.package.edition.exactArtifactRights).toMatchObject({
      status: 'public_domain',
      jurisdiction: 'United States',
      attributionRequirement: 'project_policy',
      redistributionApproved: true,
    });
    expect(compiled.package.edition.exactArtifactRights.territorialScope).toContain('outside the United States must check local law');
    expect(report.rights).toMatchObject({
      status: 'public_domain_in_usa',
      projectGutenbergPolicyReference: { localPath: AUGUSTINE_PUSEY_STRICT_PATHS.license, separateFromDeliveredBody: true },
    });
    const deliveredBody = compiled.package.sections.map(section => section.content).join('');
    expect(deliveredBody).not.toContain('Project Gutenberg');
    expect(deliveredBody).not.toContain('Robert S. Munday');
  });

  it('has no operational, database, catalog, or deployment integration surface', () => {
    const identifiers = [
      'augustine-pusey.strict-edition-package.json',
      'augustine-pusey.strict-normalization-report.json',
      'prepare-augustine-pusey-strict-package',
      'project-gutenberg-3296-pusey-english',
    ];
    const ignored = /^(?:\.git|node_modules|dist|test-output|coverage)\//;
    const allow = new Set([
      AUGUSTINE_PUSEY_STRICT_PATHS.package,
      AUGUSTINE_PUSEY_STRICT_PATHS.report,
      AUGUSTINE_PUSEY_STRICT_PATHS.text,
      AUGUSTINE_PUSEY_STRICT_PATHS.rdf,
      AUGUSTINE_PUSEY_STRICT_PATHS.license,
      'scripts/prepare-augustine-pusey-strict-package.ts',
      'test/unit/scripts/augustinePuseyStrictPackage.test.ts',
      'docs/AUGUSTINE-PUSEY-STRICT-PREPARATION.md',
    ]);
    const references = filesBelow(root)
      .map(path => relative(root, path))
      .filter(path => !ignored.test(path) && !/\.(?:png|jpg|jpeg|sqlite|db)$/i.test(path))
      .filter(path => identifiers.some(identifier => readFileSync(resolve(root, path), 'utf8').includes(identifier)));
    expect(references.length).toBeGreaterThan(0);
    expect(references.every(path => allow.has(path))).toBe(true);

    for (const forbiddenPath of ['migrations', 'src', '.github', 'wrangler.toml', 'package.json', 'data/data-manifest.json', 'data/historical-document-catalog.json']) {
      const absolute = resolve(root, forbiddenPath);
      if (!statSync(absolute, { throwIfNoEntry: false })) continue;
      const files = statSync(absolute).isDirectory() ? filesBelow(absolute) : [absolute];
      for (const file of files) {
        if (/\.(?:png|jpg|jpeg|sqlite|db)$/i.test(file)) continue;
        const content = readFileSync(file, 'utf8');
        for (const identifier of identifiers) expect(content).not.toContain(identifier);
      }
    }
  });

  it('does not accidentally admit wrapper or source changes through package serialization', () => {
    const compiled = buildAugustinePuseyStrictPackage();
    const bodyHash = createHash('sha256').update(compiled.package.sections.map(section => section.content).join('')).digest('hex');
    expect(bodyHash).toBe(verifyCheckedInAugustinePuseyStrictPackage().report.normalization.contentSha256);
    expect(compiled.package.sections.every(section => section.content === section.content.normalize('NFC'))).toBe(true);
  });

  it('provides every frozen Augustine section with a strict, boundary-preserving Markdown presentation path', () => {
    const { compiled } = verifyCheckedInAugustinePuseyStrictPackage();
    expect(compiled.package.sections).toHaveLength(14);

    for (const section of compiled.package.sections) {
      const leadingLineFeeds = section.content.match(/^\n+/u)?.[0] ?? '';
      const trailingLineFeeds = section.content.match(/\n+$/u)?.[0] ?? '';
      const interior = section.content.slice(leadingLineFeeds.length, section.content.length - trailingLineFeeds.length);
      const rendered = escapeFrozenEditionSectionContentForMarkdown(section.content);

      expect(rendered).toBe(
        `${leadingLineFeeds}${escapeEditionPlainTextForMarkdown(interior)}${trailingLineFeeds}`,
      );
      expect(rendered.startsWith(leadingLineFeeds)).toBe(true);
      expect(rendered.endsWith(trailingLineFeeds)).toBe(true);
    }
  });
});
