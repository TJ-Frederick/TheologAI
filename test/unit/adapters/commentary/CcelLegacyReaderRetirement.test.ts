import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import {
  CCEL_SEARCH_LIMITS,
  CcelSearchAdapter,
  composeCcelSearchRequest,
  normalizeCcelSectionLocator,
} from '../../../../src/adapters/commentary/CcelSearchAdapter.js';
import {
  parseReference,
  toCcelJFB,
  toCcelMHCConcise,
  toCcelMatthewHenry,
} from '../../../../src/kernel/reference.js';

const RETIRED_PATHS = [
  'src/adapters/commentary/CcelAdapter.ts',
  'src/services/commentary/CcelService.ts',
  'test/unit/adapters/commentary/CcelAdapter.test.ts',
  'test/unit/services/commentary/CcelService.test.ts',
] as const;
const SEARCH_ADAPTER_PATH = 'src/adapters/commentary/CcelSearchAdapter.ts';

describe('retired direct CCEL body-reader architecture', () => {
  it('keeps every unreachable legacy reader path absent', () => {
    for (const path of RETIRED_PATHS) expect(existsSync(path), path).toBe(false);
  });

  it('bans direct CCEL body endpoints and body-reader client/cache patterns from runtime source', () => {
    const runtimeFiles = walkFiles('src').filter(path => /\.[cm]?[jt]s$/.test(path));
    const runtimeSource = runtimeFiles.map(path => readFileSync(path, 'utf8')).join('\n');
    expect(runtimeSource).not.toContain('/ajax/scripture');
    expect(runtimeSource).not.toContain('.html?html=true');

    const ccelRuntimeFiles = runtimeFiles.filter(path => {
      const source = readFileSync(path, 'utf8');
      return /ccel/i.test(path) || /\bccel\b/i.test(source);
    });
    const ccelRuntimeSource = ccelRuntimeFiles.map(path => readFileSync(path, 'utf8')).join('\n');
    expect(ccelRuntimeSource).not.toMatch(/\bHttpClient\b|\.getText\s*\(|\bgetWorkSection\b|\bgetScripture\b|book-content|maxCacheBytes|\b(?:Body|Document|Work|Scripture)\w*Cache\b/);
    for (const path of ccelRuntimeFiles.filter(path => path !== SEARCH_ADAPTER_PATH)) {
      expect(directFetchInvocations(readFileSync(path, 'utf8'), path), path).toEqual([]);
    }
  });

  it.each([
    'fetch(url)',
    'globalThis.fetch(url)',
    'fetchImpl(url)',
    'this.fetchImpl(url)',
    'const url = locator.url; fetch(url)',
  ])('detects a forbidden non-search CCEL invocation: %s', source => {
    expect(directFetchInvocations(source, 'synthetic.ts')).toHaveLength(1);
  });

  it('locks the sole CCEL fetch to a bounded root search and never dereferences result locators', () => {
    const request = composeCcelSearchRequest({
      text: 'grace and truth',
      page: 1,
      limit: CCEL_SEARCH_LIMITS.maxHitsPerResponse,
    });
    const url = new URL(request.url);
    expect(url).toMatchObject({ protocol: 'https:', hostname: 'ccel.org', pathname: '/' });
    expect([...url.searchParams.keys()].sort()).toEqual(['page', 'text']);
    expect(url.searchParams.get('page')).toBe('1');

    expect(() => new CcelSearchAdapter({ baseUrl: 'https://ccel.org/ccel/author/work/' }))
      .toThrow('not an approved HTTPS origin');
    expect(() => new CcelSearchAdapter({ baseUrl: 'https://ccel.org/?text=grace' }))
      .toThrow('not an approved HTTPS origin');

    const searchSource = readFileSync(SEARCH_ADAPTER_PATH, 'utf8');
    expect(directFetchInvocations(searchSource, SEARCH_ADAPTER_PATH)).toEqual(['this.fetchImpl(validated, {']);
    expect(searchSource.match(/this\.fetchImpl\s*\(/g)).toHaveLength(1);
    expect(searchSource).toContain('this.fetchImpl(validated, {');
    expect(searchSource).toContain("url.pathname !== '/'");
    expect(searchSource).toContain('class MetadataCache');

    const locator = normalizeCcelSectionLocator('/ccel/augustine/confessions/confessions.i.html?tracking=discarded');
    expect(locator).toEqual({
      kind: 'ccel_section',
      url: 'https://ccel.org/ccel/augustine/confessions/confessions.i.html',
      work: 'augustine/confessions',
      section: 'confessions.i',
    });
  });

  it('preserves pure CCEL reference mapping helpers without restoring network body reads', () => {
    const reference = parseReference('John 3:16');
    expect(toCcelMatthewHenry(reference)).toEqual({ work: 'henry/mhc5', section: 'mhc5.John.iii' });
    expect(toCcelMHCConcise(reference)).toEqual({ work: 'henry/mhcc', section: 'mhcc.John.iii' });
    expect(toCcelJFB(reference)).toEqual({ work: 'jfb/jfb', section: 'jfb.John.iii' });
  });
});

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function directFetchInvocations(source: string, filename: string): string[] {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isDirectFetchCallee(node.expression)) {
      calls.push(node.getText(sourceFile).split(/\r?\n/u, 1)[0]!);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

function isDirectFetchCallee(expression: ts.LeftHandSideExpression): boolean {
  if (ts.isIdentifier(expression)) return expression.text === 'fetch' || expression.text === 'fetchImpl';
  if (!ts.isPropertyAccessExpression(expression)) return false;
  if (expression.name.text === 'fetchImpl') return true;
  return expression.name.text === 'fetch'
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === 'globalThis';
}
