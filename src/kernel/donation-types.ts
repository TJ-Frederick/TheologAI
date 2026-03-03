/**
 * Donation and x402 payment types for TheologAI.
 *
 * Kept separate from types.ts to isolate financial domain types
 * from the theological research domain.
 */

// ── Constants ──

/** TheologAI donation recipient address */
export const RECIPIENT_ADDRESS = '0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04';

/** Default RPC endpoints (public, free) */
export const DEFAULT_RPC_URLS: Record<string, string> = {
  ethereum: 'https://eth.llamarpc.com',
  base: 'https://mainnet.base.org',
  radius: 'https://rpc.radiustech.xyz',
};

/** Block explorer base URLs by chain ID */
export const EXPLORER_URLS: Record<number, string> = {
  1: 'https://etherscan.io/tx/',
  8453: 'https://basescan.org/tx/',
  723: 'https://network.radiustech.xyz/tx/',
};

// ── Token configuration ──

export interface TokenConfig {
  symbol: string;
  name: string;
  chainId: number;
  chainName: string;
  network: string;
  asset: string;
  decimals: number;
  isNative: boolean;
  x402Supported: boolean;
}

export const SUPPORTED_TOKENS: TokenConfig[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: 8453,
    chainName: 'Base',
    network: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    isNative: false,
    x402Supported: true,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chainId: 1,
    chainName: 'Ethereum',
    network: 'eip155:1',
    asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    isNative: false,
    x402Supported: false,
  },
  {
    symbol: 'ETH',
    name: 'Ether',
    chainId: 1,
    chainName: 'Ethereum',
    network: 'eip155:1',
    asset: 'native',
    decimals: 18,
    isNative: true,
    x402Supported: false,
  },
  {
    symbol: 'ETH',
    name: 'Ether',
    chainId: 8453,
    chainName: 'Base',
    network: 'eip155:8453',
    asset: 'native',
    decimals: 18,
    isNative: true,
    x402Supported: false,
  },
  {
    symbol: 'SBC',
    name: 'Stablecoin',
    chainId: 723,
    chainName: 'Radius',
    network: 'eip155:723',
    asset: '0x33ad9e4bd16b69b5bfded37d8b5d9ff9aba014fb',
    decimals: 6,
    isNative: false,
    x402Supported: true,
  },
];

// ── Facilitator configuration ──

export interface FacilitatorConfig {
  name: string;
  url: string;
  networks: string[];
  requiresApiKey: boolean;
}

export const FACILITATORS: FacilitatorConfig[] = [
  {
    name: 'Coinbase',
    url: 'https://x402.org/facilitator',
    networks: ['eip155:8453'],
    requiresApiKey: false,
  },
  {
    name: 'SBC',
    url: 'https://x402.stablecoin.xyz',
    networks: ['eip155:723'],
    requiresApiKey: true,
  },
];

// ── Tool output types ──

export interface DonationConfig {
  recipientAddress: string;
  tokens: TokenConfig[];
  facilitators: FacilitatorConfig[];
  x402PayEndpoint: string;
}

export interface DonationVerifyResult {
  txHash: string;
  chainId: number;
  chainName: string;
  from: string;
  amount: string;
  symbol: string;
  confirmed: boolean;
  isToRecipient: boolean;
  explorerUrl: string;
}

// ── Adapter output (internal) ──

export interface VerifiedTransfer {
  txHash: string;
  chainId: number;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  tokenAddress: string | null;
  blockNumber: number;
  confirmed: boolean;
}

// ── x402 V2 protocol types ──
// Hand-rolled from coinbase/x402 source (no zod dependency)

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
}

export interface PaymentPayload {
  x402Version: 2;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: Record<string, unknown>;
}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string;
  network: string;
}

// ── x402 accepts for the /x402/pay endpoint ──
// Only tokens with x402Supported=true and EIP-3009 transferWithAuthorization
// Native ETH cannot use x402 exact scheme

export const X402_ACCEPTS: PaymentRequirements[] = [
  {
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '1000000',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: RECIPIENT_ADDRESS,
    maxTimeoutSeconds: 900,
    extra: {},
  },
  {
    scheme: 'exact',
    network: 'eip155:723',
    amount: '1000000',
    asset: '0x33ad9e4bd16b69b5bfded37d8b5d9ff9aba014fb',
    payTo: RECIPIENT_ADDRESS,
    maxTimeoutSeconds: 900,
    extra: {},
  },
];
