/**
 * Non-secret rollout switches for the staged primary-source workstream.
 *
 * Live CCEL search is intentionally disabled when configuration is absent or
 * malformed. Existing exact CCEL retrieval is not gated here and remains
 * available under its established product contract.
 */

export interface PrimarySourceFeatureFlags {
  ccelLiveSearch: boolean;
}

export const DEFAULT_PRIMARY_SOURCE_FEATURE_FLAGS: Readonly<PrimarySourceFeatureFlags> = Object.freeze({
  ccelLiveSearch: false,
});

export interface PrimarySourceFlagEnvironment {
  THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH?: string;
}

function enabledValue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function readPrimarySourceFeatureFlags(
  env: PrimarySourceFlagEnvironment = {},
): PrimarySourceFeatureFlags {
  return {
    ccelLiveSearch: enabledValue(env.THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH),
  };
}
