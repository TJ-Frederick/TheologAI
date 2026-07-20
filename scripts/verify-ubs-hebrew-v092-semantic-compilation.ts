#!/usr/bin/env tsx

/**
 * Verify the U3-T7 compiler without materializing its semantic corpus. The
 * tracked result is only a content-free count/provenance audit; canonical
 * corpus bytes are generated twice in memory and then discarded.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  UBS_PINNED_SEMANTIC_BRIDGE_PATH,
  assertPinnedUbsSemanticArtifactIntegrity,
  canonicalJson,
  compilePinnedUbsHebrewV092,
  compileProjection,
  type PinnedUbsSemanticCompilationAudit,
} from './ubs-semantics/pinnedCompiler.js';
import {
  createUbsTahotNormalizedCoordinateResolver,
  parseUbsTahotNativeToNormalizedBridge,
} from './ubs-semantics/coordinateVerifier.js';

export const UBS_PINNED_SEMANTIC_COMPILATION_AUDIT_PATH =
  'data/biblical-languages/ubs-open-license/v0.9.2/SEMANTIC-COMPILATION-AUDIT.json';

export function verifyUbsHebrewV092SemanticCompilation(root: string, writeAudit = false): PinnedUbsSemanticCompilationAudit {
  // Each closure lets its large compiled object graph become unreachable before
  // the next reproduction begins. Keeping only digest/length/audit data avoids
  // retaining both complete graphs during CI verification.
  const first = compileVerificationSnapshot(root);
  const second = compileVerificationSnapshot(root);
  if (first.canonicalArtifactSha256 !== second.canonicalArtifactSha256
    || first.canonicalByteLength !== second.canonicalByteLength
    || first.semanticPayloadSha256 !== second.semanticPayloadSha256
    || first.canonicalAudit !== second.canonicalAudit) {
    throw new Error('Pinned UBS semantic compiler is not byte-reproducible across two fresh in-memory runs');
  }
  assertSetLikeReordering(root);
  if (writeAudit) {
    writeFileSync(join(root, UBS_PINNED_SEMANTIC_COMPILATION_AUDIT_PATH), first.canonicalAudit, 'utf8');
  } else {
    const tracked = readFileSync(join(root, UBS_PINNED_SEMANTIC_COMPILATION_AUDIT_PATH), 'utf8');
    if (tracked !== first.canonicalAudit) {
      throw new Error('Tracked semantic-compilation audit differs from fresh exact pinned-source reproduction');
    }
  }
  return first.audit;
}

interface SemanticCompilationVerificationSnapshot {
  readonly audit: PinnedUbsSemanticCompilationAudit;
  readonly canonicalAudit: string;
  readonly semanticPayloadSha256: string;
  readonly canonicalArtifactSha256: string;
  readonly canonicalByteLength: number;
}

function compileVerificationSnapshot(root: string): SemanticCompilationVerificationSnapshot {
  const compiled = compilePinnedUbsHebrewV092(root);
  assertAuditFacts(compiled.audit);
  assertCanonicalIdentity(
    compiled.artifact,
    compiled.audit,
    compiled.canonicalArtifactSha256,
    compiled.canonicalArtifactByteLength,
  );
  assertPinnedUbsSemanticArtifactIntegrity(compiled.artifact);
  return {
    audit: compiled.audit,
    canonicalAudit: compiled.canonicalAudit,
    semanticPayloadSha256: compiled.artifact.artifactIdentity,
    canonicalArtifactSha256: compiled.canonicalArtifactSha256,
    canonicalByteLength: compiled.canonicalArtifactByteLength,
  };
}

function assertAuditFacts(audit: PinnedUbsSemanticCompilationAudit): void {
  const projection = audit.projection;
  if (projection.entries !== 8_285 || projection.senses !== 15_123
    || projection.referenceEvidence !== 249_901 || projection.domains !== 411
    || projection.uniqueHIdentities !== 7_641 || projection.uniqueAIdentities !== 632
    || projection.nativeCoordinateMembershipCount !== 23_213
    || projection.normalizationOverrideCount !== 2_094
    || projection.ambiguousNativeCoordinateCount !== 59) {
    throw new Error('Pinned UBS semantic compiler projection facts differ from the approved source inspection');
  }
  if (audit.artifact.canonicalByteLength > audit.artifact.maximumCanonicalByteLength
    || audit.artifact.maximumCanonicalByteLength !== 128 * 1024 * 1024
    || !/^[0-9a-f]{64}$/.test(audit.artifact.semanticPayloadSha256)
    || !/^[0-9a-f]{64}$/.test(audit.artifact.canonicalArtifactSha256)) {
    throw new Error('Pinned UBS semantic compiler artifact identity or canonical artifact byte ceiling is invalid');
  }
}

function assertCanonicalIdentity(
  artifact: { readonly artifactIdentity: string },
  audit: PinnedUbsSemanticCompilationAudit,
  canonicalArtifactSha256: string,
  canonicalByteLength: number,
): void {
  if (artifact.artifactIdentity !== audit.artifact.semanticPayloadSha256
    || canonicalArtifactSha256 !== audit.artifact.canonicalArtifactSha256
    || canonicalByteLength !== audit.artifact.canonicalByteLength) {
    throw new Error('Pinned UBS semantic artifact hashes or byte length are detached from its audit');
  }
}

/** Set-like identities, POS values, glosses, reasons, and domain refs are canonicalized. */
function assertSetLikeReordering(root: string): void {
  const bridge = parseUbsTahotNativeToNormalizedBridge(readFileSync(join(root, UBS_PINNED_SEMANTIC_BRIDGE_PATH)));
  // This compact fixture proves compiler sorting independently of source order
  // without compiling a third copy of the UBS corpus in memory or on disk.
  const synthetic = {
    schemaVersion: 'theologai-ubs-hebrew-raw-decoder.v1',
    entries: [{
      entryId: '111111111111111', sourceEntryId: '111111111111111', sourceOrdinal: 1,
      lemma: 'synthetic', partOfSpeech: ['Z', 'A'], lexicalIdentities: ['H0002', 'H0001'],
      senses: [{
        senseId: '222222222222222', sourceOrdinal: 1, definitionStatus: 'absent_in_source' as const,
        definitionExclusionReasons: [], glosses: ['z', 'a'], domainIds: ['002', '001'], sourceReferences: [],
      }],
    }],
    domains: [
      { domainId: '001', sourceOrdinal: 1, level: 1, label: 'one' },
      { domainId: '002', sourceOrdinal: 2, level: 1, label: 'two' },
    ],
    excludedBaseForms: [], coordinateReferences: [], audit: {},
  } as any;
  const reversed = structuredClone(synthetic);
  reversed.entries[0].partOfSpeech.reverse();
  reversed.entries[0].lexicalIdentities.reverse();
  reversed.entries[0].senses[0].glosses.reverse();
  reversed.entries[0].senses[0].domainIds.reverse();
  const resolve = createUbsTahotNormalizedCoordinateResolver(bridge);
  const first = canonicalJson(compileProjection(synthetic, bridge, 'a'.repeat(64), resolve));
  const second = canonicalJson(compileProjection(reversed, bridge, 'a'.repeat(64), resolve));
  if (first !== second) throw new Error('Pinned UBS semantic compiler set-like arrays are not canonicalized');
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const audit = verifyUbsHebrewV092SemanticCompilation(ROOT, process.argv.slice(2).join(' ') === '--write-audit');
  console.error(`[verify-ubs-hebrew-v092-semantic-compilation] Verified ${audit.projection.referenceEvidence} evidence rows and ${audit.projection.ambiguousNativeCoordinateCount} one-to-many native coordinates.`);
}
