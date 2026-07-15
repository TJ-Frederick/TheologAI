/** Classifies chain evidence against TheologAI's donation policy. */

import { PaymentError } from '../../kernel/errors.js';
import {
  RECIPIENT_ADDRESS,
  SUPPORTED_TOKENS,
  SUPPORTED_DONATION_CHAINS,
  getSupportedDonationAsset,
  getSupportedDonationChain,
  type ChainTransactionEvidence,
  type ChainTransferEvidence,
  type DonationConfig,
  type DonationChainStatus,
  type DonationTransferResult,
  type DonationVerificationStatus,
  type DonationVerifyResult,
  type ITransactionEvidenceProvider,
  type TokenConfig,
} from '../../kernel/donation-types.js';

const MAX_PUBLIC_TRANSFERS = 100;
const MAX_CLASSIFIED_TRANSFERS = 1_000_000;
const MAX_EVM_AMOUNT_LENGTH = 78;
const MAX_UINT256 = (1n << 256n) - 1n;

export class DonationService {
  constructor(private readonly evidenceProvider: ITransactionEvidenceProvider) {}

  getConfig(): DonationConfig {
    return { recipientAddress: RECIPIENT_ADDRESS, tokens: SUPPORTED_TOKENS };
  }

  async verifyDonation(txHash: string): Promise<DonationVerifyResult> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new PaymentError('Invalid transaction hash format. Expected 0x-prefixed 64-char hex string.');
    }

    let evidence: unknown;
    try {
      evidence = await this.evidenceProvider.getEvidence(txHash);
    } catch {
      return this.result(txHash, 'unavailable', [], false, unavailableEvidence(txHash));
    }

    let normalized: ReturnType<typeof normalizeEvidence>;
    try {
      normalized = normalizeEvidence(txHash, evidence);
    } catch {
      return this.result(txHash, 'unavailable', [], false, unavailableEvidence(txHash));
    }
    if (!normalized.valid) {
      return this.result(txHash, 'unavailable', [], false, normalized.evidence);
    }
    return this.classify(txHash, normalized.evidence);
  }

  private classify(txHash: string, evidence: ChainTransactionEvidence[]): DonationVerifyResult {
    const mined = evidence.filter(item => item.state === 'mined');
    const successful = mined.filter(item => item.minedSuccessfully);
    const verified = this.collectTransfers(successful, transfer => transfer.supported && transfer.toRecipient);
    if (!verified.valid) return this.result(txHash, 'unavailable', [], false, unavailableEvidence(txHash));
    if (verified.total > 0) {
      return this.result(txHash, 'verified', verified.transfers, true, evidence, undefined, verified.total);
    }

    const wrongRecipient = this.collectTransfers(successful, transfer => transfer.supported && !transfer.toRecipient);
    if (!wrongRecipient.valid) return this.result(txHash, 'unavailable', [], false, unavailableEvidence(txHash));
    if (wrongRecipient.total > 0) {
      return this.result(
        txHash,
        'wrong_recipient',
        wrongRecipient.transfers,
        true,
        evidence,
        undefined,
        wrongRecipient.total,
      );
    }

    const unsupported = this.collectTransfers(successful, transfer => !transfer.supported);
    if (!unsupported.valid) return this.result(txHash, 'unavailable', [], false, unavailableEvidence(txHash));
    if (unsupported.total > 0 || successful.length > 0) {
      return this.result(
        txHash,
        'unsupported',
        unsupported.transfers,
        true,
        evidence,
        successful[0],
        unsupported.total,
      );
    }

    if (mined.length > 0) return this.result(txHash, 'failed', [], false, evidence, mined[0]);
    if (evidence.some(item => item.state === 'pending')) return this.result(txHash, 'pending', [], false, evidence);
    if (evidence.length > 0 && evidence.every(item => item.state === 'absent')) {
      return this.result(txHash, 'absent', [], false, evidence);
    }
    return this.result(txHash, 'unavailable', [], false, evidence);
  }

  private collectTransfers(
    evidence: ChainTransactionEvidence[],
    predicate: (transfer: ClassifiedTransfer) => boolean,
  ): ClassifiedTransferWindow {
    const results: DonationTransferResult[] = [];
    let total = 0;
    for (const chain of evidence) {
      for (const raw of chain.transfers) {
        const classified = this.classifyTransfer(chain, raw);
        if (!predicate(classified)) continue;
        total += 1;
        if (total > MAX_CLASSIFIED_TRANSFERS) return { valid: false, transfers: [], total: 0 };
        if (results.length < MAX_PUBLIC_TRANSFERS) {
          results.push(this.toResult(chain, raw, classified.token));
        }
      }
    }
    return { valid: true, transfers: results, total };
  }

  private classifyTransfer(chain: ChainTransactionEvidence, transfer: ChainTransferEvidence): ClassifiedTransfer {
    const token = getSupportedDonationAsset(chain.chainId, transfer.tokenAddress);
    return {
      token,
      supported: token !== undefined,
      toRecipient: transfer.to.toLowerCase() === RECIPIENT_ADDRESS.toLowerCase(),
    };
  }

  private toResult(
    chain: ChainTransactionEvidence,
    transfer: ChainTransferEvidence,
    token: TokenConfig | undefined,
  ): DonationTransferResult {
    return {
      chainId: chain.chainId,
      chainName: token?.chainName ?? chain.chainName,
      from: transfer.from,
      to: transfer.to,
      amount: token ? formatDecimal(transfer.amount, token.decimals) : transfer.amount,
      symbol: token?.symbol ?? 'Unsupported asset',
      tokenAddress: transfer.tokenAddress,
    };
  }

  private result(
    txHash: string,
    status: DonationVerificationStatus,
    transfers: DonationTransferResult[],
    minedSuccessfully: boolean,
    chainEvidence: ChainTransactionEvidence[],
    evidence?: ChainTransactionEvidence,
    classifiedTransferCount = transfers.length,
  ): DonationVerifyResult {
    const chainId = transfers[0]?.chainId ?? evidence?.chainId;
    const chain = chainId === undefined ? undefined : getSupportedDonationChain(chainId);
    const chainStatuses: DonationChainStatus[] = chainEvidence.map(item => ({
      chainId: item.chainId,
      chainName: item.chainName,
      state: item.state,
      ...(item.state === 'mined' ? { minedSuccessfully: item.minedSuccessfully } : {}),
    }));
    return {
      txHash,
      status,
      minedSuccessfully,
      transfers,
      explorerUrl: chain ? `${chain.explorerTransactionUrl}${txHash}` : '',
      chainStatuses,
      classifiedTransferCount,
    };
  }
}

