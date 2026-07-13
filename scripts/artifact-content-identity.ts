import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export type ArtifactIdentityKind = 'raw_sha256' | 'canonical_json_payload_sha256_v1';

export interface ArtifactContentIdentity {
  kind: ArtifactIdentityKind;
  sha256: string;
  rawSha256: string;
}
function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON does not permit non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  throw new Error(`Canonical JSON does not permit ${typeof value}`);
}

/**
 * Gzip headers and DEFLATE streams vary across platforms and zlib versions.
 * Gzip-packaged JSON therefore uses its canonical decompressed payload as the
 * portable identity while retaining raw hashes only as diagnostic evidence.
 */
export function artifactContentIdentity(path: string, bytes: Buffer): ArtifactContentIdentity {
  const rawSha256 = sha256(bytes);
  if (!path.endsWith('.json.gz')) return { kind: 'raw_sha256', sha256: rawSha256, rawSha256 };
  const text = new TextDecoder('utf-8', { fatal: true }).decode(gunzipSync(bytes));
  return {
    kind: 'canonical_json_payload_sha256_v1',
    sha256: sha256(canonicalJson(JSON.parse(text))),
    rawSha256,
  };
}
