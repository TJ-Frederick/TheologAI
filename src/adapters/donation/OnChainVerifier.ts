/** Fetches transaction evidence from the supported EVM-compatible chains. */

import { Cache } from '../../kernel/cache.js';
import {
  DEFAULT_RPC_URLS,
  type ChainTransactionEvidence,
  type ChainTransferEvidence,
  type ITransactionEvidenceProvider,
} from '../../kernel/donation-types.js';
import { readBoundedResponseText } from '../shared/HttpClient.js';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const WORD_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const MAX_RPC_RESPONSE_BYTES = 1024 * 1024;

interface RpcConfig { chainId: number; url: string; name: string }
export interface OnChainVerifierOptions {
  ethereum?: string;
  base?: string;
  radius?: string;
  rpcTimeoutMs?: number;
}
interface RpcReceiptLog { address: string; topics: string[]; data: string }
interface RpcReceipt { status: string; blockNumber: string; logs: RpcReceiptLog[] }
interface RpcTransaction { from: string; to: string | null; value: string }
type RpcResult<T> = { available: true; result: T | null } | { available: false };

export class OnChainVerifier implements ITransactionEvidenceProvider {
  private readonly cache = new Cache<ChainTransactionEvidence[]>(50, 5 * 60 * 1000);
  private readonly rpcs: RpcConfig[];
  private readonly rpcTimeoutMs: number;

  constructor(options: OnChainVerifierOptions = {}) {
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? 15000;
    this.rpcs = [
      { chainId: 1, url: options.ethereum ?? DEFAULT_RPC_URLS.ethereum, name: 'Ethereum' },
      { chainId: 8453, url: options.base ?? DEFAULT_RPC_URLS.base, name: 'Base' },
      { chainId: 723, url: options.radius ?? DEFAULT_RPC_URLS.radius, name: 'Radius' },
    ];
  }

  async getEvidence(txHash: string): Promise<ChainTransactionEvidence[]> {
    const cached = this.cache.get(txHash);
    if (cached) return cached;

    const evidence = await Promise.all(this.rpcs.map(rpc => this.getChainEvidence(rpc, txHash)));
    if (evidence.some(item => item.state === 'mined')) this.cache.set(txHash, evidence);
    return evidence;
  }

  private async getChainEvidence(rpc: RpcConfig, txHash: string): Promise<ChainTransactionEvidence> {
    const base = { txHash, chainId: rpc.chainId, chainName: rpc.name, transfers: [] as ChainTransferEvidence[] };
    const [receiptResult, transactionResult] = await Promise.all([
      this.rpcCall<RpcReceipt>(rpc.url, 'eth_getTransactionReceipt', [txHash]),
      this.rpcCall<RpcTransaction>(rpc.url, 'eth_getTransactionByHash', [txHash]),
    ]);

    if (!receiptResult.available || !transactionResult.available) return { ...base, state: 'unavailable' };
    const receipt = receiptResult.result;
    const transaction = transactionResult.result;
    if (!receipt && !transaction) return { ...base, state: 'absent' };
    if (!receipt && transaction) return { ...base, state: 'pending' };
    if (!receipt || !transaction || !this.validReceipt(receipt) || !this.validTransaction(transaction)) {
      return { ...base, state: 'unavailable' };
    }

    const minedSuccessfully = receipt.status.toLowerCase() === '0x1';
    const blockNumber = this.parseQuantity(receipt.blockNumber);
    if (blockNumber === undefined) return { ...base, state: 'unavailable' };

    const transfers = receipt.logs.flatMap(log => {
      const decoded = this.decodeTransfer(log);
      return decoded ? [decoded] : [];
    });
    const native = this.decodeNativeTransfer(transaction);
    if (native) transfers.push(native);

    return { ...base, state: 'mined', minedSuccessfully, blockNumber, transfers };
  }

