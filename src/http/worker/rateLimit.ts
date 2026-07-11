import type { Env } from '../../worker-env.js';
import { responseWithCors, type GuardResponse } from './requestPolicy.js';
import {
  logWorkerSecurityEvent,
  safeErrorName,
  type WorkerRequestMetadata,
} from './telemetry.js';

export const RATE_LIMIT_REQUESTS = 120;
export const RATE_LIMIT_PERIOD_SECONDS = 60;

interface ClientIdentity {
  ip: string;
  userAgent: string;
}

function getClientIdentity(request: Request): ClientIdentity {
  return {
    ip: request.headers.get('CF-Connecting-IP') ?? '',
    userAgent: request.headers.get('User-Agent') ?? '',
  };
}

async function hashClientIdentity(identity: ClientIdentity): Promise<string> {
  const input = new TextEncoder().encode(
    `theologai-rate-limit-v1\0${identity.ip}\0${identity.userAgent}`,
  );
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getRateLimitResponse(
  env: Env,
  request: Request,
  metadata: WorkerRequestMetadata,
  origin: string | null,
): Promise<GuardResponse | null> {
  try {
    const key = await hashClientIdentity(getClientIdentity(request));
    const { success } = await env.THEOLOGAI_RATE_LIMITER.limit({ key });
    if (success) return null;

    logWorkerSecurityEvent('warning', metadata, {
      event: 'theologai.worker.rate_limit.rejected',
      status: 429,
      limit: RATE_LIMIT_REQUESTS,
      periodSeconds: RATE_LIMIT_PERIOD_SECONDS,
      scope: 'hashed_ip_user_agent_per_colo',
    });

    return {
      response: responseWithCors(origin, 'Too many requests', {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
          'Retry-After': String(RATE_LIMIT_PERIOD_SECONDS),
        },
      }),
      reason: 'rate_limited',
    };
  } catch (error) {
    logWorkerSecurityEvent('error', metadata, {
      event: 'theologai.worker.rate_limit.failure',
      policy: 'fail_open',
      errorName: safeErrorName(error),
    });
    return null;
  }
}
