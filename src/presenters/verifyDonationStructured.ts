import {
  RECIPIENT_ADDRESS,
  SUPPORTED_DONATION_CHAINS,
  getSupportedDonationAsset,
  getSupportedDonationChain,
  type DonationVerifyResult,
} from '../kernel/donation-types.js';
import type {
  VerifyDonationOutputV1,
  VerifyDonationStatus,
} from '../mcp/schemas/verifyDonation.js';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const MAX_PUBLIC_TRANSFERS = 100;
const MAX_CLASSIFIED_TRANSFERS = 1_000_000;

const OUTCOMES: Record<VerifyDonationStatus, VerifyDonationOutputV1['classification']['transactionOutcome']> = {
  verified: 'mined_successfully',
  wrong_recipient: 'mined_successfully',
  unsupported: 'mined_successfully',
  failed: 'reverted',
  pending: 'pending',
  absent: 'not_found',
  unavailable: 'indeterminate',
};

/** Present only bounded, decision-relevant donation evidence. */
export function presentVerifyDonationStructured(result: DonationVerifyResult): VerifyDonationOutputV1 {
  if (!HASH_PATTERN.test(result.txHash)) throw new Error('Donation result has an invalid transaction hash');
  const checks = normalizeChecks(result);
  validateClassificationEvidence(result, checks);
  const transfers = result.transfers.map(transfer => {
    const chain = getSupportedDonationChain(transfer.chainId);
    if (!chain || chain.chainName !== transfer.chainName) throw new Error('Donation transfer has invalid chain identity');
    const check = checks.find(candidate => candidate.chainId === transfer.chainId);
    if (check?.state !== 'mined' || check.minedSuccessfully !== true) {
      throw new Error('Donation transfer is not backed by a successful mined chain check');
    }
    if (!ADDRESS_PATTERN.test(transfer.from) || !ADDRESS_PATTERN.test(transfer.to)) {
      throw new Error('Donation transfer has an invalid address');
    }
    if (transfer.tokenAddress !== null && !ADDRESS_PATTERN.test(transfer.tokenAddress)) {
      throw new Error('Donation transfer has an invalid asset address');
    }
    const token = getSupportedDonationAsset(transfer.chainId, transfer.tokenAddress);
    const recipient = transfer.to.toLowerCase() === RECIPIENT_ADDRESS.toLowerCase();
    const configuredAsset = token !== undefined;

    if (configuredAsset && transfer.symbol !== token.symbol) {
      throw new Error('Donation transfer symbol does not match the configured asset');
    }
    if (!configuredAsset && transfer.symbol !== 'Unsupported asset') {
      throw new Error('Unsupported donation transfer has an inconsistent symbol');
    }

    if (result.status === 'verified' && (!configuredAsset || !recipient)) {
      throw new Error('Verified donation transfer does not satisfy verification policy');
    }
    if (result.status === 'wrong_recipient' && (!configuredAsset || recipient)) {
      throw new Error('Wrong-recipient transfer does not satisfy classification policy');
    }
    if (result.status === 'unsupported' && configuredAsset) {
      throw new Error('Unsupported transfer matches a configured asset');
    }
    if (!isPositiveAmount(transfer.amount, configuredAsset)) {
      throw new Error('Donation transfer has a non-canonical amount');
    }

    return {
      chainId: chain.chainId,
      chainName: chain.chainName,
      from: transfer.from,
      to: transfer.to,
      amount: {
        value: transfer.amount,
        unit: configuredAsset ? 'asset_decimal' as const : 'raw_base_units' as const,
        decimals: token?.decimals ?? null,
      },
      asset: {
        support: configuredAsset ? 'supported' as const : 'unsupported' as const,
        kind: transfer.tokenAddress === null ? 'native' as const : 'token' as const,
        symbol: token?.symbol ?? null,
        address: token ? (token.isNative ? null : token.asset) : transfer.tokenAddress,
      },
      matches: { configuredAsset, recipient },
    };
  });

  if (transfers.length > MAX_PUBLIC_TRANSFERS) throw new Error('Donation transfer result exceeded its public bound');
  if (['unavailable', 'absent', 'pending', 'failed'].includes(result.status) && transfers.length > 0) {
    throw new Error('Non-transfer donation classification included transfers');
  }
  if (['verified', 'wrong_recipient'].includes(result.status) && transfers.length === 0) {
    throw new Error('Transfer donation classification omitted transfers');
  }
  const classifiedTotal = result.classifiedTransferCount ?? transfers.length;
  if (!Number.isSafeInteger(classifiedTotal)
    || classifiedTotal < transfers.length
    || classifiedTotal > MAX_CLASSIFIED_TRANSFERS
    || (classifiedTotal > transfers.length && transfers.length !== MAX_PUBLIC_TRANSFERS)) {
    throw new Error('Donation transfer count is invalid');
  }
  const checkedChainCount = checks.filter(check => check.state !== 'unavailable').length;
  const explorerLinks = checks.flatMap(check => {
    if (check.state !== 'pending' && check.state !== 'mined') return [];
    const chain = getSupportedDonationChain(check.chainId);
    if (!chain || chain.chainName !== check.chainName) {
      throw new Error('Donation explorer link has invalid chain identity');
    }
    return [{
      chainId: chain.chainId,
      chainName: chain.chainName,
      url: `${chain.explorerTransactionUrl}${result.txHash}`,
    }];
  });
  if (new Set(explorerLinks.map(link => link.chainId)).size !== explorerLinks.length) {
    throw new Error('Donation explorer links contain duplicate chains');
  }
  if (result.explorerUrl && !explorerLinks.some(link => link.url === result.explorerUrl)) {
    throw new Error('Legacy donation explorer link does not match observed chain evidence');
  }

  return {
    schemaVersion: '1',
    kind: 'verify_donation',
    txHash: result.txHash,
    recipientAddress: RECIPIENT_ADDRESS,
    classification: {
      status: result.status,
      donationVerified: result.status === 'verified',
      transactionOutcome: OUTCOMES[result.status],
    },
    coverage: {
      availability: checkedChainCount === SUPPORTED_DONATION_CHAINS.length
        ? 'complete'
        : checkedChainCount === 0 ? 'unavailable' : 'partial',
      checkedChainCount,
      supportedChainCount: SUPPORTED_DONATION_CHAINS.length,
    },
    chainChecks: checks,
    transfers,
    transferWindow: {
      returnedCount: transfers.length,
      classifiedTotal,
      truncated: classifiedTotal > transfers.length,
    },
    explorerLinks,
    verificationPolicy: {
      successCriterion: 'successful_receipt_supported_asset_recipient_match',
      finality: 'receipt_observed_no_confirmation_depth',
      providerFailureHandling: 'fail_closed',
    },
  };
}

