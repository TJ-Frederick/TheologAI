import { describe, it, expect } from 'vitest';
import { formatDonationConfig, formatDonationConfigHuman, formatDonationVerifyResult } from '../../../src/formatters/donationFormatter.js';
import type { DonationConfig, DonationVerifyResult } from '../../../src/kernel/donation-types.js';

// ── Fixture factories ──

function makeDonationConfig(overrides: Partial<DonationConfig> = {}): DonationConfig {
  return {
    recipientAddress: '0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04',
    tokens: [
      { symbol: 'USDC', name: 'USD Coin', chainId: 8453, chainName: 'Base', network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, isNative: false, x402Supported: true },
      { symbol: 'ETH', name: 'Ether', chainId: 1, chainName: 'Ethereum', network: 'eip155:1', asset: 'native', decimals: 18, isNative: true, x402Supported: false },
    ],
    facilitators: [
      { name: 'Coinbase', url: 'https://x402.org/facilitator', networks: ['eip155:8453'], requiresApiKey: false },
    ],
    x402PayEndpoint: 'https://test.example.com/x402/pay',
    ...overrides,
  };
}

function makeDonationVerifyResult(overrides: Partial<DonationVerifyResult> = {}): DonationVerifyResult {
  return {
    txHash: '0x' + 'ab'.repeat(32),
    chainId: 8453,
    chainName: 'Base',
    from: '0x' + '11'.repeat(20),
    amount: '1.5',
    symbol: 'USDC',
    confirmed: true,
    isToRecipient: true,
    explorerUrl: 'https://basescan.org/tx/0x' + 'ab'.repeat(32),
    ...overrides,
  };
}

describe('formatDonationConfig', () => {
  it('includes recipient address', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04');
  });

  it('lists tokens in a table', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('USDC');
    expect(out).toContain('ETH');
    expect(out).toContain('Base');
    expect(out).toContain('Ethereum');
  });

  it('marks x402-supported tokens', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('Yes');
    expect(out).toContain('No');
  });

  it('includes facilitator info', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('Coinbase');
    expect(out).toContain('eip155:8453');
  });

  it('includes x402 endpoint', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('https://test.example.com/x402/pay');
  });

  it('includes voluntary disclaimer', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('voluntary');
    expect(out).toContain('do not gate');
  });

  it('returns trimmed output', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toBe(out.trim());
  });

  it('shows native for native tokens', () => {
    const out = formatDonationConfig(makeDonationConfig());
    expect(out).toContain('native');
  });
});

describe('formatDonationConfigHuman', () => {
  it('includes recipient address', () => {
    const out = formatDonationConfigHuman(makeDonationConfig());
    expect(out).toContain('0xf2BE3382cF48ef5CAf21Ca3B01C4e6fC3Ea04B04');
  });

  it('includes web UI link', () => {
    const out = formatDonationConfigHuman(makeDonationConfig());
    expect(out).toContain('theologai.pages.dev');
  });

  it('lists transfer options in plain language', () => {
    const out = formatDonationConfigHuman(makeDonationConfig());
    expect(out).toContain('USDC on Base');
    expect(out).toContain('Ethereum');
    expect(out).toContain('Radius');
  });

  it('includes voluntary disclaimer', () => {
    const out = formatDonationConfigHuman(makeDonationConfig());
    expect(out).toContain('voluntary');
  });

  it('includes wallet tool hint', () => {
    const out = formatDonationConfigHuman(makeDonationConfig());
    expect(out).toContain('wallet MCP tool');
    expect(out).toContain('donation_config');
  });

  it('does not include contract addresses or facilitator details', () => {
    const out = formatDonationConfigHuman(makeDonationConfig());
    expect(out).not.toContain('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(out).not.toContain('Coinbase');
    expect(out).not.toContain('x402.org');
  });

  it('returns trimmed output', () => {
    const out = formatDonationConfigHuman(makeDonationConfig());
    expect(out).toBe(out.trim());
  });
});

describe('formatDonationVerifyResult', () => {
  it('includes amount and symbol', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult());
    expect(out).toContain('1.5');
    expect(out).toContain('USDC');
  });

  it('shows Confirmed status', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult({ confirmed: true }));
    expect(out).toContain('Confirmed');
  });

  it('shows Pending status', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult({ confirmed: false }));
    expect(out).toContain('Pending');
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

  it('shows thank-you when isToRecipient', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult({ isToRecipient: true }));
    expect(out).toContain('Thank you');
  });

  it('shows warning when not sent to recipient', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult({ isToRecipient: false }));
    expect(out).toContain('Warning');
    expect(out).not.toContain('Thank you');
  });

  it('returns trimmed output', () => {
    const out = formatDonationVerifyResult(makeDonationVerifyResult());
    expect(out).toBe(out.trim());
  });
});
