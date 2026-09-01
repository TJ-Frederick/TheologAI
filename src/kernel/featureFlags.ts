/**
 * One shared, non-secret contract and execution gate for primary-source search.
 *
 * Exposure selects the deployed public v6/v7 application contract. The v8
 * research foundation has a separate dormant flag so checked-in production
 * and preview behavior cannot change accidentally. Live CCEL work is
 * permitted only when all three switches are true; no caller should recreate
 * that predicate independently.
 */

export interface PrimarySourceContractConfig {
  exposeCcelDiscovery: boolean;
  ccelLiveSearch: boolean;
  ccelCoordinator: boolean;
  /** v6 is hosted-local; v7 is deployed discovery; v8 is the dormant research foundation. */
  contractVersion: '6' | '7' | '8';
  liveCcelEnabled: boolean;
}

export type PrimarySourceFeatureFlags = PrimarySourceContractConfig;

export const DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG: Readonly<PrimarySourceContractConfig> = Object.freeze({
  exposeCcelDiscovery: false,
  ccelLiveSearch: false,
  ccelCoordinator: false,
  contractVersion: '6',
  liveCcelEnabled: false,
});

export const DEFAULT_PRIMARY_SOURCE_FEATURE_FLAGS = DEFAULT_PRIMARY_SOURCE_CONTRACT_CONFIG;

export interface PrimarySourceFlagEnvironment {
  THEOLOGAI_EXPOSE_CCEL_DISCOVERY?: string;
  THEOLOGAI_ENABLE_CCEL_LIVE_SEARCH?: string;
  THEOLOGAI_ENABLE_CCEL_COORDINATOR?: string;
  /** Dormant contract-only gate. It is intentionally absent from deployed Wrangler vars. */
  THEOLOGAI_ENABLE_PRIMARY_SOURCE_RESEARCH_V8?: string;
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
  const researchFoundationV8 = enabledValue(env.THEOLOGAI_ENABLE_PRIMARY_SOURCE_RESEARCH_V8);
  return {
    exposeCcelDiscovery,
    ccelLiveSearch,
    ccelCoordinator,
    contractVersion: exposeCcelDiscovery ? researchFoundationV8 ? '8' : '7' : '6',
    liveCcelEnabled: exposeCcelDiscovery && ccelLiveSearch && ccelCoordinator,
  };
}

/** Backwards-compatible name retained for existing internal callers. */
export const readPrimarySourceFeatureFlags = readPrimarySourceContractConfig;
