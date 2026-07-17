import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('parallel-passage pagination storage guards', () => {
  it('remains migration-free and uses the existing source-ordinal key', () => {
    const migration = readFileSync(new URL('../../../migrations/0002_ubs_parallel_passages.sql', import.meta.url), 'utf8');
    expect(migration).toContain('source_ordinal INTEGER NOT NULL');
    expect(migration).toContain('ON ubs_parallel_groups(source_id, source_ordinal, group_id)');
    expect(migration).not.toMatch(/cursor/i);
  });

  it('keeps D1 continuation as bounded keyset SQL rather than offset pagination', () => {
    const adapter = readFileSync(new URL('../../../src/adapters/d1/D1UbsParallelPassageRepository.ts', import.meta.url), 'utf8');
    expect(adapter).toContain('g.source_ordinal > ?');
    expect(adapter).toContain('LIMIT ?');
    expect(adapter).not.toMatch(/\bOFFSET\b/i);
  });

  it('keeps the documented v4 cursor contract aligned with the executable schema', () => {
    const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
    const schema = readFileSync(new URL('../../../src/mcp/schemas/parallelPassages.ts', import.meta.url), 'utf8');
    const tool = readFileSync(new URL('../../../src/tools/v2/parallelPassages.ts', import.meta.url), 'utf8');
    expect(readme).toContain('Structured schema v4');
    expect(readme).not.toContain('Structured schema v3');
    expect(readme).toContain('`sourceAttestedResultWindow.nextCursor`');
    expect(readme).toContain('input `groupCursor`');
    expect(readme).not.toContain('returns an opaque `groupCursor`');
    expect(schema).toContain("const: '4'");
    expect(schema).toContain('nextCursor:');
    expect(tool).toContain('groupCursor:');
  });

  it('keeps the guided exegesis workflow metadata-first and cursor-safe', () => {
    const prompt = readFileSync(new URL('../../../src/mcp/prompts.ts', import.meta.url), 'utf8');
    const skill = readFileSync(new URL('../../../skills/passage-exegesis/SKILL.md', import.meta.url), 'utf8');
    for (const guidance of [prompt, skill]) {
      expect(guidance).toContain('additional_match_observed');
      expect(guidance).toContain('nextCursor');
      expect(guidance).toContain('groupCursor');
      expect(guidance).toContain('three pages / 15 groups');
      expect(guidance).toContain('two materially relevant groups');
      expect(guidance).toContain('first 12 unique queue references');
      expect(guidance).toContain('Preserve each selected group and every member intact; do not dedupe or flatten the groups');
      expect(guidance).toContain('separate text-enrichment queue');
      expect(guidance).toContain('Dedupe only that queue by');
      expect(guidance).toContain('normalizedReference');
      expect(guidance).toContain('budget_omitted');
      expect(guidance).toContain('before lookup');
      expect(guidance).toContain('never backfill with later references');
      expect(guidance).toContain('Never inspect, decode, or rewrite the cursor');
      expect(guidance).toMatch(/Never combine[^a-z]*groupCursor[^a-z]+with[^a-z]+includeText/);
      expect(guidance).not.toContain('includeText: true');
      expect(guidance).not.toContain('complete UBS source-attested group metadata');
    }
  });

  it('keeps executable malformed and false-terminal cases in the preview fixture', () => {
    const fixture = JSON.parse(readFileSync(
      new URL('../../fixtures/parallel-passages-preview-audit.json', import.meta.url),
      'utf8',
    )) as { cases: Array<Record<string, unknown>> };
    const byMutation = new Map(fixture.cases.map(testCase => [testCase.cursorMutation, testCase]));
    expect([...byMutation.keys()].filter(Boolean).sort()).toEqual(['false_terminal', 'malformed']);
    for (const mutation of ['malformed', 'false_terminal']) {
      expect(byMutation.get(mutation)).toMatchObject({
        cursorFrom: 'default bounded result observes an additional UBS group',
        arguments: { reference: 'Mark 10:19', maxGroups: 5 },
        assert: ['toolError', 'invalidCursorParameter'],
      });
    }
  });
});
