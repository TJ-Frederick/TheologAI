import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const srcRoot = resolve(repoRoot, 'src');
const kernelRoot = resolve(repoRoot, 'src/kernel');
const servicesRoot = resolve(repoRoot, 'src/services');
const languageServicesRoot = resolve(repoRoot, 'src/services/languages');
const adaptersRoot = resolve(repoRoot, 'src/adapters');
const presentersRoot = resolve(repoRoot, 'src/presenters');
const formattersRoot = resolve(repoRoot, 'src/formatters');
const typeScriptFile = /\.(?:ts|tsx|mts|cts)$/;
const compilerOptions: ts.CompilerOptions = {
  allowJs: false,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  resolveJsonModule: true,
};
const resolutionHost = ts.createCompilerHost(compilerOptions);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : typeScriptFile.test(entry.name) ? [file] : [];
  });
}

function scriptKindForFileName(fileName: string): ts.ScriptKind {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

function literalText(node: ts.Node): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isLiteralTypeNode(node)) return literalText(node.literal);
  return undefined;
}

function resolveSpecifier(fileName: string, specifier: string): string | undefined {
  return ts.resolveModuleName(
    specifier,
    fileName,
    compilerOptions,
    resolutionHost,
  ).resolvedModule?.resolvedFileName;
}

function pathWithin(fileName: string, root: string): boolean {
  const pathFromRoot = relative(root, resolve(fileName));
  return pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !pathFromRoot.startsWith('/');
}

