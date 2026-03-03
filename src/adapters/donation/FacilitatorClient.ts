/**
 * x402 facilitator client for settling payments.
 *
 * Mirrors the settle API from coinbase/x402 HTTPFacilitatorClient
 * without importing the x402 package.
 */

import { PaymentError } from '../../kernel/errors.js';
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from '../../kernel/donation-types.js';

export class FacilitatorClient {
  constructor(
    private url: string,
    private apiKey?: string,
  ) {}

  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(`${this.url}/settle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload,
        paymentRequirements,
      }),
    });

    const data = await response.json() as SettleResponse;

    if (!response.ok || !data.success) {
      throw new PaymentError(
        data.errorReason ?? data.errorMessage ?? `Settlement failed (${response.status})`,
      );
    }

    return data;
  }
}
