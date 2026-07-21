/**
 * Declares which materialized biblical-language artifacts each deterministic
 * verifier owns. A new D1 input must be assigned to an owner deliberately;
 * the legacy OpenScriptures/STEPBible reproducer must never quietly stop
 * checking an artifact just because another corpus was added to the manifest.
 */

import type { DataManifest } from './d1-corpus-identity.js';

export const UBS_HEBREW_V092_SEMANTIC_MATERIALIZATION_INPUTS = Object.freeze([
  'data/biblical-languages/ubs-open-license/v0.9.2/NATIVE-TO-NORMALIZED-BRIDGE.json',
  'data/biblical-languages/ubs-open-license/v0.9.2/SEMANTIC-COMPILATION-AUDIT.json',
  'data/biblical-languages/ubs-open-license/v0.9.2/SOURCE.json',
  'data/biblical-languages/ubs-open-license/v0.9.2/en/UBSHebrewDic-v0.9.2-en.JSON',
  'data/biblical-languages/ubs-open-license/v0.9.2/en/UBSHebrewDicLexicalDomains-v0.9.2-en.JSON',
] as const);

const LEGACY_REPRODUCTION_INDEX = 'data/biblical-languages/stepbible/index.json';
const LEGACY_REPRODUCTION_INPUT = /^(?:data\/biblical-languages\/strongs-(?:greek|hebrew)\.json|data\/biblical-languages\/stepbible\/morph-codes\.json|data\/biblical-languages\/stepbible-lexicons\/(?:tbesg-greek|tbesh-hebrew)\.json|data\/biblical-languages\/stepbible\/(?:greek|hebrew)\/[0-9]{2}-[A-Za-z0-9]+\.json\.gz)$/;

export interface BiblicalLanguageReproductionOwnership {
  /** Artifacts emitted by the three legacy OpenScriptures/STEPBible builders. */
  readonly legacyReproducerArtifacts: readonly string[];
  /** Inputs held by the separate exact UBS acquisition + semantic verifiers. */
  readonly separatelyVerifiedUbsInputs: readonly string[];
}

/**
 * Assign every D1 materialized biblical-language input to exactly one
 * verifier. This is intentionally a closed registry rather than a prefix
 * exclusion: a future corpus must add its own verification owner first.
 */
export function resolveBiblicalLanguageReproductionOwnership(
  manifest: DataManifest,
): BiblicalLanguageReproductionOwnership {
  const materializedLanguageInputs = manifest.materializations.d1.inputs
    .filter(path => path.startsWith('data/biblical-languages/'))
    .sort();
  const ubsInputs = new Set(UBS_HEBREW_V092_SEMANTIC_MATERIALIZATION_INPUTS);
  const actualUbsInputs = materializedLanguageInputs.filter(path => ubsInputs.has(path));
  const missingUbsInputs = UBS_HEBREW_V092_SEMANTIC_MATERIALIZATION_INPUTS
    .filter(path => !actualUbsInputs.includes(path));
  if (missingUbsInputs.length > 0) {
    throw new Error(
      'UBS Hebrew v0.9.2 semantic materialization ownership mismatch; '
      + `missing: ${missingUbsInputs.join(', ')}.`,
    );
  }

  const legacyInputs = materializedLanguageInputs.filter(path => LEGACY_REPRODUCTION_INPUT.test(path));
  const assigned = new Set([...legacyInputs, ...actualUbsInputs]);
  const unowned = materializedLanguageInputs.filter(path => !assigned.has(path));
  if (unowned.length > 0) {
    throw new Error(
      'Every materialized biblical-language input must have an explicit deterministic verifier owner; '
      + `unowned: ${unowned.join(', ')}.`,
    );
  }

  return {
    legacyReproducerArtifacts: [...legacyInputs, LEGACY_REPRODUCTION_INDEX].sort(),
    separatelyVerifiedUbsInputs: [...actualUbsInputs],
  };
}