function normalizeEvidence(
  txHash: string,
  evidence: unknown,
): { valid: boolean; evidence: ChainTransactionEvidence[] } {
  if (!Array.isArray(evidence) || evidence.length !== SUPPORTED_DONATION_CHAINS.length) {
    return { valid: false, evidence: unavailableEvidence(txHash) };
  }
  const byChain = new Map<number, ChainTransactionEvidence>();

  for (const value of evidence) {
    const item = snapshotEvidence(value);
    const expected = getSupportedDonationChain(item.chainId);
    if (!expected || byChain.has(item.chainId) || item.chainName !== expected.chainName
      || typeof item.txHash !== 'string' || item.txHash.toLowerCase() !== txHash.toLowerCase()
      || !isValidEvidenceShape(item)) {
      return { valid: false, evidence: unavailableEvidence(txHash) };
    }
    byChain.set(item.chainId, item);
  }

  const normalized = SUPPORTED_DONATION_CHAINS.map(chain => byChain.get(chain.chainId));
  if (normalized.some(item => item === undefined)) {
    return { valid: false, evidence: unavailableEvidence(txHash) };
  }
  return { valid: true, evidence: normalized as ChainTransactionEvidence[] };
}

function unavailableEvidence(txHash: string): ChainTransactionEvidence[] {
  return SUPPORTED_DONATION_CHAINS.map(chain => ({
    txHash,
    chainId: chain.chainId,
    chainName: chain.chainName,
    state: 'unavailable',
    transfers: [],
  }));
}

