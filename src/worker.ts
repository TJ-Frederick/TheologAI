/**
 * Cloudflare Workers entry point for TheologAI MCP server.
 *
 * Serves the MCP protocol over Streamable HTTP via the Cloudflare
 * Agents SDK. Auth is handled at the Cloudflare edge (rate limiting).
 *
 * Also serves the /x402/pay endpoint for x402 V2 donation payments.
 */

import { createMcpHandler } from 'agents/mcp';
import type { Env } from './worker-env.js';
import { createWorkerCompositionRoot, getDonationService } from './tools/worker/index.js';
import { createWorkerMcpServer } from './worker-server.js';
import { FacilitatorClient } from './adapters/donation/FacilitatorClient.js';
import {
  RECIPIENT_ADDRESS,
  FACILITATORS,
  X402_ACCEPTS,
  type PaymentRequired,
  type PaymentPayload,
} from './kernel/donation-types.js';

// ── x402 CORS headers ──

const X402_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Payment-Signature',
  'Access-Control-Expose-Headers': 'Payment-Required, Payment-Response',
  'Access-Control-Max-Age': '86400',
};

// ── x402 handler ──

function buildPaymentRequiredResponse(): Response {
  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    resource: {
      url: 'https://theologai.tjfrederick.workers.dev/x402/pay',
      description: 'TheologAI voluntary donation',
      mimeType: 'application/json',
    },
    accepts: X402_ACCEPTS,
  };

  const encoded = btoa(JSON.stringify(paymentRequired));

  return new Response(
    JSON.stringify({
      error: 'Payment Required',
      message: 'Send a donation to TheologAI. Include a Payment-Signature header with your x402 payment payload.',
      x402Version: 2,
    }),
    {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'Payment-Required': encoded,
        ...X402_CORS_HEADERS,
      },
    },
  );
}

async function handleX402Settlement(
  request: Request,
  env: Env,
): Promise<Response> {
  const signatureHeader = request.headers.get('Payment-Signature');
  if (!signatureHeader) {
    return buildPaymentRequiredResponse();
  }

  try {
    // Decode the payment payload from the header
    const paymentPayload = JSON.parse(atob(signatureHeader)) as PaymentPayload;
    const network = paymentPayload.accepted?.network;

    if (!network) {
      return buildPaymentRequiredResponse();
    }

    // Find the matching facilitator for this network
    const facilitatorConfig = FACILITATORS.find(f => f.networks.includes(network));
    if (!facilitatorConfig) {
      return new Response(
        JSON.stringify({ error: `Unsupported network: ${network}` }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...X402_CORS_HEADERS } },
      );
    }

    // Find matching payment requirements from our accepts
    const paymentRequirements = X402_ACCEPTS.find(a => a.network === network);
    if (!paymentRequirements) {
      return buildPaymentRequiredResponse();
    }

    // Settle via facilitator
    const apiKey = facilitatorConfig.requiresApiKey ? env.SBC_FACILITATOR_API_KEY : undefined;
    const client = new FacilitatorClient(facilitatorConfig.url, apiKey);
    const settleResult = await client.settle(paymentPayload, paymentRequirements);

    const encodedResponse = btoa(JSON.stringify(settleResult));

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Thank you for your donation to TheologAI!',
        transaction: settleResult.transaction,
        network: settleResult.network,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Payment-Response': encodedResponse,
          ...X402_CORS_HEADERS,
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Settlement failed';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 402, headers: { 'Content-Type': 'application/json', ...X402_CORS_HEADERS } },
    );
  }
}

// ── Worker entry point ──

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // x402 payment endpoint — routed before MCP handler
    if (url.pathname === '/x402/pay') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: X402_CORS_HEADERS });
      }
      return handleX402Settlement(request, env);
    }

    // MCP handler (existing)
    const root = createWorkerCompositionRoot(env);
    const mcpServer = createWorkerMcpServer(root, env.THEOLOGAI_VERSION || '0.0.0');

    return createMcpHandler(mcpServer, {
      corsOptions: {
        origin: '*',
        methods: 'GET, POST, DELETE, OPTIONS',
        headers: 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
        exposeHeaders: 'Mcp-Session-Id',
        maxAge: 86400,
      },
    })(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
