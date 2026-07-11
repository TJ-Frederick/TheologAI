/** Classifies chain evidence against TheologAI's donation policy. */

import { PaymentError } from '../../kernel/errors.js';
import {
  RECIPIENT_ADDRESS,
  SUPPORTED_TOKENS,
  EXPLORER_URLS,
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

export class DonationService {
  constructor(private readonly evidenceProvider: ITransactionEvidenceProvider) {}

  getConfig(): DonationConfig {
    return { recipientAddress: RECIPIENT_ADDRESS, tokens: SUPPORTED_TOKENS };
  }

  async verifyDonation(txHash: string): Promise<DonationVerifyResult> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new PaymentError('Invalid transaction hash format. Expected 0x-prefixed 64-char hex string.');
    }

    const evidence = await this.evidenceProvider.getEvidence(txHash);
    return this.classify(txHash, evidence);
  }

  private classify(txHash: string, evidence: ChainTransactionEvidence[]): DonationVerifyResult {
    const mined = evidence.filter(item => item.state === 'mined');
    const successful = mined.filter(item => item.minedSuccessfully);
    const verified = this.collectTransfers(successful, transfer => transfer.supported && transfer.toRecipient);
    if (verified.length > 0) return this.result(txHash, 'verified', verified, true, evidence);

    const wrongRecipient = this.collectTransfers(successful, transfer => transfer.supported && !transfer.toRecipient);
    if (wrongRecipient.length > 0) return this.result(txHash, 'wrong_recipient', wrongRecipient, true, evidence);

    const unsupported = this.collectTransfers(successful, transfer => !transfer.supported);
    if (unsupported.length > 0 || successful.length > 0) {
      return this.result(txHash, 'unsupported', unsupported, true, evidence, successful[0]);
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
  ): DonationTransferResult[] {
    const results: DonationTransferResult[] = [];
    for (const chain of evidence) {
      for (const raw of chain.transfers) {
        if (!isPositiveInteger(raw.amount)) continue;
        const classified = this.classifyTransfer(chain, raw);
        if (!predicate(classified)) continue;
        results.push(this.toResult(chain, raw, classified.token));
      }
    }
    return results;
  }

  private classifyTransfer(chain: ChainTransactionEvidence, transfer: ChainTransferEvidence): ClassifiedTransfer {
    const token = SUPPORTED_TOKENS.find(candidate => {
      if (candidate.chainId !== chain.chainId) return false;
      if (candidate.isNative) return transfer.tokenAddress === null;
      return transfer.tokenAddress?.toLowerCase() === candidate.asset.toLowerCase();
    });
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
  ): DonationVerifyResult {
    const chainId = transfers[0]?.chainId ?? evidence?.chainId;
    const chainStatuses: DonationChainStatus[] = chainEvidence.map(item => ({
      chainId: item.chainId,
      chainName: item.chainName,
      state: item.state,
    }));
    return {
      txHash,
      status,
      minedSuccessfully,
      transfers,
      explorerUrl: chainId && EXPLORER_URLS[chainId] ? `${EXPLORER_URLS[chainId]}${txHash}` : '',
      chainStatuses,
    };
  }
}

function isPositiveInteger(value: string): boolean {
  try {
    return /^\d+$/.test(value) && BigInt(value) > 0n;
  } catch {
    return false;
  }
}

interface ClassifiedTransfer {
  token: TokenConfig | undefined;
  supported: boolean;
  toRecipient: boolean;
}

function formatDecimal(rawAmount: string, decimals: number): string {
  if (decimals === 0) return rawAmount;
  const padded = rawAmount.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, -decimals) || '0';
  const fracPart = padded.slice(-decimals).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}
