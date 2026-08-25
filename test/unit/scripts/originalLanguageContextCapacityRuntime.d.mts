interface SyntheticReferenceModel {
  canonicalCandidates: string[];
  sourceReference: string | null;
  sourceLanguage: 'grc' | 'hbo' | 'arc';
  crosswalkKind: 'identity' | 'psalm_superscription' | 'psalm_verse_shift';
  bundle: { v: 1; g: number[][] } | { v: 1; s: number[][] };
}

interface SyntheticProfile {
  readonly aramaicReferences: number;
  readonly [key: string]: number;
}

export const SYNTHETIC_PROFILE: SyntheticProfile;
export const ORIGINAL_LANGUAGE_DETERMINISTIC_HASH_DOMAIN: string;
export const ORIGINAL_LANGUAGE_COMPLETE_HASH_DOMAIN: string;
export function assertOriginalLanguageCorpusCompatibility(
  expectedCorpusIdentity: string,
  actualCorpusIdentity: string,
  expectedSchemaVersion: string,
): void;
export function assertOriginalLanguageProjectionParity(
  generated: string,
  projections: readonly Array<{ label: string; sha256: string }>,
): void;
export function assessOriginalLanguageCapacity(fileBytes: number): Record<string, unknown>;
export function attachOriginalLanguageEvidenceHashes<T extends Record<string, unknown>>(
  payload: T,
): T & Record<string, unknown>;
export function canonicalOriginalLanguageEvidence(value: unknown): string;
export function originalLanguageSlotAccounting(environmentCount: number): {
  existingD1AdditionalSlots: number;
  separateD1AdditionalSlots: number;
  environments: number;
};
export function parseOriginalLanguageCapacityArguments(argv: readonly string[]): void;
export function resolveOriginalLanguageContextBinding(
  expectedCorpusIdentity: string,
  binding: { expectedBaseCorpusIdentity: string; schemaVersion: string } | undefined,
): Record<string, unknown>;
export function storedOriginalLanguageProjectionSha256(database: Database.Database): string;
export function stripOriginalLanguageVolatileMeasurements(value: unknown): unknown;
export function validateSyntheticReference(model: SyntheticReferenceModel): {
  canonicalReference: string;
  sourcePositions: number;
  contextUnits: number;
  manyToOneUnits: number;
  oneToManySourcePositions: number;
};
export function verifyOriginalLanguageCompleteHash(envelope: Record<string, unknown>): boolean;
export function withOriginalLanguageTemporaryDirectory<T>(
  action: (directory: string) => T,
  parent?: string,
): T;
import type Database from 'better-sqlite3';
