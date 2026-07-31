import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MACULA_AUDIT_IDENTITY,
  assertMaculaSourceAttribute,
  parseMaculaSourceContract,
  readMaculaSourceContract,
  verifyCurrentMainAttestation,
} from '../../../scripts/macula-source-contract.js';

const repo = new URL('../../../', import.meta.url);
const expectedMaculaPaths = [
  'data/biblical-languages/macula/SOURCE-CONTRACT.json',
  'docs/MACULA-SOURCE-CONTRACT.md',
  'scripts/macula-source-contract.ts',
  'test/unit/scripts/maculaSourceContract.test.ts',
].sort();

function contractFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL('data/biblical-languages/macula/SOURCE-CONTRACT.json', repo), 'utf8'));
}

describe('MACULA local-only source contract', () => {
  it('pins the approved untagged revisions, final audit identity, and audited current-main compatibility values', () => {
    const contract = readMaculaSourceContract(process.cwd());
    expect(contract.status).toBe('candidate_contract_only');
    expect(contract.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'macula-greek',
        revision: expect.objectContaining({
          commit: '8423afe47b9e8f24b7772e808af45c7159a6fe7e',
          tree: 'eea78df4b0f1efb857f1575243a1ec4548267a11',
        }),
      }),
      expect.objectContaining({
        id: 'macula-hebrew',
        revision: expect.objectContaining({
          commit: '47db250bd55d0d8577f2a94fba114ef16c35b23c',
          tree: '594f395cf473795d6984003800b4bf86ca691a26',
        }),
      }),
    ]));
    expect((contract.auditEvidence as { deterministicIdentity: string }).deterministicIdentity).toBe(MACULA_AUDIT_IDENTITY);
    expect(contract.currentMainAttestation).toMatchObject({
      commit: '2f12262c9a37d3588bee9b5071954823c15cbd12',
      tree: '9922aedb74c690e7a3fcb926b3d621f28fa44535',
      morphologyUsageIdentity: 'c3600bb55da75aa600f8c97885efa7d58a3e8c29c3fcc6445a553091011beabd',
      d1CorpusIdentity: '29a4a7faec2a960f06bfc026a319df8c08b495bb7ad82831fb62d3a3586643a4',
    });
    expect(() => verifyCurrentMainAttestation(process.cwd())).not.toThrow();
  });

  it('allows only the reviewed structural attributes and fails closed for excluded or unknown fields', () => {
    expect(() => assertMaculaSourceAttribute('word', 'xml:id')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('group', 'Rule')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('participant', 'participantref')).not.toThrow();
    expect(() => assertMaculaSourceAttribute('word', 'lemma')).toThrow('explicitly excluded');
    expect(() => assertMaculaSourceAttribute('group', 'unreviewed-field')).toThrow('unknown schema drift');
    expect(() => assertMaculaSourceAttribute('participant', 'unreviewed-field')).toThrow('unknown schema drift');
  });

  it('rejects unknown contract fields and changes to the dangling relationship exclusion ledger', () => {
    const unknown = contractFixture();
    unknown.unreviewed = true;
    expect(() => parseMaculaSourceContract(unknown)).toThrow('unknown or missing fields');

    const changedLedger = contractFixture();
    const ledger = changedLedger.danglingParticipantExclusionLedger as { total: number };
    ledger.total = 8;
    expect(() => parseMaculaSourceContract(changedLedger)).toThrow('dangling participant exclusion ledger drifted');
  });

  it('keeps the packet content-free and completely outside runtime, migration, manifest, and public-surface wiring', () => {
    const maculaPaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: new URL('.', repo),
      encoding: 'utf8',
    }).split('\n').filter(path => /macula/i.test(path)).sort();
    expect(maculaPaths).toEqual(expectedMaculaPaths);

    const contract = readFileSync(new URL('data/biblical-languages/macula/SOURCE-CONTRACT.json', repo), 'utf8');
    expect(contract).not.toMatch(/<\/?(?:w|wg)\b|o\d{11,}|[\u0590-\u05ff\u0370-\u03ff]/);
    expect(contract).not.toMatch(/(?:\.xml|\.sqlite|\.sql)"\s*$/m);

    for (const path of [
      'src/index.ts', 'src/worker.ts', 'src/server.ts', 'src/worker-server.ts', 'src/mcp/tools.ts',
      'src/tools/v2/index.ts', 'src/tools/worker/index.ts', 'data/data-manifest.json', 'wrangler.toml',
    ]) {
      expect(readFileSync(new URL(path, repo), 'utf8'), path).not.toMatch(/macula/i);
    }
    const packageJson = JSON.parse(readFileSync(new URL('package.json', repo), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['data:verify-macula-source-contract'])
      .toBe('tsx scripts/macula-source-contract.ts');
    expect(Object.values(packageJson.scripts).filter(command => /macula/i.test(command)))
      .toEqual(['tsx scripts/macula-source-contract.ts']);
  });
});
