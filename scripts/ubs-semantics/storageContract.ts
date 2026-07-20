/** Exact, source-independent values persisted for the pinned semantic layer. */

import {
  createPinnedUbsSemanticStorageContract,
  UBS_PINNED_SEMANTIC_COMPILER_SCHEMA,
  UBS_PINNED_SEMANTIC_COMPILER_VERSION,
  UBS_PINNED_SEMANTIC_TRANSFORM_VERSION,
} from './pinnedCompiler.js';

export interface UbsSemanticStorageAudit {
  readonly artifact: { readonly semanticPayloadSha256: string };
  readonly inputs: {
    readonly coordinateBridgeIdentity: string;
    readonly coordinateBridgeSha256: string;
    readonly coordinateAuditSha256: string;
    readonly tahotPins: readonly { readonly id: string; readonly sha256: string; readonly gitBlobSha1: string }[];
    readonly usfmtc: {
      readonly commit: string;
      readonly referenceBlob: string;
      readonly referenceSha256: string;
      readonly licenseBlob: string;
      readonly licenseSha256: string;
    };
  };
}

export function createUbsSemanticStorageContract(audit: UbsSemanticStorageAudit) {
  const pinned = createPinnedUbsSemanticStorageContract({
    artifactIdentity: audit.artifact.semanticPayloadSha256,
    coordinateBridgeIdentity: audit.inputs.coordinateBridgeIdentity,
    coordinateBridgeSha256: audit.inputs.coordinateBridgeSha256,
    coordinateAuditSha256: audit.inputs.coordinateAuditSha256,
    tahotPins: audit.inputs.tahotPins,
    usfmtc: audit.inputs.usfmtc,
  });
  return Object.freeze({
    artifact: Object.freeze({
      artifactIdentity: pinned.artifactIdentity,
      schemaVersion: UBS_PINNED_SEMANTIC_COMPILER_SCHEMA,
      compilerVersion: UBS_PINNED_SEMANTIC_COMPILER_VERSION,
      transformVersion: UBS_PINNED_SEMANTIC_TRANSFORM_VERSION,
      rightsNoticeJson: JSON.stringify(pinned.rightsNotice),
      provenanceNoticeJson: JSON.stringify(pinned.provenanceNotice),
      transformationWitnessJson: JSON.stringify(pinned.transformationWitness),
    }),
    sources: Object.freeze(pinned.sources.map(source => Object.freeze({
      ...source,
      schemaVersion: 'ubs-semantics.v1' as const,
      transformVersion: UBS_PINNED_SEMANTIC_TRANSFORM_VERSION,
      title: source.sourceRole === 'dictionary' ? 'UBS Hebrew Dictionary' : 'UBS Hebrew Dictionary Lexical Domains',
    }))),
  });
}
