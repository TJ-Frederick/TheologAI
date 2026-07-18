import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_SOURCE_LOCK,
  GUTENBERG_RDF_EXPECTATIONS,
  AQUINAS_ARTICLE_VECTOR,
  auditCyrilBlockedCandidate,
  auditGutenbergEditionEvidence,
  assertAquinasTopology,
  assertGutenbergRdfMetadata,
  buildAll,
  parseSourceLock,
  serializeArtifact,
  sha256,
  strictUtf8,
} from '../../../scripts/prepare-public-domain-historical-sources.js';

const root = resolve(import.meta.dirname, '../../..');
const prep = resolve(root, 'data/historical-sources/public-domain-prep');

function mutateUtf8File(rdf: string, ebookId: number, mutate: (file: string) => string): string {
  const marker = `<pgterms:file rdf:about="https://www.gutenberg.org/ebooks/${ebookId}.txt.utf-8">`;
  const start = rdf.indexOf(marker);
  const end = rdf.indexOf('</pgterms:file>', start);
  if (start < 0 || end < start) throw new Error(`missing UTF-8 file fixture for ${ebookId}`);
  return `${rdf.slice(0, start)}${mutate(rdf.slice(start, end + '</pgterms:file>'.length))}${rdf.slice(end + '</pgterms:file>'.length)}`;
}

function mutateLanguage(rdf: string, mutate: (language: string) => string): string {
  const start = rdf.indexOf('<dcterms:language>');
  const end = rdf.indexOf('</dcterms:language>', start);
  if (start < 0 || end < start) throw new Error('missing language fixture');
  return `${rdf.slice(0, start)}${mutate(rdf.slice(start, end + '</dcterms:language>'.length))}${rdf.slice(end + '</dcterms:language>'.length)}`;
}

function mutateUtf8FormatContainer(rdf: string, ebookId: number, mutate: (container: string) => string): string {
  const marker = `<pgterms:file rdf:about="https://www.gutenberg.org/ebooks/${ebookId}.txt.utf-8">`;
  const fileStart = rdf.indexOf(marker);
  const start = rdf.lastIndexOf('<dcterms:hasFormat>', fileStart);
  const end = rdf.indexOf('</dcterms:hasFormat>', fileStart);
  if (fileStart < 0 || start < 0 || end < fileStart) throw new Error(`missing UTF-8 format container fixture for ${ebookId}`);
  return `${rdf.slice(0, start)}${mutate(rdf.slice(start, end + '</dcterms:hasFormat>'.length))}${rdf.slice(end + '</dcterms:hasFormat>'.length)}`;
}

function wrapUtf8FileInContainer(rdf: string, ebookId: number): string {
  return mutateUtf8File(rdf, ebookId, file => `<pgterms:wrapper>${file}</pgterms:wrapper>`);
}

function wrapDirectLiteral(rdf: string, qname: string): string {
  return rdf
    .replace(`<${qname}>`, `<${qname}><rdf:value>`)
    .replace(`</${qname}>`, `</rdf:value></${qname}>`);
}

function mutateTranslator(rdf: string, mutate: (translator: string) => string): string {
  const start = rdf.indexOf('<marcrel:trl>');
  const end = rdf.indexOf('</marcrel:trl>', start);
  if (start < 0 || end < start) throw new Error('missing translator fixture');
  return `${rdf.slice(0, start)}${mutate(rdf.slice(start, end + '</marcrel:trl>'.length))}${rdf.slice(end + '</marcrel:trl>'.length)}`;
}

function filesBelow(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path)
    .filter(name => !['.git', 'node_modules', 'dist', 'test-output', 'coverage'].includes(name))
    .flatMap(name => filesBelow(resolve(path, name)));
}

