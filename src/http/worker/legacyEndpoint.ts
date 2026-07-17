import type { Env } from '../../worker-env.js';
import {
  getAllowedCorsOrigin,
  isAllowedMcpPath,
  responseWithCors,
  type GuardResponse,
} from './requestPolicy.js';

export const LEGACY_PRODUCTION_HOST = 'theologai.tjfrederick.workers.dev';
export const PRIMARY_PRODUCTION_HOST = 'mcp.theologai.xyz';

// Temporary migration guard for the confirmed AWS Frankfurt poller observed
// on 2026-07-17. Remove this rule only when the legacy workers.dev route is
// retired with separate owner approval.
const ABUSIVE_POLLER_IP = '18.192.206.183';
const ABUSIVE_POLLER_USER_AGENT = 'Go-http-client/2.0';

function isAbusivePoller(request: Request): boolean {
  return request.headers.get('CF-Connecting-IP') === ABUSIVE_POLLER_IP
    && request.headers.get('User-Agent') === ABUSIVE_POLLER_USER_AGENT;
}

/**
 * Short-circuit the confirmed abusive poller and migrate all other callers of
 * the production workers.dev alias to the canonical custom domain.
 */
export function getLegacyEndpointResponse(env: Env, request: Request): GuardResponse | null {
  const url = new URL(request.url);
  const isLegacyHost = url.hostname === LEGACY_PRODUCTION_HOST;
  const isPrimaryHost = url.hostname === PRIMARY_PRODUCTION_HOST;
  const allowedOrigin = getAllowedCorsOrigin(env, request.headers.get('Origin'));

  // This identity is intentionally scoped to the two production hosts. The
  // preview alias and arbitrary custom hosts must never inherit a production
  // traffic block merely because a caller can reproduce its headers.
  if ((isLegacyHost || isPrimaryHost) && isAbusivePoller(request)) {
    return {
      response: responseWithCors(allowedOrigin, isLegacyHost ? 'Gone' : 'Forbidden', {
        status: isLegacyHost ? 410 : 403,
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      }),
      reason: 'blocked_abusive_poller',
    };
  }

  if (!isLegacyHost) return null;

  // Redirecting an OPTIONS preflight across origins is not broadly supported
  // by browsers. Preserve the server's existing CORS contract for its two MCP
  // paths instead, while keeping native OPTIONS callers on the redirect path.
  if (request.method === 'OPTIONS' && allowedOrigin && isAllowedMcpPath(url.pathname)) {
    return {
      response: responseWithCors(allowedOrigin, null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store' },
      }),
      reason: 'legacy_host_preflight',
    };
  }

  url.protocol = 'https:';
  url.host = PRIMARY_PRODUCTION_HOST;

  return {
    response: responseWithCors(allowedOrigin, null, {
      status: 308,
      headers: {
        // A 308 has permanent semantics, but the migration is deliberately
        // reversible during burn-in. Do not let browsers or intermediaries
        // retain it beyond this individual response.
        'Cache-Control': 'no-store',
        Location: url.toString(),
      },
    }),
    reason: 'legacy_host_redirect',
  };
}
