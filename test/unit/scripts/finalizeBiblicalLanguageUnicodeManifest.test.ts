import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BiblicalLanguageUnicodeCorrectionLedger } from '../../../scripts/biblical-language-unicode-correction.js';
import type { DataManifest } from '../../../scripts/d1-corpus-identity.js';
import {
  buildFinalizedBiblicalLanguageUnicodeManifest,
  finalizeBiblicalLanguageUnicodeManifest,
} from '../../../scripts/finalize-biblical-language-unicode-manifest.js';

const TRANSFORM_9_IDENTITY = 'a28a216dfa49283e463edd6057e70b91309fc74fe989647a4c9b277c65dd63f2';
const CATALOG_INPUTS = [
  'data/historical-document-catalog-provenance.json',
  'data/historical-document-catalog.json',
];

function currentInputs(): { manifest: DataManifest; ledger: BiblicalLanguageUnicodeCorrectionLedger } {
  return {
    manifest: JSON.parse(readFileSync('data/data-manifest.json', 'utf8')) as DataManifest,
    ledger: JSON.parse(readFileSync(
      'data/biblical-languages/UNICODE-CORRECTION.json',
      'utf8',
    )) as BiblicalLanguageUnicodeCorrectionLedger,
  };
}

describe('biblical-language Unicode manifest finalizer', () => {
  it('is read-only-idempotent for the checked-in transform-9 historical manifest', () => {
    const before = readFileSync('data/data-manifest.json', 'utf8');
    const result = finalizeBiblicalLanguageUnicodeManifest(process.cwd(), false);

    expect(result).toMatchObject({
      identity: TRANSFORM_9_IDENTITY,
      transformVersion: 9,
      changedPaths: [],
    });
    expect(`${JSON.stringify(result.manifest, null, 2)}\n`).toBe(before);
    expect(readFileSync('data/data-manifest.json', 'utf8')).toBe(before);
  });

  it('does not downgrade the approved transform-9 materialization', () => {
    const { manifest, ledger } = currentInputs();
    const result = buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger);
    expect(result).toMatchObject({
      identity: TRANSFORM_9_IDENTITY,
      transformVersion: 9,
      changedPaths: [],
    });
  });

  it.each(CATALOG_INPUTS)('rejects transform 9 without required catalog input %s', path => {
    const { manifest, ledger } = currentInputs();
    manifest.materializations.d1.inputs = manifest.materializations.d1.inputs
      .filter(input => input !== path);

    expect(() => buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger))
      .toThrow(`Transform 6 must retain historical catalog D1 input: ${path}`);
  });

  it('rejects an unreviewed downstream transform rather than downgrading it', () => {
    const { manifest, ledger } = currentInputs();
    manifest.materializations.d1.transformVersion = 10;

    expect(() => buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger))
      .toThrow('Unexpected pre-correction D1 transform version');
    expect(manifest.materializations.d1.transformVersion).toBe(10);
  });
});