describe('public-domain historical source preparation', () => {
  it('preserves every byte-locked provider artifact in both Git and the working tree', () => {
    const uniqueArtifacts = new Map(
      EXPECTED_SOURCE_LOCK.candidates
        .flatMap(candidate => candidate.artifacts)
        .map(artifact => [artifact.localPath, artifact]),
    );
    expect(EXPECTED_SOURCE_LOCK.candidates.flatMap(candidate => candidate.artifacts)).toHaveLength(20);
    expect(uniqueArtifacts.size).toBe(18);

    for (const artifact of uniqueArtifacts.values()) {
      const attribute = execFileSync('git', ['check-attr', 'text', '--', artifact.localPath], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(attribute).toBe(`${artifact.localPath}: text: unset\n`);

      const trackedBlob = execFileSync('git', ['show', `:${artifact.localPath}`], {
        cwd: root,
        maxBuffer: 16 * 1024 * 1024,
      });
      const workingTreeBytes = readFileSync(resolve(root, artifact.localPath));
      expect(trackedBlob.byteLength).toBe(artifact.bytes);
      expect(sha256(trackedBlob)).toBe(artifact.sha256);
      expect(workingTreeBytes.byteLength).toBe(artifact.bytes);
      expect(sha256(workingTreeBytes)).toBe(artifact.sha256);
      expect(workingTreeBytes.equals(trackedBlob)).toBe(true);
    }

    // The page-audit protection must name the two reviewed images exactly,
    // rather than silently applying to a future sibling image.
    const unreviewedSibling = 'data/historical-sources/internet-archive/a566189200cypruoft/page-audit/unreviewed-sibling.jpg';
    const siblingAttribute = execFileSync('git', ['check-attr', 'text', '--', unreviewedSibling], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(siblingAttribute).toBe(`${unreviewedSibling}: text: unspecified\n`);

    // The lock and compiler outputs are derived text, not acquired evidence.
    // Keep the safeguard narrow enough that normal repository text handling
    // still applies to them and to the implementation itself.
    for (const derivedPath of [
      'data/historical-sources/public-domain-prep/SOURCE_LOCK.json',
      'data/historical-sources/public-domain-prep/NORMALIZATION_REPORT.json',
      'data/historical-sources/public-domain-prep/calvin-john-allen-sixth-american.sections.json',
      'data/historical-sources/public-domain-prep/aquinas-tertia-pars-q73-q83.sections.json',
      'data/historical-sources/public-domain-prep/augustine-confessions-pusey.sections.json',
      'scripts/prepare-public-domain-historical-sources.ts',
    ]) {
      const attribute = execFileSync('git', ['check-attr', 'text', '--', derivedPath], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(attribute).toBe(`${derivedPath}: text: unspecified\n`);
    }
  });

  it('accepts only the exact closed-schema acquisition lock', () => {
    const locked = JSON.parse(readFileSync(resolve(prep, 'SOURCE_LOCK.json'), 'utf8'));
    expect(parseSourceLock(locked)).toEqual(EXPECTED_SOURCE_LOCK);
    const tampered = structuredClone(locked);
    tampered.candidates[0].artifacts[0].sha256 = '0'.repeat(64);
    expect(() => parseSourceLock(tampered)).toThrow(/exactly match/);
    const extra = structuredClone(locked);
    extra.unreviewed = true;
    expect(() => parseSourceLock(extra)).toThrow(/exactly match/);
  });

  it('uses a fatal UTF-8 decoder and rejects ambiguous code units', () => {
    expect(strictUtf8(new TextEncoder().encode('faith\r\ntext'), 'valid')).toBe('faith\r\ntext');
    expect(() => strictUtf8(Uint8Array.from([0xff]), 'invalid')).toThrow(/strict UTF-8/);
    expect(() => strictUtf8(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]), 'bom')).toThrow(/BOM/);
    expect(() => strictUtf8(new TextEncoder().encode('a\rb'), 'cr')).toThrow(/lone carriage return/);
    expect(() => strictUtf8(new TextEncoder().encode('a\0b'), 'nul')).toThrow(/forbidden/);
  });

  it('audits Cyril from locked metadata, scandata, DjVuXML, and title-page evidence but emits no normalized artifact', () => {
    expect(auditCyrilBlockedCandidate()).toEqual({
      ocrObjects: 402,
      scandataLeafCount: 406,
      titlePageLeaf: 13,
      lectureObjectPages: { lecturexix: 312, lecturexx: 317, lecturexxi: 321, lecturexxii: 324, lecturexxiii: 327 },
      roleConclusion: 'blocked_untyped_collective_credit',
    });
    expect(readdirSync(prep).some(name => /cyril.*sections/i.test(name))).toBe(false);
  });

  it('audits Gutenberg RDF rights, identities, contributor roles, English, and exact UTF-8 representations', () => {
    expect(auditGutenbergEditionEvidence()).toEqual({ rdfPublicDomainAssertions: 4, rdfSemanticAssertions: 4, calvinVolumes: 2, aquinasTransformationNoticeAudited: true, directCcelArtifacts: 0, augustineTranslatorAudited: true });
    for (const expectation of GUTENBERG_RDF_EXPECTATIONS) {
      const rdf = readFileSync(resolve(root, `data/historical-sources/project-gutenberg/pg${expectation.ebookId}/pg${expectation.ebookId}.rdf`), 'utf8');
      expect(() => assertGutenbergRdfMetadata(rdf, expectation)).not.toThrow();
    }
    const calvin = readFileSync(resolve(root, 'data/historical-sources/project-gutenberg/pg45001/pg45001.rdf'), 'utf8');
    expect(() => assertGutenbergRdfMetadata(calvin.replace('ebooks/45001', 'ebooks/99999'), GUTENBERG_RDF_EXPECTATIONS[0])).toThrow(/identity drift/);
    expect(() => assertGutenbergRdfMetadata(calvin.replace('text/plain; charset=utf-8', 'text/plain; charset=us-ascii'), GUTENBERG_RDF_EXPECTATIONS[0])).toThrow(/pinned UTF-8 text format/);
    expect(() => assertGutenbergRdfMetadata(calvin.replace('</rdf:RDF>', ''), GUTENBERG_RDF_EXPECTATIONS[0])).toThrow(/well-formed XML document/);
  });

  it('fails closed when QName bindings or reviewed RDF/XML topology are forged', () => {
    for (const expectation of GUTENBERG_RDF_EXPECTATIONS) {
      const rdf = readFileSync(resolve(root, `data/historical-sources/project-gutenberg/pg${expectation.ebookId}/pg${expectation.ebookId}.rdf`), 'utf8');
      const assertRejects = (mutated: string) => expect(() => assertGutenbergRdfMetadata(mutated, expectation)).toThrow();

      // These all preserve the familiar QName spelling, so prefix-only matching
      // or recursive text extraction would incorrectly accept them.
      const namespacePrefixes = ['pgterms', 'dcterms', 'rdfs', 'dcam', 'rdf', 'cc', ...(expectation.contributor.kind === 'translator' ? ['marcrel'] : [])];
      for (const prefix of namespacePrefixes) {
        assertRejects(rdf.replace(new RegExp(`xmlns:${prefix}="[^"]+"`), `xmlns:${prefix}="https://attacker.invalid/${prefix}"`));
      }
      assertRejects(rdf.replace('<dcterms:title>', '<dcterms:title xmlns:dcterms="https://attacker.invalid/dc/terms/">'));
      assertRejects(wrapDirectLiteral(rdf, 'dcterms:title'));
      assertRejects(wrapDirectLiteral(rdf, 'dcterms:rights'));
      assertRejects(rdf
        .replace('<dcterms:language>', '<dcterms:language><pgterms:wrapper>')
        .replace('</dcterms:language>', '</pgterms:wrapper></dcterms:language>'));
      assertRejects(mutateLanguage(rdf, language => language.replace('<dcterms:language>', '<dcterms:language rdf:resource="https://attacker.invalid/language">')));
      assertRejects(mutateLanguage(rdf, language => language.replace(/<rdf:Description rdf:nodeID="[^"]+"/, '<rdf:Description rdf:nodeID="forged"')));
      assertRejects(mutateLanguage(rdf, language => language.replace(/<rdf:Description rdf:nodeID="[^"]+"/, '$& rdf:resource="https://attacker.invalid/language-description"')));
      assertRejects(rdf.replace('http://purl.org/dc/terms/RFC4646', 'https://attacker.invalid/RFC4646'));
      assertRejects(wrapUtf8FileInContainer(rdf, expectation.ebookId));
      assertRejects(mutateUtf8FormatContainer(rdf, expectation.ebookId, container => container.replace('<dcterms:hasFormat>', '<dcterms:hasFormat rdf:resource="https://attacker.invalid/format">')));
      assertRejects(mutateUtf8File(rdf, expectation.ebookId, file => file.replace(`rdf:resource="ebooks/${expectation.ebookId}"`, 'rdf:resource="ebooks/99999"')));
      assertRejects(mutateUtf8File(rdf, expectation.ebookId, file => file.replace(`<pgterms:file rdf:about="https://www.gutenberg.org/ebooks/${expectation.ebookId}.txt.utf-8">`, `<pgterms:file rdf:about="https://www.gutenberg.org/ebooks/${expectation.ebookId}.txt.utf-8" rdf:resource="https://attacker.invalid/file">`)));
      assertRejects(mutateUtf8File(rdf, expectation.ebookId, file => file
        .replace('<dcterms:format>', '<dcterms:format><pgterms:wrapper>')
        .replace('</dcterms:format>', '</pgterms:wrapper></dcterms:format>')));
      assertRejects(mutateUtf8File(rdf, expectation.ebookId, file => file.replace('<dcterms:format>', '<dcterms:format rdf:resource="https://attacker.invalid/format">')));
      assertRejects(mutateUtf8File(rdf, expectation.ebookId, file => file.replace(/<rdf:Description rdf:nodeID="[^"]+"/, '<rdf:Description rdf:nodeID="forged"')));
      assertRejects(mutateUtf8File(rdf, expectation.ebookId, file => file.replace(/<rdf:Description rdf:nodeID="[^"]+"/, '$& rdf:resource="https://attacker.invalid/format-description"')));
      assertRejects(mutateUtf8File(rdf, expectation.ebookId, file => file.replace('rdf:resource="http://purl.org/dc/terms/IMT"', 'rdf:resource="https://attacker.invalid/IMT"')));
      assertRejects(mutateUtf8File(rdf, expectation.ebookId, file => file.replace('rdf:datatype="http://purl.org/dc/terms/IMT"', 'rdf:datatype="https://attacker.invalid/IMT"')));

      if (expectation.contributor.kind === 'translator') {
        assertRejects(rdf
          .replace('<marcrel:trl>', '<marcrel:trl><pgterms:wrapper>')
          .replace('</marcrel:trl>', '</pgterms:wrapper></marcrel:trl>'));
        assertRejects(mutateTranslator(rdf, translator => translator.replace('<marcrel:trl>', '<marcrel:trl rdf:resource="https://attacker.invalid/translator">')));
        assertRejects(mutateTranslator(rdf, translator => wrapDirectLiteral(translator, 'pgterms:name')));
        assertRejects(mutateTranslator(rdf, translator => translator.replace('<pgterms:agent ', '<pgterms:agent rdf:resource="https://attacker.invalid/translator-agent" ')));
        assertRejects(rdf.replace(expectation.contributor.agentAbout, '2009/agents/forged'));
      } else {
        assertRejects(wrapDirectLiteral(rdf, 'pgterms:marc508'));
      }
    }
  });

  it('reproduces exact checked-in section artifacts with structural audits', () => {
    const first = buildAll();
    const second = buildAll();
    expect(first.lockBytes).toBe(second.lockBytes);
    expect(first.artifacts.map(serializeArtifact)).toEqual(second.artifacts.map(serializeArtifact));
    expect(first.artifacts.map(a => a.sections.length)).toEqual([91, 95, 14]);
    expect(first.artifacts.every(a => a.status === 'inactive' && a.delivery === 'sectioned_only')).toBe(true);

    const files = [
      'calvin-john-allen-sixth-american.sections.json',
      'aquinas-tertia-pars-q73-q83.sections.json',
      'augustine-confessions-pusey.sections.json',
    ];
    expect(first.artifacts.map(serializeArtifact)).toEqual(files.map(file => readFileSync(resolve(prep, file), 'utf8')));

    const aquinas = first.artifacts[1];
    expect(aquinas.sections.filter(s => s.key.endsWith('-preface'))).toHaveLength(11);
    expect(aquinas.sections.filter(s => /-article-/.test(s.key))).toHaveLength(84);
    expect(AQUINAS_ARTICLE_VECTOR).toEqual([6, 8, 8, 8, 8, 6, 8, 12, 4, 10, 6]);
    expect(aquinas.sections.map(s => s.key)).toEqual(AQUINAS_ARTICLE_VECTOR.flatMap((count, index) => [`question-${index + 73}-preface`, ...Array.from({ length: count }, (_, article) => `question-${index + 73}-article-${article + 1}`)]));
    expect(() => assertAquinasTopology(aquinas.sections)).not.toThrow();
    const missingArticle = aquinas.sections.filter(s => s.key !== 'question-80-article-12');
    expect(() => assertAquinasTopology(missingArticle)).toThrow(/topology drift/);
    const reordered = [...aquinas.sections];
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    expect(() => assertAquinasTopology(reordered)).toThrow(/topology drift/);
    expect(aquinas.sections.some(s => s.key.startsWith('question-84'))).toBe(false);
    expect(aquinas.sections.find(s => s.key === 'question-73-article-1')?.content).toContain('_I answer that,_');
    const calvin = first.artifacts[0];
    expect(calvin.sections.filter(s => /-chapter-\d+$/.test(s.key))).toHaveLength(80);
    expect(calvin.sections.filter(s => /front-matter|preface|continuation/.test(s.key))).toHaveLength(7);
    expect(calvin.sections.slice(-5).map(s => s.key)).toEqual(['book-4-chapter-20', 'book-4-chapter-20-footnotes', 'index-of-principal-matters', 'scripture-index-to-calvins-institutes', 'transcribers-notes']);
    expect(calvin.sections.at(-5)?.content).toContain('END OF THE INSTITUTES.');
    expect(calvin.sections.at(-5)?.content).not.toContain('Footnote 1404:');
    expect(calvin.sections.at(-4)?.content).toMatch(/^Footnote 1404:/);
    expect(calvin.sections.at(-4)?.content).toContain('Footnote 1490:');
    expect(calvin.sections.at(-3)?.content).toMatch(/^INDEX OF THE PRINCIPAL MATTERS\./);
    expect(calvin.sections.at(-2)?.content).toMatch(/^SCRIPTURE INDEX TO CALVIN’S INSTITUTES\./);
    expect(calvin.sections.at(-1)?.content).toMatch(/^● Transcriber’s Notes:/);
    const report = JSON.parse(readFileSync(resolve(prep, 'NORMALIZATION_REPORT.json'), 'utf8'));
    expect(report.structuralAudit).toEqual({
      calvinVolumeII: {
        reviewedMarkers: ['Footnote 1404:', 'INDEX OF THE PRINCIPAL MATTERS.', 'SCRIPTURE INDEX TO CALVIN’S INSTITUTES.', '● Transcriber’s Notes:'],
        orderedSectionKeys: ['book-4-chapter-20', 'book-4-chapter-20-footnotes', 'index-of-principal-matters', 'scripture-index-to-calvins-institutes', 'transcribers-notes'],
        totalCalvinSections: 91,
      },
      aquinasQ73ToQ83: { questionOrder: [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83], articleVector: [6, 8, 8, 8, 8, 6, 8, 12, 4, 10, 6], totalSections: 95 },
    });
    expect(first.artifacts[2].sections[0].key).toBe('front-matter');
    expect(first.artifacts[2].sections.slice(1).map(s => s.key)).toEqual(Array.from({ length: 13 }, (_, index) => `book-${index + 1}`));
  });

  it('allows identifiers only in the offline preparation boundary and denies every operational/catalog/config surface', () => {
    const needles = ['gutenberg-pg45001-pg64392-john-allen-calvin', 'gutenberg-pg19950-aquinas-tertia-pars-q73-q83', 'gutenberg-pg3296-pusey-augustine-confessions', 'internet-archive-a566189200cypruoft-cyril-1839', 'public-domain-prep/'];
    const ignored = /^(?:\.git|node_modules|dist|test-output|coverage)\//;
    const allow = (path: string) => path.startsWith('data/historical-sources/') || path === 'scripts/prepare-public-domain-historical-sources.ts' || path === 'test/unit/scripts/publicDomainHistoricalSources.test.ts';
    const repositoryFiles = filesBelow(root)
      .map(path => relative(root, path))
      .filter(path => !ignored.test(path) && !/\.(?:png|jpg|jpeg|sqlite|db)$/.test(path));
    const references = repositoryFiles.filter(path => needles.some(needle => readFileSync(resolve(root, path), 'utf8').includes(needle)));
    expect(references.length).toBeGreaterThan(0);
    expect(references.every(allow)).toBe(true);

    const rootClientAndConfig = repositoryFiles
      .filter(path => !path.includes('/') && /\.(?:jsonc?|toml|ya?ml)$/i.test(path));
    const allWranglerConfigs = repositoryFiles
      .filter(path => /(?:^|\/)wrangler[^/]*\.(?:toml|jsonc?|json)$/i.test(path));
    const deniedPaths = [
      'src', 'migrations', '.github', 'docs',
      'data/data-manifest.json', 'data/historical-document-catalog.json', 'data/historical-document-catalog-provenance.json', 'data/historical-documents', 'data/historical-section-key-plan.json',
      'scripts', ...rootClientAndConfig, ...allWranglerConfigs,
    ].map(path => resolve(root, path)).filter(path => { try { statSync(path); return true; } catch { return false; } });
    const deniedFiles = deniedPaths.flatMap(filesBelow).filter(path => !allow(relative(root, path)) && !/\.(png|jpg|jpeg|sqlite|db)$/.test(path));
    const deniedText = deniedFiles.map(path => readFileSync(path, 'utf8')).join('\n');
    for (const needle of needles) expect(deniedText).not.toContain(needle);
  });
});
