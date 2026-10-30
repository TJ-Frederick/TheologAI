/** Shared request-amplification limits that must move only under coordinated review. */
export const DEFAULT_HTTP_MAX_RETRIES = 2 as const;
/** Remote Bible adapters are pinned so generic-client changes cannot consume enrichment headroom. */
export const BIBLE_TEXT_HTTP_MAX_RETRIES = 2 as const;
export const PARALLEL_TEXT_LOOKUP_BUDGET = 12 as const;

/**
 * Conservative external-subrequest ceiling for Workers Free.
 * Source (reviewed 2026-07-16):
 * https://developers.cloudflare.com/workers/platform/limits/#subrequests
 */
export const CLOUDFLARE_FREE_EXTERNAL_SUBREQUEST_LIMIT = 50 as const;

/** Reserved for non-enrichment work performed by the same MCP invocation. */
export const PARALLEL_TEXT_RESERVED_SUBREQUEST_HEADROOM = 14 as const;
