/**
 * Donation service — business logic for donation config and verification.
 */

import type { OnChainVerifier } from '../../adapters/donation/OnChainVerifier.js';
import { PaymentError } from '../../kernel/errors.js';
import {
  RECIPIENT_ADDRESS,
  SUPPORTED_TOKENS,
  EXPLORER_URLS,
  type DonationConfig,
  type DonationVerifyResult,
} from '../../kernel/donation-types.js';

export class DonationService {
  constructor(private verifier: OnChainVerifier) {}

  getConfig(): DonationConfig {
    return {
      recipientAddress: RECIPIENT_ADDRESS,
      tokens: SUPPORTED_TOKENS,
    };
  }

  async verifyDonation(txHash: string): Promise<DonationVerifyResult> {
    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new PaymentError('Invalid transaction hash format. Expected 0x-prefixed 64-char hex string.');
    }

    const transfer = await this.verifier.verify(txHash);

    const isToRecipient = transfer.to.toLowerCase() === RECIPIENT_ADDRESS.toLowerCase();

    // Match token for decimal formatting
    const token = SUPPORTED_TOKENS.find(
      t => t.chainId === transfer.chainId && t.symbol === transfer.symbol,
    );
    const decimals = token?.decimals ?? 18;
    const chainName = token?.chainName ?? `Chain ${transfer.chainId}`;
    const explorerBase = EXPLORER_URLS[transfer.chainId] ?? '';

    return {
      txHash: transfer.txHash,
      chainId: transfer.chainId,
      chainName,
      from: transfer.from,
      amount: formatDecimal(transfer.amount, decimals),
      symbol: transfer.symbol,
      confirmed: transfer.confirmed,
      isToRecipient,
      explorerUrl: explorerBase ? `${explorerBase}${transfer.txHash}` : '',
    };
  }
}

/**
 * Convert raw integer amount string to human-readable decimal.
 * e.g. "1500000" with 6 decimals → "1.5"
 */
function formatDecimal(rawAmount: string, decimals: number): string {
  if (decimals === 0) return rawAmount;

  const padded = rawAmount.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, -decimals) || '0';
  const fracPart = padded.slice(-decimals).replace(/0+$/, '');

  return fracPart ? `${intPart}.${fracPart}` : intPart;
}
