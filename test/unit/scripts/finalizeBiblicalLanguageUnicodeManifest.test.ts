import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BiblicalLanguageUnicodeCorrectionLedger } from '../../../scripts/biblical-language-unicode-correction.js';
import type { DataManifest } from '../../../scripts/d1-corpus-identity.js';
import {
  buildFinalizedBiblicalLanguageUnicodeManifest,
  finalizeBiblicalLanguageUnicodeManifest,
} from '../../../scripts/finalize-biblical-language-unicode-manifest.js';

const TRANSFORM_5_IDENTITY = '93ae4ca3c09493cf02a6b48154c991c133fd6ce235119fc4b8cba0256a36f881';
const TRANSFORM_6_IDENTITY = 'c334b4b91c3a7c334a9425937c7f99473f27014ddae6cea377ee38bd578a6707';
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
  it('is read-only-idempotent for the checked-in transform-6 catalog manifest', () => {
    const before = readFileSync('data/data-manifest.json', 'utf8');
    const result = finalizeBiblicalLanguageUnicodeManifest(process.cwd(), false);

    expect(result).toMatchObject({
      identity: TRANSFORM_6_IDENTITY,
      transformVersion: 6,
      changedPaths: [],
    });
    expect(`${JSON.stringify(result.manifest, null, 2)}\n`).toBe(before);
    expect(readFileSync('data/data-manifest.json', 'utf8')).toBe(before);
  });

  it('continues to validate the transform-5 usage foundation', () => {
    const { manifest, ledger } = currentInputs();
    manifest.materializations.d1.transformVersion = 5;
    manifest.materializations.d1.inputs = manifest.materializations.d1.inputs
      .filter(path => !CATALOG_INPUTS.includes(path));

    const result = buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger);
    expect(result).toMatchObject({
      identity: TRANSFORM_5_IDENTITY,
      transformVersion: 5,
      changedPaths: [],
    });
  });

  it.each(CATALOG_INPUTS)('rejects transform 6 without required catalog input %s', path => {
    const { manifest, ledger } = currentInputs();
    manifest.materializations.d1.inputs = manifest.materializations.d1.inputs
      .filter(input => input !== path);

    expect(() => buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger))
      .toThrow(`Transform 6 must retain historical catalog D1 input: ${path}`);
  });

  it('rejects unreviewed downstream transform versions rather than downgrading them', () => {
    const { manifest, ledger } = currentInputs();
    manifest.materializations.d1.transformVersion = 7;

    expect(() => buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger))
      .toThrow('Unexpected pre-correction D1 transform version');
    expect(manifest.materializations.d1.transformVersion).toBe(7);
  });
});
