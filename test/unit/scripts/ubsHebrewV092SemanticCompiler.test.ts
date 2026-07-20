import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  parseUbsTahotNativeToNormalizedBridge,
  resolveUbsTahotNormalizedCoordinates,
} from '../../../scripts/ubs-semantics/coordinateVerifier.js';
import {
  canonicalJson,
  canonicalJsonDigest,
} from '../../../scripts/ubs-semantics/pinnedCompiler.js';
import {
  verifyUbsHebrewV092SemanticCompilation,
} from '../../../scripts/verify-ubs-hebrew-v092-semantic-compilation.js';

const bridgePath = 'data/biblical-languages/ubs-open-license/v0.9.2/NATIVE-TO-NORMALIZED-BRIDGE.json';

// test/setup.ts sets the suite default to 30s. This one intentionally compiles
// the full untracked corpus twice to prove reproducibility and has its own cap.
vi.setConfig({ testTimeout: 240_000 });

describe('U3-T7 pinned UBS Hebrew semantic compiler', () => {
  it('streams the exact canonical bytes used by the complete-artifact hash', () => {
    const value = {
      z: ['אֵב', { b: true, a: '\u0000' }],
      a: { y: null, x: 1 },
    };
    const canonical = canonicalJson(value);
    expect(canonicalJsonDigest(value)).toEqual({
      sha256: createHash('sha256').update(canonical).digest('hex'),
      byteLength: Buffer.byteLength(canonical, 'utf8'),
    });
  });

  it('fails during streaming when the canonical artifact byte ceiling is exceeded', () => {
    expect(() => canonicalJsonDigest({ value: 'abcdef' }, { maxBytes: 8 }))
      .toThrow('Canonical artifact byte ceiling exceeded while streaming canonical JSON');
  });

  it('keeps the native-to-normalized bridge canonical and preserves ambiguity', () => {
    const bridge = parseUbsTahotNativeToNormalizedBridge(readFileSync(bridgePath));
    expect(bridge).toMatchObject({
      schemaVersion: 'theologai-ubs-tahot-native-to-normalized-bridge.v1',
      nativeCoordinateKeys: expect.any(Array),
      bridgeIdentity: 'a7d103edbf0b29214634f25ce54feb72979e8a732c6c5caf62c3ecc23a12a790',
    });
    expect(bridge.nativeCoordinateKeys).toHaveLength(23_213);
    expect(bridge.overrides).toHaveLength(2_094);
    const ambiguous = bridge.overrides.find(row => row.normalizedCoordinates.length > 1)!;
    expect(ambiguous).toBeTruthy();
    expect(resolveUbsTahotNormalizedCoordinates(bridge, ambiguous.nativeCoordinate))
      .toEqual(ambiguous.normalizedCoordinates);
  });

  it('reproduces the content-free semantic audit from exact pins without tracking the corpus', () => {
    const audit = verifyUbsHebrewV092SemanticCompilation(process.cwd());
    expect(audit).toMatchObject({
      compilerVersion: 1,
      transformVersion: 7,
      projection: {
        entries: 8_285,
        senses: 15_123,
        referenceEvidence: 249_901,
        domains: 411,
        uniqueHIdentities: 7_641,
        uniqueAIdentities: 632,
        entriesWithMultiplePartOfSpeechValues: 12,
        ambiguousNativeCoordinateCount: 59,
        sourceEvidenceWithAmbiguousNormalizedCoordinates: 492,
      },
    });
    expect(audit.artifact).toMatchObject({
      semanticPayloadSha256: 'bd19fb99f7bbfd13ad68f2184aaded4a6e5587196ad76b68b0c22bf971fc90f6',
      canonicalArtifactSha256: 'de61ea1ee1e09aa164df33a80328b0b54e888f312ff2a11c878293a992b850d9',
      canonicalByteLength: 108_462_321,
      maximumCanonicalByteLength: 128 * 1024 * 1024,
    });
  }, 240_000);
});
