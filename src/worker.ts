/** Cloudflare Workers entry point for the anonymous Streamable HTTP MCP server. */

import type { Env } from './worker-env.js';
import { createWorkerCompositionRoot } from './tools/worker/index.js';
import { createWorkerMcpServer } from './worker-server.js';
import {
  createInternalMcpErrorResponse,
  handleWorkerMcpRequest,
} from './http/worker/mcpHandler.js';
import { readBoundedWorkerRequest } from './http/worker/requestBody.js';
import {
  applyCors,
  getDeclaredBodyLimitResponse,
  getEarlyResponse,
  getMaxRequestBytes,
  responseWithCors,
} from './http/worker/requestPolicy.js';
import { getRateLimitResponse } from './http/worker/rateLimit.js';
import {
  getWorkerRequestMetadata,
  logWorkerRuntimeError,
  logWorkerRequestEvent,
  safeErrorName,
} from './http/worker/telemetry.js';
import { handleCcelOperatorRequest } from './http/worker/ccelOperator.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    void ctx;
    // This signed, fail-closed route is outside public MCP telemetry and its
    // limiter; the handler applies a distinct fail-closed pre-auth budget.
    const operatorResponse = await handleCcelOperatorRequest(request, env);
    if (operatorResponse) return operatorResponse;

    const startedAt = Date.now();
    const metadata = getWorkerRequestMetadata(request);
    const origin = request.headers.get('Origin');
    logWorkerRequestEvent(env, metadata, { event: 'theologai.worker.request.start' });

    const complete = (
      response: Response,
      guarded: boolean,
      guardReason?: string,
    ): Response => {
      logWorkerRequestEvent(env, metadata, {
        event: 'theologai.worker.request.complete',
        status: response.status,
        guarded,
        guardReason,
        durationMs: Date.now() - startedAt,
      });
      return response;
    };

    try {
      const earlyResponse = getEarlyResponse(env, request, metadata);
      if (earlyResponse) {
        return complete(earlyResponse.response, true, earlyResponse.reason);
      }

      const rateLimitResponse = await getRateLimitResponse(env, request, metadata, origin);
      if (rateLimitResponse) {
        return complete(rateLimitResponse.response, true, rateLimitResponse.reason);
      }

      const declaredBodyLimitResponse = getDeclaredBodyLimitResponse(env, request, origin);
      if (declaredBodyLimitResponse) {
        return complete(
          declaredBodyLimitResponse.response,
          true,
          declaredBodyLimitResponse.reason,
        );
      }

      if (metadata.path === '/') {
        logWorkerRequestEvent(env, metadata, {
          event: 'theologai.worker.route.deprecated',
          canonicalPath: '/mcp',
        });
      }

      const boundedRequest = await readBoundedWorkerRequest(request, getMaxRequestBytes(env));
      if (!boundedRequest) {
        return complete(responseWithCors(origin, 'Payload too large', {
          status: 413,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }), true, 'payload_too_large');
      }

      const root = createWorkerCompositionRoot(env);
      const mcpServer = createWorkerMcpServer(root, env.THEOLOGAI_VERSION || '0.0.0');
      const result = await handleWorkerMcpRequest(mcpServer, boundedRequest);
      const response = applyCors(result.response, origin);

      if (result.errorName) {
        logWorkerRuntimeError(metadata, result.errorName, Date.now() - startedAt);
        return response;
      }

      return complete(response, false);
    } catch (error) {
      logWorkerRuntimeError(metadata, safeErrorName(error), Date.now() - startedAt);
      return applyCors(createInternalMcpErrorResponse(), origin);
    }
  },
} satisfies ExportedHandler<Env>;
