/**
 * One shared, non-secret contract and execution gate for primary-source search.
 *
 * Exposure selects the public v4/v5 application contract.  Live CCEL work is
 * permitted only when all three switches are true; no caller should recreate
 * that predicate independently.
 */

export interface PrimarySourceContractConfig {
  exposeCcelDiscovery: boolean;
  ccelLiveSearch: boolean;
  ccelCoordinator: boolean;
  /** v4 is hosted-local; v5 adds the separately gated CCEL discovery shape. */
  contractVersion: '4' | '5';
  liveCcelEnabled: boolean;
}

export type PrimarySourceFeatureFlags = PrimarySourceContractConfig;

export const DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG: Readonly<PrimarySourceContractConfig> = Object.freeze({
  exposeCcelDiscovery: false,
  ccelLiveSearch: false,
  ccelCoordinator: false,
  contractVersion: '4',
  liveCcelEnabled: false,
});

export const DEFAULT_PRIMARY_SOURCE_FEATURE_FLAGS = DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG;

export interface PrimarySourceFlagEnvironment {
  THEOLOGAI_EXPOSE_CCEL_DISCOVERY?: string;
  THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH?: string;
  THEOLOGAI_ENABLE_CCEL_COORDINATOR?: string;
}

function enabledValue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function readPrimarySourceContractConfig(
  env: PrimarySourceFlagEnvironment = {},
): PrimarySourceContractConfig {
  const exposeCcelDiscovery = enabledValue(env.THEOLOGAI_EXPOSE_CCEL_DISCOVERY);
  const ccelLiveSearch = enabledValue(env.THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH);
  const ccelCoordinator = enabledValue(env.THEOLOGAI_ENABLE_CCEL_COORDINATOR);
  return {
    exposeCcelDiscovery,
    ccelLiveSearch,
    ccelCoordinator,
    contractVersion: exposeCcelDiscovery ? '5' : '4',
    liveCcelEnabled: exposeCcelDiscovery && ccelLiveSearch && ccelCoordinator,
  };
}

/** Backwards-compatible name retained for existing internal callers. */
export const readPrimarySourceFeatureFlags = readPrimarySourceContractConfig;
