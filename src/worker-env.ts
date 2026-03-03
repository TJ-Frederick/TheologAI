/**
 * Cloudflare Workers environment bindings.
 */

export interface Env {
  /** D1 database binding */
  THEOLOGAI_DB: D1Database;
  /** ESV API key (optional — HelloAO used as fallback) */
  ESV_API_KEY?: string;
  /** Server version (set via wrangler.toml [vars]) */
  THEOLOGAI_VERSION: string;
  /** SBC facilitator API key for Radius x402 settlements */
  SBC_FACILITATOR_API_KEY?: string;
  /** Custom RPC endpoints (optional — defaults to public endpoints) */
  ETH_RPC_URL?: string;
  BASE_RPC_URL?: string;
  RADIUS_RPC_URL?: string;
}
