import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OnChainVerifier } from '../../../../src/adapters/donation/OnChainVerifier.js';
import { PaymentError } from '../../../../src/kernel/errors.js';

// ── Helpers ──

const TX_HASH = '0x' + 'ab'.repeat(32);
const USDC_BASE_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function makeReceiptResponse(overrides: Record<string, unknown> = {}) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      status: '0x1',
      blockNumber: '0x100',
      from: '0x' + '11'.repeat(20),
      to: USDC_BASE_CONTRACT,
      logs: [],
      ...overrides,
    },
  };
}

function makeTxResponse(overrides: Record<string, unknown> = {}) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      from: '0x' + '11'.repeat(20),
      to: '0x' + '22'.repeat(20),
      value: '0x0',
      blockNumber: '0x100',
      ...overrides,
    },
  };
}

function makeErc20Receipt(from: string, to: string, amount: string) {
  const fromTopic = '0x' + '0'.repeat(24) + from.slice(2);
  const toTopic = '0x' + '0'.repeat(24) + to.slice(2);
  const data = '0x' + BigInt(amount).toString(16).padStart(64, '0');

  return makeReceiptResponse({
    logs: [{
      address: USDC_BASE_CONTRACT,
      topics: [TRANSFER_TOPIC, fromTopic, toTopic],
      data,
    }],
  });
}

function mockFetch(responses: Record<string, unknown>[]) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[callIndex] ?? { jsonrpc: '2.0', id: 1, result: null };
    callIndex++;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(resp),
    });
  });
}

describe('OnChainVerifier', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('verify', () => {
    it('detects ERC-20 Transfer and returns amount as string', async () => {
      const sender = '0x' + '11'.repeat(20);
      const recipient = '0x' + '22'.repeat(20);

      // 6 responses: receipt+tx for each of 3 chains (all called in parallel)
      // Chain 1 (Ethereum) returns the match
      globalThis.fetch = mockFetch([
        makeErc20Receipt(sender, recipient, '1500000'),
        makeTxResponse({ from: sender, to: USDC_BASE_CONTRACT, value: '0x0' }),
        // Chain 2 & 3 return null
        { jsonrpc: '2.0', id: 1, result: null },
        { jsonrpc: '2.0', id: 1, result: null },
        { jsonrpc: '2.0', id: 1, result: null },
        { jsonrpc: '2.0', id: 1, result: null },
      ]);

      const verifier = new OnChainVerifier({
        ethereum: 'https://fake-eth.test',
        base: 'https://fake-base.test',
        radius: 'https://fake-radius.test',
      });

      const result = await verifier.verify(TX_HASH);

      expect(result.amount).toBe('1500000');
      expect(typeof result.amount).toBe('string');
      expect(result.from).toContain('1111');
      expect(result.to).toContain('2222');
      expect(result.confirmed).toBe(true);

      verifier.dispose();
    });

    it('detects native ETH transfer', async () => {
      const sender = '0x' + '11'.repeat(20);
      const recipient = '0x' + '22'.repeat(20);
      const weiAmount = '0x' + BigInt('1000000000000000000').toString(16); // 1 ETH

      // All chains return no ERC-20, but Ethereum has native value
      globalThis.fetch = mockFetch([
        makeReceiptResponse({ logs: [] }),
        makeTxResponse({ from: sender, to: recipient, value: weiAmount }),
        { jsonrpc: '2.0', id: 1, result: null },
        { jsonrpc: '2.0', id: 1, result: null },
        { jsonrpc: '2.0', id: 1, result: null },
        { jsonrpc: '2.0', id: 1, result: null },
      ]);

      const verifier = new OnChainVerifier({
        ethereum: 'https://fake-eth.test',
        base: 'https://fake-base.test',
        radius: 'https://fake-radius.test',
      });

      const result = await verifier.verify(TX_HASH);

      expect(result.amount).toBe('1000000000000000000');
      expect(result.symbol).toBe('ETH');
      expect(result.tokenAddress).toBeNull();

      verifier.dispose();
    });

    it('calls all RPCs in parallel (not sequential)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: null }),
      });
      globalThis.fetch = fetchMock;

      const verifier = new OnChainVerifier({
        ethereum: 'https://fake-eth.test',
        base: 'https://fake-base.test',
        radius: 'https://fake-radius.test',
      });

      await expect(verifier.verify(TX_HASH)).rejects.toThrow(PaymentError);

      // All 3 chains should have been tried (2 calls each = 6 total)
      expect(fetchMock).toHaveBeenCalledTimes(6);

      verifier.dispose();
    });

    it('throws PaymentError when tx not found on any chain', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: null }),
      });

      const verifier = new OnChainVerifier({
        ethereum: 'https://fake-eth.test',
        base: 'https://fake-base.test',
        radius: 'https://fake-radius.test',
      });

      await expect(verifier.verify(TX_HASH)).rejects.toThrow(PaymentError);
      await expect(verifier.verify(TX_HASH)).rejects.toThrow('not found');

      verifier.dispose();
    });

    it('returns cached result on repeat calls', async () => {
      const sender = '0x' + '11'.repeat(20);
      const recipient = '0x' + '22'.repeat(20);

      const fetchMock = mockFetch([
        makeErc20Receipt(sender, recipient, '1000000'),
        makeTxResponse({ from: sender, to: USDC_BASE_CONTRACT, value: '0x0' }),
        { jsonrpc: '2.0', id: 1, result: null },
        { jsonrpc: '2.0', id: 1, result: null },
        { jsonrpc: '2.0', id: 1, result: null },
        { jsonrpc: '2.0', id: 1, result: null },
      ]);
      globalThis.fetch = fetchMock;

      const verifier = new OnChainVerifier({
        ethereum: 'https://fake-eth.test',
        base: 'https://fake-base.test',
        radius: 'https://fake-radius.test',
      });

      const result1 = await verifier.verify(TX_HASH);
      const callCount = fetchMock.mock.calls.length;

      const result2 = await verifier.verify(TX_HASH);

      expect(result2).toEqual(result1);
      // No additional fetch calls on second verify
      expect(fetchMock.mock.calls.length).toBe(callCount);

      verifier.dispose();
    });

    it('handles RPC errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));

      const verifier = new OnChainVerifier({
        ethereum: 'https://fake-eth.test',
        base: 'https://fake-base.test',
        radius: 'https://fake-radius.test',
      });

      await expect(verifier.verify(TX_HASH)).rejects.toThrow(PaymentError);

      verifier.dispose();
    });
  });
});
