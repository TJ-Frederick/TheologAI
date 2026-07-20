#!/usr/bin/env tsx

/**
 * Reproduce the compact, override-only native→normalized coordinate bridge.
 *
 * This is an offline data-preparation step only. It never writes a database,
 * manifest, runtime artifact, or full UBS semantic corpus. Reproduction reads
 * the four pinned TAHOT files through the project's hash-first downloader;
 * ordinary semantic compilation subsequently reads only this small bridge.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { downloadPinnedSource } from './download-pinned-source.js';
import {
  PINNED_TAHOT_FILES,
  USFMTC_REFERENCE_ARTIFACTS,
  createUbsTahotCoordinateIndex,
  createUbsTahotNativeToNormalizedBridge,
  serializeUbsTahotNativeToNormalizedBridge,
  type UbsTahotNativeToNormalizedBridge,
} from './ubs-semantics/coordinateVerifier.js';

export const UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_PATH =
  'data/biblical-languages/ubs-open-license/v0.9.2/NATIVE-TO-NORMALIZED-BRIDGE.json';

export async function reproduceUbsHebrewV092CoordinateBridge(root: string): Promise<{
  bridge: UbsTahotNativeToNormalizedBridge;
  bytes: string;
}> {
  const inputs = await Promise.all(PINNED_TAHOT_FILES.map(async pin => ({
    pin,
    bytes: await downloadPinnedSource(pin),
  })));
  const index = createUbsTahotCoordinateIndex(
    inputs,
    readFileSync(join(root, USFMTC_REFERENCE_ARTIFACTS[0].trackedPath)),
    readFileSync(join(root, USFMTC_REFERENCE_ARTIFACTS[1].trackedPath)),
  );
  const bridge = createUbsTahotNativeToNormalizedBridge(index);
  return { bridge, bytes: serializeUbsTahotNativeToNormalizedBridge(bridge) };
}

export async function verifyUbsHebrewV092CoordinateBridge(root: string): Promise<UbsTahotNativeToNormalizedBridge> {
  const actual = await reproduceUbsHebrewV092CoordinateBridge(root);
  const tracked = readFileSync(join(root, UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_PATH), 'utf8');
  if (tracked !== actual.bytes) {
    throw new Error('Tracked native-to-normalized bridge differs from exact pinned-corpus reproduction');
  }
  return actual.bridge;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.slice(2).join(' ') === '--write') {
    const result = await reproduceUbsHebrewV092CoordinateBridge(ROOT);
    writeFileSync(join(ROOT, UBS_TAHOT_NATIVE_TO_NORMALIZED_BRIDGE_PATH), result.bytes, 'utf8');
    console.error(`[build-ubs-hebrew-v092-coordinate-bridge] Wrote ${result.bridge.overrides.length} canonical override rows.`);
  } else {
    const bridge = await verifyUbsHebrewV092CoordinateBridge(ROOT);
    console.error(`[build-ubs-hebrew-v092-coordinate-bridge] Verified ${bridge.overrides.length} canonical override rows.`);
  }
}
