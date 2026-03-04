/**
 * verify_donation tool handler.
 *
 * Verifies a donation transaction on-chain across Ethereum, Base, and Radius.
 */

import type { ToolHandler } from '../../kernel/types.js';
import type { DonationService } from '../../services/donation/DonationService.js';
import { formatDonationVerifyResult } from '../../formatters/donationFormatter.js';
import { handleToolError } from '../../kernel/errors.js';

export function createVerifyDonationHandler(donationService: DonationService): ToolHandler {
  return {
    name: 'verify_donation',
    description:
      'Verify a donation transaction on-chain. Supports USDC on Ethereum/Base, ETH on Ethereum/Base, and SBC on Radius. Provide the transaction hash to check confirmation status and recipient.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tx_hash: {
          type: 'string',
          description: 'Transaction hash (0x-prefixed, 64 hex characters)',
          pattern: '^0x[0-9a-fA-F]{64}$',
        },
      },
      required: ['tx_hash'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },

    handler: async (params) => {
      try {
        const txHash = params.tx_hash as string;
        const result = await donationService.verifyDonation(txHash);
        return {
          content: [{ type: 'text' as const, text: formatDonationVerifyResult(result) }],
        };
      } catch (error) {
        return handleToolError(error as Error);
      }
    },
  };
}
