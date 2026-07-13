/**
 * Non-secret rollout switches for the staged primary-source workstream.
 *
 * This switch is retained for future discovery-provider integration tests.
 * The current public MCP schemas expose only the local provider, so setting the
 * flag alone cannot enable CCEL or make a remote adapter publicly reachable.
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