function normalizeChecks(result: DonationVerifyResult): VerifyDonationOutputV1['chainChecks'] {
  const statuses = result.chainStatuses;
  if (!statuses || statuses.length !== SUPPORTED_DONATION_CHAINS.length) {
    throw new Error('Donation result does not cover every supported chain');
  }
  return SUPPORTED_DONATION_CHAINS.map(chain => {
    const matching = statuses.filter(status => status.chainId === chain.chainId);
    if (matching.length !== 1 || matching[0].chainName !== chain.chainName) {
      throw new Error('Donation result has missing, duplicate, or mismatched chain evidence');
    }
    const status = matching[0];
    if (status.state === 'mined' && typeof status.minedSuccessfully !== 'boolean') {
      throw new Error('Mined chain evidence omitted receipt outcome');
    }
    if (status.state !== 'mined' && status.minedSuccessfully !== undefined) {
      throw new Error('Unmined chain evidence included a receipt outcome');
    }
    return {
      chainId: chain.chainId,
      chainName: chain.chainName,
      state: status.state,
      minedSuccessfully: status.state === 'mined' ? status.minedSuccessfully! : null,
    };
  });
}

function validateClassificationEvidence(
  result: DonationVerifyResult,
  checks: VerifyDonationOutputV1['chainChecks'],
): void {
  const successful = checks.filter(check => check.state === 'mined' && check.minedSuccessfully === true);
  const reverted = checks.filter(check => check.state === 'mined' && check.minedSuccessfully === false);
  const pending = checks.filter(check => check.state === 'pending');
  const unavailable = checks.filter(check => check.state === 'unavailable');
  const successStatus = ['verified', 'wrong_recipient', 'unsupported'].includes(result.status);

  if (result.minedSuccessfully !== successStatus) {
    throw new Error('Donation receipt outcome does not match its classification');
  }

  switch (result.status) {
    case 'verified':
    case 'wrong_recipient':
    case 'unsupported':
      if (successful.length === 0) {
        throw new Error('Successful donation classification lacks a successful mined check');
      }
      return;
    case 'failed':
      if (reverted.length === 0 || successful.length > 0) {
        throw new Error('Failed donation classification lacks exclusive reverted evidence');
      }
      return;
    case 'pending':
      if (pending.length === 0 || successful.length > 0 || reverted.length > 0) {
        throw new Error('Pending donation classification does not match chain evidence');
      }
      return;
    case 'absent':
      if (!checks.every(check => check.state === 'absent')) {
        throw new Error('Absent donation classification does not match chain evidence');
      }
      return;
    case 'unavailable':
      if (unavailable.length === 0 || successful.length > 0 || reverted.length > 0 || pending.length > 0) {
        throw new Error('Unavailable donation classification does not match chain evidence');
      }
      return;
  }
}

function isPositiveAmount(value: string, decimal: boolean): boolean {
  if (value.length > 100) return false;
  return decimal
    ? /^(?:[1-9]\d*|0\.\d*[1-9]|[1-9]\d*\.\d*[1-9])$/.test(value)
    : /^[1-9]\d*$/.test(value);
}
