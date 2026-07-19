#!/usr/bin/env tsx

/**
 * Reproduce the inactive UBS v0.9.2 coordinate audit from the exact vendored
 * inputs. This is a verification guard only: it does not emit a transform,
 * migration, database row, runtime dependency, or public result.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { downloadPinnedSource } from './download-pinned-source.js';
import {
  UBS_HEBREW_V092_ARTIFACTS,
  UBS_HEBREW_V092_COORDINATE_AUDIT,
  assertPinnedUbsHebrewV092Bytes,
} from './verify-ubs-hebrew-v092-acquisition.js';
import {
  PINNED_TAHOT_FILES,
  USFMTC_REFERENCE_ARTIFACTS,
  auditUbsTahotCoordinateCoverage,
  createDefinitionReferenceValidator,
  createUbsTahotCoordinateIndex,
  type UbsTahotCoordinateAudit,
} from './ubs-semantics/coordinateVerifier.js';
import { decodePinnedUbsHebrewV092 } from './ubs-semantics/rawDecoder.js';

export const UBS_TAHOT_COORDINATE_AUDIT_PATH =
  UBS_HEBREW_V092_COORDINATE_AUDIT.trackedPath;

/** Exact byte hash, independently bound in SOURCE.json and its verifier. */
export const UBS_TAHOT_COORDINATE_AUDIT_SHA256 =
  UBS_HEBREW_V092_COORDINATE_AUDIT.sha256;

export async function reproduceUbsHebrewV092CoordinateAudit(root: string): Promise<UbsTahotCoordinateAudit> {
  const dictionary = readFileSync(join(root, UBS_HEBREW_V092_ARTIFACTS[0].trackedPath));
  const domains = readFileSync(join(root, UBS_HEBREW_V092_ARTIFACTS[1].trackedPath));
  assertPinnedUbsHebrewV092Bytes(UBS_HEBREW_V092_ARTIFACTS[0], dictionary);
  assertPinnedUbsHebrewV092Bytes(UBS_HEBREW_V092_ARTIFACTS[1], domains);

  const inputs = await Promise.all(PINNED_TAHOT_FILES.map(async pin => ({
    pin,
    // The raw corpus is intentionally not re-vendored by this UBS-only gate.
    // Each exact immutable STEPBible input is fetched through the project's
    // hash-first downloader and rejected before parsing on any byte drift.
    bytes: await downloadPinnedSource(pin),
  })));
  const index = createUbsTahotCoordinateIndex(
    inputs,
    readFileSync(join(root, USFMTC_REFERENCE_ARTIFACTS[0].trackedPath)),
    readFileSync(join(root, USFMTC_REFERENCE_ARTIFACTS[1].trackedPath)),
  );
  const projection = decodePinnedUbsHebrewV092(
    dictionary,
    domains,
    createDefinitionReferenceValidator(index),
  );
  return auditUbsTahotCoordinateCoverage(projection.coordinateReferences, index);
}

/**
 * Prove both exact report bytes and independently reproduced semantic values.
 * Report reformatting is intentionally drift: SOURCE.json pins the reviewed
 * bytes, while the deep comparison pins the executable full-corpus result.
 */
export async function verifyUbsHebrewV092CoordinateAudit(root: string): Promise<UbsTahotCoordinateAudit> {
  const reportBytes = readFileSync(join(root, UBS_TAHOT_COORDINATE_AUDIT_PATH));
  if (sha256(reportBytes) !== UBS_TAHOT_COORDINATE_AUDIT_SHA256) {
    throw new Error('Tracked UBS/TAHOT coordinate audit byte hash drift');
  }
  const tracked = JSON.parse(decodeUtf8(reportBytes)) as UbsTahotCoordinateAudit;
  const actual = await reproduceUbsHebrewV092CoordinateAudit(root);
  if (JSON.stringify(tracked) !== JSON.stringify(actual)) {
    throw new Error('Tracked UBS/TAHOT coordinate audit differs from exact full-corpus reproduction');
  }
  return actual;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Tracked UBS/TAHOT coordinate audit is not valid UTF-8');
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const audit = await verifyUbsHebrewV092CoordinateAudit(ROOT);
  console.error(
    `[reproduce-ubs-hebrew-v092-coordinate-audit] Verified ${audit.ubsReferenceRecords} UBS references, `
    + `${audit.tahotRawTokens} exact TAHOT tokens, and ${audit.ubsUniqueNativeCoordinates} native coordinates.`,
  );
}
