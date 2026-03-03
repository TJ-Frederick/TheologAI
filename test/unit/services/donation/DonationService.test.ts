import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DonationService } from '../../../../src/services/donation/DonationService.js';
import { PaymentError } from '../../../../src/kernel/errors.js';
import { RECIPIENT_ADDRESS, SUPPORTED_TOKENS, FACILITATORS } from '../../../../src/kernel/donation-types.js';

// ── Mock factory ──

function makeMockVerifier(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    verify: vi.fn().mockResolvedValue({
      txHash: '0x' + 'ab'.repeat(32),
      chainId: 8453,
      from: '0x' + '11'.repeat(20),
      to: RECIPIENT_ADDRESS,
      amount: '1500000',
      symbol: 'USDC',
      tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      blockNumber: 12345,
      confirmed: true,
      ...overrides,
    }),
    dispose: vi.fn(),
  };
}

describe('DonationService', () => {
  let service: DonationService;
  let mockVerifier: ReturnType<typeof makeMockVerifier>;

  beforeEach(() => {
    mockVerifier = makeMockVerifier();
    service = new DonationService(mockVerifier as any, 'https://test.example.com');
  });

  describe('getConfig', () => {
    it('returns correct recipient address', () => {
      const config = service.getConfig();
      expect(config.recipientAddress).toBe(RECIPIENT_ADDRESS);
    });

    it('returns all 5 supported tokens', () => {
      const config = service.getConfig();
      expect(config.tokens).toHaveLength(5);
    });

    it('returns facilitators', () => {
      const config = service.getConfig();
      expect(config.facilitators).toEqual(FACILITATORS);
    });

    it('returns x402 pay endpoint', () => {
      const config = service.getConfig();
      expect(config.x402PayEndpoint).toBe('https://test.example.com/x402/pay');
    });
  });

  describe('verifyDonation', () => {
    it('formats USDC amount correctly (6 decimals)', async () => {
      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.amount).toBe('1.5');
      expect(result.symbol).toBe('USDC');
    });

    it('formats ETH amount correctly (18 decimals)', async () => {
      mockVerifier = makeMockVerifier({
        chainId: 1,
        amount: '1000000000000000000',
        symbol: 'ETH',
        tokenAddress: null,
      });
      service = new DonationService(mockVerifier as any, 'https://test.example.com');

      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.amount).toBe('1');
      expect(result.symbol).toBe('ETH');
    });

    it('formats small USDC amounts', async () => {
      mockVerifier = makeMockVerifier({ amount: '100000' });
      service = new DonationService(mockVerifier as any, 'https://test.example.com');

      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.amount).toBe('0.1');
    });

    it('formats whole number amounts without trailing decimal', async () => {
      mockVerifier = makeMockVerifier({ amount: '5000000' });
      service = new DonationService(mockVerifier as any, 'https://test.example.com');

      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.amount).toBe('5');
    });

    it('sets isToRecipient true when to matches', async () => {
      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.isToRecipient).toBe(true);
    });

    it('sets isToRecipient false when to does not match', async () => {
      mockVerifier = makeMockVerifier({ to: '0x' + '99'.repeat(20) });
      service = new DonationService(mockVerifier as any, 'https://test.example.com');

      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.isToRecipient).toBe(false);
    });

    it('is case-insensitive for recipient check', async () => {
      mockVerifier = makeMockVerifier({ to: RECIPIENT_ADDRESS.toLowerCase() });
      service = new DonationService(mockVerifier as any, 'https://test.example.com');

      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.isToRecipient).toBe(true);
    });

    it('builds explorer URL for Base', async () => {
      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.explorerUrl).toContain('basescan.org');
    });

    it('builds explorer URL for Ethereum', async () => {
      mockVerifier = makeMockVerifier({ chainId: 1, symbol: 'ETH', amount: '1000000000000000000', tokenAddress: null });
      service = new DonationService(mockVerifier as any, 'https://test.example.com');

      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.explorerUrl).toContain('etherscan.io');
    });

    it('returns chainName from token config', async () => {
      const result = await service.verifyDonation('0x' + 'ab'.repeat(32));
      expect(result.chainName).toBe('Base');
    });

    it('throws PaymentError for invalid hash format', async () => {
      await expect(service.verifyDonation('not-a-hash')).rejects.toThrow(PaymentError);
      await expect(service.verifyDonation('')).rejects.toThrow(PaymentError);
      await expect(service.verifyDonation('0xshort')).rejects.toThrow(PaymentError);
    });

    it('calls verifier.verify with the tx hash', async () => {
      const hash = '0x' + 'ab'.repeat(32);
      await service.verifyDonation(hash);
      expect(mockVerifier.verify).toHaveBeenCalledWith(hash);
    });
  });
});