function moduleSpecifiersInSource(fileName: string, sourceText: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFileName(fileName),
  );
  const references: string[] = [];
  const visit = (node: ts.Node): void => {
    let specifier: string | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier ? literalText(node.moduleSpecifier) : undefined;
    } else if (ts.isImportTypeNode(node)) {
      specifier = literalText(node.argument);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      specifier = literalText(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      specifier = literalText(node.arguments[0]!);
    }
    if (specifier !== undefined) references.push(specifier);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function resolvedReferencesInSource(
  fileName: string,
  sourceText: string,
  forbiddenRoot: string,
): string[] {
  return moduleSpecifiersInSource(fileName, sourceText).filter((specifier) => {
    const resolved = resolveSpecifier(fileName, specifier);
    return resolved !== undefined && pathWithin(resolved, forbiddenRoot);
  });
}

function resolvedReferences(fileName: string, forbiddenRoot: string): string[] {
  return resolvedReferencesInSource(fileName, readFileSync(fileName, 'utf8'), forbiddenRoot);
}

describe('application-owned service boundaries', () => {
  it('keeps serving source independent of preparation, tests, documentation and raw source modules', () => {
    const forbiddenRoots = ['scripts', 'test', 'docs', 'data'].map(directory => join(repoRoot, directory));
    const references = walk(srcRoot).flatMap(fileName => forbiddenRoots.flatMap(forbiddenRoot =>
      resolvedReferences(fileName, forbiddenRoot).map(specifier => ({
        file: relative(repoRoot, fileName).replaceAll('\\', '/'),
        specifier,
      }))));
    expect(references).toEqual([]);
  });

  it('detects preparation and raw-source imports without executing their modules', () => {
    const fileName = join(srcRoot, 'preparation-boundary-regression.ts');
    const script = '../scripts/build-database.js';
    const source = '../data/data-manifest.json';
    for (const statement of [
      `import '${script}';`,
      `export * from '${script}';`,
      `type Build = import('${script}');`,
      `void import('${script}');`,
      `import build = require('${script}');`,
      `const build = require('${script}');`,
    ]) {
      expect(resolvedReferencesInSource(fileName, statement, join(repoRoot, 'scripts'))).toEqual([script]);
    }
    expect(resolvedReferencesInSource(fileName, `import manifest from '${source}';`, join(repoRoot, 'data'))).toEqual([source]);
    expect(resolvedReferencesInSource(fileName, "import compiled from './data/parallel-passages.json';", join(repoRoot, 'data'))).toEqual([]);
  });

  it('keeps service ports application-owned and retired adapter ports absent', () => {
    expect(existsSync(join(repoRoot, 'src/adapters/bible/BibleAdapter.ts'))).toBe(false);
    expect(existsSync(join(repoRoot, 'src/adapters/commentary/CommentaryAdapter.ts'))).toBe(false);
    for (const file of [
      'src/services/bible/BibleProviderPort.ts',
      'src/services/commentary/CommentaryProviderPort.ts',
      'src/services/historical/PrimarySourceSearchPorts.ts',
    ]) expect(existsSync(join(repoRoot, file))).toBe(true);
  });

  it('forbids every service import that resolves under src/adapters', () => {
    const references = walk(servicesRoot).flatMap((fileName) => resolvedReferences(fileName, adaptersRoot).map((specifier) => ({
      file: relative(repoRoot, fileName).replaceAll('\\', '/'),
      specifier,
    })));
    expect(references).toEqual([]);
  });

  it('forbids every language service import that resolves under presentation layers', () => {
    const references = walk(languageServicesRoot).flatMap((fileName) => [presentersRoot, formattersRoot].flatMap((forbiddenRoot) =>
      resolvedReferences(fileName, forbiddenRoot).map((specifier) => ({
        file: relative(repoRoot, fileName).replaceAll('\\', '/'),
        specifier,
      }))));
    expect(references).toEqual([]);
  });

  it('detects static, import-type, dynamic, import-equals, and literal require boundaries', () => {
    const syntheticDirectory = join(repoRoot, 'src/services');
    const specifier = '../adapters/bible/EsvAdapter.js';
    const cases = [
      { name: 'static.ts', source: `import type { EsvAdapter } from '${specifier}';` },
      { name: 'import-type.mts', source: `type Esv = import('${specifier}').EsvAdapter;` },
      { name: 'dynamic.tsx', source: `void import('${specifier}'); const view = <div />;` },
      { name: 'import-equals.cts', source: `import legacy = require('${specifier}');` },
      { name: 'require.cts', source: `const legacy = require('${specifier}');` },
    ];
    for (const { name, source } of cases) {
      const fileName = join(syntheticDirectory, `application-boundary-regression-${name}`);
      expect(resolvedReferencesInSource(fileName, source, adaptersRoot), name).toEqual([specifier]);
    }
  });

  it('detects every syntax form that would make a language service depend on presentation', () => {
    const syntheticDirectory = join(repoRoot, 'src/services/languages');
    const cases = [
      { name: 'static.ts', target: 'presenters/originalLanguageStudyStructured.js', root: presentersRoot, source: (specifier: string) => `import type { Presentation } from '${specifier}';` },
      { name: 'import-type.mts', target: 'formatters/originalLanguageStudyV2Formatter.js', root: formattersRoot, source: (specifier: string) => `type Formatter = import('${specifier}').formatOriginalLanguageStudyV2;` },
      { name: 'dynamic.tsx', target: 'presenters/originalLanguageStudyStructured.js', root: presentersRoot, source: (specifier: string) => `void import('${specifier}'); const view = <div />;` },
      { name: 'import-equals.cts', target: 'formatters/originalLanguageStudyV2Formatter.js', root: formattersRoot, source: (specifier: string) => `import legacy = require('${specifier}');` },
      { name: 'require.cts', target: 'presenters/originalLanguageStudyStructured.js', root: presentersRoot, source: (specifier: string) => `const legacy = require('${specifier}');` },
      { name: 'export-type.ts', target: 'presenters/originalLanguageStudyStructured.js', root: presentersRoot, source: (specifier: string) => `export type { OriginalLanguageStudyStructured } from '${specifier}';` },
    ];
    for (const { name, target, root, source } of cases) {
      const specifier = `../../${target}`;
      const fileName = join(syntheticDirectory, `language-presentation-boundary-regression-${name}`);
      expect(resolvedReferencesInSource(fileName, source(specifier), root), name).toEqual([specifier]);
    }
  });

  it('keeps every resolved kernel-local src dependency inside src/kernel', () => {
    const references = walk(kernelRoot).flatMap((fileName) => moduleSpecifiersInSource(
      fileName,
      readFileSync(fileName, 'utf8'),
    ).flatMap((specifier) => {
      const resolved = resolveSpecifier(fileName, specifier);
      return resolved !== undefined && pathWithin(resolved, srcRoot) && !pathWithin(resolved, kernelRoot)
        ? [{ file: relative(repoRoot, fileName).replaceAll('\\', '/'), specifier }]
        : [];
    }));
    expect(references).toEqual([]);
  });

  it('detects all import forms that would make a kernel file depend on a service', () => {
    const syntheticDirectory = join(repoRoot, 'src/kernel');
    const specifier = '../services/bible/BibleProviderPort.js';
    const cases = [
      { name: 'static.ts', source: `import type { BibleProviderPort } from '${specifier}';` },
      { name: 'import-type.mts', source: `type Port = import('${specifier}').BibleProviderPort;` },
      { name: 'dynamic.tsx', source: `void import('${specifier}'); const view = <div />;` },
      { name: 'import-equals.cts', source: `import legacy = require('${specifier}');` },
      { name: 'require.cts', source: `const legacy = require('${specifier}');` },
    ];
    for (const { name, source } of cases) {
      const fileName = join(syntheticDirectory, `kernel-boundary-regression-${name}`);
      expect(resolvedReferencesInSource(fileName, source, servicesRoot), name).toEqual([specifier]);
    }
  });
});
