import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BiblicalLanguageUnicodeCorrectionLedger } from '../../../scripts/biblical-language-unicode-correction.js';
import type { DataManifest } from '../../../scripts/d1-corpus-identity.js';
import {
  buildFinalizedBiblicalLanguageUnicodeManifest,
  finalizeBiblicalLanguageUnicodeManifest,
} from '../../../scripts/finalize-biblical-language-unicode-manifest.js';

const TRANSFORM_7_IDENTITY = '3708bf7e3ab903c409453fdf4fdac1b68848547f91f0b516855dd21765de4796';
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
  it('is read-only-idempotent for the checked-in transform-7 local semantic manifest', () => {
    const before = readFileSync('data/data-manifest.json', 'utf8');
    const result = finalizeBiblicalLanguageUnicodeManifest(process.cwd(), false);

    expect(result).toMatchObject({
      identity: TRANSFORM_7_IDENTITY,
      transformVersion: 7,
      changedPaths: [],
    });
    expect(`${JSON.stringify(result.manifest, null, 2)}\n`).toBe(before);
    expect(readFileSync('data/data-manifest.json', 'utf8')).toBe(before);
  });

  it('does not downgrade the approved transform-7 materialization', () => {
    const { manifest, ledger } = currentInputs();
    const result = buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger);
    expect(result).toMatchObject({
      identity: TRANSFORM_7_IDENTITY,
      transformVersion: 7,
      changedPaths: [],
    });
  });

  it.each(CATALOG_INPUTS)('rejects transform 7 without required catalog input %s', path => {
    const { manifest, ledger } = currentInputs();
    manifest.materializations.d1.inputs = manifest.materializations.d1.inputs
      .filter(input => input !== path);

    expect(() => buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger))
      .toThrow(`Transform 6 must retain historical catalog D1 input: ${path}`);
  });

  it('rejects an unreviewed downstream transform rather than downgrading it', () => {
    const { manifest, ledger } = currentInputs();
    manifest.materializations.d1.transformVersion = 8;

    expect(() => buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger))
      .toThrow('Unexpected pre-correction D1 transform version');
    expect(manifest.materializations.d1.transformVersion).toBe(8);
  });
});
