import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const retiredDirectory = resolve(repoRoot, 'src/types');
const canonicalTypes = resolve(repoRoot, 'src/kernel/types.ts');
const canonicalBarrel = resolve(repoRoot, 'src/kernel/index.ts');
const sourceRoots = ['src', 'scripts', 'test'];
const typeScriptFile = /\.(?:ts|tsx|mts|cts)$/;

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : typeScriptFile.test(entry.name) ? [file] : [];
  });
}

function scriptKindForFileName(fileName: string): ts.ScriptKind {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  // TypeScript's compiler API uses ScriptKind.TS for the ESM/CJS-flavoured
  // .mts/.cts extensions; the extension still controls module semantics.
  if (fileName.endsWith('.mts') || fileName.endsWith('.cts') || fileName.endsWith('.ts')) {
    return ts.ScriptKind.TS;
  }
  return ts.ScriptKind.Unknown;
}

function moduleSpecifierText(node: ts.Node): string | undefined {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isLiteralTypeNode(node)) return moduleSpecifierText(node.literal);
  return undefined;
}

function targetsRetiredTypes(sourceFile: ts.SourceFile, specifier: string): boolean {
  const normalizedSpecifier = specifier.replaceAll('\\', '/');
  if (/(^|\/)src\/types(?:\/|$)/.test(normalizedSpecifier)) return true;
  if (!normalizedSpecifier.startsWith('.')) return false;
  const resolvedSpecifier = resolve(dirname(sourceFile.fileName), specifier);
  return resolvedSpecifier === retiredDirectory || resolvedSpecifier.startsWith(`${retiredDirectory}/`);
}

function retiredReferencesInSource(fileName: string, sourceText: string): string[] {
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
      specifier = node.moduleSpecifier ? moduleSpecifierText(node.moduleSpecifier) : undefined;
    } else if (ts.isImportTypeNode(node)) {
      specifier = moduleSpecifierText(node.argument);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      specifier = moduleSpecifierText(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length > 0
    ) {
      specifier = moduleSpecifierText(node.arguments[0]!);
    }
    if (specifier !== undefined && targetsRetiredTypes(sourceFile, specifier)) references.push(specifier);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function retiredReferences(fileName: string): string[] {
  return retiredReferencesInSource(fileName, readFileSync(fileName, 'utf8'));
}

describe('canonical type authority', () => {
  it('retires the duplicate module and preserves the kernel authority files', () => {
    expect(existsSync(retiredDirectory)).toBe(false);
    expect(existsSync(join(retiredDirectory, 'index.ts'))).toBe(false);
    expect(statSync(canonicalTypes).isFile()).toBe(true);
    expect(statSync(canonicalBarrel).isFile()).toBe(true);
  });

  it('finds no retired type imports or exports, including quarantined files', () => {
    const references = sourceRoots.flatMap((root) => walk(resolve(repoRoot, root)))
      .flatMap((fileName) => retiredReferences(fileName).map((specifier) => ({
        file: relative(repoRoot, fileName).replaceAll('\\', '/'),
        specifier,
      })));
    expect(references).toEqual([]);
  });

  it('detects static, import-type, and dynamic retired references across TS file kinds', () => {
    const syntheticDirectory = join(repoRoot, 'test/unit/config');
    const specifier = '../../../src/types/index.js';
    const cases = [
      { name: 'static.ts', source: `import type { BibleResult } from '${specifier}';` },
      { name: 'static.tsx', source: `export { value } from '${specifier}'; const value = <div />;` },
      { name: 'import-type.mts', source: `type BibleResult = import('${specifier}').BibleResult;` },
      { name: 'dynamic.cts', source: `void import('${specifier}');` },
      { name: 'import-equals.cts', source: `import legacy = require('${specifier}');` },
      { name: 'require.cts', source: `const legacy = require('${specifier}');` },
    ];
    for (const { name, source } of cases) {
      const fileName = join(syntheticDirectory, `type-authority-regression-${name}`);
      expect(retiredReferencesInSource(fileName, source), name).toEqual([specifier]);
    }
  });
});
