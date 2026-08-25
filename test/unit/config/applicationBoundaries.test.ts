import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const servicesRoot = resolve(repoRoot, 'src/services');
const adaptersRoot = resolve(repoRoot, 'src/adapters');
const typeScriptFile = /\.(?:ts|tsx|mts|cts)$/;
const compilerOptions: ts.CompilerOptions = {
  allowJs: false,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
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

function resolvesUnderAdapters(fileName: string, specifier: string): boolean {
  const resolved = ts.resolveModuleName(
    specifier,
    fileName,
    compilerOptions,
    resolutionHost,
  ).resolvedModule?.resolvedFileName;
  if (!resolved) return false;
  const pathFromAdapters = relative(adaptersRoot, resolve(resolved));
  return pathFromAdapters !== '' && !pathFromAdapters.startsWith('..') && !pathFromAdapters.startsWith('/');
}

function adapterReferencesInSource(fileName: string, sourceText: string): string[] {
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
    if (specifier !== undefined && resolvesUnderAdapters(fileName, specifier)) references.push(specifier);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function adapterReferences(fileName: string): string[] {
  return adapterReferencesInSource(fileName, readFileSync(fileName, 'utf8'));
}

describe('application-owned service boundaries', () => {
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
    const references = walk(servicesRoot).flatMap((fileName) => adapterReferences(fileName).map((specifier) => ({
      file: relative(repoRoot, fileName).replaceAll('\\', '/'),
      specifier,
    })));
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
      expect(adapterReferencesInSource(fileName, source), name).toEqual([specifier]);
    }
  });
});
