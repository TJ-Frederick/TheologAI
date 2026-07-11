import type { Env } from '../../worker-env.js';
import type { WorkerRequestMetadata } from './telemetry.js';

export const DEFAULT_ALLOWED_ORIGIN = 'https://theologai.pages.dev';
export const DEFAULT_MAX_REQUEST_BYTES = 1024 * 1024;

const ALLOWED_METHODS = new Set(['POST', 'OPTIONS']);
const ALLOWED_PATHS = new Set(['/', '/mcp']);
const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

export interface GuardResponse {
  response: Response;
  reason: string;
}

export function getMaxRequestBytes(env: Env): number {
  const configured = Number(env.THEOLOGAI_MAX_REQUEST_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_REQUEST_BYTES;
}

function getAllowedOrigins(env: Env): Set<string> {
  const configured = env.THEOLOGAI_ALLOWED_ORIGINS?.trim();
  const origins = configured ? configured.split(/[\s,]+/) : [DEFAULT_ALLOWED_ORIGIN];
  return new Set(origins.filter(Boolean));
}

function mergeVary(current: string | null, value: string): string {
  const values = new Set((current ?? '').split(',').map(entry => entry.trim()).filter(Boolean));
  values.add(value);
  return [...values].join(', ');
}

export function corsHeaders(origin: string | null, initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  else headers.delete('Access-Control-Allow-Origin');
  headers.set('Vary', mergeVary(headers.get('Vary'), 'Origin'));
  return headers;
}

export function responseWithCors(
  origin: string | null,
  body: BodyInit | null,
  init: ResponseInit = {},
): Response {
  return new Response(body, { ...init, headers: corsHeaders(origin, init.headers) });
}

export function applyCors(response: Response, origin: string | null): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders(origin, response.headers),
  });
}

export function getEarlyResponse(
  env: Env,
  request: Request,
  metadata: WorkerRequestMetadata,
): GuardResponse | null {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const allowedOrigin = origin && getAllowedOrigins(env).has(origin)
    ? origin
    : null;

  if (origin && !allowedOrigin) {
    return {
      response: responseWithCors(null, 'Forbidden', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
      reason: 'invalid_origin',
    };
  }

  if (!ALLOWED_PATHS.has(url.pathname)) {
    return {
      response: responseWithCors(allowedOrigin, 'Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
      reason: 'unknown_path',
    };
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return {
      response: responseWithCors(allowedOrigin, 'Method not allowed', {
        status: 405,
        headers: {
          Allow: 'POST, OPTIONS',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      }),
      reason: 'unsupported_method',
    };
  }

  if (request.method === 'OPTIONS') {
    return {
      response: responseWithCors(allowedOrigin, null, { status: 204 }),
      reason: 'preflight',
    };
  }

  return null;
}

export function getDeclaredBodyLimitResponse(
  env: Env,
  request: Request,
  origin: string | null,
): GuardResponse | null {
  const contentLength = request.headers.get('Content-Length');
  if (!contentLength || Number(contentLength) <= getMaxRequestBytes(env)) return null;

  return {
    response: responseWithCors(origin, 'Payload too large', {
      status: 413,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
    reason: 'payload_too_large',
  };
}
