/** Donation configuration, chain evidence, and public verification results. */

export const RECIPIENT_ADDRESS = '0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04';

export const DONATION_CONFIG_LIMITS = Object.freeze({
  maxAssets: 20,
  maxSymbolLength: 16,
  maxNameLength: 100,
  maxChainNameLength: 100,
  maxNetworkLength: 41,
  maxDecimals: 255,
});

export const DEFAULT_RPC_URLS = Object.freeze({
  ethereum: 'https://eth.llamarpc.com',
  base: 'https://mainnet.base.org',
  radius: 'https://rpc.radiustech.xyz',
});

export type DonationRpcKey = keyof typeof DEFAULT_RPC_URLS;

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

export interface DonationChainConfig {
  chainId: number;
  chainName: string;
  network: string;
  explorerTransactionUrl: string;
}

/** Canonical chain identities used by verification, public output, and schemas. */
export const SUPPORTED_DONATION_CHAINS = Object.freeze([
  Object.freeze({
    chainId: 1,
    chainName: 'Ethereum',
    network: 'eip155:1',
    explorerTransactionUrl: 'https://etherscan.io/tx/',
  }),
  Object.freeze({
    chainId: 8453,
    chainName: 'Base',
    network: 'eip155:8453',
    explorerTransactionUrl: 'https://basescan.org/tx/',
  }),
  Object.freeze({
    chainId: 723,
    chainName: 'Radius',
    network: 'eip155:723',
    explorerTransactionUrl: 'https://network.radiustech.xyz/tx/',
  }),
] as const satisfies readonly DonationChainConfig[]);

export type SupportedDonationChain = typeof SUPPORTED_DONATION_CHAINS[number];
export type SupportedDonationChainId = SupportedDonationChain['chainId'];
export type SupportedDonationChainName = SupportedDonationChain['chainName'];
export type SupportedDonationNetwork = typeof SUPPORTED_DONATION_CHAINS[number]['network'];

const chain = (chainId: number): DonationChainConfig => {
  const configured = SUPPORTED_DONATION_CHAINS.find(candidate => candidate.chainId === chainId);
  if (!configured) throw new Error(`Missing donation chain configuration for chain ${chainId}`);
  return configured;
};

const token = <const T extends Pick<
  TokenConfig,
  'symbol' | 'name' | 'chainId' | 'asset' | 'decimals' | 'isNative'
>>(asset: T) => {
  const configuredChain = chain(asset.chainId);
  return Object.freeze({
    ...asset,
    chainName: configuredChain.chainName,
    network: configuredChain.network,
  });
};

/** Ordered for stable display only; array position is never an asset ranking. */
export const SUPPORTED_TOKENS = Object.freeze([
  token({ symbol: 'USDC', name: 'USD Coin', chainId: 8453, asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, isNative: false }),
  token({ symbol: 'USDC', name: 'USD Coin', chainId: 1, asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, isNative: false }),
  token({ symbol: 'ETH', name: 'Ether', chainId: 1, asset: 'native', decimals: 18, isNative: true }),
  token({ symbol: 'ETH', name: 'Ether', chainId: 8453, asset: 'native', decimals: 18, isNative: true }),
  token({ symbol: 'SBC', name: 'Stablecoin', chainId: 723, asset: '0x33ad9e4bd16b69b5bfded37d8b5d9ff9aba014fb', decimals: 6, isNative: false }),
] as const satisfies readonly Readonly<TokenConfig>[]);

export type SupportedDonationSymbol = typeof SUPPORTED_TOKENS[number]['symbol'];

export function getSupportedDonationChain(chainId: number): SupportedDonationChain | undefined {
  return SUPPORTED_DONATION_CHAINS.find(candidate => candidate.chainId === chainId);
}

export function getSupportedDonationAsset(
  chainId: number,
  tokenAddress: string | null,
) {
  return SUPPORTED_TOKENS.find(candidate => candidate.chainId === chainId
    && (candidate.isNative
      ? tokenAddress === null
      : tokenAddress?.toLowerCase() === candidate.asset.toLowerCase()));
}

export interface DonationConfig {
  recipientAddress: string;
  tokens: readonly Readonly<TokenConfig>[];
}

export interface ChainTransferEvidence {
  from: string;
  to: string;
  amount: string;
  /** Null denotes the chain's native asset. */
  tokenAddress: string | null;
}

export type ChainEvidenceState = 'unavailable' | 'absent' | 'pending' | 'mined';

export interface ChainTransactionEvidence {
  txHash: string;
  chainId: number;
  chainName: string;
  state: ChainEvidenceState;
  minedSuccessfully?: boolean;
  blockNumber?: number;
  transfers: ChainTransferEvidence[];
}

/** Public summary of what each chain provider could establish. */
export interface DonationChainStatus {
  chainId: number;
  chainName: string;
  state: ChainEvidenceState;
  minedSuccessfully?: boolean;
}

export interface ITransactionEvidenceProvider {
  getEvidence(txHash: string): Promise<ChainTransactionEvidence[]>;
}

export type DonationVerificationStatus =
  | 'unavailable'
  | 'absent'
  | 'pending'
  | 'failed'
  | 'unsupported'
  | 'wrong_recipient'
  | 'verified';

export interface DonationTransferResult {
  chainId: number;
  chainName: string;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  tokenAddress: string | null;
}

export interface DonationVerifyResult {
  txHash: string;
  status: DonationVerificationStatus;
  minedSuccessfully: boolean;
  transfers: DonationTransferResult[];
  explorerUrl: string;
  /** Populated by the service; optional for compatibility with older callers. */
  chainStatuses?: DonationChainStatus[];
  /** Exact number of status-relevant, valid transfers before the public 100-item bound. */
  classifiedTransferCount?: number;
}
