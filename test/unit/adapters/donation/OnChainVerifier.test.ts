import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnChainVerifier } from '../../../../src/adapters/donation/OnChainVerifier.js';

const TX_HASH = `0x${'ab'.repeat(32)}`;
const TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const FROM = `0x${'11'.repeat(20)}`;
const TO = `0x${'22'.repeat(20)}`;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function word(address: string): string { return `0x${'0'.repeat(24)}${address.slice(2)}`; }
function transfer(to = TO, address = TOKEN, amount = 1_500_000n) {
  return { address, topics: [TRANSFER_TOPIC, word(FROM), word(to)], data: `0x${amount.toString(16).padStart(64, '0')}` };
}
function receipt(overrides: Record<string, unknown> = {}) {
  return { status: '0x1', blockNumber: '0x100', logs: [], ...overrides };
}
function transaction(overrides: Record<string, unknown> = {}) {
  return { from: FROM, to: TOKEN, value: '0x0', ...overrides };
}
function response(result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
function errorResponse(error: unknown) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockByChain(handler: (url: string, method: string) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn().mockImplementation((url, init) => {
    const request = JSON.parse(String(init?.body)) as { method: string };
    return handler(String(url), request.method);
  });
}

function mockChains(firstReceipt: unknown, firstTransaction: unknown) {
  const results = [firstReceipt, firstTransaction, null, null, null, null];
  globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(response(results.shift())));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('OnChainVerifier evidence', () => {
  it('decodes every valid transfer log plus a native transfer', async () => {
    mockChains(
      receipt({ logs: [transfer(), transfer(TO, `0x${'33'.repeat(20)}`, 2n)] }),
      transaction({ to: TO, value: '0xde0b6b3a7640000' }),
    );
    const provider = new OnChainVerifier({ ethereum: 'eth', base: 'base', radius: 'radius' });

    const evidence = await provider.getEvidence(TX_HASH);

    expect(evidence[0]).toMatchObject({ state: 'mined', minedSuccessfully: true, blockNumber: 256 });
    expect(evidence[0].transfers).toHaveLength(3);
    expect(evidence[0].transfers[0]).toMatchObject({ to: TO, amount: '1500000', tokenAddress: TOKEN });
    expect(evidence[0].transfers[2]).toMatchObject({ amount: '1000000000000000000', tokenAddress: null });
  });

  it('ignores malformed transfer logs rather than treating them as donations', async () => {
    mockChains(receipt({ logs: [null, transfer(TO, TOKEN, 0n), { ...transfer(), data: '0xnot-a-word' }] }), transaction());
    const provider = new OnChainVerifier({ ethereum: 'eth', base: 'base', radius: 'radius' });

    const evidence = await provider.getEvidence(TX_HASH);

    expect(evidence[0].state).toBe('mined');
    expect(evidence[0].transfers).toEqual([]);
  });

  it.each([
    [null, null, 'absent'],
    [null, transaction(), 'pending'],
    [receipt({ status: '0x0' }), transaction(), 'mined'],
  ])('distinguishes receipt/transaction state %#', async (receiptValue, txValue, state) => {
    mockChains(receiptValue, txValue);
    const provider = new OnChainVerifier({ ethereum: 'eth', base: 'base', radius: 'radius' });
    const evidence = await provider.getEvidence(TX_HASH);
    expect(evidence[0].state).toBe(state);
    if (state === 'mined') expect(evidence[0].minedSuccessfully).toBe(false);
  });

  it('distinguishes provider failure from an absent transaction', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const provider = new OnChainVerifier({ ethereum: 'eth', base: 'base', radius: 'radius' });
    const evidence = await provider.getEvidence(TX_HASH);
    expect(evidence.every(item => item.state === 'unavailable')).toBe(true);
  });

  it('normalizes explicit transaction-not-found RPC errors to absent', async () => {
    mockByChain((url) => {
      if (url === 'eth') return errorResponse({ code: -32000, data: { message: 'transaction not found' } });
      if (url === 'base') return errorResponse({ code: -32000, message: 'receipt not found' });
      return response(null);
    });
    const provider = new OnChainVerifier({ ethereum: 'eth', base: 'base', radius: 'radius' });

    const evidence = await provider.getEvidence(TX_HASH);

    expect(evidence.map(item => item.state)).toEqual(['absent', 'absent', 'absent']);
  });

  it('does not treat a generic not-found RPC error as transaction absence', async () => {
    mockByChain((url) => url === 'eth'
      ? errorResponse({ code: -32000, message: 'not found' })
      : response(null));
    const provider = new OnChainVerifier({ ethereum: 'eth', base: 'base', radius: 'radius' });

    const evidence = await provider.getEvidence(TX_HASH);

    expect(evidence.map(item => item.state)).toEqual(['unavailable', 'absent', 'absent']);
  });

  it('preserves healthy absence alongside a partial RPC outage', async () => {
    mockByChain((url) => url === 'eth'
      ? Promise.reject(new Error('offline'))
      : response(null));
    const provider = new OnChainVerifier({ ethereum: 'eth', base: 'base', radius: 'radius' });

    const evidence = await provider.getEvidence(TX_HASH);

    expect(evidence.map(item => item.state)).toEqual(['unavailable', 'absent', 'absent']);
  });

  it('reports total RPC outage as unavailable on every chain', async () => {
    mockByChain(() => Promise.reject(new Error('offline')));
    const provider = new OnChainVerifier({ ethereum: 'eth', base: 'base', radius: 'radius' });

    const evidence = await provider.getEvidence(TX_HASH);

    expect(evidence.map(item => item.state)).toEqual(['unavailable', 'unavailable', 'unavailable']);
  });

  it('aborts stalled response parsing and clears timers', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => ({
      ok: true,
      text: () => new Promise((_resolve, reject) => {
        (init?.signal as AbortSignal).addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    }));
    const provider = new OnChainVerifier({ ethereum: 'eth', base: 'base', radius: 'radius', rpcTimeoutMs: 25 });
    const pending = provider.getEvidence(TX_HASH);
    await vi.advanceTimersByTimeAsync(25);
    const evidence = await pending;
    expect(evidence.every(item => item.state === 'unavailable')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
