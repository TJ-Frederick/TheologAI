import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AQUINAS_GUTENBERG_TOPOLOGY_DISCREPANCY_LEDGER_PATH,
  AQUINAS_GUTENBERG_TOPOLOGY_LOCK_PATH,
  readAquinasGutenbergTopologyDiscrepancyLedger,
} from '../../../scripts/aquinas-gutenberg-topology.js';
import { expectedAquinasQuestionKeys } from '../../../src/kernel/sectionedEditionCollectionFoundation.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('Aquinas Gutenberg content-free topology lock', () => {
  it('binds the frozen four-source topology with no runtime registration', () => {
    const lock = JSON.parse(read(AQUINAS_GUTENBERG_TOPOLOGY_LOCK_PATH)) as {
      status: string;
      questions: { questionKey: string; source_locator_status: string; source_structure_status: string }[];
      sources: { ebookId: number; editorialInterludeCount: number }[];
    };

    expect(lock.status).toBe('local_only_inactive');
    expect(lock.questions.map(question => question.questionKey)).toEqual(expectedAquinasQuestionKeys());
    expect(lock.sources.map(source => source.ebookId)).toEqual([17611, 17897, 18755, 19950]);
    expect(lock.sources.map(source => source.editorialInterludeCount)).toEqual([0, 0, 0, 1]);
    expect(question(lock, 'prima-secundae.q038')).toMatchObject({ source_locator_status: 'verified', source_structure_status: 'discrepancy_ledgered' });
    expect(question(lock, 'prima.q019')).toMatchObject({ source_locator_status: 'discrepancy_ledgered', source_structure_status: 'discrepancy_ledgered' });
  });

  it('requires the exact checked-in content-free discrepancy ledger', () => {
    const ledger = readAquinasGutenbergTopologyDiscrepancyLedger();
    const perArtifact = ledger.entries.reduce<Record<number, number>>((counts, entry) => {
      counts[entry.ebookId] = (counts[entry.ebookId] ?? 0) + 1;
      return counts;
    }, {});

    expect(ledger.entries).toHaveLength(46);
    expect(perArtifact).toEqual({
      17611: 14,
      17897: 9,
      18755: 17,
      19950: 6,
    });
    expect(ledger.entries.find(entry => entry.questionKey === 'prima-secundae.q038')).toMatchObject({
      observedDeclaredArticleCount: 4,
      resolvedArticleCount: 5,
      resolutionBasis: 'article_shell_count_and_preamble_evidence',
    });
  });
});

function question(lock: { questions: { questionKey: string }[] }, key: string): { questionKey: string } {
  const result = lock.questions.find(question => question.questionKey === key);
  if (!result) throw new Error(`missing frozen question key ${key}`);
  return result;
}

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}
