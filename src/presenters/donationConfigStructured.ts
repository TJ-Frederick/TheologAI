import {
  DONATION_CONFIG_LIMITS,
  RECIPIENT_ADDRESS,
  SUPPORTED_DONATION_CHAINS,
  SUPPORTED_TOKENS,
  type DonationChainConfig,
  type DonationConfig,
  type TokenConfig,
} from '../kernel/donation-types.js';
import { PUBLIC_DONATION_URL } from '../kernel/publicUrls.js';
import type {
  DonationAssetOutputV1,
  DonationConfigOutputV1,
} from '../mcp/schemas/donationConfig.js';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

const assetIdentity = (token: Readonly<TokenConfig>): string => (
  `${token.chainId}:${token.isNative ? 'native' : token.asset.toLowerCase()}`
);

const configuredAssets = new Map(SUPPORTED_TOKENS.map(token => [assetIdentity(token), token]));
const configuredChains = new Map<number, DonationChainConfig>(
  SUPPORTED_DONATION_CHAINS.map(chain => [chain.chainId, chain]),
);

/** Present donation configuration without adding preferences or wallet claims. */
export function presentDonationConfigStructured(config: DonationConfig): DonationConfigOutputV1 {
  validateConfig(config);
  return {
    schemaVersion: '1',
    kind: 'donation_config',
    voluntary: true,
    featureAccessIndependentOfDonation: true,
    assetOrderMeaning: 'configured_display_order_not_ranking',
    webDonationUrl: PUBLIC_DONATION_URL,
    recipientAddress: config.recipientAddress,
    assets: config.tokens.map((token): DonationAssetOutputV1 => (
      token.isNative ? {
        symbol: token.symbol,
        name: token.name,
        chainId: token.chainId,
        chainName: token.chainName,
        network: token.network,
        assetKind: 'native',
        assetAddress: null,
        decimals: token.decimals,
      } : {
        symbol: token.symbol,
        name: token.name,
        chainId: token.chainId,
        chainName: token.chainName,
        network: token.network,
        assetKind: 'token',
        assetAddress: token.asset,
        decimals: token.decimals,
      }
    )),
  };
}

function validateConfig(config: DonationConfig): void {
  if (config.recipientAddress !== RECIPIENT_ADDRESS || !ADDRESS_PATTERN.test(config.recipientAddress)) {
    throw new Error('Donation recipient does not match the configured recipient');
  }
  if (config.tokens.length < 1 || config.tokens.length > DONATION_CONFIG_LIMITS.maxAssets) {
    throw new Error(`Donation configuration must contain 1-${DONATION_CONFIG_LIMITS.maxAssets} assets`);
  }

  const seen = new Set<string>();
  for (const token of config.tokens) {
    validateAssetFields(token);
    const identity = assetIdentity(token);
    if (seen.has(identity)) {
      throw new Error(`Duplicate donation asset identity on chain ${token.chainId}`);
    }
    seen.add(identity);

    const configured = configuredAssets.get(identity);
    if (!configured || !sameAssetConfiguration(token, configured)) {
      throw new Error(`Donation asset ${token.symbol} on chain ${token.chainId} does not match the supported catalog`);
    }
  }
}

function validateAssetFields(token: Readonly<TokenConfig>): void {
  if (!Number.isSafeInteger(token.chainId) || token.chainId < 1) {
    throw new Error(`Donation asset ${token.symbol} has an invalid chain ID`);
  }
  const chain = configuredChains.get(token.chainId);
  if (!chain || token.chainName !== chain.chainName || token.network !== chain.network) {
    throw new Error(`Donation asset ${token.symbol} has inconsistent chain identity`);
  }
  if (
    token.symbol.length < 1
    || token.symbol.length > DONATION_CONFIG_LIMITS.maxSymbolLength
    || !SYMBOL_PATTERN.test(token.symbol)
  ) {
    throw new Error('Donation asset has an invalid symbol');
  }
  if (
    token.name.length < 1
    || token.name.length > DONATION_CONFIG_LIMITS.maxNameLength
    || token.name !== token.name.trim()
    || CONTROL_CHARACTER_PATTERN.test(token.name)
  ) {
    throw new Error(`Donation asset ${token.symbol} has an invalid name`);
  }
  if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > DONATION_CONFIG_LIMITS.maxDecimals) {
    throw new Error(`Donation asset ${token.symbol} has invalid decimals`);
  }
  if (token.isNative && token.asset !== 'native') {
    throw new Error(`Native asset ${token.symbol} on ${token.chainName} has a contract address`);
  }
  if (!token.isNative && !ADDRESS_PATTERN.test(token.asset)) {
    throw new Error(`Token asset ${token.symbol} on ${token.chainName} has no contract address`);
  }
}

function sameAssetConfiguration(actual: Readonly<TokenConfig>, expected: Readonly<TokenConfig>): boolean {
  return actual.symbol === expected.symbol
    && actual.name === expected.name
    && actual.chainId === expected.chainId
    && actual.chainName === expected.chainName
    && actual.network === expected.network
    && actual.asset === expected.asset
    && actual.decimals === expected.decimals
    && actual.isNative === expected.isNative;
}
