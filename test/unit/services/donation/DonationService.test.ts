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
function service(items: ChainTransactionEvidence[], complete = true) {
  const completed = complete ? [
    ...items,
    ...[
      { chainId: 1, chainName: 'Ethereum' },
      { chainId: 8453, chainName: 'Base' },
      { chainId: 723, chainName: 'Radius' },
    ].filter(chain => !items.some(item => item.chainId === chain.chainId)).map(chain => evidence({
      ...chain, state: 'absent', minedSuccessfully: undefined, blockNumber: undefined, transfers: [],
    })),
  ] : items;
  const provider: ITransactionEvidenceProvider = { getEvidence: vi.fn().mockResolvedValue(completed) };
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

  it('fails closed on zero or malformed transfer amounts from an evidence provider', async () => {
    const { donation } = service([evidence({
      transfers: [
        { from: FROM, to: RECIPIENT_ADDRESS, amount: '0', tokenAddress: USDC },
        { from: FROM, to: RECIPIENT_ADDRESS, amount: 'not-an-integer', tokenAddress: USDC },
      ],
    })]);
    const result = await donation.verifyDonation(HASH);
    expect(result).toMatchObject({ status: 'unavailable', transfers: [] });
    expect(result.chainStatuses?.every(item => item.state === 'unavailable')).toBe(true);
  });

  it('recognizes supported native transfers', async () => {
    const { donation } = service([evidence({ transfers: [{ from: FROM, to: RECIPIENT_ADDRESS, amount: '1000000000000000000', tokenAddress: null }] })]);
    const result = await donation.verifyDonation(HASH);
    expect(result).toMatchObject({ status: 'verified', transfers: [{ amount: '1', symbol: 'ETH' }] });
  });

  it.each([
    ['unavailable', evidence({ state: 'unavailable', minedSuccessfully: undefined, blockNumber: undefined, transfers: [] })],
    ['absent', evidence({ state: 'absent', minedSuccessfully: undefined, blockNumber: undefined, transfers: [] })],
    ['pending', evidence({ state: 'pending', minedSuccessfully: undefined, blockNumber: undefined, transfers: [] })],
    ['failed', evidence({ state: 'mined', minedSuccessfully: false, transfers: [] })],
    ['unsupported', evidence({ state: 'mined', minedSuccessfully: true, transfers: [] })],
  ] as const)('returns %s without claiming a donation', async (status, item) => {
    const { donation } = service([item]);
    expect(await donation.verifyDonation(HASH)).toMatchObject({ status, transfers: [] });
  });

  it('keeps partial outages honest while exposing healthy per-chain evidence', async () => {
    const { donation } = service([
      evidence({ state: 'absent', minedSuccessfully: undefined, blockNumber: undefined, transfers: [] }),
      evidence({ chainId: 1, chainName: 'Ethereum', state: 'unavailable', minedSuccessfully: undefined, blockNumber: undefined, transfers: [] }),
    ]);
    const result = await donation.verifyDonation(HASH);
    expect(result.status).toBe('unavailable');
    expect(result.chainStatuses).toEqual([
      { chainId: 1, chainName: 'Ethereum', state: 'unavailable' },
      { chainId: 8453, chainName: 'Base', state: 'absent' },
      { chainId: 723, chainName: 'Radius', state: 'absent' },
    ]);
  });

  it('does not let a partial outage hide a verified healthy-chain transfer', async () => {
    const { donation } = service([
      evidence(),
      evidence({ chainId: 1, chainName: 'Ethereum', state: 'unavailable', minedSuccessfully: undefined, blockNumber: undefined, transfers: [] }),
    ]);

    const result = await donation.verifyDonation(HASH);

    expect(result.status).toBe('verified');
    expect(result.chainStatuses).toEqual([
      { chainId: 1, chainName: 'Ethereum', state: 'unavailable' },
      { chainId: 8453, chainName: 'Base', state: 'mined', minedSuccessfully: true },
      { chainId: 723, chainName: 'Radius', state: 'absent' },
    ]);
  });

  it('reports total outage without claiming absence', async () => {
    const { donation } = service([
      evidence({ state: 'unavailable', minedSuccessfully: undefined, blockNumber: undefined, transfers: [] }),
      evidence({ chainId: 1, chainName: 'Ethereum', state: 'unavailable', minedSuccessfully: undefined, blockNumber: undefined, transfers: [] }),
      evidence({ chainId: 723, chainName: 'Radius', state: 'unavailable', minedSuccessfully: undefined, blockNumber: undefined, transfers: [] }),
    ]);

    const result = await donation.verifyDonation(HASH);

    expect(result).toMatchObject({ status: 'unavailable', transfers: [] });
    expect(result.chainStatuses?.every(item => item.state === 'unavailable')).toBe(true);
  });

  it('fails closed when malformed provider objects throw during inspection', async () => {
    const hostile = Object.defineProperty({}, 'chainId', {
      get: () => { throw new Error('provider-internal secret'); },
    });
    const provider = {
      getEvidence: vi.fn().mockResolvedValue([hostile, hostile, hostile]),
    } as unknown as ITransactionEvidenceProvider;

    const result = await new DonationService(provider).verifyDonation(HASH);

    expect(result).toMatchObject({ status: 'unavailable', transfers: [], classifiedTransferCount: 0 });
    expect(JSON.stringify(result)).not.toContain('provider-internal secret');
  });

  it.each([
    ['amount', '1', 'not-an-integer'],
    ['tokenAddress', OTHER, USDC],
  ] as const)('fails closed for volatile %s accessors before classification', async (property, first, second) => {
    let reads = 0;
    const transfer: Record<string, unknown> = {
      from: FROM,
      to: RECIPIENT_ADDRESS,
      amount: '1',
      tokenAddress: OTHER,
    };
    Object.defineProperty(transfer, property, {
      enumerable: true,
      get: () => (++reads === 1 ? first : second),
    });
    const { donation } = service([evidence({
      transfers: [transfer as unknown as ChainTransactionEvidence['transfers'][number]],
    })]);

    const result = await donation.verifyDonation(HASH);

    expect(result).toMatchObject({ status: 'unavailable', transfers: [], classifiedTransferCount: 0 });
    expect(result.chainStatuses?.every(item => item.state === 'unavailable')).toBe(true);
    expect(reads).toBe(0);
  });

  it('accepts the maximum uint256 amount without crossing presenter bounds', async () => {
    const { donation } = service([evidence({
      transfers: [{
        from: FROM,
        to: RECIPIENT_ADDRESS,
        amount: String((1n << 256n) - 1n),
        tokenAddress: USDC,
      }],
    })]);

    const result = await donation.verifyDonation(HASH);

    expect(result.status).toBe('verified');
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].amount.length).toBeLessThanOrEqual(100);
  });

  it('rejects an oversized transfer collection before reading any element', async () => {
    const transfers = new Array<ChainTransactionEvidence['transfers'][number]>(1_000_001);
    let reads = 0;
    Object.defineProperty(transfers, 0, {
      get: () => { reads += 1; throw new Error('must not inspect'); },
    });
    const { donation } = service([evidence({ transfers })]);

    const result = await donation.verifyDonation(HASH);

    expect(result).toMatchObject({ status: 'unavailable', transfers: [], classifiedTransferCount: 0 });
    expect(reads).toBe(0);
  });

  it('turns provider exceptions into sanitized fail-closed evidence', async () => {
    const provider: ITransactionEvidenceProvider = {
      getEvidence: vi.fn().mockRejectedValue(new Error('secret RPC URL and provider payload')),
    };

    const result = await new DonationService(provider).verifyDonation(HASH);

    expect(result).toMatchObject({
      status: 'unavailable', minedSuccessfully: false, transfers: [], classifiedTransferCount: 0,
    });
    expect(result.chainStatuses?.every(item => item.state === 'unavailable')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret RPC URL');
    expect(JSON.stringify(result)).not.toContain('provider payload');
  });

  it.each([
    ['null', null],
    ['object', { chains: [] }],
    ['primitive item', [null, 7, 'bad']],
  ])('fails closed for malformed provider result: %s', async (_label, providerValue) => {
    const provider = {
      getEvidence: vi.fn().mockResolvedValue(providerValue),
    } as unknown as ITransactionEvidenceProvider;

    const result = await new DonationService(provider).verifyDonation(HASH);

    expect(result).toMatchObject({ status: 'unavailable', transfers: [], classifiedTransferCount: 0 });
    expect(result.chainStatuses?.every(item => item.state === 'unavailable')).toBe(true);
  });

  it('rejects malformed hashes before querying providers', async () => {
    const { donation, provider } = service([]);
    await expect(donation.verifyDonation('bad')).rejects.toThrow(PaymentError);
    expect(provider.getEvidence).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', [evidence()]],
    ['duplicate', [evidence(), evidence()]],
    ['unknown', [evidence(), evidence({ chainId: 99, chainName: 'Unknown' })]],
    ['mismatched name', [evidence({ chainName: 'Ethereum' })]],
    ['mismatched hash', [evidence({ txHash: `0x${'cd'.repeat(32)}` })]],
    ['unknown state', [evidence({ state: 'unknown' as ChainTransactionEvidence['state'] })]],
  ])('fails closed for %s chain evidence', async (_label, items) => {
    const { donation } = service(items, false);
    const result = await donation.verifyDonation(HASH);
    expect(result).toMatchObject({ status: 'unavailable', minedSuccessfully: false, transfers: [] });
    expect(result.chainStatuses).toHaveLength(3);
    expect(result.chainStatuses?.every(item => item.state === 'unavailable')).toBe(true);
  });

  it.each([
    ['null transfer', null as unknown as ChainTransactionEvidence['transfers'][number]],
    ['missing amount', { from: FROM, to: RECIPIENT_ADDRESS, tokenAddress: USDC } as unknown as ChainTransactionEvidence['transfers'][number]],
    ['bad sender address', { from: 'not-an-address', to: RECIPIENT_ADDRESS, amount: '1', tokenAddress: USDC }],
    ['bad token address', { from: FROM, to: RECIPIENT_ADDRESS, amount: '1', tokenAddress: 'not-a-token' }],
    ['leading-zero amount', { from: FROM, to: RECIPIENT_ADDRESS, amount: '0001', tokenAddress: OTHER }],
    ['100-digit amount', { from: FROM, to: RECIPIENT_ADDRESS, amount: '1'.repeat(100), tokenAddress: USDC }],
    ['uint256 overflow', { from: FROM, to: RECIPIENT_ADDRESS, amount: String(1n << 256n), tokenAddress: USDC }],
  ])('fails closed for %s in mined transfer evidence', async (_label, transfer) => {
    const { donation } = service([evidence({ transfers: [transfer] })]);

    const result = await donation.verifyDonation(HASH);

    expect(result).toMatchObject({ status: 'unavailable', transfers: [] });
    expect(result.chainStatuses?.every(item => item.state === 'unavailable')).toBe(true);
  });

  it('fails closed when a non-mined state contradictorily carries a block number', async () => {
    const { donation } = service([evidence({
      state: 'pending', minedSuccessfully: undefined, blockNumber: 100, transfers: [],
    })]);

    const result = await donation.verifyDonation(HASH);

    expect(result).toMatchObject({ status: 'unavailable', transfers: [] });
    expect(result.chainStatuses?.every(item => item.state === 'unavailable')).toBe(true);
  });

  it('scans all status-relevant transfers, returns at most 100, and reports the exact total', async () => {
    const transfers = Array.from({ length: 137 }, (_, index) => ({
      from: FROM,
      to: RECIPIENT_ADDRESS,
      amount: String(index + 1),
      tokenAddress: USDC,
    }));
    const { donation } = service([evidence({ transfers })]);

    const result = await donation.verifyDonation(HASH);

    expect(result.status).toBe('verified');
    expect(result.transfers).toHaveLength(100);
    expect(result.classifiedTransferCount).toBe(137);
    expect(result.transfers.at(-1)?.amount).toBe('0.0001');
  });
});
