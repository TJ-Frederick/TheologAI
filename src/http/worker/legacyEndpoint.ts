import type { GuardResponse } from './requestPolicy.js';

export const LEGACY_PRODUCTION_HOST = 'theologai.tjfrederick.workers.dev';
export const PRIMARY_PRODUCTION_HOST = 'mcp.theologai.xyz';

// Temporary migration guard for the confirmed AWS Frankfurt poller observed
// on 2026-07-17. Remove this rule when the legacy workers.dev route is retired.
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
export function getLegacyEndpointResponse(request: Request): GuardResponse | null {
  const url = new URL(request.url);

  if (isAbusivePoller(request)) {
    const isLegacyRequest = url.hostname === LEGACY_PRODUCTION_HOST;
    return {
      response: new Response(isLegacyRequest ? 'Gone' : 'Forbidden', {
        status: isLegacyRequest ? 410 : 403,
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      }),
      reason: 'blocked_abusive_poller',
    };
  }

  if (url.hostname !== LEGACY_PRODUCTION_HOST) return null;

  url.protocol = 'https:';
  url.host = PRIMARY_PRODUCTION_HOST;

  return {
    response: new Response(null, {
      status: 308,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        Location: url.toString(),
      },
    }),
    reason: 'legacy_host_redirect',
  };
}