  private validReceipt(receipt: unknown): receipt is RpcReceipt {
    if (!receipt || typeof receipt !== 'object') return false;
    const candidate = receipt as Partial<RpcReceipt>;
    return typeof candidate.status === 'string'
      && /^0x[01]$/.test(candidate.status.toLowerCase())
      && typeof candidate.blockNumber === 'string'
      && Array.isArray(candidate.logs);
  }

  private validTransaction(transaction: unknown): transaction is RpcTransaction {
    if (!transaction || typeof transaction !== 'object') return false;
    const candidate = transaction as Partial<RpcTransaction>;
    return typeof candidate.from === 'string'
      && (candidate.to === null || typeof candidate.to === 'string')
      && typeof candidate.value === 'string';
  }

  private decodeTransfer(value: unknown): ChainTransferEvidence | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const log = value as Partial<RpcReceiptLog>;
    if (typeof log.address !== 'string' || !ADDRESS_PATTERN.test(log.address)) return undefined;
    if (!Array.isArray(log.topics) || log.topics.length < 3 || typeof log.data !== 'string') return undefined;
    if (typeof log.topics[0] !== 'string' || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) return undefined;
    if (typeof log.topics[1] !== 'string' || typeof log.topics[2] !== 'string') return undefined;
    if (!WORD_PATTERN.test(log.topics[1]) || !WORD_PATTERN.test(log.topics[2]) || !WORD_PATTERN.test(log.data)) return undefined;
    try {
      const amount = BigInt(log.data);
      if (amount <= 0n) return undefined;
      return {
        from: `0x${log.topics[1].slice(-40)}`.toLowerCase(),
        to: `0x${log.topics[2].slice(-40)}`.toLowerCase(),
        amount: amount.toString(),
        tokenAddress: log.address.toLowerCase(),
      };
    } catch {
      return undefined;
    }
  }

  private decodeNativeTransfer(transaction: RpcTransaction): ChainTransferEvidence | undefined {
    if (!ADDRESS_PATTERN.test(transaction.from) || !transaction.to || !ADDRESS_PATTERN.test(transaction.to)) return undefined;
    try {
      const amount = BigInt(transaction.value);
      if (amount <= 0n) return undefined;
      return {
        from: transaction.from.toLowerCase(),
        to: transaction.to.toLowerCase(),
        amount: amount.toString(),
        tokenAddress: null,
      };
    } catch {
      return undefined;
    }
  }

  private parseQuantity(value: string): number | undefined {
    if (!/^0x[0-9a-fA-F]+$/.test(value)) return undefined;
    const parsed = Number.parseInt(value, 16);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  private async rpcCall<T>(url: string, method: string, params: unknown[]): Promise<RpcResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.rpcTimeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) return { available: false };
      const json = JSON.parse(
        await readBoundedResponseText(response, MAX_RPC_RESPONSE_BYTES, 'Donation RPC'),
      ) as { result?: T | null; error?: unknown };
      // Nodes are allowed to return null for an unknown hash, but some public
      // endpoints use a JSON-RPC "not found" error instead. That is conclusive
      // absence, not an outage. Keep all other RPC errors unavailable so a
      // rate limit, malformed response, or provider failure cannot become a
      // false negative.
      if (json.error) {
        return isTransactionNotFoundError(json.error)
          ? { available: true, result: null }
          : { available: false };
      }
      if (!Object.hasOwn(json, 'result')) return { available: false };
      return { available: true, result: json.result ?? null };
    } catch {
      return { available: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  dispose(): void { this.cache.dispose(); }
}

function isTransactionNotFoundError(error: unknown): boolean {
  const text = rpcErrorText(error).toLowerCase().replace(/[_-]+/g, ' ').trim();
  return [
    'transaction not found',
    'transaction hash not found',
    'unknown transaction',
    'receipt not found',
    'unknown receipt',
    'tx not found',
    'tx hash not found',
  ].some(phrase => text.includes(phrase));
}

function rpcErrorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';
  const candidate = error as { message?: unknown; data?: unknown };
  const messages = [
    candidate.message,
    typeof candidate.data === 'string' ? candidate.data : rpcErrorText(candidate.data),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  return messages.join(' ');
}
