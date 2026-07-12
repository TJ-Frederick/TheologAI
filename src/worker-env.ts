/**
 * Optional secrets layered over the bindings generated from wrangler.toml in
 * worker-configuration.d.ts. Plaintext runtime configuration belongs in
 * wrangler.toml so deployments cannot silently discard dashboard-only values.
 */
export type Env = Cloudflare.Env & {
  /** ESV API key (optional — HelloAO used as fallback) */
  ESV_API_KEY?: string;
  /** Custom RPC endpoints (optional — defaults to public endpoints) */
  ETH_RPC_URL?: string;
  BASE_RPC_URL?: string;
  RADIUS_RPC_URL?: string;
  /** Staged primary-source switches; absent values remain disabled. */
  THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH?: string;
};
