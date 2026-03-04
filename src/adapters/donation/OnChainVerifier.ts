/**
 * On-chain transaction verifier using JSON-RPC.
 *
 * Verifies donation transactions across Ethereum, Base, and Radius
 * by calling eth_getTransactionReceipt and eth_getTransactionByHash.
 * Uses raw fetch (not HttpClient) because JSON-RPC requires POST.
 */

import { Cache } from '../../kernel/cache.js';
import { PaymentError } from '../../kernel/errors.js';
import {
  DEFAULT_RPC_URLS,
  SUPPORTED_TOKENS,
  type VerifiedTransfer,
} from '../../kernel/donation-types.js';

/** ERC-20 Transfer(address,address,uint256) event topic */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface RpcConfig {
  chainId: number;
  url: string;
  name: string;
}

interface RpcReceiptLog {
  address: string;
  topics: string[];
  data: string;
}

interface RpcReceipt {
  status: string;
  blockNumber: string;
  from: string;
  to: string;
  logs: RpcReceiptLog[];
}

interface RpcTransaction {
  from: string;
  to: string;
  value: string;
  blockNumber: string;
}

export class OnChainVerifier {
  private cache: Cache<VerifiedTransfer>;
  private rpcs: RpcConfig[];

  constructor(rpcUrls: {
    ethereum?: string;
    base?: string;
    radius?: string;
  } = {}) {
    this.cache = new Cache<VerifiedTransfer>(50, 5 * 60 * 1000);
    this.rpcs = [
      { chainId: 1, url: rpcUrls.ethereum ?? DEFAULT_RPC_URLS.ethereum, name: 'Ethereum' },
      { chainId: 8453, url: rpcUrls.base ?? DEFAULT_RPC_URLS.base, name: 'Base' },
      { chainId: 723, url: rpcUrls.radius ?? DEFAULT_RPC_URLS.radius, name: 'Radius' },
    ];
  }

  async verify(txHash: string): Promise<VerifiedTransfer> {
    // Check cache across all chains
    for (const rpc of this.rpcs) {
      const cached = this.cache.get(`${txHash}:${rpc.chainId}`);
      if (cached) return cached;
    }

    // Parallel chain detection via Promise.allSettled
    const results = await Promise.allSettled(
      this.rpcs.map(rpc => this.verifyOnChain(rpc, txHash)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        const transfer = result.value;
        this.cache.set(`${txHash}:${transfer.chainId}`, transfer);
        return transfer;
      }
    }

    throw new PaymentError(
      `Transaction not found on any supported chain (Ethereum, Base, Radius)`,
      txHash,
    );
  }

  private async verifyOnChain(
    rpc: RpcConfig,
    txHash: string,
  ): Promise<VerifiedTransfer | null> {
    // Fetch receipt and transaction data in parallel
    const [receipt, tx] = await Promise.all([
      this.rpcCall<RpcReceipt>(rpc.url, 'eth_getTransactionReceipt', [txHash]),
      this.rpcCall<RpcTransaction>(rpc.url, 'eth_getTransactionByHash', [txHash]),
    ]);

    if (!receipt || !tx) return null;

    const confirmed = receipt.status === '0x1';
    const blockNumber = parseInt(receipt.blockNumber, 16);

    // Check for ERC-20 Transfer events
    const transferLog = receipt.logs.find(
      log => log.topics.length >= 3 && log.topics[0] === TRANSFER_TOPIC,
    );

    if (transferLog) {
      const from = '0x' + transferLog.topics[1].slice(26);
      const to = '0x' + transferLog.topics[2].slice(26);
      const amount = BigInt(transferLog.data).toString();
      const tokenAddress = transferLog.address.toLowerCase();

      const token = SUPPORTED_TOKENS.find(
        t => t.chainId === rpc.chainId && !t.isNative && t.asset.toLowerCase() === tokenAddress,
      );

      return {
        txHash,
        chainId: rpc.chainId,
        from,
        to,
        amount,
        symbol: token?.symbol ?? 'UNKNOWN',
        tokenAddress,
        blockNumber,
        confirmed,
      };
    }

    // Fall back to native ETH/value transfer
    const value = BigInt(tx.value);
    if (value > 0n) {
      const token = SUPPORTED_TOKENS.find(
        t => t.chainId === rpc.chainId && t.isNative,
      );

      return {
        txHash,
        chainId: rpc.chainId,
        from: tx.from,
        to: tx.to,
        amount: value.toString(),
        symbol: token?.symbol ?? 'ETH',
        tokenAddress: null,
        blockNumber,
        confirmed,
      };
    }

    return null;
  }

  private async rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T | null> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

      if (!response.ok) return null;

      const json = await response.json() as { result?: T; error?: { message: string } };
      if (json.error || !json.result) return null;

      return json.result;
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.cache.dispose();
  }
}
