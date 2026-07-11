import type { Env } from '../../worker-env.js';

export interface WorkerRequestMetadata {
  method: string;
  path: string;
  hasOrigin: boolean;
  cfRay: string | null;
  country: string | null;
  colo: string | null;
  hasClientIp: boolean;
  hasUserAgent: boolean;
  hasMcpSessionId: boolean;
  hasMcpProtocolVersion: boolean;
}

export type WorkerRequestEvent =
  | { event: 'theologai.worker.request.start' }
  | {
      event: 'theologai.worker.request.complete';
      status: number;
      guarded: boolean;
      guardReason?: string;
      durationMs: number;
    }
  | {
      event: 'theologai.worker.request.error';
      status: 500;
      errorName: string;
      durationMs: number;
    }
  | {
      event: 'theologai.worker.route.deprecated';
      canonicalPath: '/mcp';
    };

export type WorkerSecurityEvent =
  | {
      event: 'theologai.worker.rate_limit.rejected';
      status: 429;
      limit: number;
      periodSeconds: number;
      scope: 'hashed_ip_user_agent_per_colo';
    }
  | {
      event: 'theologai.worker.rate_limit.failure';
      policy: 'fail_open';
      errorName: string;
    };

export function getWorkerRequestMetadata(request: Request): WorkerRequestMetadata {
  const url = new URL(request.url);
  const cf = request.cf as IncomingRequestCfProperties | undefined;

  return {
    method: request.method,
    path: url.pathname,
    hasOrigin: request.headers.has('Origin'),
    cfRay: request.headers.get('CF-Ray'),
    country: typeof cf?.country === 'string' ? cf.country : null,
    colo: typeof cf?.colo === 'string' ? cf.colo : null,
    hasClientIp: request.headers.has('CF-Connecting-IP'),
    hasUserAgent: request.headers.has('User-Agent'),
    hasMcpSessionId: request.headers.has('Mcp-Session-Id'),
    hasMcpProtocolVersion: request.headers.has('Mcp-Protocol-Version'),
  };
}

export function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

export function logWorkerRequestEvent(
  env: Env,
  metadata: WorkerRequestMetadata,
  event: WorkerRequestEvent,
): void {
  if (env.THEOLOGAI_REQUEST_LOGS !== 'true') return;
  console.log(JSON.stringify({ ...metadata, ...event }));
}

export function logWorkerSecurityEvent(
  level: 'warning' | 'error',
  metadata: WorkerRequestMetadata,
  event: WorkerSecurityEvent,
): void {
  const payload = JSON.stringify({ ...metadata, ...event });
  if (level === 'error') console.error(payload);
  else console.warn(payload);
}

export function logWorkerRuntimeError(
  metadata: WorkerRequestMetadata,
  errorName: string,
  durationMs: number,
): void {
  console.error(JSON.stringify({
    ...metadata,
    event: 'theologai.worker.request.error',
    status: 500,
    errorName,
    durationMs,
  }));
}
