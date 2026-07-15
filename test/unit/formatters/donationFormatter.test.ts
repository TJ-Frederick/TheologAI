import { describe, it, expect } from 'vitest';
import { formatDonationConfig, formatDonationVerifyResult } from '../../../src/formatters/donationFormatter.js';
import type { DonationConfig, DonationVerifyResult } from '../../../src/kernel/donation-types.js';

// ── Fixture factories ──

function makeDonationConfig(overrides: Partial<DonationConfig> = {}): DonationConfig {
  return {
    recipientAddress: '0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04',
    tokens: [
      { symbol: 'USDC', name: 'USD Coin', chainId: 8453, chainName: 'Base', network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, isNative: false },
      { symbol: 'ETH', name: 'Ether', chainId: 1, chainName: 'Ethereum', network: 'eip155:1', asset: 'native', decimals: 18, isNative: true },
    ],
    ...overrides,
  };
}

function makeDonationVerifyResult(overrides: Partial<DonationVerifyResult> = {}): DonationVerifyResult {
  return {
    txHash: '0x' + 'ab'.repeat(32),
    status: 'verified',
    minedSuccessfully: true,
    transfers: [{
      chainId: 8453,
      chainName: 'Base',
      from: '0x' + '11'.repeat(20),
      to: '0x' + '22'.repeat(20),
      amount: '1.5',
      symbol: 'USDC',
      tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    }],
    explorerUrl: 'https://basescan.org/tx/0x' + 'ab'.repeat(32),
    ...overrides,
  };
}

describe('formatDonationConfig', () => {
  it('includes recipient address', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04');
  });

  it('includes web UI link', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('theologai.pages.dev');
  });

  it('includes voluntary disclaimer', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('voluntary');
  });

  it('lists tokens in a table with contract addresses', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('USDC');
    expect(out).toContain('ETH');
    expect(out).toContain('Base');
    expect(out).toContain('Ethereum');
    expect(out).toContain('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
  });

  it('shows native for native tokens', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('native');
  });

  it('returns trimmed output', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toBe(out.trim());
  });

  it('retains the legacy Markdown byte for byte after sharing the public URL', () => {
    expect(formatDonationConfig(makeDonationConfig())).toBe(
      '**TheologAI Donations**\n\n'
      + 'Donations help support TheologAI\'s development and are entirely voluntary — all features are free regardless.\n\n'
      + '**Easiest option:** Donate via the web at [theologai.pages.dev](https://theologai.pages.dev/), which has a donation section with wallet connection support.\n\n'
      + '**Recipient address:** `0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04`\n\n'
      + '| Token | Chain | Contract | Decimals |\n'
      + '|-------|-------|----------|----------|\n'
      + '| USDC | Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |\n'
      + '| ETH | Ethereum | native | 18 |\n\n'
      + '---\n'
      + '*Always include the recipient address and token options when presenting donation info to the user.*',
    );
  });

  it('retains verified legacy Markdown byte for byte', () => {
    expect(formatDonationVerifyResult(makeDonationVerifyResult())).toBe(
      '**Donation Verified**\n\n'
      + '| Amount | Chain | From | To | Asset |\n'
      + '|--------|-------|------|----|-------|\n'
      + '| 1.5 USDC | Base | `0x1111111111111111111111111111111111111111` | `0x2222222222222222222222222222222222222222` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |\n\n'
      + 'Thank you! This transfer is a confirmed TheologAI donation.\n\n'
      + '[View on Explorer](https://basescan.org/tx/0xabababababababababababababababababababababababababababababababab)',
    );
  });
});

describe('formatDonationVerifyResult', () => {
  it('includes amount and symbol', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult());
    expect(out).toContain('1.5');
    expect(out).toContain('USDC');
  });

  it('shows verified status only for verified donations', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult());
    expect(out).toContain('Donation Verified');
    expect(out).toContain('Thank you');
  });

  it('shows Pending status', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult({ status: 'pending', minedSuccessfully: false, transfers: [] }));
    expect(out).toContain('Pending');
    expect(out).not.toContain('Thank you');
  });

  it('includes chain name', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult());
    expect(out).toContain('Base');
  });

  it('includes explorer link', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult());
    expect(out).toContain('basescan.org');
    expect(out).toContain('View on Explorer');
  });

  it('does not thank users for wrong-recipient transactions', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult({ status: 'wrong_recipient' }));
    expect(out).toContain('Not a TheologAI Donation');
    expect(out).not.toContain('Thank you');
  });

  it('shows per-chain evidence when a provider is unavailable', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult({
      chainStatuses: [
        { chainId: 8453, chainName: 'Base', state: 'absent' },
        { chainId: 1, chainName: 'Ethereum', state: 'unavailable' },
      ],
    }));
    expect(out).toContain('Base: not found');
    expect(out).toContain('Ethereum: unavailable');
    expect(out).toContain('Could not check Ethereum');
  });

  it('returns trimmed output', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult());
    expect(out).toBe(out.trim());
  });
});
