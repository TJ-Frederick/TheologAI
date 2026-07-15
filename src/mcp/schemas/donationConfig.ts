import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  DONATION_CONFIG_LIMITS,
  RECIPIENT_ADDRESS,
  SUPPORTED_TOKENS,
  type TokenConfig,
} from '../../kernel/donation-types.js';
import { PUBLIC_DONATION_URL } from '../../kernel/publicUrls.js';

interface DonationAssetOutputBase {
  symbol: string;
  name: string;
  chainId: number;
  chainName: string;
  network: string;
  decimals: number;
}

export type DonationAssetOutputV1 = DonationAssetOutputBase & (
  | { assetKind: 'native'; assetAddress: null }
  | { assetKind: 'token'; assetAddress: string }
);

export interface DonationConfigOutputV1 {
  [key: string]: unknown;
  schemaVersion: '1';
  kind: 'donation_config';
  voluntary: true;
  featureAccessIndependentOfDonation: true;
  assetOrderMeaning: 'configured_display_order_not_ranking';
  webDonationUrl: string;
  recipientAddress: string;
  assets: DonationAssetOutputV1[];
}

const ADDRESS_PATTERN = '^0x[0-9a-fA-F]{40}$';
const ASSET_REQUIRED = [
  'symbol', 'name', 'chainId', 'chainName', 'network',
  'assetKind', 'assetAddress', 'decimals',
] as const;

function assetSchema(token: Readonly<TokenConfig>) {
  return {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        const: token.symbol,
        minLength: 1,
        maxLength: DONATION_CONFIG_LIMITS.maxSymbolLength,
      },
      name: {
        type: 'string',
        const: token.name,
        minLength: 1,
        maxLength: DONATION_CONFIG_LIMITS.maxNameLength,
      },
      chainId: { type: 'integer', const: token.chainId, minimum: 1 },
      chainName: {
        type: 'string',
        const: token.chainName,
        minLength: 1,
        maxLength: DONATION_CONFIG_LIMITS.maxChainNameLength,
      },
      network: {
        type: 'string',
        const: token.network,
        minLength: 3,
        maxLength: DONATION_CONFIG_LIMITS.maxNetworkLength,
        pattern: '^eip155:[1-9][0-9]*$',
      },
      assetKind: { type: 'string', const: token.isNative ? 'native' : 'token' },
      assetAddress: token.isNative
        ? { type: 'null' }
        : { type: 'string', const: token.asset, pattern: ADDRESS_PATTERN },
      decimals: {
        type: 'integer',
        const: token.decimals,
        minimum: 0,
        maximum: DONATION_CONFIG_LIMITS.maxDecimals,
      },
    },
    required: [...ASSET_REQUIRED],
    additionalProperties: false,
  };
}

export const donationConfigOutputSchema = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string', const: '1' },
    kind: { type: 'string', const: 'donation_config' },
    voluntary: { type: 'boolean', const: true },
    featureAccessIndependentOfDonation: { type: 'boolean', const: true },
    assetOrderMeaning: {
      type: 'string',
      const: 'configured_display_order_not_ranking',
      description: 'Array order is stable display configuration, not a preference or recommendation.',
    },
    webDonationUrl: { type: 'string', const: PUBLIC_DONATION_URL, minLength: 1, maxLength: 2048 },
    recipientAddress: { type: 'string', const: RECIPIENT_ADDRESS, pattern: ADDRESS_PATTERN },
    assets: {
      type: 'array',
      minItems: 1,
      maxItems: DONATION_CONFIG_LIMITS.maxAssets,
      uniqueItems: true,
      description: 'Configured display order only; array position is not an asset ranking.',
      items: { oneOf: SUPPORTED_TOKENS.map(assetSchema) },
    },
  },
  required: [
    'schemaVersion', 'kind', 'voluntary', 'featureAccessIndependentOfDonation',
    'assetOrderMeaning', 'webDonationUrl', 'recipientAddress', 'assets',
  ],
  additionalProperties: false,
} as NonNullable<Tool['outputSchema']>;
