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
}
