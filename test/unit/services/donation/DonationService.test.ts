import { describe, expect, it, vi } from 'vitest';
import { DonationService } from '../../../../src/services/donation/DonationService.js';
import { PaymentError } from '../../../../src/kernel/errors.js';
import { RECIPIENT_ADDRESS, type ChainTransactionEvidence, type ITransactionEvidenceProvider } from '../../../../src/kernel/donation-types.js';

const HASH = `0x${'ab'.repeat(32)}`;
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const OTHER = `0x${'99'.repeat(20)}`;
const FROM = `0x${'11'.repeat(20)}`;

function evidence(overrides: Partial<ChainTransactionEvidence> = {}): ChainTransactionEvidence {
  return {
    txHash: HASH,
    chainId: 8453,
    chainName: 'Base',
    state: 'mined',
    minedSuccessfully: true,
    blockNumber: 100,
    transfers: [{ from: FROM, to: RECIPIENT_ADDRESS, amount: '1500000', tokenAddress: USDC }],
    ...overrides,
  };
}
function service(items: ChainTransactionEvidence[]) {
  const provider: ITransactionEvidenceProvider = { getEvidence: vi.fn().mockResolvedValue(items) };
  return { donation: new DonationService(provider), provider };
}

describe('DonationService classification', () => {
  it('verifies every supported transfer sent to the recipient', async () => {
    const { donation } = service([evidence({
      transfers: [
        { from: FROM, to: OTHER, amount: '999', tokenAddress: OTHER },
        { from: FROM, to: RECIPIENT_ADDRESS, amount: '1500000', tokenAddress: USDC },
        { from: FROM, to: RECIPIENT_ADDRESS.toLowerCase(), amount: '500000', tokenAddress: USDC },
      ],
    })]);
    const result = await donation.verifyDonation(HASH);
    expect(result.status).toBe('verified');
    expect(result.transfers.map(item => item.amount)).toEqual(['1.5', '0.5']);
    expect(result.transfers.every(item => item.symbol === 'USDC')).toBe(true);
  });

  it('does not false-confirm a supported transfer sent elsewhere', async () => {
    const { donation } = service([evidence({ transfers: [{ from: FROM, to: OTHER, amount: '1', tokenAddress: USDC }] })]);
    const result = await donation.verifyDonation(HASH);
    expect(result.status).toBe('wrong_recipient');
    expect(result.minedSuccessfully).toBe(true);
  });

  it('does not false-confirm an unsupported token sent to the recipient', async () => {
    const { donation } = service([evidence({ transfers: [{ from: FROM, to: RECIPIENT_ADDRESS, amount: '7', tokenAddress: OTHER }] })]);
    const result = await donation.verifyDonation(HASH);
    expect(result.status).toBe('unsupported');
    expect(result.transfers[0].symbol).toBe('Unsupported asset');
  });

  it('does not confirm zero or malformed transfer amounts from an evidence provider', async () => {
    const { donation } = service([evidence({
      transfers: [
        { from: FROM, to: RECIPIENT_ADDRESS, amount: '0', tokenAddress: USDC },
        { from: FROM, to: RECIPIENT_ADDRESS, amount: 'not-an-integer', tokenAddress: USDC },
      ],
    })]);
    expect(await donation.verifyDonation(HASH)).toMatchObject({ status: 'unsupported', transfers: [] });
  });

  it('recognizes supported native transfers', async () => {
    const { donation } = service([evidence({ transfers: [{ from: FROM, to: RECIPIENT_ADDRESS, amount: '1000000000000000000', tokenAddress: null }] })]);
    const result = await donation.verifyDonation(HASH);
    expect(result).toMatchObject({ status: 'verified', transfers: [{ amount: '1', symbol: 'ETH' }] });
  });

  it.each([
    ['unavailable', evidence({ state: 'unavailable', minedSuccessfully: undefined, transfers: [] })],
    ['absent', evidence({ state: 'absent', minedSuccessfully: undefined, transfers: [] })],
    ['pending', evidence({ state: 'pending', minedSuccessfully: undefined, transfers: [] })],
    ['failed', evidence({ state: 'mined', minedSuccessfully: false, transfers: [] })],
    ['unsupported', evidence({ state: 'mined', minedSuccessfully: true, transfers: [] })],
  ] as const)('returns %s without claiming a donation', async (status, item) => {
    const { donation } = service([item]);
    expect(await donation.verifyDonation(HASH)).toMatchObject({ status, transfers: [] });
  });

  it('keeps partial outages honest while exposing healthy per-chain evidence', async () => {
    const { donation } = service([
      evidence({ state: 'absent', minedSuccessfully: undefined, transfers: [] }),
      evidence({ chainId: 1, chainName: 'Ethereum', state: 'unavailable', minedSuccessfully: undefined, transfers: [] }),
    ]);
    const result = await donation.verifyDonation(HASH);
    expect(result.status).toBe('unavailable');
    expect(result.chainStatuses).toEqual([
      { chainId: 8453, chainName: 'Base', state: 'absent' },
      { chainId: 1, chainName: 'Ethereum', state: 'unavailable' },
    ]);
  });

  it('does not let a partial outage hide a verified healthy-chain transfer', async () => {
    const { donation } = service([
      evidence(),
      evidence({ chainId: 1, chainName: 'Ethereum', state: 'unavailable', minedSuccessfully: undefined, transfers: [] }),
    ]);

    const result = await donation.verifyDonation(HASH);

    expect(result.status).toBe('verified');
    expect(result.chainStatuses).toEqual([
      { chainId: 8453, chainName: 'Base', state: 'mined' },
      { chainId: 1, chainName: 'Ethereum', state: 'unavailable' },
    ]);
  });

  it('reports total outage without claiming absence', async () => {
    const { donation } = service([
      evidence({ state: 'unavailable', minedSuccessfully: undefined, transfers: [] }),
      evidence({ chainId: 1, chainName: 'Ethereum', state: 'unavailable', minedSuccessfully: undefined, transfers: [] }),
      evidence({ chainId: 723, chainName: 'Radius', state: 'unavailable', minedSuccessfully: undefined, transfers: [] }),
    ]);

    const result = await donation.verifyDonation(HASH);

    expect(result).toMatchObject({ status: 'unavailable', transfers: [] });
    expect(result.chainStatuses?.every(item => item.state === 'unavailable')).toBe(true);
  });

  it('rejects malformed hashes before querying providers', async () => {
    const { donation, provider } = service([]);
    await expect(donation.verifyDonation('bad')).rejects.toThrow(PaymentError);
    expect(provider.getEvidence).not.toHaveBeenCalled();
  });
});