function snapshotEvidence(value: unknown): ChainTransactionEvidence {
  if (!value || typeof value !== 'object') throw new Error('Invalid donation evidence record');
  const rawTransfers = ownDataValue(value, 'transfers');
  if (!Array.isArray(rawTransfers)) throw new Error('Invalid donation transfer collection');
  const transferCount = ownDataValue(rawTransfers, 'length');
  if (typeof transferCount !== 'number'
    || !Number.isSafeInteger(transferCount)
    || transferCount < 0
    || transferCount > MAX_CLASSIFIED_TRANSFERS) {
    throw new Error('Donation transfer collection exceeds its safe bound');
  }
  const transfers: ChainTransferEvidence[] = [];
  for (let index = 0; index < transferCount; index += 1) {
    transfers.push(snapshotTransfer(ownDataValue(rawTransfers, String(index))));
  }
  return {
    txHash: ownDataValue(value, 'txHash') as string,
    chainId: ownDataValue(value, 'chainId') as number,
    chainName: ownDataValue(value, 'chainName') as string,
    state: ownDataValue(value, 'state') as ChainTransactionEvidence['state'],
    minedSuccessfully: optionalOwnDataValue(value, 'minedSuccessfully') as boolean | undefined,
    blockNumber: optionalOwnDataValue(value, 'blockNumber') as number | undefined,
    transfers,
  };
}

function snapshotTransfer(value: unknown): ChainTransferEvidence {
  if (!value || typeof value !== 'object') throw new Error('Invalid donation transfer record');
  return {
    from: ownDataValue(value, 'from') as string,
    to: ownDataValue(value, 'to') as string,
    amount: ownDataValue(value, 'amount') as string,
    tokenAddress: ownDataValue(value, 'tokenAddress') as string | null,
  };
}

function ownDataValue(value: object, property: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, property);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw new Error('Donation evidence must use stable data properties');
  }
  return descriptor.value;
}

function optionalOwnDataValue(value: object, property: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, property);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) {
    throw new Error('Donation evidence must use stable data properties');
  }
  return descriptor.value;
}

function isValidEvidenceShape(item: ChainTransactionEvidence): boolean {
  if (!Array.isArray(item.transfers) || item.transfers.length > MAX_CLASSIFIED_TRANSFERS) return false;
  if (!['unavailable', 'absent', 'pending', 'mined'].includes(item.state)) return false;
  if (item.state === 'mined') {
    return typeof item.minedSuccessfully === 'boolean'
      && Number.isSafeInteger(item.blockNumber)
      && (item.blockNumber ?? -1) >= 0
      && item.transfers.every(isValidTransferEvidence);
  }
  return item.minedSuccessfully === undefined
    && item.blockNumber === undefined
    && item.transfers.length === 0;
}

function isValidTransferEvidence(value: unknown): value is ChainTransferEvidence {
  if (!value || typeof value !== 'object') return false;
  const transfer = value as Partial<ChainTransferEvidence>;
  return typeof transfer.from === 'string'
    && isAddress(transfer.from)
    && typeof transfer.to === 'string'
    && isAddress(transfer.to)
    && (transfer.tokenAddress === null
      || (typeof transfer.tokenAddress === 'string' && isAddress(transfer.tokenAddress)))
    && isPositiveInteger(transfer.amount);
}

function isPositiveInteger(value: unknown): value is string {
  try {
    return typeof value === 'string'
      && value.length <= MAX_EVM_AMOUNT_LENGTH
      && /^[1-9]\d*$/.test(value)
      && BigInt(value) > 0n
      && BigInt(value) <= MAX_UINT256;
  } catch {
    return false;
  }
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

interface ClassifiedTransfer {
  token: TokenConfig | undefined;
  supported: boolean;
  toRecipient: boolean;
}

interface ClassifiedTransferWindow {
  valid: boolean;
  transfers: DonationTransferResult[];
  total: number;
}

function formatDecimal(rawAmount: string, decimals: number): string {
  if (decimals === 0) return rawAmount;
  const padded = rawAmount.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, -decimals) || '0';
  const fracPart = padded.slice(-decimals).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}
