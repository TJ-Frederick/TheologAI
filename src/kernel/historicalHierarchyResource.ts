/** Canonical dormant resource identities for hierarchy-node delivery. */

export interface HistoricalHierarchyResource {
  publicSlug: string;
  nodeKey?: string;
}

export const HISTORICAL_HIERARCHY_RESOURCE_URI_MAX_LENGTH = 384;

const PUBLIC_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const NODE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export function buildHistoricalHierarchyResourceUri(publicSlug: string, nodeKey?: string): string | undefined {
  if (!isPublicSlug(publicSlug) || (nodeKey !== undefined && !isNodeKey(nodeKey))) return undefined;
  const uri = nodeKey === undefined
    ? `theologai://documents/${publicSlug}`
    : `theologai://documents/${publicSlug}#node-${nodeKey}`;
  return uri.length <= HISTORICAL_HIERARCHY_RESOURCE_URI_MAX_LENGTH ? uri : undefined;
}

/** Parse only canonical hierarchy landing and direct-node resource identities. */
export function parseHistoricalHierarchyResourceUri(uri: string): HistoricalHierarchyResource | undefined {
  if (typeof uri !== 'string' || uri.length > HISTORICAL_HIERARCHY_RESOURCE_URI_MAX_LENGTH) return undefined;
  const match = /^theologai:\/\/documents\/([^/#?]+)(?:#node-([^#?]+))?$/.exec(uri);
  if (!match) return undefined;
  const publicSlug = match[1]!;
  const nodeKey = match[2];
  const canonical = buildHistoricalHierarchyResourceUri(publicSlug, nodeKey);
  if (canonical !== uri) return undefined;
  return { publicSlug, ...(nodeKey === undefined ? {} : { nodeKey }) };
}

export function isHistoricalHierarchyPublicSlug(value: string): boolean {
  return isPublicSlug(value);
}

export function isHistoricalHierarchyNodeKey(value: string): boolean {
  return isNodeKey(value);
}

function isPublicSlug(value: string): boolean {
  return typeof value === 'string' && PUBLIC_SLUG.test(value) && value !== '.' && value !== '..';
}

function isNodeKey(value: string): boolean {
  return typeof value === 'string' && NODE_KEY.test(value) && value !== '.' && value !== '..';
}
