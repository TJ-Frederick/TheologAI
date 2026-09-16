import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BiblicalLanguageUnicodeCorrectionLedger } from '../../../scripts/biblical-language-unicode-correction.js';
import type { DataManifest } from '../../../scripts/d1-corpus-identity.js';
import {
  buildFinalizedBiblicalLanguageUnicodeManifest,
  finalizeBiblicalLanguageUnicodeManifest,
} from '../../../scripts/finalize-biblical-language-unicode-manifest.js';

const TRANSFORM_13_IDENTITY = 'ef42dfff4fda29d708f2bd340bbd4463ab4a128408651cea887a97bc28199bb1';
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
  it('is read-only-idempotent for the checked-in transform-13 active manifest', () => {
    const before = readFileSync('data/data-manifest.json', 'utf8');
    const result = finalizeBiblicalLanguageUnicodeManifest(process.cwd(), false);

    expect(result).toMatchObject({
      identity: TRANSFORM_13_IDENTITY,
      transformVersion: 13,
      changedPaths: [],
    });
    expect(`${JSON.stringify(result.manifest, null, 2)}\n`).toBe(before);
    expect(readFileSync('data/data-manifest.json', 'utf8')).toBe(before);
  });

  it('does not downgrade the approved transform-13 materialization', () => {
    const { manifest, ledger } = currentInputs();
    const result = buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger);
    expect(result).toMatchObject({
      identity: TRANSFORM_13_IDENTITY,
      transformVersion: 13,
      changedPaths: [],
    });
  });

  it.each(CATALOG_INPUTS)('rejects transform 13 without required catalog input %s', path => {
    const { manifest, ledger } = currentInputs();
    manifest.materializations.d1.inputs = manifest.materializations.d1.inputs
      .filter(input => input !== path);

    expect(() => buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger))
      .toThrow(`Transform 6 must retain historical catalog D1 input: ${path}`);
  });

  it('rejects an unreviewed downstream transform rather than downgrading it', () => {
    const { manifest, ledger } = currentInputs();
    manifest.materializations.d1.transformVersion = 11;

    expect(() => buildFinalizedBiblicalLanguageUnicodeManifest(process.cwd(), manifest, ledger))
      .toThrow('Unexpected pre-correction D1 transform version');
    expect(manifest.materializations.d1.transformVersion).toBe(11);
  });
});
