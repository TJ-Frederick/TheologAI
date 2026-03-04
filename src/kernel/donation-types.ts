/**
 * Donation types for TheologAI.
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
  },
];

// ── Tool output types ──

export interface DonationConfig {
  recipientAddress: string;
  tokens: TokenConfig[];
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
