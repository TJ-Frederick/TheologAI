import type { Env } from '../../worker-env.js';
import { responseWithCors, type GuardResponse } from './requestPolicy.js';
import { hashRateLimitIp } from './rateLimitIdentity.js';
import {
  logWorkerSecurityEvent,
  safeErrorName,
  type WorkerRequestMetadata,
} from './telemetry.js';

export const RATE_LIMIT_REQUESTS = 120;
export const RATE_LIMIT_PERIOD_SECONDS = 60;

export async function getRateLimitResponse(
  env: Env,
  request: Request,
  metadata: WorkerRequestMetadata,
  origin: string | null,
): Promise<GuardResponse | null> {
  try {
    // Missing trusted identity shares one conservative bucket. Never fall back
    // to spoofable Forwarded/X-Forwarded-For or User-Agent values.
    const key = await hashRateLimitIp(request.headers.get('CF-Connecting-IP') ?? '', 'theologai-rate-limit-v2');
    const { success } = await env.THEOLOGAI_RATE_LIMITER.limit({ key });
    if (success) return null;

    logWorkerSecurityEvent('warning', metadata, {
      event: 'theologai.worker.rate_limit.rejected',
      status: 429,
      limit: RATE_LIMIT_REQUESTS,
      periodSeconds: RATE_LIMIT_PERIOD_SECONDS,
      scope: 'hashed_ip_per_colo',
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
