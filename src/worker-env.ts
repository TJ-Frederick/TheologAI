import type { CcelGlobalCoordinator } from './http/worker/CcelGlobalCoordinator.js';

/**
 * Optional secrets layered over the bindings generated from wrangler.toml in
 * worker-configuration.d.ts. Plaintext runtime configuration belongs in
 * wrangler.toml so deployments cannot silently discard dashboard-only values.
 */
export type Env = Omit<Cloudflare.Env, 'THEOLOGAI_CCEL_COORDINATOR'> & {
  /** Wrangler cannot yet infer RPC methods for a Durable Object in another Worker. */
  THEOLOGAI_CCEL_COORDINATOR: DurableObjectNamespace<CcelGlobalCoordinator>;
  /** ESV API key (optional — HelloAO used as fallback) */
  ESV_API_KEY?: string;
  /** Custom RPC endpoints (optional — defaults to public endpoints) */
  ETH_RPC_URL?: string;
  BASE_RPC_URL?: string;
  RADIUS_RPC_URL?: string;
  /** Staged primary-source switches; absent values remain disabled. */
  THEOLOGAI_EXPOSE_CCEL_DISCOVERY?: string;
  THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH?: string;
  THEOLOGAI_ENABLE_CCEL_COORDINATOR?: string;
};
